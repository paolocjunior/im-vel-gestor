/**
 * Bulk PV (planned value) sync utility.
 * Generates planned monthly values for ALL leaf stages of a study
 * that have start_date, end_date, and total_value > 0.
 *
 * Uses the same centavos-based algorithm as ConstructionStages.recalcPVMonthly.
 * Idempotent: deletes all existing planned records for the study, then inserts fresh ones.
 */

import { supabase } from "@/integrations/supabase/client";

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
  studyId: string,
  start: string,
  end: string,
  totalCents: number
): { stage_id: string; study_id: string; month_key: string; value: number; value_type: string }[] {
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

  // Non-negativity fix
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
    .map(r => ({
      stage_id: stageId,
      study_id: studyId,
      month_key: r.month_key,
      value: r.value,
      value_type: "planned" as const,
    }));
}

/**
 * Sync all PV monthly records for a study.
 * Deletes all existing planned records, then inserts fresh ones for every leaf stage.
 */
export async function syncAllPVMonthly(studyId: string): Promise<void> {
  const { data: stagesRaw } = await supabase
    .from("construction_stages" as any)
    .select("id, parent_id, start_date, end_date, total_value, stage_type")
    .eq("study_id", studyId)
    .eq("is_deleted", false);

  const stages: StageForPV[] = (stagesRaw as any[] | null) ?? [];
  if (stages.length === 0) return;

  const leafIds = getLeafIds(stages);
  const allInserts: ReturnType<typeof distributePV> = [];

  for (const stage of stages) {
    if (!leafIds.has(stage.id)) continue;

    const totalCents = Math.round((Number(stage.total_value) || 0) * 100);
    if (totalCents <= 0) continue;

    let start = stage.start_date;
    let end = stage.end_date;

    // Taxas: single date
    if (stage.stage_type === "taxas") {
      if (!start) continue;
      end = start;
    }

    if (!start || !end) continue;

    const rows = distributePV(stage.id, studyId, start, end, totalCents);
    allInserts.push(...rows);
  }

  // Delete all existing planned values for this study
  const { error: delError } = await supabase
    .from("construction_stage_monthly_values" as any)
    .delete()
    .eq("study_id", studyId)
    .eq("value_type", "planned");

  if (delError) {
    console.error("[pvSync] delete error:", delError);
    return;
  }

  // Batch insert (Supabase handles arrays up to ~1000 rows)
  if (allInserts.length > 0) {
    for (let i = 0; i < allInserts.length; i += 500) {
      const chunk = allInserts.slice(i, i + 500);
      const { error: insError } = await supabase
        .from("construction_stage_monthly_values" as any)
        .insert(chunk as any);
      if (insError) {
        console.error("[pvSync] insert error:", insError);
      }
    }
  }
}
