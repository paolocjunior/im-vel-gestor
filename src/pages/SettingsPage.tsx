import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
    await loadCostCenters();
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

    // If no cost centers exist, seed from defaults
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

  // Cost center management
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
          {/* Column 1: Settings + Theme */}
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

          {/* Column 2-3: Cost Centers & Categories */}
          <div className="lg:col-span-2">
            <div className="card-dashboard space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-base">Centro de Custos e Categorias</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Centro de Custo (macro) → Categorias (micro)</p>
                </div>
              </div>

              {/* Add new cost center */}
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

              {/* Cost centers list */}
              <div className="space-y-1">
                {costCenters.map(cc => (
                  <div key={cc.id} className="border rounded-lg">
                    {/* Cost center header */}
                    <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50" onClick={() => toggleExpand(cc.id)}>
                      {cc.expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      <span className="font-semibold text-sm flex-1">{cc.name}</span>
                      <span className="text-xs text-muted-foreground mr-2">{cc.categories.length} cat.</span>
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={e => { e.stopPropagation(); removeCostCenter(cc.id); }}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>

                    {/* Categories */}
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
        </div>
      </div>
    </div>
  );
}
