import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRNumber } from "@/components/ui/masked-number-input";

interface StageRow {
  id: string;
  parent_id: string | null;
  code: string;
  name: string;
  level: number;
  position: number;
  start_date: string | null;
  end_date: string | null;
  status: string;
  total_value: number;
}

interface Props {
  studyId: string;
}

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateBR(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function getEffectiveDates(stage: StageRow, allStages: StageRow[]): { start: string | null; end: string | null } {
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

function diffDays(a: string, b: string): number {
  const da = new Date(a + "T12:00:00");
  const db = new Date(b + "T12:00:00");
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Generate monthly columns between two dates */
function generateMonthColumns(minDate: string, maxDate: string): { key: string; label: string; year: number; month: number; start: string; end: string }[] {
  const cols: { key: string; label: string; year: number; month: number; start: string; end: string }[] = [];
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

/** Calculate how many days of a stage fall within a given month */
function daysInMonth(stageStart: string, stageEnd: string, monthStart: string, monthEnd: string): number {
  const overlapStart = stageStart > monthStart ? stageStart : monthStart;
  const overlapEnd = stageEnd < monthEnd ? stageEnd : monthEnd;
  if (overlapStart > overlapEnd) return 0;
  return diffDays(overlapStart, overlapEnd) + 1;
}

type ViewMode = "value" | "percent";

export default function PhysicalFinancialSchedule({ studyId }: Props) {
  const [stages, setStages] = useState<StageRow[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [selectedStageIds, setSelectedStageIds] = useState<Set<string>>(new Set());
  const [filterApplied, setFilterApplied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("value");

  const sidebarRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const fetchStages = useCallback(async () => {
    const { data } = await supabase
      .from("construction_stages" as any)
      .select("id, parent_id, code, name, level, position, start_date, end_date, status, total_value")
      .eq("study_id", studyId)
      .eq("is_deleted", false)
      .order("position");
    if (data) setStages(data as any[]);
  }, [studyId]);

  useEffect(() => { fetchStages(); }, [fetchStages]);

  // Auto-expand roots
  useEffect(() => {
    const roots = stages.filter(s => !s.parent_id);
    setExpanded(new Set(roots.map(s => s.id)));
  }, [stages.length]);

  // Sync vertical scroll
  useEffect(() => {
    const sidebar = sidebarRef.current;
    const table = tableRef.current;
    if (!sidebar || !table) return;
    let syncing = false;
    const syncA = () => { if (!syncing) { syncing = true; table.scrollTop = sidebar.scrollTop; syncing = false; } };
    const syncB = () => { if (!syncing) { syncing = true; sidebar.scrollTop = table.scrollTop; syncing = false; } };
    sidebar.addEventListener("scroll", syncA);
    table.addEventListener("scroll", syncB);
    return () => { sidebar.removeEventListener("scroll", syncA); table.removeEventListener("scroll", syncB); };
  }, []);

  const rootStages = stages.filter(s => !s.parent_id);

  const visibleStages = useMemo(() => {
    const result: StageRow[] = [];
    const addStage = (stage: StageRow) => {
      if (filterApplied && selectedStageIds.size > 0) {
        const isSelected = selectedStageIds.has(stage.id);
        const hasSelectedDescendant = stages.some(s => {
          let cur = s;
          while (cur.parent_id) {
            if (cur.parent_id === stage.id && selectedStageIds.has(cur.id)) return true;
            const parent = stages.find(p => p.id === cur.parent_id);
            if (!parent) break;
            cur = parent;
          }
          return false;
        });
        if (!isSelected && !hasSelectedDescendant) return;
      }
      result.push(stage);
      if (expanded.has(stage.id)) {
        stages.filter(s => s.parent_id === stage.id).sort((a, b) => a.position - b.position).forEach(addStage);
      }
    };
    rootStages.sort((a, b) => a.position - b.position).forEach(addStage);
    return result;
  }, [stages, expanded, filterApplied, selectedStageIds, rootStages]);

  // Timeline bounds
  const allEffectiveDates = stages.flatMap(s => {
    const hasChildren = stages.some(c => c.parent_id === s.id);
    if (hasChildren) {
      const eff = getEffectiveDates(s, stages);
      return [eff.start, eff.end].filter(Boolean) as string[];
    }
    return [s.start_date, s.end_date].filter(Boolean) as string[];
  });
  const globalMin = allEffectiveDates.length > 0 ? allEffectiveDates.sort()[0] : todayISO();
  const globalMax = allEffectiveDates.length > 0 ? allEffectiveDates.sort().reverse()[0] : addDays(todayISO(), 90);

  const effectiveMin = periodStart || globalMin;
  const effectiveMax = periodEnd || globalMax;

  // Monthly columns
  const monthColumns = useMemo(() => generateMonthColumns(effectiveMin, effectiveMax), [effectiveMin, effectiveMax]);

  // For each leaf stage, distribute total_value proportionally across months
  // For parent stages, aggregate children values
  const stageMonthValues = useMemo(() => {
    const map = new Map<string, Map<string, number>>();

    // First compute leaf values
    for (const stage of stages) {
      const hasChildren = stages.some(s => s.parent_id === stage.id);
      if (hasChildren) continue;

      const dates = { start: stage.start_date, end: stage.end_date };
      if (!dates.start || !dates.end) continue;

      const totalDays = diffDays(dates.start, dates.end) + 1;
      if (totalDays <= 0) continue;

      const valuePerDay = (Number(stage.total_value) || 0) / totalDays;
      const monthMap = new Map<string, number>();

      for (const col of monthColumns) {
        const days = daysInMonth(dates.start, dates.end, col.start, col.end);
        if (days > 0) {
          monthMap.set(col.key, days * valuePerDay);
        }
      }
      map.set(stage.id, monthMap);
    }

    // Aggregate parents (bottom-up by level)
    const maxLevel = Math.max(...stages.map(s => s.level), 0);
    for (let lvl = maxLevel - 1; lvl >= 0; lvl--) {
      for (const stage of stages.filter(s => s.level === lvl)) {
        const children = stages.filter(s => s.parent_id === stage.id);
        if (children.length === 0) continue;
        const parentMap = new Map<string, number>();
        for (const col of monthColumns) {
          let sum = 0;
          for (const child of children) {
            sum += map.get(child.id)?.get(col.key) || 0;
          }
          if (sum > 0) parentMap.set(col.key, sum);
        }
        map.set(stage.id, parentMap);
      }
    }

    return map;
  }, [stages, monthColumns]);

  // Grand totals per month
  const monthTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const col of monthColumns) {
      let sum = 0;
      for (const stage of stages) {
        const hasChildren = stages.some(s => s.parent_id === stage.id);
        if (hasChildren) continue; // only count leaves to avoid double counting
        sum += stageMonthValues.get(stage.id)?.get(col.key) || 0;
      }
      totals.set(col.key, sum);
    }
    return totals;
  }, [monthColumns, stages, stageMonthValues]);

  // Grand total overall
  const grandTotal = stages.reduce((sum, s) => {
    const hasChildren = stages.some(c => c.parent_id === s.id);
    return sum + (hasChildren ? 0 : Number(s.total_value) || 0);
  }, 0);

  // Accumulated totals per month
  const monthAccumulated = useMemo(() => {
    const acc = new Map<string, number>();
    let running = 0;
    for (const col of monthColumns) {
      running += monthTotals.get(col.key) || 0;
      acc.set(col.key, running);
    }
    return acc;
  }, [monthColumns, monthTotals]);

  // Stage total value (for percentage calc)
  const getStageTotalValue = (stage: StageRow): number => {
    const hasChildren = stages.some(s => s.parent_id === stage.id);
    if (!hasChildren) return Number(stage.total_value) || 0;
    // Sum leaf descendants
    const sumChildren = (id: string): number => {
      const children = stages.filter(s => s.parent_id === id);
      if (children.length === 0) {
        const s = stages.find(st => st.id === id);
        return s ? Number(s.total_value) || 0 : 0;
      }
      return children.reduce((sum, c) => sum + sumChildren(c.id), 0);
    };
    return sumChildren(stage.id);
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allStageOptions = stages.map(s => ({ id: s.id, label: `${s.code} - ${s.name}` }));
  const toggleStageFilter = (id: string) => {
    setSelectedStageIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const setPeriodPreset = (preset: "today" | "month" | "year") => {
    const d = new Date();
    if (preset === "today") { setPeriodStart(todayISO()); setPeriodEnd(todayISO()); }
    else if (preset === "month") {
      setPeriodStart(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10));
      setPeriodEnd(new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10));
    } else {
      setPeriodStart(`${d.getFullYear()}-01-01`);
      setPeriodEnd(`${d.getFullYear()}-12-31`);
    }
  };

  const applyFilters = () => setFilterApplied(true);
  const clearFilters = () => {
    setPeriodStart(""); setPeriodEnd("");
    setSelectedStageIds(new Set());
    setFilterApplied(false);
  };

  const ROW_HEIGHT = 36;
  const COL_WIDTH = 110;
  const SIDEBAR_WIDTH = 250;
  const TOTAL_COL_WIDTH = 110;

  const fmt = (v: number) => formatBRNumber(v);
  const fmtPercent = (v: number) => `${formatBRNumber(v)}%`;

  const getCellValue = (stageId: string, colKey: string, stageTotal: number): string => {
    const val = stageMonthValues.get(stageId)?.get(colKey) || 0;
    if (val === 0) return "-";
    if (viewMode === "percent") {
      return stageTotal > 0 ? fmtPercent((val / stageTotal) * 100) : "-";
    }
    return fmt(val);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">Cronograma Físico-Financeiro</h2>

      {/* Summary */}
      <div className="rounded-xl border p-4 bg-card shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Período</p>
            <p className="text-lg font-semibold text-foreground">
              {allEffectiveDates.length > 0 ? `${formatDateBR(globalMin)} — ${formatDateBR(globalMax)}` : "Sem datas definidas"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground mb-1">Valor Total</p>
            <p className="text-lg font-semibold text-foreground">R$ {fmt(grandTotal)}</p>
          </div>
        </div>
      </div>

      {/* Filters - same as Gantt */}
      <div className="rounded-xl border p-4 bg-card shadow-sm space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">Período:</span>
          <Input type="date" className="w-40" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
          <Input type="date" className="w-40" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
          <Button variant="outline" size="sm" onClick={() => setPeriodPreset("today")}>Hoje</Button>
          <Button variant="outline" size="sm" onClick={() => setPeriodPreset("month")}>Este Mês</Button>
          <Button variant="outline" size="sm" onClick={() => setPeriodPreset("year")}>Este Ano</Button>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs">
                Etapas {selectedStageIds.size > 0 && `(${selectedStageIds.size})`} ▼
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 max-h-60 overflow-y-auto p-2" align="start">
              {allStageOptions.map(opt => (
                <label key={opt.id} className="flex items-center gap-2 py-1 px-1 hover:bg-muted rounded cursor-pointer text-sm">
                  <Checkbox checked={selectedStageIds.has(opt.id)} onCheckedChange={() => toggleStageFilter(opt.id)} />
                  <span className="truncate">{opt.label}</span>
                </label>
              ))}
            </PopoverContent>
          </Popover>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Exibição:</span>
            <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="value">Valor (R$)</SelectItem>
                <SelectItem value="percent">Percentual (%)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button size="sm" onClick={applyFilters}>Aplicar</Button>
          <Button variant="outline" size="sm" onClick={clearFilters}>Limpar</Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex" style={{ height: Math.max((visibleStages.length + 3) * ROW_HEIGHT + ROW_HEIGHT + 2, 200) }}>
          {/* Sidebar - Stage names */}
          <div className="flex-shrink-0 border-r bg-card z-10 flex flex-col" style={{ width: SIDEBAR_WIDTH }}>
            <div className="border-b flex items-center px-3 bg-muted/30 shrink-0" style={{ height: ROW_HEIGHT }}>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Etapas</span>
            </div>
            <div
              ref={sidebarRef}
              className="overflow-x-auto overflow-y-scroll flex-1 gantt-sidebar"
            >
              <div style={{ minWidth: SIDEBAR_WIDTH }}>
                {visibleStages.map(stage => {
                  const hasChildren = stages.some(s => s.parent_id === stage.id);
                  const isExpanded = expanded.has(stage.id);
                  return (
                    <div
                      key={stage.id}
                      className={cn(
                        "flex items-center border-b hover:bg-muted/30 transition-colors whitespace-nowrap",
                        hasChildren ? "font-semibold" : ""
                      )}
                      style={{ height: ROW_HEIGHT, paddingLeft: `${stage.level * 16 + 8}px` }}
                    >
                      {hasChildren ? (
                        <button onClick={() => toggleExpand(stage.id)} className="mr-1 p-0.5 rounded hover:bg-muted">
                          {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                        </button>
                      ) : (
                        <span className="w-4 mr-1" />
                      )}
                      <span className="text-xs text-foreground/80">{stage.code} - {stage.name}</span>
                    </div>
                  );
                })}
                {/* Footer rows in sidebar */}
                <div className="border-b bg-muted/20 flex items-center px-3 font-semibold" style={{ height: ROW_HEIGHT }}>
                  <span className="text-xs text-foreground">Total Mensal</span>
                </div>
                <div className="border-b bg-muted/20 flex items-center px-3 font-semibold" style={{ height: ROW_HEIGHT }}>
                  <span className="text-xs text-foreground">Acumulado</span>
                </div>
                <div className="border-b bg-muted/20 flex items-center px-3 font-semibold" style={{ height: ROW_HEIGHT }}>
                  <span className="text-xs text-foreground">% Acumulado</span>
                </div>
              </div>
            </div>
          </div>

          {/* Data columns */}
          <div
            ref={tableRef}
            className="flex-1 overflow-auto"
          >
            <div style={{ width: (monthColumns.length + 1) * COL_WIDTH, minWidth: "100%" }}>
              {/* Header */}
              <div className="flex bg-muted/30 sticky top-0 z-10 border-b" style={{ height: ROW_HEIGHT }}>
                {monthColumns.map(col => (
                  <div
                    key={col.key}
                    className="flex-shrink-0 border-r flex items-center justify-center text-xs text-muted-foreground font-medium"
                    style={{ width: COL_WIDTH }}
                  >
                    {col.label}
                  </div>
                ))}
                <div
                  className="flex-shrink-0 border-r flex items-center justify-center text-xs font-semibold text-foreground bg-muted/50"
                  style={{ width: TOTAL_COL_WIDTH }}
                >
                  Total
                </div>
              </div>

              {/* Data rows */}
              {visibleStages.map((stage, i) => {
                const hasChildren = stages.some(s => s.parent_id === stage.id);
                const stageTotal = getStageTotalValue(stage);
                return (
                  <div
                    key={stage.id}
                    className={cn("flex border-b", i % 2 === 0 ? "bg-muted/10" : "", hasChildren ? "bg-muted/20" : "")}
                    style={{ height: ROW_HEIGHT }}
                  >
                    {monthColumns.map(col => (
                      <div
                        key={col.key}
                        className="flex-shrink-0 border-r flex items-center justify-end px-2 text-xs text-foreground/80"
                        style={{ width: COL_WIDTH }}
                      >
                        {getCellValue(stage.id, col.key, stageTotal)}
                      </div>
                    ))}
                    <div
                      className="flex-shrink-0 border-r flex items-center justify-end px-2 text-xs font-semibold text-foreground bg-muted/10"
                      style={{ width: TOTAL_COL_WIDTH }}
                    >
                      {viewMode === "percent" ? "100,00%" : `R$ ${fmt(stageTotal)}`}
                    </div>
                  </div>
                );
              })}

              {/* Footer: Total Mensal */}
              <div className="flex border-b bg-muted/20" style={{ height: ROW_HEIGHT }}>
                {monthColumns.map(col => (
                  <div key={col.key} className="flex-shrink-0 border-r flex items-center justify-end px-2 text-xs font-semibold text-foreground" style={{ width: COL_WIDTH }}>
                    {viewMode === "percent"
                      ? (grandTotal > 0 ? fmtPercent(((monthTotals.get(col.key) || 0) / grandTotal) * 100) : "-")
                      : `R$ ${fmt(monthTotals.get(col.key) || 0)}`}
                  </div>
                ))}
                <div className="flex-shrink-0 border-r flex items-center justify-end px-2 text-xs font-bold text-foreground bg-muted/30" style={{ width: TOTAL_COL_WIDTH }}>
                  {viewMode === "percent" ? "100,00%" : `R$ ${fmt(grandTotal)}`}
                </div>
              </div>

              {/* Footer: Acumulado */}
              <div className="flex border-b bg-muted/20" style={{ height: ROW_HEIGHT }}>
                {monthColumns.map(col => (
                  <div key={col.key} className="flex-shrink-0 border-r flex items-center justify-end px-2 text-xs font-semibold text-foreground" style={{ width: COL_WIDTH }}>
                    {viewMode === "percent"
                      ? (grandTotal > 0 ? fmtPercent(((monthAccumulated.get(col.key) || 0) / grandTotal) * 100) : "-")
                      : `R$ ${fmt(monthAccumulated.get(col.key) || 0)}`}
                  </div>
                ))}
                <div className="flex-shrink-0 border-r flex items-center justify-end px-2 text-xs font-bold text-foreground bg-muted/30" style={{ width: TOTAL_COL_WIDTH }}>
                  {viewMode === "percent" ? "100,00%" : `R$ ${fmt(grandTotal)}`}
                </div>
              </div>

              {/* Footer: % Acumulado */}
              <div className="flex border-b bg-muted/20" style={{ height: ROW_HEIGHT }}>
                {monthColumns.map(col => (
                  <div key={col.key} className="flex-shrink-0 border-r flex items-center justify-end px-2 text-xs font-semibold text-primary" style={{ width: COL_WIDTH }}>
                    {grandTotal > 0 ? fmtPercent(((monthAccumulated.get(col.key) || 0) / grandTotal) * 100) : "-"}
                  </div>
                ))}
                <div className="flex-shrink-0 border-r flex items-center justify-end px-2 text-xs font-bold text-primary bg-muted/30" style={{ width: TOTAL_COL_WIDTH }}>
                  100,00%
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
