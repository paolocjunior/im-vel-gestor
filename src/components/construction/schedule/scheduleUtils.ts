export const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function formatDateBR(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

export function diffDays(a: string, b: string): number {
  const da = new Date(a + "T12:00:00");
  const db = new Date(b + "T12:00:00");
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface StageRow {
  id: string;
  parent_id: string | null;
  code: string;
  name: string;
  level: number;
  position: number;
  start_date: string | null;
  end_date: string | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  status: string;
  total_value: number;
  stage_type: string | null;
}

export interface MonthColumn {
  key: string;
  label: string;
  year: number;
  month: number;
  start: string;
  end: string;
}

export type Granularity = "biweekly" | "monthly" | "quarterly" | "semiannual" | "annual";

export function getEffectiveDates(stage: StageRow, allStages: StageRow[]): { start: string | null; end: string | null } {
  const children = allStages.filter(s => s.parent_id === stage.id);
  if (children.length === 0) return { start: stage.start_date, end: stage.end_date };
  let minStart: string | null = null;
  let maxEnd: string | null = null;
  for (const child of children) {
    const childDates = getEffectiveDates(child, allStages);
    if (childDates.start && (!minStart || childDates.start < minStart)) minStart = childDates.start;
    if (childDates.end && (!maxEnd || childDates.end > maxEnd)) maxEnd = childDates.end;
  }
  return { start: minStart, end: maxEnd };
}

export function generateMonthColumns(minDate: string, maxDate: string): MonthColumn[] {
  const cols: MonthColumn[] = [];
  let [y, m] = minDate.split("-").map(Number);
  const [ey, em] = maxDate.split("-").map(Number);

  while (y < ey || (y === ey && m <= em)) {
    const lastDay = new Date(y, m, 0).getDate();
    const start = `${y}-${String(m).padStart(2, "0")}-01`;
    const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    cols.push({
      key: `${y}-${String(m).padStart(2, "0")}`,
      label: `${MONTHS_PT[m - 1]}/${y}`,
      year: y,
      month: m,
      start,
      end,
    });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return cols;
}

/** Group month columns by granularity */
export function groupColumns(monthCols: MonthColumn[], granularity: Granularity): { key: string; label: string; monthKeys: string[] }[] {
  if (granularity === "monthly") {
    return monthCols.map(c => ({ key: c.key, label: c.label, monthKeys: [c.key] }));
  }

  if (granularity === "biweekly") {
    // For biweekly, each month gets 2 columns: 1-15 and 16-end
    const result: { key: string; label: string; monthKeys: string[] }[] = [];
    for (const c of monthCols) {
      result.push({ key: `${c.key}-Q1`, label: `${MONTHS_PT[c.month - 1]} 1Q/${c.year}`, monthKeys: [c.key] });
      result.push({ key: `${c.key}-Q2`, label: `${MONTHS_PT[c.month - 1]} 2Q/${c.year}`, monthKeys: [c.key] });
    }
    return result;
  }

  const groupSize = granularity === "quarterly" ? 3 : granularity === "semiannual" ? 6 : 12;
  const groups: { key: string; label: string; monthKeys: string[] }[] = [];

  for (let i = 0; i < monthCols.length; i += groupSize) {
    const chunk = monthCols.slice(i, i + groupSize);
    if (chunk.length === 0) continue;
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    const label = chunk.length === 1
      ? first.label
      : `${MONTHS_PT[first.month - 1]}/${first.year} - ${MONTHS_PT[last.month - 1]}/${last.year}`;
    groups.push({
      key: `${first.key}_${last.key}`,
      label,
      monthKeys: chunk.map(c => c.key),
    });
  }
  return groups;
}

export function getStageTotalValue(stage: StageRow, stages: StageRow[]): number {
  const hasChildren = stages.some(s => s.parent_id === stage.id);
  if (!hasChildren) return Number(stage.total_value) || 0;
  const sumChildren = (id: string): number => {
    const children = stages.filter(s => s.parent_id === id);
    if (children.length === 0) {
      const s = stages.find(st => st.id === id);
      return s ? Number(s.total_value) || 0 : 0;
    }
    return children.reduce((sum, c) => sum + sumChildren(c.id), 0);
  };
  return sumChildren(stage.id);
}
