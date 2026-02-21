import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronRight, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRNumber } from "@/components/ui/masked-number-input";
import { toast } from "sonner";

interface StageRow {
  id: string;
  parent_id: string | null;
  code: string;
  name: string;
  level: number;
  position: number;
  unit_id: string | null;
  quantity: number;
  unit_price: number;
  total_value: number;
  start_date: string | null;
  end_date: string | null;
  stage_type: string | null;
  dependency_id: string | null;
  status: string;
}

interface UnitItem {
  id: string;
  name: string;
  abbreviation: string;
  has_decimals: boolean;
}

interface Props {
  studyId: string;
}

function formatDateShort(d: string | null) {
  if (!d) return "";
  const date = new Date(d + "T12:00:00");
  const day = String(date.getDate()).padStart(2, "0");
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${day}/${months[date.getMonth()]}`;
}

function getStageTypeLabel(type: string | null): string {
  switch (type) {
    case 'servico': return 'Serviço';
    case 'mao_de_obra': return 'Mão de Obra';
    case 'material': return 'Material';
    case 'taxas': return 'Taxas';
    default: return '—';
  }
}

function getStageColor(rootIndex: number, subIndex: number): string {
  const goldenAngle = 137.508;
  const hue = (rootIndex * goldenAngle) % 360;
  const saturation = 28;
  const lightness = subIndex < 0 ? 86 : Math.min(93, 89 + subIndex * 1.5);
  return `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`;
}

function getStageColorDark(rootIndex: number, subIndex: number): string {
  const goldenAngle = 137.508;
  const hue = (rootIndex * goldenAngle) % 360;
  const saturation = 25;
  const lightness = subIndex < 0 ? 14 : Math.max(10, 20 - subIndex * 1.5);
  return `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`;
}

const getStatusBg = (status: string) => {
  switch (status) {
    case "stopped": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    case "in_progress": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    case "finished": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case "orcamento": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "pedido": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
    case "recebido": return "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300";
    case "utilizado": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case "em_aberto": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    case "pago": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    default: return "bg-muted text-muted-foreground";
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "stopped": return "Parado";
    case "in_progress": return "Em andamento";
    case "finished": return "Finalizado";
    case "orcamento": return "Orçamento";
    case "pedido": return "Pedido";
    case "recebido": return "Recebido";
    case "utilizado": return "Utilizado";
    case "em_aberto": return "Em Aberto";
    case "pago": return "Pago";
    default: return "—";
  }
};

export default function MeasurementExecution({ studyId }: Props) {
  const navigate = useNavigate();
  const [stages, setStages] = useState<StageRow[]>([]);
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [selectedStageIds, setSelectedStageIds] = useState<Set<string>>(new Set());
  const [filterApplied, setFilterApplied] = useState(false);
  const isDark = document.documentElement.classList.contains("dark");

  const fetchStages = useCallback(async () => {
    const { data } = await supabase
      .from("construction_stages" as any)
      .select("id, parent_id, code, name, level, position, unit_id, quantity, unit_price, total_value, start_date, end_date, stage_type, dependency_id, status")
      .eq("study_id", studyId)
      .eq("is_deleted", false)
      .order("position");
    if (data) setStages(data as any[]);
  }, [studyId]);

  const fetchUnits = useCallback(async () => {
    const { data } = await supabase
      .from("construction_units" as any)
      .select("id, name, abbreviation, has_decimals")
      .eq("is_active", true)
      .order("name");
    if (data) setUnits(data as any[]);
  }, []);

  useEffect(() => { fetchStages(); fetchUnits(); }, [fetchStages, fetchUnits]);

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

  const totalValue = stages.reduce((sum, s) => {
    const hasChildren = stages.some(c => c.parent_id === s.id);
    return sum + (hasChildren ? 0 : Number(s.total_value) || 0);
  }, 0);

  const allDates = stages.flatMap(s => [s.start_date, s.end_date]).filter(Boolean) as string[];
  const minDate = allDates.length > 0 ? allDates.sort()[0] : null;
  const maxDate = allDates.length > 0 ? allDates.sort().reverse()[0] : null;

  const formatDateFull = (d: string | null) => {
    if (!d) return "--/--/----";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  const getDeepTotal = (s: StageRow): number => {
    const children = stages.filter(child => child.parent_id === s.id);
    if (children.length === 0) return s.total_value || 0;
    return children.reduce((sum, child) => sum + getDeepTotal(child), 0);
  };

  const getDeepPeriod = (s: StageRow): { minDate: string | null; maxDate: string | null } => {
    const children = stages.filter(child => child.parent_id === s.id);
    if (children.length === 0) return { minDate: s.start_date, maxDate: s.end_date };
    let minD: string | null = null;
    let maxD: string | null = null;
    for (const child of children) {
      const childPeriod = getDeepPeriod(child);
      if (childPeriod.minDate && (!minD || childPeriod.minDate < minD)) minD = childPeriod.minDate;
      if (childPeriod.maxDate && (!maxD || childPeriod.maxDate > maxD)) maxD = childPeriod.maxDate;
    }
    return { minDate: minD, maxDate: maxD };
  };

  const getRootIndex = (stage: StageRow): number => {
    if (!stage.parent_id) return rootStages.indexOf(stage);
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

  // Handle measurement action selection
  const handleMeasurementAction = async (stage: StageRow, action: string) => {
    switch (action) {
      // Material actions
      case "orcamento":
        toast.info("Tela de Orçamento será implementada em breve");
        break;
      case "pedido":
        toast.info("Tela de Pedido será implementada em breve");
        break;
      case "compras":
        toast.info("Tela de Compras será implementada em breve");
        break;

      // Taxas actions
      case "cadastrar": {
        // Check if bill already exists for this stage
        const { data: existingBills } = await supabase
          .from("bills")
          .select("id")
          .eq("study_id", studyId)
          .eq("description", `Taxas - ${stage.code} - ${stage.name}`)
          .eq("is_deleted", false);

        if (existingBills && existingBills.length > 0) {
          toast.warning("Esta taxa já foi cadastrada no financeiro.");
          return;
        }
        // Navigate to new bill page with pre-filled data
        navigate(`/studies/${studyId}/bills/new?from=${encodeURIComponent(`/studies/${studyId}/construction`)}&stageId=${stage.id}&stageName=${encodeURIComponent(`Taxas - ${stage.code} - ${stage.name}`)}&amount=${stage.total_value}`);
        break;
      }
      case "pagar":
        toast.info("Funcionalidade de pagamento será implementada em breve");
        break;

      // Serviço / Mão de Obra actions
      case "incluir_medicao":
        toast.info("Incluir Medição será implementada em breve");
        break;
      case "retificar_medicao":
        toast.info("Retificar Medição será implementada em breve");
        break;
      case "estornar_medicao":
        toast.info("Estornar Medição será implementada em breve");
        break;
    }
  };

  function renderMeasurementColumn(stage: StageRow) {
    const hasChildren = stages.some(s => s.parent_id === stage.id);
    if (hasChildren || !stage.stage_type) {
      return <div className="w-[150px] h-8" />;
    }

    if (stage.stage_type === 'material') {
      return (
        <Select onValueChange={(v) => handleMeasurementAction(stage, v)}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue placeholder="Ação..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="orcamento" className="text-xs">Orçamento</SelectItem>
            <SelectItem value="pedido" className="text-xs">Pedido</SelectItem>
            <SelectItem value="compras" className="text-xs">Compras</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    if (stage.stage_type === 'taxas') {
      return (
        <Select onValueChange={(v) => handleMeasurementAction(stage, v)}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue placeholder="Ação..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cadastrar" className="text-xs">Cadastrar</SelectItem>
            <SelectItem value="pagar" className="text-xs">Pagar</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    // servico or mao_de_obra
    return (
      <Select onValueChange={(v) => handleMeasurementAction(stage, v)}>
        <SelectTrigger className="w-[150px] h-8 text-xs">
          <SelectValue placeholder="Ação..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="incluir_medicao" className="text-xs">Incluir Medição</SelectItem>
          <SelectItem value="retificar_medicao" className="text-xs">Retificar Medição</SelectItem>
          <SelectItem value="estornar_medicao" className="text-xs">Estornar Medição</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  function renderStageRow(stage: StageRow, depth: number) {
    const children = stages.filter(s => s.parent_id === stage.id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(stage.id);
    const isLeaf = !hasChildren;
    const unit = units.find(u => u.id === stage.unit_id);
    const rootIdx = getRootIndex(stage);
    const subIdx = getSubIndex(stage);
    const bgColor = isDark ? getStageColorDark(rootIdx, subIdx) : getStageColor(rootIdx, subIdx);
    const stageTotalValue = getDeepTotal(stage);
    const stagePeriod = hasChildren ? getDeepPeriod(stage) : null;
    const isTaxas = stage.stage_type === 'taxas';

    const depStage = stage.dependency_id ? stages.find(s => s.id === stage.dependency_id) : null;

    const displayPeriod = stage.start_date && stage.end_date
      ? `${formatDateShort(stage.start_date)} - ${formatDateShort(stage.end_date)}`
      : "";

    const renderFields = () => {
      if (isLeaf) {
        return (
          <>
            {/* Tipo */}
            <div className="w-24 h-8 flex items-center justify-center px-1">
              <span className={cn("text-foreground/80", !stage.stage_type && "text-muted-foreground/50")}>
                {getStageTypeLabel(stage.stage_type)}
              </span>
            </div>

            {/* Unidade */}
            <div className="w-16 h-8 flex items-center justify-center px-1">
              <span className={cn("text-foreground/80", !unit && "text-muted-foreground/50")}>
                {isTaxas ? "" : (unit ? unit.abbreviation : "—")}
              </span>
            </div>

            {/* Qtde */}
            <div className="w-16 h-8 flex items-center justify-end px-1">
              <span className="text-foreground/80">
                {isTaxas ? "" : (stage.quantity > 0 ? formatBRNumber(stage.quantity, unit?.has_decimals ? 2 : 0) : "—")}
              </span>
            </div>

            {/* V. Unit */}
            <div className="w-24 h-8 flex items-center justify-end px-1">
              <span className="text-foreground/80">
                {isTaxas ? "" : (stage.unit_price > 0 ? formatBRNumber(stage.unit_price) : "—")}
              </span>
            </div>

            {/* V. Total */}
            <div className="w-24 h-8 flex items-center justify-end px-1">
              <span className="text-foreground/80 font-medium">
                {stageTotalValue > 0 ? formatBRNumber(stageTotalValue) : "—"}
              </span>
            </div>

            {/* Dependência */}
            <div className="w-20 h-8 flex items-center justify-center px-1">
              <span className={cn("text-foreground/80", !depStage && "text-muted-foreground/50")}>
                {depStage ? depStage.code : "—"}
              </span>
            </div>

            {/* Período */}
            <div className="w-[160px] h-8 flex items-center px-1 gap-1">
              <CalendarIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className={cn("whitespace-nowrap text-foreground/80", !displayPeriod && "text-muted-foreground/50")}>
                {isTaxas ? (stage.start_date ? formatDateShort(stage.start_date) : "—") : (displayPeriod || "—")}
              </span>
            </div>

            {/* Medição - type-specific dropdown */}
            {renderMeasurementColumn(stage)}
          </>
        );
      }

      // Parent fields
      return (
        <>
          <div className="w-24 h-8" />
          <div className="w-16 h-8" />
          <div className="w-16 h-8" />
          <div className="w-24 h-8" />
          <div className="w-24 h-8 flex items-center justify-end px-1">
            <span className="text-foreground/80 font-medium">
              {stageTotalValue > 0 ? formatBRNumber(stageTotalValue) : "—"}
            </span>
          </div>
          <div className="w-20 h-8 flex items-center justify-center px-1">
            <span className={cn("text-foreground/80", !depStage && "text-muted-foreground/50")}>
              {depStage ? depStage.code : "—"}
            </span>
          </div>
          {stagePeriod && (stagePeriod.minDate || stagePeriod.maxDate) ? (
            <div className="w-[160px] h-8 flex items-center text-foreground/80 px-1 gap-1">
              <CalendarIcon className="h-3 w-3 shrink-0 text-muted-foreground/50" />
              <span className="whitespace-nowrap">
                {stagePeriod.minDate ? formatDateShort(stagePeriod.minDate) : "?"} - {stagePeriod.maxDate ? formatDateShort(stagePeriod.maxDate) : "?"}
              </span>
            </div>
          ) : (
            <div className="w-[160px] h-8" />
          )}
          <div className="w-[150px] h-8" />
        </>
      );
    };

    return (
      <div key={stage.id}>
        <div
          className={cn(
            "flex items-center gap-1.5 py-2 px-2 border-b border-border/50 hover:brightness-95 transition-all",
            hasChildren && "font-semibold"
          )}
          style={{ paddingLeft: `${depth * 20 + 8}px`, backgroundColor: bgColor }}
        >
          <button className="shrink-0" onClick={() => toggleExpand(stage.id)}>
            {hasChildren || isExpanded ? (
              isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
            )}
          </button>

          <div className="flex-1 min-w-0 overflow-x-auto scrollbar-thin">
            <span className="text-sm whitespace-nowrap">
              {stage.code} - {stage.name}
            </span>
          </div>

          <div className={cn("flex items-center gap-0.5 shrink-0 ml-4", stage.level === 0 ? "text-sm" : "text-xs")}>
            {renderFields()}
          </div>
        </div>

        {isExpanded && children.sort((a, b) => a.position - b.position).map(c => renderStageRow(c, depth + 1))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">Medição / Execução</h2>

      {/* Summary */}
      <div className="rounded-xl p-4 flex items-center justify-between" style={{ backgroundColor: isDark ? 'hsl(180, 28%, 12%)' : 'hsl(180, 28%, 88%)' }}>
        {minDate && maxDate ? (
          <div>
            <p className="text-xs text-muted-foreground">Período</p>
            <p className="text-base font-semibold">{formatDateFull(minDate)} — {formatDateFull(maxDate)}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma data definida</p>
        )}
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Valor Total</p>
          <p className="text-base font-semibold">R$ {formatBRNumber(totalValue)}</p>
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

      {/* Headers */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-1.5 py-2 px-2 bg-muted border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <div className="w-6 shrink-0" />
          <div className="flex-1 min-w-0">Etapa</div>
          <div className="flex items-center gap-0.5 shrink-0 ml-4">
            <div className="w-24 text-center">Tipo</div>
            <div className="w-16 text-center">Un.</div>
            <div className="w-16 text-right">Qtde</div>
            <div className="w-24 text-right">V. Unit.</div>
            <div className="w-24 text-right">V. Total</div>
            <div className="w-20 text-center">Dep.</div>
            <div className="w-[160px] text-center">Período</div>
            <div className="w-[150px] text-center">Medição</div>
          </div>
        </div>

        {/* Rows */}
        <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 340px)" }}>
          {visibleStages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma etapa encontrada</p>
          ) : (
            rootStages.sort((a, b) => a.position - b.position).map(stage => {
              if (filterApplied && selectedStageIds.size > 0 && !visibleStages.find(v => v.id === stage.id)) return null;
              return renderStageRow(stage, 0);
            })
          )}
        </div>
      </div>
    </div>
  );
}
