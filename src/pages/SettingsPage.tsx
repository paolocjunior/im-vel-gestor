import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Key, Plus, Trash2 } from "lucide-react";
import GlobalTopbar from "@/components/GlobalTopbar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MaskedNumberInput } from "@/components/ui/masked-number-input";

interface UserSettings {
  roi_viable_threshold: number;
  roi_attention_threshold: number;
  default_down_payment_percent: number;
  default_monthly_interest: number;
  default_term_months: number;
}

interface FinancialInstitution {
  id: string;
  name: string;
  institution_type: string;
  notes: string | null;
  is_active: boolean;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>({
    roi_viable_threshold: 30,
    roi_attention_threshold: 10,
    default_down_payment_percent: 20,
    default_monthly_interest: 0.99,
    default_term_months: 360,
  });
  const [institutions, setInstitutions] = useState<FinancialInstitution[]>([]);
  const [newInst, setNewInst] = useState({ name: "", institution_type: "Banco", notes: "" });
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingInst, setSavingInst] = useState(false);

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
        default_down_payment_percent: Number(settingsRes.data.default_down_payment_percent),
        default_monthly_interest: Number(settingsRes.data.default_monthly_interest),
        default_term_months: settingsRes.data.default_term_months,
      });
    }
    if (instRes.data) setInstitutions(instRes.data);
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    const { error } = await supabase
      .from("user_settings")
      .update(settings)
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Settings */}
          <div className="card-dashboard space-y-5">
            <h2 className="font-bold text-base">Configurações do Usuário</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>ROI mínimo Viável (%)</Label>
                <MaskedNumberInput value={settings.roi_viable_threshold} onValueChange={v => setSettings(s => ({ ...s, roi_viable_threshold: v }))} />
              </div>
              <div className="space-y-1.5">
                <Label>ROI mínimo Atenção (%)</Label>
                <MaskedNumberInput value={settings.roi_attention_threshold} onValueChange={v => setSettings(s => ({ ...s, roi_attention_threshold: v }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Entrada padrão (%)</Label>
                <MaskedNumberInput value={settings.default_down_payment_percent} onValueChange={v => setSettings(s => ({ ...s, default_down_payment_percent: v }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Juros padrão mensal (%)</Label>
                <MaskedNumberInput value={settings.default_monthly_interest} onValueChange={v => setSettings(s => ({ ...s, default_monthly_interest: v }))} decimals={4} />
              </div>
              <div className="space-y-1.5">
                <Label>Prazo padrão (meses)</Label>
                <MaskedNumberInput value={settings.default_term_months} onValueChange={v => setSettings(s => ({ ...s, default_term_months: v }))} decimals={0} />
              </div>
            </div>

            <Button onClick={saveSettings} disabled={savingSettings}>
              {savingSettings ? "Salvando..." : "Salvar configurações"}
            </Button>
          </div>

          {/* Institutions */}
          <div className="space-y-6">
            <div className="card-dashboard space-y-4">
              <h2 className="font-bold text-base">Nova Instituição Financeira</h2>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Nome</Label>
                  <Input value={newInst.name} onChange={(e) => setNewInst(s => ({ ...s, name: e.target.value }))} placeholder="Ex: Banco do Brasil" />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={newInst.institution_type} onValueChange={(v) => setNewInst(s => ({ ...s, institution_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Banco">Banco</SelectItem>
                      <SelectItem value="Carteira">Carteira</SelectItem>
                      <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Observação</Label>
                  <Textarea value={newInst.notes} onChange={(e) => setNewInst(s => ({ ...s, notes: e.target.value }))} rows={2} />
                </div>
                <Button onClick={addInstitution} disabled={savingInst} size="sm">
                  <Plus className="h-4 w-4 mr-1.5" />
                  {savingInst ? "Adicionando..." : "Adicionar instituição"}
                </Button>
              </div>
            </div>

            <div className="card-dashboard space-y-4">
              <h2 className="font-bold text-base">Instituições Ativas</h2>
              {institutions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma instituição cadastrada.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm table-zebra">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-semibold">Nome</th>
                        <th className="text-left py-2 font-semibold">Tipo</th>
                        <th className="text-right py-2 font-semibold">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {institutions.map((inst) => (
                        <tr key={inst.id} className="border-b last:border-0">
                          <td className="py-2">{inst.name}</td>
                          <td className="py-2">{inst.institution_type}</td>
                          <td className="py-2 text-right">
                            <Button variant="ghost" size="sm" onClick={() => removeInstitution(inst.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
