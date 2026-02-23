/**
 * PV (planned value) sync utility.
 * Generates planned monthly values for ALL leaf stages of a study.
 *
 * Key properties:
 * - Conditional: only syncs when dirty (stages changed since last sync or no planned records exist)
 * - Transactional: uses an RPC function with advisory lock for atomicity & concurrency safety
 * - Observable: returns structured results; never fails silently
 */

import { supabase } from "@/integrations/supabase/client";

export interface PVSyncResult {
  ok: boolean;
  skipped?: boolean;
  deleted?: number;
  inserted?: number;
  error?: string;
}

interface StageForPV {
  id: string;
  parent_id: string | null;
  start_date: string | null;
  end_date: string | null;
  total_value: number;
  stage_type: string | null;
}

function getLeafIds(stages: StageForPV[]): Set<string> {
  const parentIds = new Set<string>();
  for (const s of stages) {
    if (s.parent_id) parentIds.add(s.parent_id);
  }
  const leafIds = new Set<string>();
  for (const s of stages) {
    if (!parentIds.has(s.id)) leafIds.add(s.id);
  }
  return leafIds;
}

function distributePV(
  stageId: string,
  start: string,
  end: string,
  totalCents: number
): { stage_id: string; month_key: string; value: number }[] {
  const startD = new Date(start + "T12:00:00");
  const endD = new Date(end + "T12:00:00");
  const totalDays = Math.round((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (totalDays <= 0) return [];

  const monthEntries: { month_key: string; days: number }[] = [];
  let cur = new Date(startD);
  while (cur <= endD) {
    const y = cur.getFullYear();
    const m = cur.getMonth() + 1;
    const monthKey = `${y}-${String(m).padStart(2, "0")}`;
    const monthStart = new Date(y, m - 1, 1);
    const monthEnd = new Date(y, m, 0);
    const effStart = startD > monthStart ? startD : monthStart;
    const effEnd = endD < monthEnd ? endD : monthEnd;
    const days = Math.round((effEnd.getTime() - effStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (days > 0) monthEntries.push({ month_key: monthKey, days });
    cur = new Date(y, m, 1);
  }

  if (monthEntries.length === 0) return [];

  const pvCents: number[] = new Array(monthEntries.length);
  let sumCents = 0;
  for (let i = 0; i < monthEntries.length - 1; i++) {
    pvCents[i] = Math.round((monthEntries[i].days / totalDays) * totalCents);
    sumCents += pvCents[i];
  }
  pvCents[pvCents.length - 1] = totalCents - sumCents;

  if (pvCents[pvCents.length - 1] < 0) {
    for (let i = pvCents.length - 2; i >= 0 && pvCents[pvCents.length - 1] < 0; i--) {
      const pull = Math.min(pvCents[i], -pvCents[pvCents.length - 1]);
      pvCents[i] -= pull;
      pvCents[pvCents.length - 1] += pull;
    }
  }

  return monthEntries
    .map((e, i) => ({ month_key: e.month_key, value: pvCents[i] / 100 }))
    .filter(r => r.value > 0)
    .map(r => ({ stage_id: stageId, month_key: r.month_key, value: r.value }));
}

/**
 * Check if PV sync is needed by comparing pv_last_synced_at with max updated_at of stages.
 */
async function isSyncNeeded(studyId: string): Promise<boolean> {
  // Get study's pv_last_synced_at
  const { data: study } = await supabase
    .from("studies")
    .select("pv_last_synced_at")
    .eq("id", studyId)
    .single();

  const lastSynced = study?.pv_last_synced_at;

  // If never synced, check if there are any stages that would produce PV
  if (!lastSynced) {
    const { count } = await supabase
      .from("construction_stages" as any)
      .select("id", { count: "exact", head: true })
      .eq("study_id", studyId)
      .eq("is_deleted", false)
      .gt("total_value", 0);
    return (count ?? 0) > 0;
  }

  // Check if any stage was updated after last sync
  const { data: recentStages } = await supabase
    .from("construction_stages" as any)
    .select("id")
    .eq("study_id", studyId)
    .eq("is_deleted", false)
    .gt("updated_at", lastSynced)
    .limit(1);

  return (recentStages?.length ?? 0) > 0;
}

/**
 * Sync all PV monthly records for a study.
 * - Conditional: skips if not dirty
 * - Transactional: uses RPC with advisory lock
 * - Returns structured result for UI feedback
 */
export async function syncAllPVMonthly(studyId: string, force = false): Promise<PVSyncResult> {
  try {
    // 1. Dirty check (skip if not needed)
    if (!force) {
      const needed = await isSyncNeeded(studyId);
      if (!needed) {
        return { ok: true, skipped: true };
      }
    }

    // 2. Fetch leaf stages and compute PV rows client-side
    const { data: stagesRaw, error: fetchError } = await supabase
      .from("construction_stages" as any)
      .select("id, parent_id, start_date, end_date, total_value, stage_type")
      .eq("study_id", studyId)
      .eq("is_deleted", false);

    if (fetchError) {
      return { ok: false, error: `Erro ao buscar etapas: ${fetchError.message}` };
    }

    const stages: StageForPV[] = (stagesRaw as any[] | null) ?? [];
    const allInserts: { stage_id: string; month_key: string; value: number }[] = [];

    if (stages.length > 0) {
      const leafIds = getLeafIds(stages);

      for (const stage of stages) {
        if (!leafIds.has(stage.id)) continue;
        const totalCents = Math.round((Number(stage.total_value) || 0) * 100);
        if (totalCents <= 0) continue;

        let start = stage.start_date;
        let end = stage.end_date;

        if (stage.stage_type === "taxas") {
          if (!start) continue;
          end = start;
        }

        if (!start || !end) continue;

        const rows = distributePV(stage.id, start, end, totalCents);
        allInserts.push(...rows);
      }
    }

    // 3. Call atomic RPC (handles delete + insert + lock + timestamp update)
    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      "sync_pv_monthly" as any,
      {
        p_study_id: studyId,
        p_rows: allInserts,
      }
    );

    if (rpcError) {
      return { ok: false, error: `Erro no sync: ${rpcError.message}` };
    }

    const result = rpcResult as any;
    if (!result?.ok) {
      return { ok: false, error: result?.error || "Erro desconhecido no sync PV" };
    }

    return {
      ok: true,
      skipped: false,
      deleted: result.deleted,
      inserted: result.inserted,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Erro inesperado no sync PV" };
  }
}
