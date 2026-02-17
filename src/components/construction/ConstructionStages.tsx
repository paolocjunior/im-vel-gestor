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
import { Plus, ChevronDown, ChevronRight, Trash2, ArrowUpDown, Layers, Calendar } from "lucide-react";
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
}

export default function ConstructionStages({ studyId, onStagesChanged }: Props) {
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

  // Compute totals
  const rootStages = stages.filter((s) => !s.parent_id);
  const totalValue = stages.reduce((sum, s) => {
    // Only count leaf stages (no children) to avoid double counting
    const hasChildren = stages.some((c) => c.parent_id === s.id);
    return sum + (hasChildren ? 0 : Number(s.total_value) || 0);
  }, 0);
  const totalM2 = stages.reduce((sum, s) => sum + (Number(s.area_m2) || 0), 0);
  const valorM2 = totalM2 > 0 ? totalValue / totalM2 : 0;

  // Period
  const allDates = stages
    .flatMap((s) => [s.start_date, s.end_date])
    .filter(Boolean) as string[];
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
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Get available catalog items for adding a macro stage (level 0 catalog items)
  const macroOptions = catalog.filter((c) => c.level === 0);

  // Get catalog children for sub-stages
  const getCatalogChildren = (parentCatalogId: string) =>
    catalog.filter((c) => c.parent_id === parentCatalogId);

  const handleAddStage = async () => {
    if (!selectedCatalogId && !newCatalogName) return;

    let catalogItem: CatalogItem | undefined;
    let newCode = "";
    let newName = "";

    if (showNewCatalog && newCatalogName) {
      // Create new catalog entry
      const position = macroOptions.length + 1;
      const code = `${position}.0`;
      const { data, error } = await supabase
        .from("construction_stage_catalog" as any)
        .insert({
          user_id: user?.id,
          parent_id: addParentId ? stages.find(s => s.id === addParentId)?.catalog_id : null,
          code,
          name: newCatalogName,
          level: addParentId ? 1 : 0,
          position,
          is_system: false,
        })
        .select()
        .single();

      if (error) {
        toast.error("Erro ao criar etapa no catálogo");
        return;
      }

      newCode = code;
      newName = newCatalogName;
      catalogItem = data as any;
      fetchCatalog();
    } else {
      catalogItem = catalog.find((c) => c.id === selectedCatalogId);
      if (!catalogItem) return;
      newCode = catalogItem.code;
      newName = catalogItem.name;
    }

    // Determine position and code for the new stage
    const siblings = stages.filter((s) => s.parent_id === addParentId);
    const position = siblings.length + 1;
    const parentStage = addParentId ? stages.find((s) => s.id === addParentId) : null;
    const stageCode = parentStage ? `${parentStage.code}.${position}` : `${position}`;

    const { error } = await supabase.from("construction_stages" as any).insert({
      study_id: studyId,
      parent_id: addParentId,
      catalog_id: catalogItem?.id || null,
      code: stageCode,
      name: newName,
      level: parentStage ? parentStage.level + 1 : 0,
      position,
    });

    if (error) {
      toast.error("Erro ao adicionar etapa");
      return;
    }

    toast.success("Etapa adicionada");
    setAddDialogOpen(false);
    setSelectedCatalogId("");
    setNewCatalogName("");
    setShowNewCatalog(false);
    fetchStages();
    onStagesChanged();
  };

  const handleDeleteStage = async () => {
    if (!deleteTarget) return;
    await supabase
      .from("construction_stages" as any)
      .update({ is_deleted: true })
      .eq("id", deleteTarget.id);

    toast.success("Etapa excluída");
    setDeleteTarget(null);
    fetchStages();
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
    await supabase
      .from("construction_stages" as any)
      .update(update)
      .eq("id", stageId);

    fetchStages();
    onStagesChanged();
  };

  function renderStageRow(stage: StageRow, depth: number) {
    const children = stages.filter((s) => s.parent_id === stage.id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(stage.id);
    const isLeaf = !hasChildren;
    const unit = units.find((u) => u.id === stage.unit_id);

    return (
      <div key={stage.id}>
        <div
          className={cn(
            "flex items-center gap-2 py-2 px-2 border-b border-border/50 hover:bg-muted/30 transition-colors",
            depth === 0 && "bg-muted/20 font-semibold"
          )}
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          {/* Expand toggle */}
          <button
            className="shrink-0"
            onClick={() => toggleExpand(stage.id)}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
            )}
          </button>

          {/* Code + Name */}
          <span className="text-sm min-w-[180px] truncate">
            {stage.code} - {stage.name}
          </span>

          {/* Editable fields for leaf items */}
          {isLeaf ? (
            <div className="flex items-center gap-2 ml-auto">
              {/* Unit */}
              <Select
                value={stage.unit_id || ""}
                onValueChange={(v) => handleFieldChange(stage.id, "unit_id", v)}
              >
                <SelectTrigger className="w-20 h-8 text-xs">
                  <SelectValue placeholder="Un." />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id} className="text-xs">
                      {u.abbreviation}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Quantity */}
              <MaskedNumberInput
                className="w-20 h-8 text-xs text-right"
                value={stage.quantity}
                onValueChange={(v) => handleFieldChange(stage.id, "quantity", v)}
                decimals={unit?.has_decimals ? 2 : 0}
                placeholder="Qtde."
              />

              {/* Unit Price */}
              <MaskedNumberInput
                className="w-28 h-8 text-xs text-right"
                value={stage.unit_price}
                onValueChange={(v) => handleFieldChange(stage.id, "unit_price", v)}
                placeholder="Valor Unit."
              />

              {/* Total */}
              <div className="w-28 h-8 flex items-center justify-end text-xs font-medium text-foreground">
                {formatBRNumber(stage.total_value)}
              </div>

              {/* Delete */}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => setDeleteTarget(stage)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 ml-auto">
              <div className="text-xs text-muted-foreground">
                Total: R$ {formatBRNumber(
                  children.reduce((sum, c) => sum + (Number(c.total_value) || 0), 0)
                )}
              </div>
            </div>
          )}
        </div>

        {/* Children */}
        {isExpanded && children.map((c) => renderStageRow(c, depth + 1))}

        {/* Add sub-stage button */}
        {isExpanded && (
          <button
            className="flex items-center gap-1 text-xs text-primary hover:text-primary-hover py-1 transition-colors"
            style={{ paddingLeft: `${(depth + 1) * 20 + 28}px` }}
            onClick={() => {
              setAddParentId(stage.id);
              setAddDialogOpen(true);
            }}
          >
            <Plus className="h-3 w-3" /> Adicionar sub-etapa
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-foreground">Etapas</h2>

      {/* Summary */}
      <div className="card-dashboard space-y-4">
        {minDate && maxDate && (
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Período</p>
            <p className="text-sm font-semibold text-foreground">
              {formatDate(minDate)} à {formatDate(maxDate)}
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Valor m²</p>
            <p className="kpi-value text-lg">R$ {formatBRNumber(valorM2)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total m²</p>
            <p className="kpi-value text-lg">{formatBRNumber(totalM2)} m²</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Valor Total</p>
            <p className="kpi-value text-lg">R$ {formatBRNumber(totalValue)}</p>
          </div>
        </div>
      </div>

      {/* Stage tree */}
      <div className="card-dashboard p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b">
          <span className="text-sm font-semibold text-foreground flex-1">Etapas</span>
          <span className="text-xs text-muted-foreground w-20 text-center hidden sm:block">Unidade</span>
          <span className="text-xs text-muted-foreground w-20 text-center hidden sm:block">Qtde.</span>
          <span className="text-xs text-muted-foreground w-28 text-center hidden sm:block">Valor Unit.</span>
          <span className="text-xs text-muted-foreground w-28 text-center hidden sm:block">Valor Total</span>
          <span className="w-8" />
        </div>

        {/* Rows */}
        {rootStages.map((s) => renderStageRow(s, 0))}

        {/* Add macro stage */}
        <button
          className="flex items-center gap-2 px-4 py-3 text-sm text-primary hover:text-primary-hover hover:bg-muted/20 w-full text-left transition-colors"
          onClick={() => {
            setAddParentId(null);
            setAddDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Adicionar Etapa
        </button>
      </div>

      {/* Add Stage Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {addParentId ? "Adicionar Sub-etapa" : "Adicionar Etapa"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {!showNewCatalog ? (
              <>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">
                    Selecione a etapa
                  </label>
                  <Select value={selectedCatalogId} onValueChange={setSelectedCatalogId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha uma etapa..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(addParentId
                        ? (() => {
                            const parentStage = stages.find(s => s.id === addParentId);
                            return parentStage?.catalog_id
                              ? getCatalogChildren(parentStage.catalog_id)
                              : macroOptions;
                          })()
                        : macroOptions
                      ).map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-sm">
                          {c.code} - {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <button
                  className="text-xs text-primary hover:text-primary-hover font-medium"
                  onClick={() => setShowNewCatalog(true)}
                >
                  + Criar nova etapa
                </button>
              </>
            ) : (
              <>
                <div>
                  <label className="text-sm font-medium text-foreground mb-1 block">
                    Nome da nova etapa
                  </label>
                  <Input
                    value={newCatalogName}
                    onChange={(e) => setNewCatalogName(e.target.value)}
                    placeholder="Ex: Serviços Especiais"
                  />
                </div>
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setShowNewCatalog(false);
                    setNewCatalogName("");
                  }}
                >
                  ← Voltar para lista
                </button>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAddStage}
              disabled={!selectedCatalogId && !newCatalogName}
            >
              Adicionar
            </Button>
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
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteStage} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
