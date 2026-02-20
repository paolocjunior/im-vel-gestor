import { useState, useEffect, useCallback } from "react";
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
}

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
      .select("id, parent_id, catalog_id, code, name, level, position, unit_id, quantity, unit_price, total_value, start_date, end_date, area_m2, status, dependency_id")
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
      .update({ unit_id: null, quantity: 0, unit_price: 0, total_value: 0, area_m2: 0 })
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
      .select("id, parent_id, catalog_id, code, name, level, position, unit_id, quantity, unit_price, total_value, start_date, end_date, area_m2, status, dependency_id")
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
    await supabase.from("construction_stages" as any).update({ is_deleted: true }).in("id", allIds);

    toast.success("Etapa excluída");
    const parentId = deleteTarget.parent_id;
    setDeleteTarget(null);

    const { data: freshStages } = await supabase
      .from("construction_stages" as any)
      .select("id, parent_id, catalog_id, code, name, level, position, unit_id, quantity, unit_price, total_value, start_date, end_date, area_m2, status, dependency_id")
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

    // Check all siblings' effective status (considering the one being changed)
    const allFinished = siblings.every(s => {
      const effectiveStatus = s.id === childStageId ? newStatus : s.status;
      return effectiveStatus === "finished";
    });

    if (allFinished) {
      await supabase.from("construction_stages" as any).update({ status: "finished" }).eq("id", parentId);
      // Continue propagating up
      await propagateStatusUp(parentId, "finished", currentStages);
    } else {
      // If parent was finished but now a child isn't, reset parent
      const parent = currentStages.find(s => s.id === parentId);
      if (parent?.status === "finished") {
        await supabase.from("construction_stages" as any).update({ status: "pending" }).eq("id", parentId);
      }
    }
  };

  const handleFieldChange = async (stageId: string, field: string, value: any) => {
    const update: any = { [field]: value };
    if (field === "quantity" || field === "unit_price") {
      const stage = stages.find((s) => s.id === stageId);
      if (stage) {
        const qty = field === "quantity" ? value : stage.quantity;
        const price = field === "unit_price" ? value : stage.unit_price;
        update.total_value = qty * price;
      }
    }
    await supabase.from("construction_stages" as any).update(update).eq("id", stageId);

    // Status propagation logic
    if (field === "status") {
      const stage = stages.find(s => s.id === stageId);
      if (stage) {
        const children = stages.filter(s => s.parent_id === stageId);
        // If this is a parent (macro), propagate status down to all descendants
        if (children.length > 0) {
          const allDescendantIds = collectAllDescendants(stageId);
          if (allDescendantIds.length > 0) {
            await supabase.from("construction_stages" as any)
              .update({ status: value })
              .in("id", allDescendantIds);
          }
        }
        // Propagate up: check if all siblings are finished → mark parent finished
        await propagateStatusUp(stageId, value, stages);
      }
    }

    // Dependency is now per-stage (not propagated to descendants)
    
    fetchStages();
    onStagesChanged();
  };

  const handleDateRangeChange = async (stageId: string, startDate: string | null, endDate: string | null) => {
    await supabase.from("construction_stages" as any)
      .update({ start_date: startDate, end_date: endDate })
      .eq("id", stageId);
    fetchStages();
    onStagesChanged();
  };

  /** Get available dependency options - any stage at same level under same parent, positioned before */
  const getDependencyOptions = (stage: StageRow): StageRow[] => {
    const siblings = stages.filter(s => s.parent_id === stage.parent_id).sort((a, b) => a.position - b.position);
    const idx = siblings.findIndex(s => s.id === stage.id);
    if (idx <= 0) return []; // First sibling - no dependencies
    return siblings.slice(0, idx);
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case "stopped": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "in_progress": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "finished": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "stopped": return "Parado";
      case "in_progress": return "Em andamento";
      case "finished": return "Finalizado";
      default: return "—";
    }
  };

  function DateRangePicker({ stage }: { stage: StageRow }) {
    const [open, setOpen] = useState(false);
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
      }
    };

    const displayText = stage.start_date && stage.end_date
      ? `${formatDateShort(stage.start_date)}-${formatDateShort(stage.end_date)}`
      : "";

    return (
      <Popover open={open} onOpenChange={setOpen}>
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

  function renderStageRow(stage: StageRow, depth: number) {
    const children = stages.filter((s) => s.parent_id === stage.id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(stage.id);
    const isLeaf = !hasChildren;
    const unit = units.find((u) => u.id === stage.unit_id);
    const rootIdx = getRootIndex(stage);
    const subIdx = getSubIndex(stage);
    const bgColor = isDark ? getStageColorDark(rootIdx, subIdx) : getStageColor(rootIdx, subIdx);

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

    return (
      <div key={stage.id}>
        <div
          className={cn(
            "flex items-center gap-1.5 py-2 px-2 border-b border-border/50 hover:brightness-95 transition-all",
            depth === 0 && "font-semibold"
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
          <div className="flex items-center gap-1.5 shrink-0">
            {isLeaf ? (
              <>
                {/* Unidade */}
                <Select value={stage.unit_id || ""} onValueChange={(v) => handleFieldChange(stage.id, "unit_id", v)}>
                  <SelectTrigger className="w-16 h-8 text-xs bg-background/80"><SelectValue placeholder="Un." /></SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id} className="text-xs">{u.abbreviation}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Qtde */}
                <MaskedNumberInput
                  id={`qty-${stage.id}`}
                  className="w-16 h-8 text-xs text-right bg-background/80"
                  value={stage.quantity}
                  onValueChange={(v) => handleFieldChange(stage.id, "quantity", v)}
                  decimals={unit?.has_decimals ? 2 : 0}
                  placeholder="Qtde."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); document.getElementById(`price-${stage.id}`)?.focus(); }
                  }}
                />

                {/* V. Unit. */}
                <MaskedNumberInput
                  id={`price-${stage.id}`}
                  className="w-24 h-8 text-xs text-right bg-background/80"
                  value={stage.unit_price}
                  onValueChange={(v) => handleFieldChange(stage.id, "unit_price", v)}
                  placeholder="V. Unit."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                  }}
                />

                {/* V. Total */}
                <MaskedNumberInput
                  className="w-24 h-8 text-xs text-right bg-background/80 font-medium"
                  value={stageTotalValue}
                  onValueChange={() => {}}
                  readOnly
                  tabIndex={-1}
                />

                {/* Dependência */}
                {depOptions.length > 0 ? (
                  <Select
                    value={stage.dependency_id || "none"}
                    onValueChange={(v) => handleFieldChange(stage.id, "dependency_id", v === "none" ? null : v)}
                  >
                    <SelectTrigger className="w-20 h-8 text-xs bg-background/80">
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
                  <div className="w-20 h-8" />
                )}

                {/* Período */}
                <DateRangePicker stage={stage} />

                {/* Status */}
                <Select value={stage.status || "pending"} onValueChange={(v) => handleFieldChange(stage.id, "status", v)}>
                  <SelectTrigger className={cn("w-[110px] h-8 text-xs border-0", getStatusBg(stage.status))}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending" className="text-xs">—</SelectItem>
                    <SelectItem value="stopped" className="text-xs">
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />Parado</span>
                    </SelectItem>
                    <SelectItem value="in_progress" className="text-xs">
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500" />Em andamento</span>
                    </SelectItem>
                    <SelectItem value="finished" className="text-xs">
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" />Finalizado</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </>
            ) : (
              <>
                {/* Empty spacers for Unidade + Qtde + V.Unit + V.Total columns */}
                <div className="w-16 h-8" />
                <div className="w-16 h-8" />
                <div className="w-24 h-8" />
                <MaskedNumberInput
                  className="w-24 h-8 text-xs text-right bg-background/80 font-medium"
                  value={stageTotalValue}
                  onValueChange={() => {}}
                  readOnly
                  tabIndex={-1}
                />

                {/* Dependência for parent */}
                {depOptions.length > 0 ? (
                  <Select
                    value={stage.dependency_id || "none"}
                    onValueChange={(v) => handleFieldChange(stage.id, "dependency_id", v === "none" ? null : v)}
                  >
                    <SelectTrigger className="w-20 h-8 text-xs bg-background/80">
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
                  <div className="w-20 h-8" />
                )}

                {/* Período for parent - show computed period when collapsed */}
                {!isExpanded && stagePeriod && (stagePeriod.minDate || stagePeriod.maxDate) ? (
                  <div className="w-[120px] h-8 flex items-center text-xs text-muted-foreground px-1">
                    <span className="truncate">
                      {stagePeriod.minDate ? formatDateShort(stagePeriod.minDate) : "?"}-{stagePeriod.maxDate ? formatDateShort(stagePeriod.maxDate) : "?"}
                    </span>
                  </div>
                ) : (
                  <div className="w-[120px] h-8" />
                )}

                {/* Status for parent */}
                <Select value={stage.status || "pending"} onValueChange={(v) => handleFieldChange(stage.id, "status", v)}>
                  <SelectTrigger className={cn("w-[110px] h-8 text-xs border-0", getStatusBg(stage.status))}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending" className="text-xs">—</SelectItem>
                    <SelectItem value="stopped" className="text-xs">
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" />Parado</span>
                    </SelectItem>
                    <SelectItem value="in_progress" className="text-xs">
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500" />Em andamento</span>
                    </SelectItem>
                    <SelectItem value="finished" className="text-xs">
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" />Finalizado</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}

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
    <div className="space-y-6">
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
          <div className="flex items-center gap-1.5 shrink-0">
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
