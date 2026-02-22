import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatBRNumber } from "@/components/ui/masked-number-input";
import { MaskedNumberInput } from "@/components/ui/masked-number-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Plus, ChevronDown, ChevronRight, Trash2, ArrowUp, ArrowDown, CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CatalogItem {
  id: string;
  parent_id: string | null;
  code: string;
  name: string;
  level: number;
  position: number;
}

interface UnitItem {
  id: string;
  name: string;
  abbreviation: string;
  has_decimals: boolean;
}

interface StageRow {
  id: string;
  parent_id: string | null;
  catalog_id: string | null;
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
  area_m2: number;
  status: string;
  dependency_id: string | null;
  stage_type: string | null;
}

type StageType = 'servico' | 'mao_de_obra' | 'material' | 'taxas';

const STAGE_TYPE_OPTIONS: { value: StageType; label: string }[] = [
  { value: 'servico', label: 'Serviço (Executável)' },
  { value: 'mao_de_obra', label: 'Mão de Obra' },
  { value: 'material', label: 'Material (Compra)' },
  { value: 'taxas', label: 'Taxas' },
];

const getStageTypeLabel = (type: string | null): string => {
  switch (type) {
    case 'servico': return 'Serviço';
    case 'mao_de_obra': return 'Mão de Obra';
    case 'material': return 'Material';
    case 'taxas': return 'Taxas';
    default: return '—';
  }
};

const getStatusOptionsForType = (type: string | null) => {
  if (type === 'material') {
    return [
      { value: 'pending', label: '—' },
      { value: 'orcamento', label: 'Orçamento' },
      { value: 'pedido', label: 'Pedido' },
      { value: 'recebido', label: 'Recebido' },
      { value: 'utilizado', label: 'Utilizado' },
    ];
  }
  if (type === 'taxas') {
    return [
      { value: 'em_aberto', label: 'Em Aberto' },
      { value: 'pago', label: 'Pago' },
    ];
  }
  // servico, mao_de_obra, default
  return [
    { value: 'pending', label: '—' },
    { value: 'stopped', label: 'Parado' },
    { value: 'in_progress', label: 'Em andamento' },
    { value: 'finished', label: 'Finalizado' },
  ];
};

interface Props {
  studyId: string;
  onStagesChanged: () => void;
  onIncompleteStagesChange?: (incompleteNames: string[]) => void;
}

/** Generate a procedural HSL color for a stage based on its root index using Golden Ratio */
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

function formatDateShort(d: string | null) {
  if (!d) return "";
  const date = new Date(d + "T12:00:00");
  const day = String(date.getDate()).padStart(2, "0");
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${day}/${months[date.getMonth()]}`;
}

export default function ConstructionStages({ studyId, onStagesChanged, onIncompleteStagesChange }: Props) {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addParentId, setAddParentId] = useState<string | null>(null);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<StageRow | null>(null);
  const [newCatalogName, setNewCatalogName] = useState("");
  const [showNewCatalog, setShowNewCatalog] = useState(false);
  const [dataLossTarget, setDataLossTarget] = useState<StageRow | null>(null);
  const isDark = document.documentElement.classList.contains("dark");

  const fetchCatalog = useCallback(async () => {
    const { data } = await supabase
      .from("construction_stage_catalog" as any)
      .select("id, parent_id, code, name, level, position")
      .eq("is_active", true)
      .order("position");
    if (data) setCatalog(data as any[]);
  }, []);

  const fetchUnits = useCallback(async () => {
    const { data } = await supabase
      .from("construction_units" as any)
      .select("id, name, abbreviation, has_decimals")
      .eq("is_active", true)
      .order("name");
    if (data) setUnits(data as any[]);
  }, []);

  const fetchStages = useCallback(async () => {
    const { data } = await supabase
      .from("construction_stages" as any)
      .select("id, parent_id, catalog_id, code, name, level, position, unit_id, quantity, unit_price, total_value, start_date, end_date, area_m2, status, dependency_id, stage_type")
      .eq("study_id", studyId)
      .eq("is_deleted", false)
      .order("position");
    if (data) {
      const idSet = new Set((data as any[]).map((s: any) => s.id));
      const valid = (data as any[]).filter((s: any) => !s.parent_id || idSet.has(s.parent_id));
      setStages(valid);
    }
  }, [studyId]);

  useEffect(() => {
    fetchCatalog();
    fetchUnits();
    fetchStages();
  }, [fetchCatalog, fetchUnits, fetchStages]);

  // Detect incomplete leaf stages
  useEffect(() => {
    if (onIncompleteStagesChange) {
      const incompleteLeaves = stages.filter(s => {
        const hasChildren = stages.some(c => c.parent_id === s.id);
        if (hasChildren) return false;
        if (!s.stage_type) return true; // No type selected yet
        if (s.stage_type === 'taxas') return s.total_value <= 0;
        return s.quantity <= 0 || s.unit_price <= 0;
      });
      onIncompleteStagesChange(incompleteLeaves.map(s => `${s.code} - ${s.name}`));
    }
  }, [stages, onIncompleteStagesChange]);

  const rootStages = stages.filter((s) => !s.parent_id);
  const totalValue = stages.reduce((sum, s) => {
    const hasChildren = stages.some((c) => c.parent_id === s.id);
    return sum + (hasChildren ? 0 : Number(s.total_value) || 0);
  }, 0);

  const allDates = stages.flatMap((s) => [s.start_date, s.end_date]).filter(Boolean) as string[];
  const minDate = allDates.length > 0 ? allDates.sort()[0] : null;
  const maxDate = allDates.length > 0 ? allDates.sort().reverse()[0] : null;

  const formatDateFull = (d: string | null) => {
    if (!d) return "--/--/----";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const macroOptions = catalog.filter((c) => c.level === 0);
  const getCatalogChildren = (parentCatalogId: string) => catalog.filter((c) => c.parent_id === parentCatalogId);
  const usedCatalogIds = new Set(stages.filter(s => s.catalog_id).map(s => s.catalog_id));

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

  const handleAddSubStageClick = (parentStage: StageRow) => {
    const hasData = parentStage.unit_id || parentStage.quantity > 0 || parentStage.unit_price > 0;
    if (hasData) {
      setDataLossTarget(parentStage);
    } else {
      setAddParentId(parentStage.id);
      setAddDialogOpen(true);
    }
  };

  const confirmDataLossAndAdd = async () => {
    if (!dataLossTarget) return;
    await supabase
      .from("construction_stages" as any)
      .update({ unit_id: null, quantity: 0, unit_price: 0, total_value: 0, area_m2: 0, stage_type: null })
      .eq("id", dataLossTarget.id);
    setAddParentId(dataLossTarget.id);
    setDataLossTarget(null);
    setAddDialogOpen(true);
    fetchStages();
    onStagesChanged();
  };

  const renumberSiblings = async (parentId: string | null, allStages?: StageRow[], parentCode?: string) => {
    const stageList = allStages || stages;
    const siblings = stageList.filter(s => s.parent_id === parentId).sort((a, b) => a.position - b.position);
    
    for (let i = 0; i < siblings.length; i++) {
      const newPos = i + 1;
      const newCode = parentCode ? `${parentCode}.${newPos}` : `${newPos}`;
      if (siblings[i].position !== newPos || siblings[i].code !== newCode) {
        await supabase.from("construction_stages" as any)
          .update({ position: newPos, code: newCode })
          .eq("id", siblings[i].id);
      }
      await renumberSiblings(siblings[i].id, stageList, newCode);
    }
  };

  const handleMoveStage = async (stage: StageRow, direction: 'up' | 'down') => {
    const siblings = stages.filter(s => s.parent_id === stage.parent_id).sort((a, b) => a.position - b.position);
    const idx = siblings.findIndex(s => s.id === stage.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;

    const other = siblings[swapIdx];
    await supabase.from("construction_stages" as any).update({ position: other.position }).eq("id", stage.id);
    await supabase.from("construction_stages" as any).update({ position: stage.position }).eq("id", other.id);

    const { data: freshStages } = await supabase
      .from("construction_stages" as any)
      .select("id, parent_id, catalog_id, code, name, level, position, unit_id, quantity, unit_price, total_value, start_date, end_date, area_m2, status, dependency_id, stage_type")
      .eq("study_id", studyId)
      .eq("is_deleted", false)
      .order("position");

    if (freshStages) {
      const parentStage = stage.parent_id ? (freshStages as any[]).find(s => s.id === stage.parent_id) : null;
      const parentCode = parentStage ? parentStage.code : undefined;
      await renumberSiblings(stage.parent_id, freshStages as any[], parentCode);
    }

    await fetchStages();
    onStagesChanged();
  };

  const handleAddStage = async () => {
    if (!selectedCatalogId && !newCatalogName) return;

    let catalogItem: CatalogItem | undefined;
    let newName = "";

    if (showNewCatalog && newCatalogName) {
      const existing = catalog.find(c => c.name.toLowerCase() === newCatalogName.toLowerCase());
      if (existing) { toast.error("Já existe uma etapa com este nome"); return; }

      let catalogCode: string;
      let catalogPosition: number;
      if (addParentId) {
        const pStage = stages.find(s => s.id === addParentId);
        const pCatalogId = pStage?.catalog_id;
        const existingSubs = pCatalogId ? getCatalogChildren(pCatalogId) : [];
        const maxSubNum = existingSubs.reduce((max, c) => {
          const parts = c.code.split('.');
          return Math.max(max, parseInt(parts[parts.length - 1], 10) || 0);
        }, 0);
        const parentCode = pStage?.code || '0';
        catalogCode = `${parentCode}.${maxSubNum + 1}`;
        catalogPosition = existingSubs.length + 1;
      } else {
        const maxMacroNum = macroOptions.reduce((max, c) => Math.max(max, parseInt(c.code, 10) || 0), 0);
        catalogCode = `${maxMacroNum + 1}`;
        catalogPosition = macroOptions.length + 1;
      }
      const { data, error } = await supabase
        .from("construction_stage_catalog" as any)
        .insert({
          user_id: user?.id,
          parent_id: addParentId ? stages.find(s => s.id === addParentId)?.catalog_id : null,
          code: catalogCode,
          name: newCatalogName,
          level: addParentId ? 1 : 0,
          position: catalogPosition,
          is_system: false,
        })
        .select()
        .single();

      if (error) { toast.error("Erro ao criar etapa no catálogo"); return; }
      newName = newCatalogName;
      catalogItem = data as any;
      fetchCatalog();
    } else {
      catalogItem = catalog.find((c) => c.id === selectedCatalogId);
      if (!catalogItem) return;
      newName = catalogItem.name;
      const duplicate = stages.find(s => s.catalog_id === catalogItem!.id && s.parent_id === addParentId);
      if (duplicate) { toast.error("Esta etapa já foi adicionada"); return; }
    }

    const siblings = stages.filter((s) => s.parent_id === addParentId);
    const position = siblings.length + 1;
    const parentStage = addParentId ? stages.find((s) => s.id === addParentId) : null;
    
    const maxNum = siblings.length > 0
      ? Math.max(...siblings.map(s => {
          const parts = s.code.split('.');
          return parseInt(parts[parts.length - 1], 10) || 0;
        }))
      : 0;
    const nextNum = maxNum + 1;
    const stageCode = parentStage ? `${parentStage.code}.${nextNum}` : `${nextNum}`;

    const { error } = await supabase.from("construction_stages" as any).insert({
      study_id: studyId,
      parent_id: addParentId,
      catalog_id: catalogItem?.id || null,
      code: stageCode,
      name: newName,
      level: parentStage ? parentStage.level + 1 : 0,
      position,
    });

    if (error) { toast.error("Erro ao adicionar etapa"); return; }

    // Reset ancestor statuses to pending since there's now an unfinished sub-stage
    if (addParentId) {
      const ancestorIds: string[] = [];
      let currentId: string | null = addParentId;
      while (currentId) {
        ancestorIds.push(currentId);
        const parent = stages.find(s => s.id === currentId);
        currentId = parent?.parent_id || null;
      }
      if (ancestorIds.length > 0) {
        await supabase.from("construction_stages" as any)
          .update({ status: "pending" })
          .in("id", ancestorIds);
      }
    }

    toast.success("Etapa adicionada");
    setAddDialogOpen(false);
    setSelectedCatalogId("");
    setNewCatalogName("");
    setShowNewCatalog(false);

    if (addParentId) {
      setExpanded(prev => new Set([...prev, addParentId!]));
    }

    const { data: newStages } = await supabase
      .from("construction_stages" as any)
      .select("id, parent_id, code")
      .eq("study_id", studyId)
      .eq("is_deleted", false)
      .order("position");

    if (newStages) {
      const newStage = (newStages as any[]).find(s => s.code === stageCode && s.parent_id === addParentId);
      if (newStage) {
        setExpanded(prev => new Set([...prev, newStage.id]));
      }
    }

    fetchStages();
    onStagesChanged();
  };

  const handleDeleteStage = async () => {
    if (!deleteTarget) return;
    const collectDescendants = (parentId: string): string[] => {
      const children = stages.filter(s => s.parent_id === parentId);
      return children.flatMap(c => [c.id, ...collectDescendants(c.id)]);
    };
    const allIds = [deleteTarget.id, ...collectDescendants(deleteTarget.id)];

    // Cascade: soft-delete linked bills for unpaid taxas stages
    const taxasIds = allIds.filter(id => {
      const s = stages.find(st => st.id === id);
      return s && s.stage_type === 'taxas' && s.status !== 'pago';
    });
    let deletedBillCount = 0;
    if (taxasIds.length > 0) {
      const { data: linkedBills } = await supabase
        .from("bills")
        .select("id")
        .in("stage_id", taxasIds)
        .eq("is_deleted", false);
      if (linkedBills && linkedBills.length > 0) {
        const billIds = linkedBills.map(b => b.id);
        await supabase.from("bill_installments").update({ is_deleted: true }).in("bill_id", billIds);
        await supabase.from("bills").update({ is_deleted: true }).in("id", billIds);
        deletedBillCount = billIds.length;
      }
    }

    await supabase.from("construction_stages" as any).update({ is_deleted: true }).in("id", allIds);

    if (deletedBillCount > 0) {
      toast.success(`Etapa excluída. ${deletedBillCount} despesa(s) vinculada(s) também ${deletedBillCount === 1 ? 'foi excluída' : 'foram excluídas'} do financeiro.`);
    } else {
      toast.success("Etapa excluída");
    }
    const parentId = deleteTarget.parent_id;
    setDeleteTarget(null);

    const { data: freshStages } = await supabase
      .from("construction_stages" as any)
      .select("id, parent_id, catalog_id, code, name, level, position, unit_id, quantity, unit_price, total_value, start_date, end_date, area_m2, status, dependency_id, stage_type")
      .eq("study_id", studyId)
      .eq("is_deleted", false)
      .order("position");

    if (freshStages) {
      const parentStage = parentId ? (freshStages as any[]).find(s => s.id === parentId) : null;
      await renumberSiblings(parentId, freshStages as any[], parentStage?.code);
    }

    await fetchStages();
    onStagesChanged();
  };

  /** Recursively collect all descendant IDs */
  const collectAllDescendants = (parentId: string): string[] => {
    const children = stages.filter(s => s.parent_id === parentId);
    return children.flatMap(c => [c.id, ...collectAllDescendants(c.id)]);
  };

  /** Check if all children of a parent have a given status, and propagate up */
  const propagateStatusUp = async (childStageId: string, newStatus: string, currentStages: StageRow[]) => {
    const childStage = currentStages.find(s => s.id === childStageId);
    if (!childStage?.parent_id) return;

    const parentId = childStage.parent_id;
    const siblings = currentStages.filter(s => s.parent_id === parentId);

    const allFinished = siblings.every(s => {
      const effectiveStatus = s.id === childStageId ? newStatus : s.status;
      return effectiveStatus === "finished";
    });

    if (allFinished) {
      await supabase.from("construction_stages" as any).update({ status: "finished" }).eq("id", parentId);
      await propagateStatusUp(parentId, "finished", currentStages);
    } else {
      const parent = currentStages.find(s => s.id === parentId);
      if (parent?.status === "finished") {
        await supabase.from("construction_stages" as any).update({ status: "pending" }).eq("id", parentId);
      }
    }
  };

  /** Recalculate and persist PV monthly values for a stage based on its period and total_value.
   *  PV is distributed proportionally by calendar days across intersecting months.
   *  Guarantees: Σ PV_mês = total_value exactly AND no PV month is negative. */
  const recalcPVMonthly = async (stageId: string) => {
    const stage = (await supabase.from("construction_stages" as any)
      .select("start_date, end_date, total_value, stage_type")
      .eq("id", stageId)
      .eq("study_id", studyId)
      .single()).data as any;
    if (!stage) return;

    let start = stage.start_date as string | null;
    let end = stage.end_date as string | null;
    const total = Math.round((Number(stage.total_value) || 0) * 100) / 100;

    // For taxas, force end = start; skip if no start_date
    if (stage.stage_type === 'taxas') {
      if (!start) {
        // No date → delete any existing PV and return
        await supabase.from("construction_stage_monthly_values" as any)
          .delete().eq("stage_id", stageId).eq("study_id", studyId).eq("value_type", "planned");
        return;
      }
      end = start;
    }

    if (!start || !end || total <= 0) {
      await supabase.from("construction_stage_monthly_values" as any)
        .delete().eq("stage_id", stageId).eq("study_id", studyId).eq("value_type", "planned");
      return;
    }

    const startD = new Date(start + "T12:00:00");
    const endD = new Date(end + "T12:00:00");
    const totalDays = Math.round((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (totalDays <= 0) return;

    // Iterate months from start to end
    let cur = new Date(startD);
    const monthEntries: { month_key: string; days: number }[] = [];
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

    if (monthEntries.length === 0) return;

    // Calculate PV per month with non-negativity guarantee
    const pvValues: number[] = new Array(monthEntries.length);

    // Round all months except last
    let sumRounded = 0;
    for (let i = 0; i < monthEntries.length - 1; i++) {
      pvValues[i] = Math.round(((monthEntries[i].days / totalDays) * total) * 100) / 100;
      sumRounded += pvValues[i];
    }
    // Last month absorbs rounding difference
    pvValues[monthEntries.length - 1] = Math.round((total - sumRounded) * 100) / 100;

    // Non-negativity fix: if last month went negative, pull cents from previous months
    if (pvValues[pvValues.length - 1] < 0) {
      for (let i = pvValues.length - 2; i >= 0 && pvValues[pvValues.length - 1] < 0; i--) {
        while (pvValues[i] > 0 && pvValues[pvValues.length - 1] < 0) {
          pvValues[i] = Math.round((pvValues[i] - 0.01) * 100) / 100;
          pvValues[pvValues.length - 1] = Math.round((pvValues[pvValues.length - 1] + 0.01) * 100) / 100;
        }
      }
    }

    // Build insert rows (filter zeros)
    const inserts = monthEntries
      .map((e, i) => ({ month_key: e.month_key, value: pvValues[i] }))
      .filter(r => r.value > 0)
      .map(r => ({
        stage_id: stageId,
        study_id: studyId,
        month_key: r.month_key,
        value: r.value,
        value_type: "planned",
      }));

    // Delete then insert with minimal gap
    await supabase.from("construction_stage_monthly_values" as any)
      .delete().eq("stage_id", stageId).eq("study_id", studyId).eq("value_type", "planned");

    if (inserts.length > 0) {
      await supabase.from("construction_stage_monthly_values" as any)
        .insert(inserts as any);
    }
  };

  // Stable ref for debounce timers — survives re-renders, cleaned up on unmount
  const pvRecalcTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    return () => {
      // Cleanup all pending timers on unmount
      const timers = pvRecalcTimersRef.current;
      for (const key of Object.keys(timers)) {
        clearTimeout(timers[key]);
      }
    };
  }, []);

  const debouncedRecalcPV = useCallback((stageId: string) => {
    const timers = pvRecalcTimersRef.current;
    if (timers[stageId]) clearTimeout(timers[stageId]);
    timers[stageId] = setTimeout(() => {
      recalcPVMonthly(stageId);
      delete timers[stageId];
    }, 600);
  }, [studyId]);

  const handleFieldChange = async (stageId: string, field: string, value: any) => {
    const update: any = { [field]: value };
    
    // When changing stage_type, reset status to appropriate default and clear incompatible fields
    if (field === "stage_type") {
      if (value === 'taxas') {
        update.unit_id = null;
        update.quantity = 0;
        update.unit_price = 0;
        update.status = 'em_aberto';
        update.end_date = null;
      } else if (value === 'material') {
        update.status = 'pending';
      } else {
        update.status = 'pending';
      }
    }
    
    if (field === "quantity" || field === "unit_price") {
      const stage = stages.find((s) => s.id === stageId);
      if (stage) {
        const qty = field === "quantity" ? value : stage.quantity;
        const price = field === "unit_price" ? value : stage.unit_price;
        update.total_value = qty * price;
      }
    }
    await supabase.from("construction_stages" as any).update(update).eq("id", stageId);

    // Recalculate PV when total_value changes (debounced to avoid excessive writes during typing)
    if (field === "quantity" || field === "unit_price" || field === "total_value") {
      debouncedRecalcPV(stageId);
    }

    // Sync taxas value/date changes to linked bill
    const stage = stages.find(s => s.id === stageId);
    if (stage?.stage_type === 'taxas' && (field === "total_value" || update.total_value !== undefined)) {
      const newTotal = update.total_value ?? value;
      const { data: linkedBills } = await supabase.from("bills")
        .select("id")
        .eq("stage_id", stageId)
        .eq("is_deleted", false);
      if (linkedBills && linkedBills.length > 0) {
        for (const bill of linkedBills) {
          await supabase.from("bills").update({ total_amount: newTotal }).eq("id", bill.id);
          await supabase.from("bill_installments").update({ amount: newTotal })
            .eq("bill_id", bill.id).eq("status", "PENDING");
        }
      }
    }

    // Status propagation logic
    if (field === "status") {
      if (stage) {
        const children = stages.filter(s => s.parent_id === stageId);
        if (children.length > 0) {
          const allDescendantIds = collectAllDescendants(stageId);
          if (allDescendantIds.length > 0) {
            await supabase.from("construction_stages" as any)
              .update({ status: value })
              .in("id", allDescendantIds);
          }
        }
        await propagateStatusUp(stageId, value, stages);
      }
    }
    
    fetchStages();
    onStagesChanged();
  };

  const handleDateRangeChange = async (stageId: string, startDate: string | null, endDate: string | null) => {
    await supabase.from("construction_stages" as any)
      .update({ start_date: startDate, end_date: endDate })
      .eq("id", stageId);
    await recalcPVMonthly(stageId);
    fetchStages();
    onStagesChanged();
  };

  const handleSingleDateChange = async (stageId: string, date: string | null) => {
    await supabase.from("construction_stages" as any)
      .update({ start_date: date, end_date: date })
      .eq("id", stageId);
    await recalcPVMonthly(stageId);
    // Sync taxas date to linked bill's first_due_date and installment due_date
    const stage = stages.find(s => s.id === stageId);
    if (stage?.stage_type === 'taxas' && date) {
      const { data: linkedBills } = await supabase.from("bills")
        .select("id")
        .eq("stage_id", stageId)
        .eq("is_deleted", false);
      if (linkedBills && linkedBills.length > 0) {
        for (const bill of linkedBills) {
          await supabase.from("bills").update({ first_due_date: date }).eq("id", bill.id);
          await supabase.from("bill_installments").update({ due_date: date })
            .eq("bill_id", bill.id).eq("status", "PENDING");
        }
      }
    }
    fetchStages();
    onStagesChanged();
  };

  /** Get available dependency options - any stage at same level under same parent, positioned before */
  const getDependencyOptions = (stage: StageRow): StageRow[] => {
    const siblings = stages.filter(s => s.parent_id === stage.parent_id).sort((a, b) => a.position - b.position);
    const idx = siblings.findIndex(s => s.id === stage.id);
    if (idx <= 0) return [];
    return siblings.slice(0, idx);
  };

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

  function DateRangePicker({ stage, autoOpen, onClose }: { stage: StageRow; autoOpen?: boolean; onClose?: () => void }) {
    const [open, setOpen] = useState(autoOpen ?? false);
    const startDate = stage.start_date ? new Date(stage.start_date + "T12:00:00") : undefined;
    const endDate = stage.end_date ? new Date(stage.end_date + "T12:00:00") : undefined;
    const [range, setRange] = useState<{ from?: Date; to?: Date }>({ from: startDate, to: endDate });

    const handleSelect = (selected: any) => {
      if (!selected) return;
      setRange({ from: selected.from, to: selected.to });
      if (selected.from && selected.to) {
        const fmt = (d: Date) => format(d, "yyyy-MM-dd");
        handleDateRangeChange(stage.id, fmt(selected.from), fmt(selected.to));
        setOpen(false);
        onClose?.();
      }
    };

    const handleOpenChange = (v: boolean) => {
      setOpen(v);
      if (!v) onClose?.();
    };

    const displayText = stage.start_date && stage.end_date
      ? `${formatDateShort(stage.start_date)}-${formatDateShort(stage.end_date)}`
      : "";

    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "w-[120px] h-8 text-xs text-left px-2 rounded-md border border-input bg-background/80 flex items-center gap-1",
              !displayText && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{displayText || "Período"}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
          <Calendar
            mode="range"
            selected={range as any}
            onSelect={handleSelect}
            numberOfMonths={1}
            locale={ptBR}
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    );
  }

  function SingleDatePicker({ stage, autoOpen, onClose }: { stage: StageRow; autoOpen?: boolean; onClose?: () => void }) {
    const [open, setOpen] = useState(autoOpen ?? false);
    const currentDate = stage.start_date ? new Date(stage.start_date + "T12:00:00") : undefined;

    const handleSelect = (selected: Date | undefined) => {
      if (!selected) return;
      const fmt = format(selected, "yyyy-MM-dd");
      handleSingleDateChange(stage.id, fmt);
      setOpen(false);
      onClose?.();
    };

    const handleOpenChange = (v: boolean) => {
      setOpen(v);
      if (!v) onClose?.();
    };

    const displayText = stage.start_date ? formatDateShort(stage.start_date) : "";

    return (
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "w-[120px] h-8 text-xs text-left px-2 rounded-md border border-input bg-background/80 flex items-center gap-1",
              !displayText && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate">{displayText || "Vencimento"}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
          <Calendar
            mode="single"
            selected={currentDate}
            onSelect={handleSelect}
            locale={ptBR}
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    );
  }

  // Track which field is being edited
  const [editingField, setEditingField] = useState<string | null>(null);

  /** Click-to-edit inline cell */
  function InlineEditableNumber({ stageId, field, value, decimals = 2, placeholder, width, onCommit, nextFieldId }: {
    stageId: string; field: string; value: number; decimals?: number; placeholder: string; width: string;
    onCommit: (v: number) => void; nextFieldId?: string;
  }) {
    const fieldKey = `${field}-${stageId}`;
    const isEditing = editingField === fieldKey;

    if (!isEditing) {
      return (
        <div
          className={cn("h-8 flex items-center justify-end cursor-pointer rounded px-1 hover:bg-background/60 transition-colors", width)}
          onClick={() => setEditingField(fieldKey)}
        >
          <span className={cn("text-foreground/80", !value && "text-muted-foreground/50")}>
            {value > 0 ? formatBRNumber(value, decimals) : placeholder}
          </span>
        </div>
      );
    }

    return (
      <MaskedNumberInput
        id={fieldKey}
        autoFocus
        className={cn("h-8 text-right", width)}
        value={value}
        onValueChange={onCommit}
        decimals={decimals}
        placeholder={placeholder}
        onBlur={() => setEditingField(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (nextFieldId) {
              setEditingField(nextFieldId);
            } else {
              setEditingField(null);
            }
          }
        }}
      />
    );
  }

  function renderStageRow(stage: StageRow, depth: number) {
    const children = stages.filter((s) => s.parent_id === stage.id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(stage.id);
    const isLeaf = !hasChildren;
    const unit = units.find((u) => u.id === stage.unit_id);
    const rootIdx = getRootIndex(stage);
    const subIdx = getSubIndex(stage);
    const bgColor = isDark ? getStageColorDark(rootIdx, subIdx) : getStageColor(rootIdx, subIdx);

    const stageType = stage.stage_type;
    const hasType = !!stageType;

    const getDeepTotal = (s: StageRow): number => {
      const stageChildren = stages.filter(child => child.parent_id === s.id);
      if (stageChildren.length === 0) return s.total_value || 0;
      return stageChildren.reduce((sum, child) => sum + getDeepTotal(child), 0);
    };

    const stageTotalValue = getDeepTotal(stage);

    // Compute effective period for macro stages from all descendants
    const getDeepPeriod = (s: StageRow): { minDate: string | null; maxDate: string | null } => {
      const stageChildren = stages.filter(child => child.parent_id === s.id);
      if (stageChildren.length === 0) return { minDate: s.start_date, maxDate: s.end_date };
      let minD: string | null = null;
      let maxD: string | null = null;
      for (const child of stageChildren) {
        const childPeriod = getDeepPeriod(child);
        if (childPeriod.minDate && (!minD || childPeriod.minDate < minD)) minD = childPeriod.minDate;
        if (childPeriod.maxDate && (!maxD || childPeriod.maxDate > maxD)) maxD = childPeriod.maxDate;
      }
      return { minDate: minD, maxDate: maxD };
    };

    const stagePeriod = hasChildren ? getDeepPeriod(stage) : null;

    const siblings = stages.filter(s => s.parent_id === stage.parent_id).sort((a, b) => a.position - b.position);
    const siblingIdx = siblings.findIndex(s => s.id === stage.id);
    const canMoveUp = siblingIdx > 0;
    const canMoveDown = siblingIdx < siblings.length - 1;

    const depOptions = getDependencyOptions(stage);
    const depStage = stage.dependency_id ? stages.find(s => s.id === stage.dependency_id) : null;

    // Display text for period
    const displayPeriod = stage.start_date && stage.end_date
      ? `${formatDateShort(stage.start_date)}-${formatDateShort(stage.end_date)}`
      : "";

    const statusOptions = getStatusOptionsForType(stageType);

    const renderLeafFields = () => {
      if (!isLeaf) return null;

      // First: always show Tipo selector
      const tipoField = (
        editingField === `tipo-${stage.id}` ? (
          <Select
            open
            value={stageType || ""}
            onValueChange={(v) => { handleFieldChange(stage.id, "stage_type", v); setEditingField(null); }}
            onOpenChange={(open) => { if (!open) setEditingField(null); }}
          >
            <SelectTrigger className="w-24 h-8 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              {STAGE_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div
            className="w-24 h-8 flex items-center justify-center cursor-pointer rounded px-1 hover:bg-background/60 transition-colors"
            onClick={() => setEditingField(`tipo-${stage.id}`)}
          >
            <span className={cn("text-foreground/80", !stageType && "text-muted-foreground/50")}>
              {getStageTypeLabel(stageType)}
            </span>
          </div>
        )
      );

      // If no type selected, only show Tipo and spacers
      if (!hasType) {
        return (
          <>
            {tipoField}
            {/* Spacers for the remaining columns */}
            <div className="w-16 h-8" />
            <div className="w-16 h-8" />
            <div className="w-24 h-8" />
            <div className="w-24 h-8" />
            <div className="w-20 h-8" />
            <div className="w-[120px] h-8" />
            <div className="w-[110px] h-8" />
          </>
        );
      }

      const isTaxas = stageType === 'taxas';

      return (
        <>
          {tipoField}

          {/* Unidade - hidden for Taxas */}
          {isTaxas ? (
            <div className="w-16 h-8" />
          ) : (
            editingField === `unit-${stage.id}` ? (
              <Select
                open
                value={stage.unit_id || ""}
                onValueChange={(v) => { handleFieldChange(stage.id, "unit_id", v); setEditingField(null); }}
                onOpenChange={(open) => { if (!open) setEditingField(null); }}
              >
                <SelectTrigger className="w-16 h-8 text-xs"><SelectValue placeholder="Un." /></SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id} className="text-xs">{u.abbreviation}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div
                className="w-16 h-8 flex items-center justify-center cursor-pointer rounded px-1 hover:bg-background/60 transition-colors"
                onClick={() => setEditingField(`unit-${stage.id}`)}
              >
                <span className={cn("text-foreground/80", !unit && "text-muted-foreground/50")}>
                  {unit ? unit.abbreviation : "Un."}
                </span>
              </div>
            )
          )}

          {/* Qtde */}
          {isTaxas ? (
            <div className="w-16 h-8" />
          ) : (
            <InlineEditableNumber
              stageId={stage.id}
              field="qty"
              value={stage.quantity}
              decimals={unit?.has_decimals ? 2 : 0}
              placeholder="Qtde."
              width="w-16"
              onCommit={(v) => handleFieldChange(stage.id, "quantity", v)}
              nextFieldId={`price-${stage.id}`}
            />
          )}

          {/* V. Unit. - hidden for Taxas */}
          {isTaxas ? (
            <div className="w-24 h-8" />
          ) : (
            <InlineEditableNumber
              stageId={stage.id}
              field="price"
              value={stage.unit_price}
              placeholder="V. Unit."
              width="w-24"
              onCommit={(v) => handleFieldChange(stage.id, "unit_price", v)}
            />
          )}

          {/* V. Total - editable only for Taxas */}
          {isTaxas ? (
            <InlineEditableNumber
              stageId={stage.id}
              field="total"
              value={stage.total_value}
              placeholder="V. Total"
              width="w-24"
              onCommit={(v) => handleFieldChange(stage.id, "total_value", v)}
            />
          ) : (
            <div className="w-24 h-8 flex items-center justify-end px-1">
              <span className="text-foreground/80 font-medium">
                {stageTotalValue > 0 ? formatBRNumber(stageTotalValue) : "—"}
              </span>
            </div>
          )}

          {/* Dependência */}
          {depOptions.length > 0 ? (
            editingField === `dep-${stage.id}` ? (
              <Select
                open
                value={stage.dependency_id || "none"}
                onValueChange={(v) => { handleFieldChange(stage.id, "dependency_id", v === "none" ? null : v); setEditingField(null); }}
                onOpenChange={(open) => { if (!open) setEditingField(null); }}
              >
                <SelectTrigger className="w-20 h-8 text-xs">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">—</SelectItem>
                  {depOptions.map((d) => (
                    <SelectItem key={d.id} value={d.id} className="text-xs">{d.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div
                className="w-20 h-8 flex items-center justify-center cursor-pointer rounded px-1 hover:bg-background/60 transition-colors"
                onClick={() => setEditingField(`dep-${stage.id}`)}
              >
                <span className={cn("text-foreground/80", !depStage && "text-muted-foreground/50")}>
                  {depStage ? depStage.code : "—"}
                </span>
              </div>
            )
          ) : (
            <div className="w-20 h-8" />
          )}

          {/* Período */}
          {isTaxas || stageType === 'material' ? (
            /* Taxas and Material: period is read-only, filled dynamically by Medição/Execução */
            <div className="w-[120px] h-8 flex items-center px-1 gap-1">
              <CalendarIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className={cn("truncate text-foreground/80", !stage.start_date && "text-muted-foreground/50")}>
                {isTaxas
                  ? (stage.start_date ? formatDateShort(stage.start_date) : "—")
                  : (displayPeriod || "—")}
              </span>
            </div>
          ) : (
            editingField === `period-${stage.id}` ? (
              <DateRangePicker stage={stage} autoOpen onClose={() => setEditingField(null)} />
            ) : (
              <div
                className="w-[120px] h-8 flex items-center cursor-pointer rounded px-1 hover:bg-background/60 transition-colors gap-1"
                onClick={() => setEditingField(`period-${stage.id}`)}
              >
                <CalendarIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className={cn("truncate text-foreground/80", !displayPeriod && "text-muted-foreground/50")}>
                  {displayPeriod || "Período"}
                </span>
              </div>
            )
          )}

          {/* Status - read-only, driven by Medição/Execução */}
          <div
            className={cn("w-[110px] h-8 flex items-center justify-center rounded px-1 text-xs", getStatusBg(stage.status))}
          >
            {getStatusLabel(stage.status)}
          </div>
        </>
      );
    };

    const renderParentFields = () => {
      if (isLeaf) return null;
      return (
        <>
          {/* Tipo spacer */}
          <div className="w-24 h-8" />
          {/* Empty spacers for Unidade + Qtde + V.Unit columns */}
          <div className="w-16 h-8" />
          <div className="w-16 h-8" />
          <div className="w-24 h-8" />
          {/* V. Total for parent */}
          <div className="w-24 h-8 flex items-center justify-end px-1">
            <span className="text-foreground/80 font-medium">
              {stageTotalValue > 0 ? formatBRNumber(stageTotalValue) : "—"}
            </span>
          </div>

          {/* Dependência for parent */}
          {depOptions.length > 0 ? (
            editingField === `dep-${stage.id}` ? (
              <Select
                open
                value={stage.dependency_id || "none"}
                onValueChange={(v) => { handleFieldChange(stage.id, "dependency_id", v === "none" ? null : v); setEditingField(null); }}
                onOpenChange={(open) => { if (!open) setEditingField(null); }}
              >
                <SelectTrigger className="w-20 h-8 text-xs">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">—</SelectItem>
                  {depOptions.map((d) => (
                    <SelectItem key={d.id} value={d.id} className="text-xs">{d.code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div
                className="w-20 h-8 flex items-center justify-center cursor-pointer rounded px-1 hover:bg-background/60 transition-colors"
                onClick={() => setEditingField(`dep-${stage.id}`)}
              >
                <span className={cn("text-foreground/80", !depStage && "text-muted-foreground/50")}>
                  {depStage ? depStage.code : "—"}
                </span>
              </div>
            )
          ) : (
            <div className="w-20 h-8" />
          )}

          {/* Período for parent - always show aggregated period */}
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

          {/* Status for parent - read-only, driven by children */}
          <div
            className={cn("w-[110px] h-8 flex items-center justify-center rounded px-1 text-xs", getStatusBg(stage.status))}
          >
            {getStatusLabel(stage.status)}
          </div>
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

          {/* Name with horizontal scroll */}
          <div className="flex-1 min-w-0 overflow-x-auto scrollbar-thin">
            <span className="text-sm whitespace-nowrap">
              {stage.code} - {stage.name}
            </span>
          </div>

          {/* Fixed columns */}
          <div className={cn("flex items-center gap-0.5 shrink-0 ml-4", stage.level === 0 ? "text-sm" : "text-xs")}>
            {isLeaf ? renderLeafFields() : renderParentFields()}

            {/* Reorder buttons */}
            <div className="flex flex-col">
              <button
                className={cn("p-0.5", canMoveUp ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/20 cursor-default")}
                onClick={() => canMoveUp && handleMoveStage(stage, 'up')}
                disabled={!canMoveUp}
                title="Mover para cima"
              >
                <ArrowUp className="h-3 w-3" />
              </button>
              <button
                className={cn("p-0.5", canMoveDown ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/20 cursor-default")}
                onClick={() => canMoveDown && handleMoveStage(stage, 'down')}
                disabled={!canMoveDown}
                title="Mover para baixo"
              >
                <ArrowDown className="h-3 w-3" />
              </button>
            </div>

            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(stage)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {isExpanded && children.map((c) => renderStageRow(c, depth + 1))}

        {isExpanded && (
          <button
            className="flex items-center gap-1 text-xs text-primary hover:text-primary-hover py-1.5 transition-colors"
            style={{ paddingLeft: `${(depth + 1) * 20 + 28}px` }}
            onClick={() => handleAddSubStageClick(stage)}
          >
            <Plus className="h-3 w-3" /> Adicionar sub-etapa
          </button>
        )}
      </div>
    );
  }

  const getAvailableOptions = () => {
    if (addParentId) {
      const parentStage = stages.find(s => s.id === addParentId);
      const options = parentStage?.catalog_id ? getCatalogChildren(parentStage.catalog_id) : macroOptions;
      return options.filter(c => !usedCatalogIds.has(c.id) || !stages.some(s => s.catalog_id === c.id && s.parent_id === addParentId));
    }
    return macroOptions.filter(c => !usedCatalogIds.has(c.id) || !stages.some(s => s.catalog_id === c.id && s.parent_id === null));
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">Etapas</h2>

      <div className="rounded-xl p-4 flex items-center justify-between" style={{ backgroundColor: isDark ? 'hsl(180, 28%, 12%)' : 'hsl(180, 28%, 88%)' }}>
        {minDate && maxDate ? (
          <div className="text-left">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Período</p>
            <p className="kpi-value text-lg text-foreground">{formatDateFull(minDate)} à {formatDateFull(maxDate)}</p>
          </div>
        ) : (
          <div />
        )}
        <div className="text-right">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Valor Total</p>
          <p className="kpi-value text-lg text-foreground">R$ {formatBRNumber(totalValue)}</p>
        </div>
      </div>

      <div className="card-dashboard p-0 overflow-hidden">
        <div className="flex items-center px-4 py-3 bg-muted/30 border-b">
          <span className="text-sm font-semibold text-foreground flex-1 min-w-0">Etapas</span>
          <div className="flex items-center gap-0.5 shrink-0 ml-4">
            <span className="text-xs text-muted-foreground w-24 text-center">Tipo</span>
            <span className="text-xs text-muted-foreground w-16 text-center">Unidade</span>
            <span className="text-xs text-muted-foreground w-16 text-right">Qtde.</span>
            <span className="text-xs text-muted-foreground w-24 text-right">V. Unit.</span>
            <span className="text-xs text-muted-foreground w-24 text-right">V. Total</span>
            <span className="text-xs text-muted-foreground w-20 text-center">Dep.</span>
            <span className="text-xs text-muted-foreground w-[120px] text-center">Período</span>
            <span className="text-xs text-muted-foreground w-[110px] text-center">Status</span>
            <span className="w-[22px]" />
            <span className="w-8" />
          </div>
        </div>

        {rootStages.map((s) => renderStageRow(s, 0))}

        <button
          className="flex items-center gap-2 px-4 py-3 text-sm text-primary hover:text-primary-hover hover:bg-muted/20 w-full text-left transition-colors"
          onClick={() => { setAddParentId(null); setAddDialogOpen(true); }}
        >
          <Plus className="h-4 w-4" /> Adicionar Etapa
        </button>
      </div>

      {/* Add Stage Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{addParentId ? "Adicionar Sub-etapa" : "Adicionar Etapa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!showNewCatalog ? (
              <>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Selecione a etapa</label>
                  <Select value={selectedCatalogId} onValueChange={setSelectedCatalogId}>
                    <SelectTrigger><SelectValue placeholder="Escolha uma etapa..." /></SelectTrigger>
                    <SelectContent>
                      {getAvailableOptions().map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-sm">{c.code} - {c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <button className="text-xs text-primary hover:text-primary-hover font-medium" onClick={() => setShowNewCatalog(true)}>
                  + Criar nova etapa
                </button>
              </>
            ) : (
              <>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">Nome da nova etapa</label>
                  <Input value={newCatalogName} onChange={(e) => setNewCatalogName(e.target.value)} placeholder="Ex: Serviços Especiais" />
                </div>
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { setShowNewCatalog(false); setNewCatalogName(""); }}>
                  ← Voltar para lista
                </button>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddStage} disabled={!selectedCatalogId && !newCatalogName}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir etapa?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{deleteTarget?.code} - {deleteTarget?.name}"?
              {stages.some(s => s.parent_id === deleteTarget?.id) && " Todas as sub-etapas também serão excluídas."}
              {" "}Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteStage} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Data Loss Warning */}
      <AlertDialog open={!!dataLossTarget} onOpenChange={() => setDataLossTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dados serão perdidos</AlertDialogTitle>
            <AlertDialogDescription>
              A etapa "{dataLossTarget?.code} - {dataLossTarget?.name}" já possui dados preenchidos (unidade, quantidade ou valor).
              Ao adicionar uma sub-etapa, estes dados serão excluídos e apenas os valores das sub-etapas serão considerados.
              Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDataLossAndAdd}>Continuar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
