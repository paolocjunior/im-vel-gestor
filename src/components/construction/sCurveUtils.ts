/**
 * REGRAS DA CURVA S FINANCEIRA:
 *
 * 1. month_key DEVE ser formato YYYY-MM. Registros inválidos são descartados com console.warn.
 * 2. month_key é sempre gerado no backend (competência). Nunca derivar do client/timezone.
 * 3. Range = min/max dos month_key existentes em PV+AC. AC fora do planejamento estende o range.
 * 4. Apenas etapas-folha ATUAIS (ativas, sem filhos ativos) entram no cálculo.
 * 5. Registros órfãos (stage_id inexistente em activeStageIds) são descartados.
 * 6. Cálculos monetários em centavos inteiros. Conversão para decimal apenas na saída.
 * 7. value_type filtrado explicitamente: apenas 'planned' e 'actual'.
 */

import { MONTHS_PT } from "./schedule/scheduleUtils";

// --- Types ---

export interface StageMinimal {
  id: string;
  parent_id: string | null;
}

export interface MonthlyValueRow {
  stage_id: string;
  month_key: string;
  value: number;
  value_type: string;
}

export interface SCurveDataPoint {
  monthKey: string;
  label: string;
  pvMensal: number;
  acMensal: number;
  pvAcum: number;
  acAcum: number;
  desvioAcum: number;
}

export type SCurveResult =
  | { status: "no-leaves" }
  | { status: "no-values" }
  | { status: "ok"; data: SCurveDataPoint[] };

// --- Helpers ---

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Determina etapas-folha: ativas sem filhos ativos.
 * Query 1 já retorna apenas is_deleted=false, então filhos deletados não contam.
 */
export function getLeafStageIds(stages: StageMinimal[]): Set<string> {
  const parentIds = new Set<string>();
  for (const s of stages) {
    if (s.parent_id) parentIds.add(s.parent_id);
  }
  const leafIds = new Set<string>();
  for (const s of stages) {
    if (!parentIds.has(s.id)) {
      leafIds.add(s.id);
    }
  }
  return leafIds;
}

function formatMonthLabel(mk: string): string {
  const [yearStr, monthStr] = mk.split("-");
  const monthIdx = parseInt(monthStr, 10) - 1;
  return `${MONTHS_PT[monthIdx]}/${yearStr}`;
}

function generateMonthRange(min: string, max: string): string[] {
  const range: string[] = [];
  let [y, m] = min.split("-").map(Number);
  const [ey, em] = max.split("-").map(Number);

  while (y < ey || (y === ey && m <= em)) {
    range.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return range;
}

// --- Main builder (pure function) ---

export function buildSCurveData(
  stages: StageMinimal[],
  monthlyValues: MonthlyValueRow[]
): SCurveResult {
  // 1. Derive active stage ids and leaf ids
  const activeStageIds = new Set(stages.map((s) => s.id));
  const leafIds = getLeafStageIds(stages);

  // Cenário A: nenhuma etapa-folha
  if (leafIds.size === 0) {
    return { status: "no-leaves" };
  }

  // 2. Triple filter: orphans → format → leaves
  const filtered: MonthlyValueRow[] = [];
  for (const v of monthlyValues) {
    // Discard orphans
    if (!activeStageIds.has(v.stage_id)) continue;

    // Validate month_key format
    if (!MONTH_KEY_RE.test(v.month_key)) {
      console.warn(
        `[SCurve] month_key inválido descartado: "${v.month_key}", stage_id: ${v.stage_id}`
      );
      continue;
    }

    // Only current leaves
    if (!leafIds.has(v.stage_id)) continue;

    // Only planned/actual (defense — query already filters, but belt-and-suspenders)
    if (v.value_type !== "planned" && v.value_type !== "actual") continue;

    filtered.push(v);
  }

  // Cenário B: folhas existem, mas sem PV/AC
  if (filtered.length === 0) {
    return { status: "no-values" };
  }

  // 3. Min/Max without sort (single loop)
  let minMonth = filtered[0].month_key;
  let maxMonth = filtered[0].month_key;
  for (const v of filtered) {
    if (v.month_key < minMonth) minMonth = v.month_key;
    if (v.month_key > maxMonth) maxMonth = v.month_key;
  }

  // 4. Aggregate O(N) with Map (centavos)
  const monthMap = new Map<string, { pvCents: number; acCents: number }>();
  for (const v of filtered) {
    let entry = monthMap.get(v.month_key);
    if (!entry) {
      entry = { pvCents: 0, acCents: 0 };
      monthMap.set(v.month_key, entry);
    }
    const cents = Math.round(v.value * 100);
    if (v.value_type === "planned") {
      entry.pvCents += cents;
    } else {
      entry.acCents += cents;
    }
  }

  // 5. Continuous range + dataset with accumulation
  const monthRange = generateMonthRange(minMonth, maxMonth);
  let pvAcumCents = 0;
  let acAcumCents = 0;

  const data: SCurveDataPoint[] = monthRange.map((mk) => {
    const entry = monthMap.get(mk) ?? { pvCents: 0, acCents: 0 };
    pvAcumCents += entry.pvCents;
    acAcumCents += entry.acCents;
    const desvioCents = acAcumCents - pvAcumCents;

    return {
      monthKey: mk,
      label: formatMonthLabel(mk),
      pvMensal: entry.pvCents / 100,
      acMensal: entry.acCents / 100,
      pvAcum: pvAcumCents / 100,
      acAcum: acAcumCents / 100,
      desvioAcum: desvioCents / 100,
    };
  });

  return { status: "ok", data };
}
