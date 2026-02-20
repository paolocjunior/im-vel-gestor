import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { ChevronDown, ChevronRight, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRNumber } from "@/components/ui/masked-number-input";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  StageRow, Granularity, generateMonthColumns, groupColumns,
  getEffectiveDates, todayISO, addDays, formatDateBR, diffDays, getStageTotalValue
} from "./schedule/scheduleUtils";

interface Props {
  studyId: string;
}

export default function PhysicalFinancialSchedule({ studyId }: Props) {
  const [stages, setStages] = useState<StageRow[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [selectedStageIds, setSelectedStageIds] = useState<Set<string>>(new Set());
  const [filterApplied, setFilterApplied] = useState(false);
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  // Monthly values: Map<stageId, Map<monthKey, value>>
  const [monthlyValues, setMonthlyValues] = useState<Map<string, Map<string, number>>>(new Map());
  const [editingCell, setEditingCell] = useState<{ stageId: string; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState("");

  const sidebarRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const fetchStages = useCallback(async () => {
    const { data } = await supabase
      .from("construction_stages" as any)
      .select("id, parent_id, code, name, level, position, start_date, end_date, actual_start_date, actual_end_date, status, total_value")
      .eq("study_id", studyId)
      .eq("is_deleted", false)
      .order("position");
    if (data) setStages(data as any[]);
  }, [studyId]);

  const fetchMonthlyValues = useCallback(async () => {
    const { data } = await supabase
      .from("construction_stage_monthly_values" as any)
      .select("stage_id, month_key, value")
      .eq("study_id", studyId);
    if (data) {
      const map = new Map<string, Map<string, number>>();
      for (const row of data as any[]) {
        if (!map.has(row.stage_id)) map.set(row.stage_id, new Map());
        map.get(row.stage_id)!.set(row.month_key, Number(row.value) || 0);
      }
      setMonthlyValues(map);
    }
  }, [studyId]);

  useEffect(() => { fetchStages(); fetchMonthlyValues(); }, [fetchStages, fetchMonthlyValues]);

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

  const monthColumns = useMemo(() => generateMonthColumns(effectiveMin, effectiveMax), [effectiveMin, effectiveMax]);
  const groupedColumns = useMemo(() => groupColumns(monthColumns, granularity), [monthColumns, granularity]);

  // Grand total (leaves only)
  const grandTotal = stages.reduce((sum, s) => {
    const hasChildren = stages.some(c => c.parent_id === s.id);
    return sum + (hasChildren ? 0 : Number(s.total_value) || 0);
  }, 0);

  // Get monthly value for a stage + group of month keys
  const getStageGroupValue = (stageId: string, monthKeys: string[]): number => {
    const stageMap = monthlyValues.get(stageId);
    if (!stageMap) return 0;
    return monthKeys.reduce((sum, mk) => sum + (stageMap.get(mk) || 0), 0);
  };

  // Get aggregated value for parent stages (sum children)
  const getAggregatedGroupValue = useCallback((stageId: string, monthKeys: string[]): number => {
    const children = stages.filter(s => s.parent_id === stageId);
    if (children.length === 0) return getStageGroupValue(stageId, monthKeys);
    return children.reduce((sum, c) => sum + getAggregatedGroupValue(c.id, monthKeys), 0);
  }, [stages, monthlyValues]);

  // Realizado = sum of all monthly values for a stage
  const getRealizado = useCallback((stageId: string): number => {
    const children = stages.filter(s => s.parent_id === stageId);
    if (children.length === 0) {
      const stageMap = monthlyValues.get(stageId);
      if (!stageMap) return 0;
      let sum = 0;
      stageMap.forEach(v => sum += v);
      return sum;
    }
    return children.reduce((sum, c) => sum + getRealizado(c.id), 0);
  }, [stages, monthlyValues]);

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

  const applyFilters = () => setFilterApplied(true);
  const clearFilters = () => {
    setPeriodStart(""); setPeriodEnd("");
    setSelectedStageIds(new Set());
    setFilterApplied(false);
  };

  // Save monthly value
  const saveMonthlyValue = async (stageId: string, monthKey: string, value: number) => {
    // For grouped columns (biweekly), monthKey might contain Q1/Q2 suffix - use base month
    const baseMonthKey = monthKey.replace(/-Q[12]$/, "");

    const { data: existing } = await supabase
      .from("construction_stage_monthly_values" as any)
      .select("id")
      .eq("stage_id", stageId)
      .eq("month_key", baseMonthKey)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("construction_stage_monthly_values" as any)
        .update({ value, updated_at: new Date().toISOString() } as any)
        .eq("id", (existing as any).id);
    } else if (value > 0) {
      await supabase
        .from("construction_stage_monthly_values" as any)
        .insert({ stage_id: stageId, study_id: studyId, month_key: baseMonthKey, value } as any);
    }
    fetchMonthlyValues();
  };

  // Save actual dates
  const saveActualDate = async (stageId: string, field: "actual_start_date" | "actual_end_date", date: Date | undefined) => {
    const value = date ? date.toISOString().slice(0, 10) : null;
    await supabase
      .from("construction_stages" as any)
      .update({ [field]: value } as any)
      .eq("id", stageId);
    fetchStages();
  };

  const handleCellDoubleClick = (stageId: string, colKey: string, monthKeys: string[]) => {
    const hasChildren = stages.some(s => s.parent_id === stageId);
    if (hasChildren) return; // Only leaves are editable
    const currentVal = getStageGroupValue(stageId, monthKeys);
    setEditingCell({ stageId, colKey });
    setEditValue(currentVal > 0 ? String(currentVal) : "");
  };

  const commitEdit = () => {
    if (!editingCell) return;
    const numVal = parseFloat(editValue.replace(/\./g, "").replace(",", ".")) || 0;
    // For grouped columns, save to the first month key
    const group = groupedColumns.find(g => g.key === editingCell.colKey);
    if (group && group.monthKeys.length > 0) {
      saveMonthlyValue(editingCell.stageId, group.monthKeys[0], numVal);
    }
    setEditingCell(null);
    setEditValue("");
  };

  const fmt = (v: number) => formatBRNumber(v);
  const fmtPercent = (v: number) => `${formatBRNumber(v)}%`;

  const ROW_HEIGHT = 48;
  const COL_WIDTH_MONTH = 120;
  const FIXED_COLS_WIDTH = 1100; // Total width for fixed columns

  // Footer totals per grouped column
  const getFooterGroupTotal = (monthKeys: string[]): number => {
    return stages
      .filter(s => !stages.some(c => c.parent_id === s.id)) // leaves only
      .reduce((sum, s) => sum + getStageGroupValue(s.id, monthKeys), 0);
  };

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-foreground">Cronograma Físico-Financeiro</h2>

      {/* Summary */}
      <div className="rounded-xl border p-3 bg-card shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Período</p>
            <p className="text-base font-semibold text-foreground">
              {allEffectiveDates.length > 0 ? `${formatDateBR(globalMin)} — ${formatDateBR(globalMax)}` : "Sem datas definidas"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground mb-0.5">Valor Total</p>
            <p className="text-base font-semibold text-foreground">R$ {fmt(grandTotal)}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border p-3 bg-card shadow-sm space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">Período:</span>
          <Input type="date" className="w-36 h-8 text-xs" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
          <Input type="date" className="w-36 h-8 text-xs" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">Granularidade:</span>
          <Select value={granularity} onValueChange={(v) => setGranularity(v as Granularity)}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="biweekly">Quinzenal</SelectItem>
              <SelectItem value="monthly">Mensal</SelectItem>
              <SelectItem value="quarterly">Trimestral</SelectItem>
              <SelectItem value="semiannual">Semestral</SelectItem>
              <SelectItem value="annual">Anual</SelectItem>
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs h-8">
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

          <Button size="sm" className="h-8 text-xs" onClick={applyFilters}>Aplicar</Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={clearFilters}>Limpar</Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
          <table className="border-collapse text-xs" style={{ minWidth: FIXED_COLS_WIDTH + groupedColumns.length * COL_WIDTH_MONTH }}>
            <thead className="sticky top-0 z-20 bg-muted/50">
              <tr>
                <th className="sticky left-0 z-30 bg-muted/80 border-b border-r px-2 text-left font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap" style={{ minWidth: 200 }}>Etapas</th>
                <th className="border-b border-r px-1 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ minWidth: 60 }}>Peso</th>
                <th className="border-b border-r px-1 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ minWidth: 90 }}>Previsto</th>
                <th className="border-b border-r px-1 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ minWidth: 90 }}>Realizado</th>
                <th className="border-b border-r px-1 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ minWidth: 80 }}>Real x Prev</th>
                <th className="border-b border-r px-1 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ minWidth: 85 }}>Data Inicial</th>
                <th className="border-b border-r px-1 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ minWidth: 85 }}>Data Final</th>
                <th className="border-b border-r px-1 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ minWidth: 70 }}>Duração</th>
                <th className="border-b border-r px-1 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ minWidth: 110 }}>Início Etapa</th>
                <th className="border-b border-r px-1 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ minWidth: 110 }}>Término Etapa</th>
                <th className="border-b border-r px-1 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ minWidth: 70 }}>Duração</th>
                {groupedColumns.map(col => (
                  <th key={col.key} className="border-b border-r px-1 text-center font-medium text-muted-foreground whitespace-nowrap" style={{ minWidth: COL_WIDTH_MONTH }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleStages.map((stage, i) => {
                const hasChildren = stages.some(s => s.parent_id === stage.id);
                const isExpanded = expanded.has(stage.id);
                const stageTotal = getStageTotalValue(stage, stages);
                const realizado = getRealizado(stage.id);
                const realVsPrev = stageTotal > 0 ? (realizado / stageTotal) * 100 : 0;
                const isRoot = !stage.parent_id;

                // Peso: only for root/macro stages, and only if they have value
                const peso = isRoot && grandTotal > 0 && stageTotal > 0 ? (stageTotal / grandTotal) * 100 : null;

                // Duração planejada
                const plannedDuration = stage.start_date && stage.end_date
                  ? diffDays(stage.start_date, stage.end_date) + 1
                  : null;

                // Duração real
                const actualDuration = stage.actual_start_date && stage.actual_end_date
                  ? diffDays(stage.actual_start_date, stage.actual_end_date) + 1
                  : null;

                return (
                  <tr key={stage.id} className={cn(
                    "border-b hover:bg-muted/20 transition-colors",
                    i % 2 === 0 ? "bg-background" : "bg-muted/5",
                    hasChildren ? "bg-muted/15 font-semibold" : ""
                  )}>
                    {/* Etapa name */}
                    <td className="sticky left-0 z-10 bg-inherit border-r px-1 whitespace-nowrap" style={{ paddingLeft: `${stage.level * 16 + 8}px` }}>
                      <div className="flex items-center gap-1">
                        {hasChildren ? (
                          <button onClick={() => toggleExpand(stage.id)} className="p-0.5 rounded hover:bg-muted">
                            {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                          </button>
                        ) : <span className="w-4" />}
                        <span className="text-foreground/80 truncate max-w-[160px]">{stage.code} - {stage.name}</span>
                      </div>
                    </td>
                    {/* Peso */}
                    <td className="border-r px-1 text-center text-foreground/70">
                      {peso !== null ? fmtPercent(peso) : "-"}
                    </td>
                    {/* Previsto */}
                    <td className="border-r px-1 text-right text-foreground/80 whitespace-nowrap">
                      {stageTotal > 0 ? `R$ ${fmt(stageTotal)}` : "-"}
                    </td>
                    {/* Realizado */}
                    <td className="border-r px-1 text-right text-foreground/80 whitespace-nowrap">
                      {realizado > 0 ? `R$ ${fmt(realizado)}` : "-"}
                    </td>
                    {/* Real x Previsto */}
                    <td className={cn("border-r px-1 text-center", realVsPrev > 100 ? "text-destructive" : "text-foreground/70")}>
                      {stageTotal > 0 ? fmtPercent(realVsPrev) : "-"}
                    </td>
                    {/* Data Inicial */}
                    <td className="border-r px-1 text-center text-foreground/70">
                      {stage.start_date ? formatDateBR(stage.start_date) : "-"}
                    </td>
                    {/* Data Final */}
                    <td className="border-r px-1 text-center text-foreground/70">
                      {stage.end_date ? formatDateBR(stage.end_date) : "-"}
                    </td>
                    {/* Duração planejada */}
                    <td className="border-r px-1 text-center text-foreground/70">
                      {plannedDuration !== null ? `${plannedDuration} dias` : "-"}
                    </td>
                    {/* Início da Etapa (editable date) */}
                    <td className="border-r px-1 text-center">
                      <DatePickerCell
                        value={stage.actual_start_date}
                        onChange={(d) => saveActualDate(stage.id, "actual_start_date", d)}
                      />
                    </td>
                    {/* Término da Etapa (editable date) */}
                    <td className="border-r px-1 text-center">
                      <DatePickerCell
                        value={stage.actual_end_date}
                        onChange={(d) => saveActualDate(stage.id, "actual_end_date", d)}
                      />
                    </td>
                    {/* Duração real */}
                    <td className="border-r px-1 text-center text-foreground/70">
                      {actualDuration !== null ? `${actualDuration} dias` : "-"}
                    </td>
                    {/* Month cells */}
                    {groupedColumns.map(col => {
                      const val = hasChildren
                        ? getAggregatedGroupValue(stage.id, col.monthKeys)
                        : getStageGroupValue(stage.id, col.monthKeys);
                      const pct = stageTotal > 0 ? (val / stageTotal) * 100 : 0;
                      const isEditing = editingCell?.stageId === stage.id && editingCell?.colKey === col.key;

                      if (isEditing) {
                        return (
                          <td key={col.key} className="border-r px-0.5">
                            <Input
                              autoFocus
                              className="h-7 text-xs text-right w-full"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={commitEdit}
                              onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") { setEditingCell(null); setEditValue(""); } }}
                            />
                          </td>
                        );
                      }

                      return (
                        <td
                          key={col.key}
                          className={cn(
                            "border-r px-1 text-right cursor-pointer hover:bg-accent/20 transition-colors",
                            !hasChildren && "cursor-text"
                          )}
                          onDoubleClick={() => handleCellDoubleClick(stage.id, col.key, col.monthKeys)}
                          style={{ minWidth: COL_WIDTH_MONTH }}
                        >
                          {val > 0 ? (
                            <div className="flex flex-col items-end">
                              <span className="text-foreground/90 text-xs font-medium">R$ {fmt(val)}</span>
                              <span className="text-muted-foreground text-[10px]">{fmtPercent(pct)}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/50">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* Footer: Total Mensal */}
              <tr className="bg-muted/20 font-semibold border-t-2">
                <td className="sticky left-0 z-10 bg-muted/30 border-r px-2 text-foreground">Total Mensal</td>
                <td className="border-r" />
                <td className="border-r px-1 text-right text-foreground whitespace-nowrap">R$ {fmt(grandTotal)}</td>
                <td className="border-r px-1 text-right text-foreground whitespace-nowrap">
                  {(() => { const total = stages.filter(s => !stages.some(c => c.parent_id === s.id)).reduce((sum, s) => sum + getRealizado(s.id), 0); return total > 0 ? `R$ ${fmt(total)}` : "-"; })()}
                </td>
                <td className="border-r" />
                <td className="border-r" />
                <td className="border-r" />
                <td className="border-r" />
                <td className="border-r" />
                <td className="border-r" />
                <td className="border-r" />
                {groupedColumns.map(col => {
                  const total = getFooterGroupTotal(col.monthKeys);
                  return (
                    <td key={col.key} className="border-r px-1 text-right text-foreground">
                      {total > 0 ? (
                        <div className="flex flex-col items-end">
                          <span className="text-xs font-medium">R$ {fmt(total)}</span>
                          <span className="text-[10px] text-muted-foreground">{grandTotal > 0 ? fmtPercent((total / grandTotal) * 100) : "-"}</span>
                        </div>
                      ) : "-"}
                    </td>
                  );
                })}
              </tr>

              {/* Footer: Acumulado */}
              <tr className="bg-muted/20 font-semibold">
                <td className="sticky left-0 z-10 bg-muted/30 border-r px-2 text-foreground">Acumulado</td>
                <td className="border-r" /><td className="border-r" /><td className="border-r" /><td className="border-r" />
                <td className="border-r" /><td className="border-r" /><td className="border-r" />
                <td className="border-r" /><td className="border-r" /><td className="border-r" />
                {(() => {
                  let running = 0;
                  return groupedColumns.map(col => {
                    running += getFooterGroupTotal(col.monthKeys);
                    return (
                      <td key={col.key} className="border-r px-1 text-right text-foreground">
                        <div className="flex flex-col items-end">
                          <span className="text-xs font-medium">R$ {fmt(running)}</span>
                          <span className="text-[10px] text-primary">{grandTotal > 0 ? fmtPercent((running / grandTotal) * 100) : "-"}</span>
                        </div>
                      </td>
                    );
                  });
                })()}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** Inline date picker cell */
function DatePickerCell({ value, onChange }: { value: string | null; onChange: (d: Date | undefined) => void }) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(value + "T12:00:00") : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={cn(
          "inline-flex items-center gap-1 text-xs px-1 py-0.5 rounded hover:bg-muted transition-colors w-full justify-center",
          !value && "text-muted-foreground"
        )}>
          {value ? formatDateBR(value) : <CalendarIcon className="h-3 w-3" />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="center">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(d) => { onChange(d); setOpen(false); }}
          className="p-3 pointer-events-auto"
          locale={ptBR}
        />
      </PopoverContent>
    </Popover>
  );
}
