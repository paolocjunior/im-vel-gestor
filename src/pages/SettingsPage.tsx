import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Key, Plus, Trash2, ChevronDown, ChevronRight, Sun, Moon } from "lucide-react";
import GlobalTopbar from "@/components/GlobalTopbar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MaskedNumberInput } from "@/components/ui/masked-number-input";
import { useTheme } from "next-themes";
import { Switch } from "@/components/ui/switch";
import { COST_CENTERS } from "@/lib/billConstants";

interface UserSettings {
  roi_viable_threshold: number;
  roi_attention_threshold: number;
}

interface FinancialInstitution {
  id: string;
  name: string;
  institution_type: string;
  notes: string | null;
  is_active: boolean;
}

interface CostCenter {
  id: string;
  name: string;
  categories: Category[];
  expanded?: boolean;
}

interface Category {
  id: string;
  cost_center_id: string;
  name: string;
}

interface CatalogStage {
  id: string;
  name: string;
  code: string;
  is_system: boolean;
  subStages: { id: string; name: string; code: string; is_system: boolean }[];
  expanded?: boolean;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<UserSettings>({
    roi_viable_threshold: 30,
    roi_attention_threshold: 10,
  });
  const [institutions, setInstitutions] = useState<FinancialInstitution[]>([]);
  const [newInst, setNewInst] = useState({ name: "", institution_type: "Banco", notes: "" });
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingInst, setSavingInst] = useState(false);

  // Cost centers & categories
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [newCCName, setNewCCName] = useState("");
  const [newCatNames, setNewCatNames] = useState<Record<string, string>>({});

  // Stage catalog
  const [catalogStages, setCatalogStages] = useState<CatalogStage[]>([]);
  const [newStageName, setNewStageName] = useState("");
  const [newSubStageNames, setNewSubStageNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    const [settingsRes, instRes] = await Promise.all([
      supabase.from("user_settings").select("*").eq("user_id", user!.id).single(),
      supabase.from("financial_institutions").select("*").eq("user_id", user!.id).eq("is_active", true).order("name"),
    ]);
    if (settingsRes.data) {
      setSettings({
        roi_viable_threshold: Number(settingsRes.data.roi_viable_threshold),
        roi_attention_threshold: Number(settingsRes.data.roi_attention_threshold),
      });
    }
    if (instRes.data) setInstitutions(instRes.data);
    await Promise.all([loadCostCenters(), loadCatalogStages()]);
  };

  const loadCostCenters = async () => {
    const { data: ccData } = await supabase.from("user_cost_centers" as any)
      .select("id, name")
      .eq("user_id", user!.id)
      .eq("is_active", true)
      .order("name");
    const { data: catData } = await supabase.from("user_categories" as any)
      .select("id, cost_center_id, name")
      .eq("user_id", user!.id)
      .eq("is_active", true)
      .order("name");

    const ccs: CostCenter[] = ((ccData as any[]) || []).map((cc: any) => ({
      id: cc.id,
      name: cc.name,
      categories: ((catData as any[]) || []).filter((cat: any) => cat.cost_center_id === cc.id).map((cat: any) => ({
        id: cat.id,
        cost_center_id: cat.cost_center_id,
        name: cat.name,
      })),
      expanded: false,
    }));

    if (ccs.length === 0) {
      await seedDefaults();
      return;
    }

    setCostCenters(ccs);
  };

  const seedDefaults = async () => {
    for (const [ccName, categories] of Object.entries(COST_CENTERS)) {
      const { data: ccRow } = await supabase.from("user_cost_centers" as any)
        .insert({ user_id: user!.id, name: ccName } as any)
        .select("id")
        .single();
      if (ccRow) {
        const catInserts = categories.map(catName => ({
          user_id: user!.id,
          cost_center_id: (ccRow as any).id,
          name: catName,
        }));
        await supabase.from("user_categories" as any).insert(catInserts as any);
      }
    }
    await loadCostCenters();
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    const { error } = await supabase
      .from("user_settings")
      .update({
        roi_viable_threshold: settings.roi_viable_threshold,
        roi_attention_threshold: settings.roi_attention_threshold,
      })
      .eq("user_id", user!.id);
    setSavingSettings(false);
    if (error) { toast.error("Erro ao salvar configurações."); return; }
    toast.success("Configurações salvas!");
  };

  const addInstitution = async () => {
    if (!newInst.name.trim()) { toast.error("Nome é obrigatório."); return; }
    setSavingInst(true);
    const { error } = await supabase.from("financial_institutions").insert({
      user_id: user!.id,
      name: newInst.name.trim(),
      institution_type: newInst.institution_type,
      notes: newInst.notes.trim() || null,
    });
    setSavingInst(false);
    if (error) { toast.error("Erro ao adicionar."); return; }
    setNewInst({ name: "", institution_type: "Banco", notes: "" });
    toast.success("Instituição adicionada!");
    loadData();
  };

  const removeInstitution = async (id: string) => {
    await supabase.from("financial_institutions").update({ is_active: false }).eq("id", id);
    toast.success("Instituição removida.");
    loadData();
  };

  const addCostCenter = async () => {
    if (!newCCName.trim()) { toast.error("Nome é obrigatório."); return; }
    await supabase.from("user_cost_centers" as any).insert({ user_id: user!.id, name: newCCName.trim() } as any);
    setNewCCName("");
    toast.success("Centro de custo adicionado!");
    loadCostCenters();
  };

  const removeCostCenter = async (id: string) => {
    await supabase.from("user_cost_centers" as any).update({ is_active: false } as any).eq("id", id);
    toast.success("Centro de custo removido.");
    loadCostCenters();
  };

  const addCategory = async (costCenterId: string) => {
    const name = newCatNames[costCenterId]?.trim();
    if (!name) { toast.error("Nome é obrigatório."); return; }
    await supabase.from("user_categories" as any).insert({
      user_id: user!.id,
      cost_center_id: costCenterId,
      name,
    } as any);
    setNewCatNames(prev => ({ ...prev, [costCenterId]: "" }));
    toast.success("Categoria adicionada!");
    loadCostCenters();
  };

  const removeCategory = async (id: string) => {
    await supabase.from("user_categories" as any).update({ is_active: false } as any).eq("id", id);
    toast.success("Categoria removida.");
    loadCostCenters();
  };

  const toggleExpand = (ccId: string) => {
    setCostCenters(prev => prev.map(cc => cc.id === ccId ? { ...cc, expanded: !cc.expanded } : cc));
  };

  // Stage catalog management
  const loadCatalogStages = async () => {
    const { data: allCatalog } = await supabase
      .from("construction_stage_catalog" as any)
      .select("id, parent_id, code, name, level, is_system, user_id")
      .eq("is_active", true)
      .order("position");

    if (!allCatalog) return;

    const items = allCatalog as any[];
    // Show system items + user's own items
    const visible = items.filter(c => c.user_id === null || c.user_id === user!.id);
    const macros = visible.filter(c => c.level === 0);
    const subs = visible.filter(c => c.level === 1);

    const stages: CatalogStage[] = macros.map(m => ({
      id: m.id,
      name: m.name,
      code: m.code,
      is_system: m.is_system,
      subStages: subs.filter(s => s.parent_id === m.id).map((s: any) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        is_system: s.is_system,
      })),
      expanded: false,
    }));

    setCatalogStages(stages);
  };

  const addCatalogStage = async () => {
    if (!newStageName.trim()) { toast.error("Nome é obrigatório."); return; }
    // Check duplicate
    if (catalogStages.some(s => s.name.toLowerCase() === newStageName.trim().toLowerCase())) {
      toast.error("Já existe uma etapa com este nome.");
      return;
    }
    const maxCode = catalogStages.reduce((max, s) => Math.max(max, parseInt(s.code, 10) || 0), 0);
    await supabase.from("construction_stage_catalog" as any).insert({
      user_id: user!.id,
      code: `${maxCode + 1}`,
      name: newStageName.trim(),
      level: 0,
      position: catalogStages.length + 1,
      is_system: false,
    } as any);
    setNewStageName("");
    toast.success("Etapa adicionada ao catálogo!");
    loadCatalogStages();
  };

  const removeCatalogStage = async (id: string) => {
    await supabase.from("construction_stage_catalog" as any).update({ is_active: false } as any).eq("id", id);
    // Also deactivate sub-stages
    await supabase.from("construction_stage_catalog" as any).update({ is_active: false } as any).eq("parent_id", id);
    toast.success("Etapa removida do catálogo.");
    loadCatalogStages();
  };

  const addCatalogSubStage = async (parentId: string) => {
    const name = newSubStageNames[parentId]?.trim();
    if (!name) { toast.error("Nome é obrigatório."); return; }
    const parent = catalogStages.find(s => s.id === parentId);
    if (!parent) return;
    // Check duplicate
    if (parent.subStages.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      toast.error("Já existe uma sub-etapa com este nome.");
      return;
    }
    const maxSubNum = parent.subStages.reduce((max, s) => {
      const parts = s.code.split('.');
      return Math.max(max, parseInt(parts[parts.length - 1], 10) || 0);
    }, 0);
    await supabase.from("construction_stage_catalog" as any).insert({
      user_id: user!.id,
      parent_id: parentId,
      code: `${parent.code}.${maxSubNum + 1}`,
      name,
      level: 1,
      position: parent.subStages.length + 1,
      is_system: false,
    } as any);
    setNewSubStageNames(prev => ({ ...prev, [parentId]: "" }));
    toast.success("Sub-etapa adicionada ao catálogo!");
    loadCatalogStages();
  };

  const removeCatalogSubStage = async (id: string) => {
    await supabase.from("construction_stage_catalog" as any).update({ is_active: false } as any).eq("id", id);
    toast.success("Sub-etapa removida do catálogo.");
    loadCatalogStages();
  };

  const toggleCatalogExpand = (id: string) => {
    setCatalogStages(prev => prev.map(s => s.id === id ? { ...s, expanded: !s.expanded } : s));
  };

  return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar showSettings={false} />

      <div className="max-w-[1440px] mx-auto px-6 py-6 space-y-6">
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" size="sm" onClick={() => { window.history.length > 1 ? navigate(-1) : navigate("/hub"); }}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Voltar
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate("/settings/change-password")}>
            <Key className="h-4 w-4 mr-1.5" />
            Trocar senha
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1: Settings + Theme + Institutions */}
          <div className="space-y-6">
            <div className="card-dashboard space-y-4">
              <h2 className="font-bold text-base">Configurações</h2>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>ROI mínimo Viável (%)</Label>
                  <MaskedNumberInput value={settings.roi_viable_threshold} onValueChange={v => setSettings(s => ({ ...s, roi_viable_threshold: v }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>ROI mínimo Atenção (%)</Label>
                  <MaskedNumberInput value={settings.roi_attention_threshold} onValueChange={v => setSettings(s => ({ ...s, roi_attention_threshold: v }))} />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                    <Label className="text-sm font-normal">Tema escuro</Label>
                  </div>
                  <Switch checked={theme === "dark"} onCheckedChange={v => setTheme(v ? "dark" : "light")} />
                </div>
              </div>
              <Button onClick={saveSettings} disabled={savingSettings} size="sm">
                {savingSettings ? "Salvando..." : "Salvar configurações"}
              </Button>
            </div>

            {/* Institutions */}
            <div className="card-dashboard space-y-3">
              <h2 className="font-bold text-base">Instituições Financeiras</h2>
              <div className="space-y-2">
                <Input value={newInst.name} onChange={(e) => setNewInst(s => ({ ...s, name: e.target.value }))} placeholder="Nome da instituição" className="h-8 text-sm" />
                <div className="flex gap-2">
                  <Select value={newInst.institution_type} onValueChange={(v) => setNewInst(s => ({ ...s, institution_type: v }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Banco">Banco</SelectItem>
                      <SelectItem value="Carteira">Carteira</SelectItem>
                      <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={addInstitution} disabled={savingInst} size="sm" className="h-8 shrink-0">
                    <Plus className="h-3 w-3 mr-1" />
                    Adicionar
                  </Button>
                </div>
              </div>
              {institutions.length > 0 && (
                <div className="space-y-1 pt-2 border-t">
                  {institutions.map(inst => (
                    <div key={inst.id} className="flex items-center justify-between py-1 text-sm">
                      <div>
                        <span className="font-medium">{inst.name}</span>
                        <span className="text-muted-foreground ml-2 text-xs">({inst.institution_type})</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeInstitution(inst.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Cost Centers & Categories */}
          <div>
            <div className="card-dashboard space-y-4">
              <div>
                <h2 className="font-bold text-base">Centro de Custos e Categorias</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Centro de Custo (macro) → Categorias (micro)</p>
              </div>

              <div className="flex gap-2">
                <Input
                  value={newCCName}
                  onChange={e => setNewCCName(e.target.value)}
                  placeholder="Novo centro de custo..."
                  className="h-8 text-sm"
                  onKeyDown={e => e.key === "Enter" && addCostCenter()}
                />
                <Button onClick={addCostCenter} size="sm" className="h-8 shrink-0">
                  <Plus className="h-3 w-3 mr-1" /> Adicionar
                </Button>
              </div>

              <div className="space-y-1 max-h-[500px] overflow-y-auto">
                {costCenters.map(cc => (
                  <div key={cc.id} className="border rounded-lg">
                    <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50" onClick={() => toggleExpand(cc.id)}>
                      {cc.expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      <span className="font-semibold text-sm flex-1">{cc.name}</span>
                      <span className="text-xs text-muted-foreground mr-2">{cc.categories.length} cat.</span>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={e => { e.stopPropagation(); removeCostCenter(cc.id); }}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>

                    {cc.expanded && (
                      <div className="border-t px-3 py-2 pl-8 space-y-1">
                        {cc.categories.map(cat => (
                          <div key={cat.id} className="flex items-center justify-between py-0.5 text-sm">
                            <span>{cat.name}</span>
                            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => removeCategory(cat.id)}>
                              <Trash2 className="h-2.5 w-2.5 text-destructive" />
                            </Button>
                          </div>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <Input
                            value={newCatNames[cc.id] || ""}
                            onChange={e => setNewCatNames(prev => ({ ...prev, [cc.id]: e.target.value }))}
                            placeholder="Nova categoria..."
                            className="h-7 text-xs"
                            onKeyDown={e => e.key === "Enter" && addCategory(cc.id)}
                          />
                          <Button onClick={() => addCategory(cc.id)} size="sm" className="h-7 text-xs shrink-0">
                            <Plus className="h-2.5 w-2.5 mr-1" /> Add
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {costCenters.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">Carregando centros de custo...</p>
                )}
              </div>
            </div>
          </div>

          {/* Column 3: Stage Catalog */}
          <div>
            <div className="card-dashboard space-y-4">
              <div>
                <h2 className="font-bold text-base">Etapas e Sub-Etapas</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Catálogo de etapas (macro) → Sub-etapas (micro)</p>
              </div>

              <div className="flex gap-2">
                <Input
                  value={newStageName}
                  onChange={e => setNewStageName(e.target.value)}
                  placeholder="Nova etapa macro..."
                  className="h-8 text-sm"
                  onKeyDown={e => e.key === "Enter" && addCatalogStage()}
                />
                <Button onClick={addCatalogStage} size="sm" className="h-8 shrink-0">
                  <Plus className="h-3 w-3 mr-1" /> Adicionar
                </Button>
              </div>

              <div className="space-y-1 max-h-[500px] overflow-y-auto">
                {catalogStages.map(stage => (
                  <div key={stage.id} className="border rounded-lg">
                    <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50" onClick={() => toggleCatalogExpand(stage.id)}>
                      {stage.expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      <span className="font-semibold text-sm flex-1 truncate">{stage.code} - {stage.name}</span>
                      <span className="text-xs text-muted-foreground mr-2">{stage.subStages.length} sub.</span>
                      {!stage.is_system && (
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={e => { e.stopPropagation(); removeCatalogStage(stage.id); }}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </div>

                    {stage.expanded && (
                      <div className="border-t px-3 py-2 pl-8 space-y-1">
                        {stage.subStages.map(sub => (
                          <div key={sub.id} className="flex items-center justify-between py-0.5 text-sm">
                            <span className="truncate">{sub.code} - {sub.name}</span>
                            {!sub.is_system && (
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => removeCatalogSubStage(sub.id)}>
                                <Trash2 className="h-2.5 w-2.5 text-destructive" />
                              </Button>
                            )}
                          </div>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <Input
                            value={newSubStageNames[stage.id] || ""}
                            onChange={e => setNewSubStageNames(prev => ({ ...prev, [stage.id]: e.target.value }))}
                            placeholder="Nova sub-etapa..."
                            className="h-7 text-xs"
                            onKeyDown={e => e.key === "Enter" && addCatalogSubStage(stage.id)}
                          />
                          <Button onClick={() => addCatalogSubStage(stage.id)} size="sm" className="h-7 text-xs shrink-0">
                            <Plus className="h-2.5 w-2.5 mr-1" /> Add
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {catalogStages.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">Carregando catálogo de etapas...</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
