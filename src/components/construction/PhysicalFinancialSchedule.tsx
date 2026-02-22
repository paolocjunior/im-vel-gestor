import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { ChevronDown, ChevronRight, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRNumber } from "@/components/ui/masked-number-input";
import { ptBR } from "date-fns/locale";
import {
  StageRow, generateMonthColumns, groupColumns,
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
  // PV and AC maps: stageId -> monthKey -> value
  const [pvValues, setPvValues] = useState<Map<string, Map<string, number>>>(new Map());
  const [acValues, setAcValues] = useState<Map<string, Map<string, number>>>(new Map());

  const fetchStages = useCallback(async () => {
    const { data } = await supabase
      .from("construction_stages" as any)
      .select("id, parent_id, code, name, level, position, start_date, end_date, actual_start_date, actual_end_date, status, total_value, stage_type")
      .eq("study_id", studyId)
      .eq("is_deleted", false)
      .order("position");
    if (data) setStages(data as any[]);
  }, [studyId]);

  const fetchMonthlyValues = useCallback(async () => {
    const { data } = await supabase
      .from("construction_stage_monthly_values" as any)
      .select("stage_id, month_key, value, value_type")
      .eq("study_id", studyId);
    if (data) {
      const pv = new Map<string, Map<string, number>>();
      const ac = new Map<string, Map<string, number>>();
      for (const row of data as any[]) {
        const target = row.value_type === "planned" ? pv : ac;
        if (!target.has(row.stage_id)) target.set(row.stage_id, new Map());
        target.get(row.stage_id)!.set(row.month_key, Number(row.value) || 0);
      }
      setPvValues(pv);
      setAcValues(ac);
    }
  }, [studyId]);

  useEffect(() => { fetchStages(); fetchMonthlyValues(); }, [fetchStages, fetchMonthlyValues]);

  useEffect(() => {
    const roots = stages.filter(s => !s.parent_id);
    setExpanded(new Set(roots.map(s => s.id)));
  }, [stages.length]);

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
  const groupedColumns = useMemo(() => groupColumns(monthColumns, "monthly"), [monthColumns]);

  const grandTotal = stages.reduce((sum, s) => {
    const hasChildren = stages.some(c => c.parent_id === s.id);
    return sum + (hasChildren ? 0 : Number(s.total_value) || 0);
  }, 0);

  // Helper to get value from a map for a stage and month keys
  const getMapValue = (map: Map<string, Map<string, number>>, stageId: string, monthKeys: string[]): number => {
    const stageMap = map.get(stageId);
    if (!stageMap) return 0;
    return monthKeys.reduce((sum, mk) => sum + (stageMap.get(mk) || 0), 0);
  };

  // Aggregated (recursive) value for parent stages
  const getAggregatedValue = useCallback((map: Map<string, Map<string, number>>, stageId: string, monthKeys: string[]): number => {
    const children = stages.filter(s => s.parent_id === stageId);
    if (children.length === 0) return getMapValue(map, stageId, monthKeys);
    return children.reduce((sum, c) => sum + getAggregatedValue(map, c.id, monthKeys), 0);
  }, [stages]);

  const getTotalForStage = useCallback((map: Map<string, Map<string, number>>, stageId: string): number => {
    const children = stages.filter(s => s.parent_id === stageId);
    if (children.length === 0) {
      const stageMap = map.get(stageId);
      if (!stageMap) return 0;
      let sum = 0;
      stageMap.forEach(v => sum += v);
      return sum;
    }
    return children.reduce((sum, c) => sum + getTotalForStage(map, c.id), 0);
  }, [stages]);

  const getComputedActualDates = useCallback((stageId: string): { start: string | null; end: string | null } => {
    const children = stages.filter(s => s.parent_id === stageId);
    if (children.length === 0) {
      const st = stages.find(s => s.id === stageId);
      return { start: st?.actual_start_date || null, end: st?.actual_end_date || null };
    }
    let minStart: string | null = null;
    let maxEnd: string | null = null;
    for (const child of children) {
      const childDates = getComputedActualDates(child.id);
      if (childDates.start && (!minStart || childDates.start < minStart)) minStart = childDates.start;
      if (childDates.end && (!maxEnd || childDates.end > maxEnd)) maxEnd = childDates.end;
    }
    return { start: minStart, end: maxEnd };
  }, [stages]);

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

  const fmt = (v: number) => formatBRNumber(v);
  const fmtPercent = (v: number) => `${formatBRNumber(v)}%`;

  const COL_WIDTH_MONTH = 140;

  const getFontSize = (level: number) => {
    if (level === 0) return "text-sm";
    if (level === 1) return "text-xs";
    return "text-[11px]";
  };

  // Footer totals for leaf stages only
  const getFooterTotal = (map: Map<string, Map<string, number>>, monthKeys: string[]): number => {
    return stages
      .filter(s => !stages.some(c => c.parent_id === s.id))
      .reduce((sum, s) => sum + getMapValue(map, s.id, monthKeys), 0);
  };

  const totalPV = stages.filter(s => !stages.some(c => c.parent_id === s.id)).reduce((sum, s) => sum + getTotalForStage(pvValues, s.id), 0);
  const totalAC = stages.filter(s => !stages.some(c => c.parent_id === s.id)).reduce((sum, s) => sum + getTotalForStage(acValues, s.id), 0);

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
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-0.5">PV Total</p>
              <p className="text-base font-semibold text-foreground">R$ {fmt(grandTotal)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-0.5">AC Total</p>
              <p className="text-base font-semibold text-foreground">R$ {fmt(totalAC)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border p-3 bg-card shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">Período:</span>
          <Input type="date" className="w-36 h-8 text-xs" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
          <Input type="date" className="w-36 h-8 text-xs" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />

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

      {/* Tooltip legend */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground px-1">
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-blue-400" /> PV = Planejado (dias corridos)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-green-500" /> AC = Realizado</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-orange-400" /> Desvio = AC − PV</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
          <table className="border-collapse text-xs w-max">
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="sticky left-0 z-30 bg-muted border-b border-r px-2 text-left font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap" style={{ minWidth: 200 }}>Etapas</th>
                <th className="bg-muted border-b border-r px-1 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ minWidth: 60 }}>Peso</th>
                <th className="bg-muted border-b border-r px-1 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ minWidth: 90 }}>PV Total</th>
                <th className="bg-muted border-b border-r px-1 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ minWidth: 90 }}>AC Total</th>
                <th className="bg-muted border-b border-r px-1 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ minWidth: 80 }}>AC/PV</th>
                <th className="bg-muted border-b border-r px-1 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ minWidth: 85 }}>Data Inicial</th>
                <th className="bg-muted border-b border-r px-1 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ minWidth: 85 }}>Data Final</th>
                <th className="bg-muted border-b border-r px-1 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ minWidth: 70 }}>Duração</th>
                <th className="bg-muted border-b border-r px-1 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ minWidth: 110 }}>Início Etapa</th>
                <th className="bg-muted border-b border-r px-1 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ minWidth: 110 }}>Término Etapa</th>
                <th className="bg-muted border-b border-r px-1 text-center font-semibold text-muted-foreground whitespace-nowrap" style={{ minWidth: 70 }}>Duração</th>
                {groupedColumns.map(col => (
                  <th key={col.key} className="bg-muted border-b border-r px-1 text-center font-medium text-muted-foreground whitespace-nowrap" style={{ minWidth: COL_WIDTH_MONTH }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleStages.map((stage) => {
                const hasChildren = stages.some(s => s.parent_id === stage.id);
                const isExpanded = expanded.has(stage.id);
                const stageTotal = getStageTotalValue(stage, stages);
                const stagePVTotal = getTotalForStage(pvValues, stage.id);
                const stageACTotal = getTotalForStage(acValues, stage.id);
                const acVsPv = stagePVTotal > 0 ? (stageACTotal / stagePVTotal) * 100 : 0;
                const isRoot = !stage.parent_id;
                const peso = isRoot && grandTotal > 0 && stageTotal > 0 ? (stageTotal / grandTotal) * 100 : null;

                const isTaxas = stage.stage_type === 'taxas';
                const plannedDates = hasChildren
                  ? getEffectiveDates(stage, stages)
                  : isTaxas
                    ? { start: stage.start_date, end: stage.start_date }
                    : { start: stage.start_date, end: stage.end_date };

                const plannedDuration = plannedDates.start && plannedDates.end
                  ? diffDays(plannedDates.start, plannedDates.end) + 1
                  : null;

                const actualDates = hasChildren
                  ? getComputedActualDates(stage.id)
                  : { start: stage.actual_start_date, end: stage.actual_end_date };

                const actualDuration = actualDates.start && actualDates.end
                  ? diffDays(actualDates.start, actualDates.end) + 1
                  : null;

                const rowBg = hasChildren ? "bg-muted/80" : "bg-background";
                const cellStickyBg = hasChildren ? "bg-muted" : "bg-background";
                const fontSize = getFontSize(stage.level);

                return (
                  <tr key={stage.id} className={cn("border-b hover:bg-muted/20 transition-colors", rowBg)}>
                    <td className={cn("sticky left-0 z-10 border-r px-1 whitespace-nowrap", cellStickyBg, fontSize, hasChildren && "font-semibold")} style={{ paddingLeft: `${stage.level * 16 + 8}px`, minWidth: 200 }}>
                      <div className="flex items-center gap-1">
                        {hasChildren ? (
                          <button onClick={() => toggleExpand(stage.id)} className="p-0.5 rounded hover:bg-muted">
                            {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                          </button>
                        ) : <span className="w-4" />}
                        <span className="text-foreground/80 truncate max-w-[160px]">{stage.code} - {stage.name}</span>
                      </div>
                    </td>
                    <td className={cn("border-r px-1 text-center text-foreground/70", fontSize)} style={{ minWidth: 60 }}>
                      {peso !== null ? fmtPercent(peso) : "-"}
                    </td>
                    <td className={cn("border-r px-1 text-right text-foreground/80 whitespace-nowrap", fontSize)} style={{ minWidth: 90 }}>
                      {stageTotal > 0 ? `R$ ${fmt(stageTotal)}` : "-"}
                    </td>
                    <td className={cn("border-r px-1 text-right text-foreground/80 whitespace-nowrap", fontSize)} style={{ minWidth: 90 }}>
                      {stageACTotal > 0 ? `R$ ${fmt(stageACTotal)}` : "-"}
                    </td>
                    <td className={cn("border-r px-1 text-center", fontSize, acVsPv > 100 ? "text-destructive" : "text-foreground/70")} style={{ minWidth: 80 }}>
                      {stagePVTotal > 0 ? fmtPercent(acVsPv) : "-"}
                    </td>
                    <td className={cn("border-r px-1 text-center text-foreground/70", fontSize)} style={{ minWidth: 85 }}>
                      {plannedDates.start ? formatDateBR(plannedDates.start) : "-"}
                    </td>
                    <td className={cn("border-r px-1 text-center text-foreground/70", fontSize)} style={{ minWidth: 85 }}>
                      {plannedDates.end ? formatDateBR(plannedDates.end) : "-"}
                    </td>
                    <td className={cn("border-r px-1 text-center text-foreground/70", fontSize)} style={{ minWidth: 70 }}>
                      {plannedDuration !== null ? `${plannedDuration} dias` : "-"}
                    </td>
                    <td className={cn("border-r px-1 text-center text-foreground/70", fontSize)} style={{ minWidth: 110 }}>
                      {actualDates.start ? formatDateBR(actualDates.start) : "-"}
                    </td>
                    <td className={cn("border-r px-1 text-center text-foreground/70", fontSize)} style={{ minWidth: 110 }}>
                      {actualDates.end ? formatDateBR(actualDates.end) : "-"}
                    </td>
                    <td className={cn("border-r px-1 text-center text-foreground/70", fontSize)} style={{ minWidth: 70 }}>
                      {actualDuration !== null ? `${actualDuration} dias` : "-"}
                    </td>
                    {/* Month cells: PV + AC */}
                    {groupedColumns.map(col => {
                      const pvVal = hasChildren
                        ? getAggregatedValue(pvValues, stage.id, col.monthKeys)
                        : getMapValue(pvValues, stage.id, col.monthKeys);
                      const acVal = hasChildren
                        ? getAggregatedValue(acValues, stage.id, col.monthKeys)
                        : getMapValue(acValues, stage.id, col.monthKeys);

                      return (
                        <td key={col.key} className="border-r px-1 text-right" style={{ minWidth: COL_WIDTH_MONTH }}>
                          {pvVal > 0 || acVal > 0 ? (
                            <div className="flex flex-col items-end gap-0.5">
                              {pvVal > 0 && (
                                <span className={cn("text-blue-600 dark:text-blue-400", fontSize)}>
                                  PV {fmt(pvVal)}
                                </span>
                              )}
                              {acVal > 0 && (
                                <span className={cn("text-green-700 dark:text-green-400 font-medium", fontSize)}>
                                  AC {fmt(acVal)}
                                </span>
                              )}
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

              {/* Footer: PV Mensal */}
              <tr className="bg-blue-50/50 dark:bg-blue-950/20 border-t-2">
                <td className="sticky left-0 z-10 bg-blue-50 dark:bg-blue-950/30 border-r px-2 text-sm font-bold text-blue-700 dark:text-blue-300 whitespace-nowrap">PV Mensal</td>
                <td className="bg-blue-50 dark:bg-blue-950/30 border-r" />
                <td className="bg-blue-50 dark:bg-blue-950/30 border-r px-1 text-right text-sm font-bold text-blue-700 dark:text-blue-300 whitespace-nowrap">R$ {fmt(grandTotal)}</td>
                <td className="bg-blue-50 dark:bg-blue-950/30 border-r" />
                <td className="bg-blue-50 dark:bg-blue-950/30 border-r" />
                <td className="bg-blue-50 dark:bg-blue-950/30 border-r" />
                <td className="bg-blue-50 dark:bg-blue-950/30 border-r" />
                <td className="bg-blue-50 dark:bg-blue-950/30 border-r" />
                <td className="bg-blue-50 dark:bg-blue-950/30 border-r" />
                <td className="bg-blue-50 dark:bg-blue-950/30 border-r" />
                <td className="bg-blue-50 dark:bg-blue-950/30 border-r" />
                {groupedColumns.map(col => {
                  const total = getFooterTotal(pvValues, col.monthKeys);
                  return (
                    <td key={col.key} className="border-r px-1 text-right bg-blue-50 dark:bg-blue-950/30" style={{ minWidth: COL_WIDTH_MONTH }}>
                      {total > 0 ? (
                        <span className="text-sm font-bold text-blue-700 dark:text-blue-300">R$ {fmt(total)}</span>
                      ) : "-"}
                    </td>
                  );
                })}
              </tr>

              {/* Footer: AC Mensal */}
              <tr className="bg-green-50/50 dark:bg-green-950/20">
                <td className="sticky left-0 z-10 bg-green-50 dark:bg-green-950/30 border-r px-2 text-sm font-bold text-green-700 dark:text-green-300 whitespace-nowrap">AC Mensal</td>
                <td className="bg-green-50 dark:bg-green-950/30 border-r" />
                <td className="bg-green-50 dark:bg-green-950/30 border-r" />
                <td className="bg-green-50 dark:bg-green-950/30 border-r px-1 text-right text-sm font-bold text-green-700 dark:text-green-300 whitespace-nowrap">R$ {fmt(totalAC)}</td>
                <td className="bg-green-50 dark:bg-green-950/30 border-r" />
                <td className="bg-green-50 dark:bg-green-950/30 border-r" />
                <td className="bg-green-50 dark:bg-green-950/30 border-r" />
                <td className="bg-green-50 dark:bg-green-950/30 border-r" />
                <td className="bg-green-50 dark:bg-green-950/30 border-r" />
                <td className="bg-green-50 dark:bg-green-950/30 border-r" />
                <td className="bg-green-50 dark:bg-green-950/30 border-r" />
                {groupedColumns.map(col => {
                  const total = getFooterTotal(acValues, col.monthKeys);
                  return (
                    <td key={col.key} className="border-r px-1 text-right bg-green-50 dark:bg-green-950/30" style={{ minWidth: COL_WIDTH_MONTH }}>
                      {total > 0 ? (
                        <span className="text-sm font-bold text-green-700 dark:text-green-300">R$ {fmt(total)}</span>
                      ) : "-"}
                    </td>
                  );
                })}
              </tr>

              {/* Footer: PV Acumulado */}
              <tr className="bg-blue-50/30 dark:bg-blue-950/10">
                <td className="sticky left-0 z-10 bg-blue-50/60 dark:bg-blue-950/20 border-r px-2 text-sm font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">PV Acumulado</td>
                <td className="bg-blue-50/60 dark:bg-blue-950/20 border-r" />
                <td className="bg-blue-50/60 dark:bg-blue-950/20 border-r" />
                <td className="bg-blue-50/60 dark:bg-blue-950/20 border-r" />
                <td className="bg-blue-50/60 dark:bg-blue-950/20 border-r" />
                <td className="bg-blue-50/60 dark:bg-blue-950/20 border-r" />
                <td className="bg-blue-50/60 dark:bg-blue-950/20 border-r" />
                <td className="bg-blue-50/60 dark:bg-blue-950/20 border-r" />
                <td className="bg-blue-50/60 dark:bg-blue-950/20 border-r" />
                <td className="bg-blue-50/60 dark:bg-blue-950/20 border-r" />
                <td className="bg-blue-50/60 dark:bg-blue-950/20 border-r" />
                {(() => {
                  let running = 0;
                  return groupedColumns.map(col => {
                    running += getFooterTotal(pvValues, col.monthKeys);
                    return (
                      <td key={col.key} className="border-r px-1 text-right bg-blue-50/60 dark:bg-blue-950/20" style={{ minWidth: COL_WIDTH_MONTH }}>
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-bold text-blue-600 dark:text-blue-400">R$ {fmt(running)}</span>
                          <span className="text-[10px] text-blue-500/70">{grandTotal > 0 ? fmtPercent((running / grandTotal) * 100) : "-"}</span>
                        </div>
                      </td>
                    );
                  });
                })()}
              </tr>

              {/* Footer: AC Acumulado */}
              <tr className="bg-green-50/30 dark:bg-green-950/10">
                <td className="sticky left-0 z-10 bg-green-50/60 dark:bg-green-950/20 border-r px-2 text-sm font-bold text-green-600 dark:text-green-400 whitespace-nowrap">AC Acumulado</td>
                <td className="bg-green-50/60 dark:bg-green-950/20 border-r" />
                <td className="bg-green-50/60 dark:bg-green-950/20 border-r" />
                <td className="bg-green-50/60 dark:bg-green-950/20 border-r" />
                <td className="bg-green-50/60 dark:bg-green-950/20 border-r" />
                <td className="bg-green-50/60 dark:bg-green-950/20 border-r" />
                <td className="bg-green-50/60 dark:bg-green-950/20 border-r" />
                <td className="bg-green-50/60 dark:bg-green-950/20 border-r" />
                <td className="bg-green-50/60 dark:bg-green-950/20 border-r" />
                <td className="bg-green-50/60 dark:bg-green-950/20 border-r" />
                <td className="bg-green-50/60 dark:bg-green-950/20 border-r" />
                {(() => {
                  let running = 0;
                  return groupedColumns.map(col => {
                    running += getFooterTotal(acValues, col.monthKeys);
                    return (
                      <td key={col.key} className="border-r px-1 text-right bg-green-50/60 dark:bg-green-950/20" style={{ minWidth: COL_WIDTH_MONTH }}>
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-bold text-green-600 dark:text-green-400">R$ {fmt(running)}</span>
                          <span className="text-[10px] text-green-500/70">{grandTotal > 0 ? fmtPercent((running / grandTotal) * 100) : "-"}</span>
                        </div>
                      </td>
                    );
                  });
                })()}
              </tr>

              {/* Footer: Desvio (AC - PV) Acumulado */}
              <tr className="bg-orange-50/30 dark:bg-orange-950/10 border-t">
                <td className="sticky left-0 z-10 bg-orange-50/60 dark:bg-orange-950/20 border-r px-2 text-sm font-bold text-orange-600 dark:text-orange-400 whitespace-nowrap">Desvio (AC−PV)</td>
                <td className="bg-orange-50/60 dark:bg-orange-950/20 border-r" />
                <td className="bg-orange-50/60 dark:bg-orange-950/20 border-r" />
                <td className="bg-orange-50/60 dark:bg-orange-950/20 border-r" />
                <td className="bg-orange-50/60 dark:bg-orange-950/20 border-r" />
                <td className="bg-orange-50/60 dark:bg-orange-950/20 border-r" />
                <td className="bg-orange-50/60 dark:bg-orange-950/20 border-r" />
                <td className="bg-orange-50/60 dark:bg-orange-950/20 border-r" />
                <td className="bg-orange-50/60 dark:bg-orange-950/20 border-r" />
                <td className="bg-orange-50/60 dark:bg-orange-950/20 border-r" />
                <td className="bg-orange-50/60 dark:bg-orange-950/20 border-r" />
                {(() => {
                  let runningPV = 0;
                  let runningAC = 0;
                  return groupedColumns.map(col => {
                    runningPV += getFooterTotal(pvValues, col.monthKeys);
                    runningAC += getFooterTotal(acValues, col.monthKeys);
                    const desvio = runningAC - runningPV;
                    return (
                      <td key={col.key} className="border-r px-1 text-right bg-orange-50/60 dark:bg-orange-950/20" style={{ minWidth: COL_WIDTH_MONTH }}>
                        {runningPV > 0 || runningAC > 0 ? (
                          <span className={cn("text-sm font-bold", desvio > 0 ? "text-destructive" : desvio < 0 ? "text-green-600 dark:text-green-400" : "text-foreground/70")}>
                            {desvio >= 0 ? "+" : ""}R$ {fmt(desvio)}
                          </span>
                        ) : "-"}
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
