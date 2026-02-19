import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
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
  dependency_id: string | null;
  status: string;
  total_value: number;
  quantity: number;
  unit_price: number;
}

type TimeScale = "daily" | "weekly" | "monthly";

interface Props {
  studyId: string;
}

function getStageBarColor(rootIndex: number, subIndex: number): string {
  const goldenAngle = 137.508;
  const hue = (rootIndex * goldenAngle) % 360;
  const saturation = 50;
  const lightness = subIndex < 0 ? 55 : Math.min(68, 58 + subIndex * 2);
  return `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDays(a: string, b: string): number {
  const da = new Date(a + "T12:00:00");
  const db = new Date(b + "T12:00:00");
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDateBR(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function getMonthStart(dateStr: string): string {
  return dateStr.slice(0, 7) + "-01";
}

function getMonthEnd(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function formatHeaderLabel(dateStr: string, scale: TimeScale): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (scale === "daily") return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
  if (scale === "weekly") return `${String(d).padStart(2, "0")}/${MONTHS_PT[m - 1]}`;
  return `${MONTHS_PT[m - 1]}/${y}`;
}

/** Compute effective date range for a parent stage based on children */
function getEffectiveDates(stage: StageRow, allStages: StageRow[]): { start: string | null; end: string | null } {
  const children = allStages.filter(s => s.parent_id === stage.id);
  if (children.length === 0) {
    return { start: stage.start_date, end: stage.end_date };
  }
  let minStart: string | null = null;
  let maxEnd: string | null = null;
  for (const child of children) {
    const childDates = getEffectiveDates(child, allStages);
    if (childDates.start && (!minStart || childDates.start < minStart)) minStart = childDates.start;
    if (childDates.end && (!maxEnd || childDates.end > maxEnd)) maxEnd = childDates.end;
  }
  return { start: minStart, end: maxEnd };
}

export default function GanttChart({ studyId }: Props) {
  const [stages, setStages] = useState<StageRow[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [timeScale, setTimeScale] = useState<TimeScale>("weekly");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [selectedStageIds, setSelectedStageIds] = useState<Set<string>>(new Set());
  const [filterApplied, setFilterApplied] = useState(false);
  const [dragging, setDragging] = useState<{ stageId: string; mode: "start" | "move" | "end"; startX: number; origStart: string; origEnd: string } | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const chartScrollRef = useRef<HTMLDivElement>(null);

  const fetchStages = useCallback(async () => {
    const { data } = await supabase
      .from("construction_stages" as any)
      .select("id, parent_id, code, name, level, position, start_date, end_date, dependency_id, status, total_value, quantity, unit_price")
      .eq("study_id", studyId)
      .eq("is_deleted", false)
      .order("position");
    if (data) setStages(data as any[]);
  }, [studyId]);

  useEffect(() => { fetchStages(); }, [fetchStages]);

  // Auto-expand all roots on load
  useEffect(() => {
    const roots = stages.filter(s => !s.parent_id);
    setExpanded(new Set(roots.map(s => s.id)));
  }, [stages.length]);

  // Sync vertical scroll between sidebar and chart
  useEffect(() => {
    const sidebar = sidebarScrollRef.current;
    const chart = chartScrollRef.current;
    if (!sidebar || !chart) return;

    let syncing = false;
    const syncSidebarToChart = () => {
      if (syncing) return;
      syncing = true;
      chart.scrollTop = sidebar.scrollTop;
      syncing = false;
    };
    const syncChartToSidebar = () => {
      if (syncing) return;
      syncing = true;
      sidebar.scrollTop = chart.scrollTop;
      syncing = false;
    };

    sidebar.addEventListener("scroll", syncSidebarToChart);
    chart.addEventListener("scroll", syncChartToSidebar);
    return () => {
      sidebar.removeEventListener("scroll", syncSidebarToChart);
      chart.removeEventListener("scroll", syncChartToSidebar);
    };
  }, []);

  const rootStages = stages.filter(s => !s.parent_id);

  const getRootIndex = (stage: StageRow): number => {
    let current = stage;
    while (current.parent_id) {
      const parent = stages.find(s => s.id === current.parent_id);
      if (!parent) break;
      current = parent;
    }
    return rootStages.indexOf(current);
  };

  const getSubIndex = (stage: StageRow): number => {
    if (!stage.parent_id) return -1;
    const siblings = stages.filter(s => s.parent_id === stage.parent_id).sort((a, b) => a.position - b.position);
    return siblings.indexOf(stage);
  };

  // Build visible stages list (respecting expand/collapse)
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
        const children = stages.filter(s => s.parent_id === stage.id).sort((a, b) => a.position - b.position);
        children.forEach(addStage);
      }
    };
    rootStages.sort((a, b) => a.position - b.position).forEach(addStage);
    return result;
  }, [stages, expanded, filterApplied, selectedStageIds, rootStages]);

  // Calculate timeline bounds using effective dates (parent = sum of children)
  const allEffectiveDates = stages.flatMap(s => {
    const hasChildren = stages.some(c => c.parent_id === s.id);
    if (hasChildren) {
      const eff = getEffectiveDates(s, stages);
      return [eff.start, eff.end].filter(Boolean) as string[];
    }
    return [s.start_date, s.end_date].filter(Boolean) as string[];
  });
  const globalMin = allEffectiveDates.length > 0 ? allEffectiveDates.sort()[0] : todayISO();
  const globalMax = allEffectiveDates.length > 0 ? allEffectiveDates.sort().reverse()[0] : addDays(todayISO(), 30);

  const effectiveMin = periodStart || addDays(globalMin, -7);
  const effectiveMax = periodEnd || addDays(globalMax, 7);

  // Generate time columns
  const timeColumns = useMemo(() => {
    const cols: { start: string; end: string; label: string }[] = [];
    let current = effectiveMin;

    if (timeScale === "daily") {
      while (current <= effectiveMax) {
        cols.push({ start: current, end: current, label: formatHeaderLabel(current, "daily") });
        current = addDays(current, 1);
      }
    } else if (timeScale === "weekly") {
      current = getWeekStart(effectiveMin);
      while (current <= effectiveMax) {
        const weekEnd = addDays(current, 6);
        cols.push({ start: current, end: weekEnd, label: formatHeaderLabel(current, "weekly") });
        current = addDays(current, 7);
      }
    } else {
      current = getMonthStart(effectiveMin);
      while (current <= effectiveMax) {
        const mEnd = getMonthEnd(current);
        cols.push({ start: current, end: mEnd, label: formatHeaderLabel(current, "monthly") });
        const [y, m] = current.split("-").map(Number);
        const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
        current = nextMonth;
      }
    }
    return cols;
  }, [effectiveMin, effectiveMax, timeScale]);

  const totalTimelineDays = diffDays(effectiveMin, effectiveMax) + 1;
  const COL_WIDTH = timeScale === "daily" ? 40 : timeScale === "weekly" ? 100 : 120;
  const totalChartWidth = timeColumns.length * COL_WIDTH;
  const ROW_HEIGHT = 40;
  const SIDEBAR_WIDTH = 250;

  // Calculate bar position - for parents, use effective dates from children
  const getBarStyle = (stage: StageRow) => {
    const hasChildren = stages.some(s => s.parent_id === stage.id);
    let startDate: string | null;
    let endDate: string | null;

    if (hasChildren) {
      const eff = getEffectiveDates(stage, stages);
      startDate = eff.start;
      endDate = eff.end;
    } else {
      startDate = stage.start_date;
      endDate = stage.end_date;
    }

    if (!startDate || !endDate) return null;
    const startOffset = diffDays(effectiveMin, startDate);
    const duration = diffDays(startDate, endDate) + 1;
    const pxPerDay = totalChartWidth / totalTimelineDays;
    return {
      left: startOffset * pxPerDay,
      width: Math.max(duration * pxPerDay, 8),
    };
  };

  // Period presets
  const setPeriodPreset = (preset: "today" | "month" | "year") => {
    const today = todayISO();
    const d = new Date();
    if (preset === "today") { setPeriodStart(today); setPeriodEnd(today); }
    else if (preset === "month") {
      setPeriodStart(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10));
      setPeriodEnd(new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10));
    } else {
      setPeriodStart(`${d.getFullYear()}-01-01`);
      setPeriodEnd(`${d.getFullYear()}-12-31`);
    }
  };

  // Toggle expand
  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Stage filter
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

  // Summary
  const totalValue = stages.reduce((sum, s) => {
    const hasChildren = stages.some(c => c.parent_id === s.id);
    return sum + (hasChildren ? 0 : Number(s.total_value) || 0);
  }, 0);

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent, stageId: string, mode: "start" | "move" | "end") => {
    e.preventDefault();
    const stage = stages.find(s => s.id === stageId);
    if (!stage?.start_date || !stage?.end_date) return;
    // Don't allow dragging parent stages (their bars are computed from children)
    const hasChildren = stages.some(s => s.parent_id === stageId);
    if (hasChildren) return;
    setDragging({ stageId, mode, startX: e.clientX, origStart: stage.start_date, origEnd: stage.end_date });
  };

  useEffect(() => {
    if (!dragging) return;
    const pxPerDay = totalChartWidth / totalTimelineDays;

    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - dragging.startX;
      const daysDelta = Math.round(dx / pxPerDay);
      if (daysDelta === 0) return;

      setStages(prev => prev.map(s => {
        if (s.id !== dragging.stageId) return s;
        if (dragging.mode === "move") {
          return { ...s, start_date: addDays(dragging.origStart, daysDelta), end_date: addDays(dragging.origEnd, daysDelta) };
        } else if (dragging.mode === "start") {
          const newStart = addDays(dragging.origStart, daysDelta);
          if (newStart > dragging.origEnd) return s;
          return { ...s, start_date: newStart };
        } else {
          const newEnd = addDays(dragging.origEnd, daysDelta);
          if (newEnd < dragging.origStart) return s;
          return { ...s, end_date: newEnd };
        }
      }));
    };

    const handleUp = async () => {
      const stage = stages.find(s => s.id === dragging.stageId);
      if (stage && (stage.start_date !== dragging.origStart || stage.end_date !== dragging.origEnd)) {
        await supabase.from("construction_stages" as any)
          .update({ start_date: stage.start_date, end_date: stage.end_date })
          .eq("id", dragging.stageId);
      }
      setDragging(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, stages, totalChartWidth, totalTimelineDays]);

  // Draw dependency arrows - exact routing: right, down, left, down, right to target
  const renderArrows = () => {
    const arrows: JSX.Element[] = [];
    const pxPerDay = totalChartWidth / totalTimelineDays;

    visibleStages.forEach((stage, rowIdx) => {
      if (!stage.dependency_id) return;
      const depStage = stages.find(s => s.id === stage.dependency_id);
      if (!depStage) return;
      const depRowIdx = visibleStages.findIndex(s => s.id === depStage.id);
      if (depRowIdx < 0) return;

      const hasDepChildren = stages.some(s => s.parent_id === depStage.id);
      const depDates = hasDepChildren ? getEffectiveDates(depStage, stages) : { start: depStage.start_date, end: depStage.end_date };
      const hasStageChildren = stages.some(s => s.parent_id === stage.id);
      const stageDates = hasStageChildren ? getEffectiveDates(stage, stages) : { start: stage.start_date, end: stage.end_date };

      if (!depDates.end || !stageDates.start) return;

      const depEndX = (diffDays(effectiveMin, depDates.end) + 1) * pxPerDay;
      const stageStartX = diffDays(effectiveMin, stageDates.start) * pxPerDay;
      const depY = depRowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;
      const stageY = rowIdx * ROW_HEIGHT + ROW_HEIGHT / 2;

      let pathD: string;
      const gap = 12;

      if (stageStartX >= depEndX + 24 && rowIdx > depRowIdx) {
        // Enough horizontal space and target is below - simple L route
        const midX = depEndX + gap;
        pathD = `M ${depEndX} ${depY} L ${midX} ${depY} L ${midX} ${stageY} L ${stageStartX} ${stageY}`;
      } else {
        // Route: right from end → down below dep row → left past target start → down to target row → right to target start
        const rightX = depEndX + gap;
        const midY1 = depY + ROW_HEIGHT * 0.45; // below dep bar
        const leftX = stageStartX - gap;
        const midY2 = stageY; // target row center
        pathD = `M ${depEndX} ${depY} L ${rightX} ${depY} L ${rightX} ${midY1} L ${leftX} ${midY1} L ${leftX} ${midY2} L ${stageStartX} ${midY2}`;
      }

      arrows.push(
        <g key={`arrow-${stage.id}`}>
          <defs>
            <marker id={`arrowhead-${stage.id}`} markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" className="fill-muted-foreground/60" />
            </marker>
          </defs>
          <path
            d={pathD}
            fill="none"
            className="stroke-muted-foreground/50"
            strokeWidth={1.5}
            markerEnd={`url(#arrowhead-${stage.id})`}
          />
        </g>
      );
    });

    return arrows;
  };

  return (
    <div className="space-y-4">
      {/* Title */}
      <h2 className="text-lg font-bold text-foreground">Cronograma de Gantt</h2>

      {/* Summary header */}
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
            <p className="text-lg font-semibold text-foreground">
              R$ {formatBRNumber(totalValue)}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
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
            <span className="text-sm font-medium">Escala de Período:</span>
            <Select value={timeScale} onValueChange={(v) => setTimeScale(v as TimeScale)}>
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Diário</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="monthly">Mensal</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button size="sm" onClick={applyFilters}>Aplicar</Button>
          <Button variant="outline" size="sm" onClick={clearFilters}>Limpar</Button>
        </div>
      </div>

      {/* Gantt Chart */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex" style={{ height: Math.max(visibleStages.length * ROW_HEIGHT + ROW_HEIGHT + 2, 200) }}>
          {/* Sidebar - Stage names */}
          <div className="flex-shrink-0 border-r bg-card z-10 flex flex-col" style={{ width: SIDEBAR_WIDTH }}>
            {/* Header */}
            <div className="h-10 border-b flex items-center px-3 bg-muted/30 shrink-0">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Etapas</span>
            </div>
            {/* Rows - synced scroll */}
            <div
              ref={sidebarScrollRef}
              className="overflow-x-auto overflow-y-auto flex-1"
              style={{ maxHeight: visibleStages.length * ROW_HEIGHT }}
            >
              <div style={{ minWidth: SIDEBAR_WIDTH }}>
                {visibleStages.map(stage => {
                  const hasChildren = stages.some(s => s.parent_id === stage.id);
                  const isExpanded = expanded.has(stage.id);
                  return (
                    <div
                      key={stage.id}
                      className="flex items-center border-b hover:bg-muted/30 transition-colors whitespace-nowrap"
                      style={{ height: ROW_HEIGHT, paddingLeft: `${(stage.level) * 16 + 8}px` }}
                    >
                      {hasChildren ? (
                        <button onClick={() => toggleExpand(stage.id)} className="mr-1 p-0.5 rounded hover:bg-muted">
                          {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                        </button>
                      ) : (
                        <span className="w-4 mr-1" />
                      )}
                      <span className="text-xs text-foreground/80 font-medium">{stage.code} - {stage.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Chart area */}
          <div
            ref={chartScrollRef}
            className="flex-1 overflow-x-auto overflow-y-auto gantt-chart-area"
          >
            <div style={{ width: totalChartWidth, minWidth: "100%" }}>
              {/* Time header */}
              <div className="h-10 border-b flex bg-muted/30 sticky top-0 z-10">
                {timeColumns.map((col, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 border-r flex items-center justify-center text-xs text-muted-foreground font-medium"
                    style={{ width: COL_WIDTH }}
                  >
                    {col.label}
                  </div>
                ))}
              </div>

              {/* Chart rows */}
              <div className="relative" style={{ height: visibleStages.length * ROW_HEIGHT }}>
                {/* Grid lines */}
                {timeColumns.map((_, i) => (
                  <div
                    key={`grid-${i}`}
                    className="absolute top-0 bottom-0 border-r border-border/30"
                    style={{ left: i * COL_WIDTH, width: COL_WIDTH }}
                  />
                ))}

                {/* Row stripes */}
                {visibleStages.map((_, i) => (
                  <div
                    key={`row-${i}`}
                    className={cn("absolute w-full border-b border-border/20", i % 2 === 0 ? "bg-muted/10" : "")}
                    style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT }}
                  />
                ))}

                {/* Today line */}
                {(() => {
                  const today = todayISO();
                  if (today >= effectiveMin && today <= effectiveMax) {
                    const pxPerDay = totalChartWidth / totalTimelineDays;
                    const x = diffDays(effectiveMin, today) * pxPerDay;
                    return <div className="absolute top-0 bottom-0 w-0.5 bg-destructive/40 z-10" style={{ left: x }} />;
                  }
                  return null;
                })()}

                {/* Dependency arrows SVG */}
                <svg className="absolute inset-0 pointer-events-none z-20" style={{ width: totalChartWidth, height: visibleStages.length * ROW_HEIGHT }}>
                  {renderArrows()}
                </svg>

                {/* Bars */}
                {visibleStages.map((stage, rowIdx) => {
                  const barStyle = getBarStyle(stage);
                  if (!barStyle) return null;
                  const rootIdx = getRootIndex(stage);
                  const subIdx = getSubIndex(stage);
                  const color = getStageBarColor(rootIdx, subIdx);
                  const hasChildren = stages.some(s => s.parent_id === stage.id);

                  return (
                    <div
                      key={`bar-${stage.id}`}
                      ref={el => { if (el) rowRefs.current.set(stage.id, el); }}
                      className={cn(
                        "absolute rounded-md flex items-center z-30 group",
                        hasChildren ? "opacity-70" : "",
                        dragging?.stageId === stage.id ? "ring-2 ring-primary" : "",
                        hasChildren ? "cursor-default" : ""
                      )}
                      style={{
                        top: rowIdx * ROW_HEIGHT + 8,
                        left: barStyle.left,
                        width: barStyle.width,
                        height: ROW_HEIGHT - 16,
                        backgroundColor: color,
                      }}
                    >
                      {!hasChildren && (
                        <>
                          {/* Left resize handle */}
                          <div
                            className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-black/10 rounded-l-md"
                            onMouseDown={e => handleMouseDown(e, stage.id, "start")}
                          />
                          {/* Center move handle */}
                          <div
                            className="flex-1 cursor-grab active:cursor-grabbing h-full flex items-center justify-center overflow-hidden"
                            onMouseDown={e => handleMouseDown(e, stage.id, "move")}
                          >
                            {barStyle.width > 60 && (
                              <span className="text-[10px] font-medium text-white/90 drop-shadow-sm truncate px-1">
                                {stage.code}
                              </span>
                            )}
                          </div>
                          {/* Right resize handle */}
                          <div
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-black/10 rounded-r-md"
                            onMouseDown={e => handleMouseDown(e, stage.id, "end")}
                          />
                        </>
                      )}
                      {hasChildren && (
                        <div className="flex-1 h-full flex items-center justify-center overflow-hidden">
                          {barStyle.width > 60 && (
                            <span className="text-[10px] font-medium text-white/90 drop-shadow-sm truncate px-1">
                              {stage.code}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
