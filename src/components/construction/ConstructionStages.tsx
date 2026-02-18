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
import { Plus, ChevronDown, ChevronRight, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
  // For sub-stages, vary lightness per sub-index within range 89-93
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
      .select("id, parent_id, catalog_id, code, name, level, position, unit_id, quantity, unit_price, total_value, start_date, end_date, area_m2, status")
      .eq("study_id", studyId)
      .eq("is_deleted", false)
      .order("position");
    if (data) setStages(data as any[]);
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
        return !hasChildren && s.quantity === 0 && s.unit_price === 0;
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

  const formatDate = (d: string | null) => {
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
    if (!stage.parent_id) return -1; // macro
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

  /** Recursively renumber all siblings and their descendants under a parent */
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
      // Always recurse into children with the new code
      await renumberSiblings(siblings[i].id, stageList, newCode);
    }
  };

  const handleMoveStage = async (stage: StageRow, direction: 'up' | 'down') => {
    const siblings = stages.filter(s => s.parent_id === stage.parent_id).sort((a, b) => a.position - b.position);
    const idx = siblings.findIndex(s => s.id === stage.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;

    const other = siblings[swapIdx];
    // Swap positions
    await supabase.from("construction_stages" as any).update({ position: other.position }).eq("id", stage.id);
    await supabase.from("construction_stages" as any).update({ position: stage.position }).eq("id", other.id);

    // Fetch fresh data, then renumber everything from parent with correct parent code
    const { data: freshStages } = await supabase
      .from("construction_stages" as any)
      .select("id, parent_id, catalog_id, code, name, level, position, unit_id, quantity, unit_price, total_value, start_date, end_date, area_m2, status")
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
        // Parent code is just a number like "1", so sub is "1.X"
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
    
    // Code: macro = just number "1", "2"...; sub = "parentCode.N"
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
    // Recursively collect all descendant IDs
    const collectDescendants = (parentId: string): string[] => {
      const children = stages.filter(s => s.parent_id === parentId);
      return children.flatMap(c => [c.id, ...collectDescendants(c.id)]);
    };
    const allIds = [deleteTarget.id, ...collectDescendants(deleteTarget.id)];
    await supabase.from("construction_stages" as any).update({ is_deleted: true }).in("id", allIds);

    toast.success("Etapa excluída");
    const parentId = deleteTarget.parent_id;
    setDeleteTarget(null);

    // Fetch fresh data then renumber
    const { data: freshStages } = await supabase
      .from("construction_stages" as any)
      .select("id, parent_id, catalog_id, code, name, level, position, unit_id, quantity, unit_price, total_value, start_date, end_date, area_m2, status")
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
    fetchStages();
    onStagesChanged();
  };

  function renderStageRow(stage: StageRow, depth: number) {
    const children = stages.filter((s) => s.parent_id === stage.id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(stage.id);
    const isLeaf = !hasChildren;
    const unit = units.find((u) => u.id === stage.unit_id);
    const rootIdx = getRootIndex(stage);
    const subIdx = getSubIndex(stage);
    const bgColor = isDark ? getStageColorDark(rootIdx, subIdx) : getStageColor(rootIdx, subIdx);

    const siblings = stages.filter(s => s.parent_id === stage.parent_id).sort((a, b) => a.position - b.position);
    const siblingIdx = siblings.findIndex(s => s.id === stage.id);
    const canMoveUp = siblingIdx > 0;
    const canMoveDown = siblingIdx < siblings.length - 1;

    return (
      <div key={stage.id}>
        <div
          className={cn(
            "flex items-center gap-2 py-2 px-2 border-b border-border/50 hover:brightness-95 transition-all",
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

          <span className="text-sm min-w-[180px] truncate">
            {stage.code} - {stage.name}
          </span>

          {isLeaf ? (
            <div className="flex items-center gap-2 ml-auto">
              <Select value={stage.unit_id || ""} onValueChange={(v) => handleFieldChange(stage.id, "unit_id", v)}>
                <SelectTrigger className="w-20 h-8 text-xs bg-background/80"><SelectValue placeholder="Un." /></SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id} className="text-xs">{u.abbreviation}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <MaskedNumberInput
                id={`qty-${stage.id}`}
                className="w-20 h-8 text-xs text-right bg-background/80"
                value={stage.quantity}
                onValueChange={(v) => handleFieldChange(stage.id, "quantity", v)}
                decimals={unit?.has_decimals ? 2 : 0}
                placeholder="Qtde."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); document.getElementById(`price-${stage.id}`)?.focus(); }
                }}
              />

              <MaskedNumberInput
                id={`price-${stage.id}`}
                className="w-28 h-8 text-xs text-right bg-background/80"
                value={stage.unit_price}
                onValueChange={(v) => handleFieldChange(stage.id, "unit_price", v)}
                placeholder="Valor Unit."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                }}
              />

              <div className="w-28 h-8 flex items-center justify-end text-xs font-medium text-foreground">
                {formatBRNumber(stage.total_value)}
              </div>

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
          ) : (
            <div className="flex items-center gap-2 ml-auto">
              <div className="text-xs text-muted-foreground">
                Total: R$ {formatBRNumber(children.reduce((sum, c) => sum + (Number(c.total_value) || 0), 0))}
              </div>

              {/* Reorder buttons for parent stages */}
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
          )}
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

      <div className="rounded-xl p-5" style={{ backgroundColor: isDark ? 'hsl(180, 28%, 12%)' : 'hsl(180, 28%, 88%)' }}>
        {minDate && maxDate && (
          <div className="text-center mb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Período</p>
            <p className="text-sm font-semibold text-foreground">{formatDate(minDate)} à {formatDate(maxDate)}</p>
          </div>
        )}
        <div className="flex justify-end">
          <div className="text-right">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Valor Total</p>
            <p className="kpi-value text-lg">R$ {formatBRNumber(totalValue)}</p>
          </div>
        </div>
      </div>

      <div className="card-dashboard p-0 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b">
          <span className="text-sm font-semibold text-foreground flex-1">Etapas</span>
          <span className="text-xs text-muted-foreground w-20 text-center hidden sm:block">Unidade</span>
          <span className="text-xs text-muted-foreground w-20 text-center hidden sm:block">Qtde.</span>
          <span className="text-xs text-muted-foreground w-28 text-center hidden sm:block">Valor Unit.</span>
          <span className="text-xs text-muted-foreground w-28 text-center hidden sm:block">Valor Total</span>
          <span className="w-14" />
          <span className="w-8" />
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
