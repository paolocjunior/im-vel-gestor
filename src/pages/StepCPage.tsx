import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import GlobalTopbar from "@/components/GlobalTopbar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { recomputeAndSave } from "@/lib/recomputeService";

export default function StepCPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    down_payment_acquisition: 0,
    itbi_mode: "PERCENT",
    itbi_percent: 0,
    itbi_value: 0,
    bank_appraisal: 0,
    registration_fee: 0,
    deed_fee: 0,
  });
  const [purchaseValue, setPurchaseValue] = useState(0);

  useEffect(() => { if (user && id) loadData(); }, [user, id]);

  const loadData = async () => {
    const { data } = await supabase.from("study_inputs")
      .select("down_payment_acquisition, itbi_mode, itbi_percent, itbi_value, bank_appraisal, registration_fee, deed_fee, purchase_value")
      .eq("study_id", id).single();
    if (data) {
      setPurchaseValue(Number(data.purchase_value));
      setForm({
        down_payment_acquisition: Number(data.down_payment_acquisition),
        itbi_mode: data.itbi_mode,
        itbi_percent: Number(data.itbi_percent),
        itbi_value: Number(data.itbi_value),
        bank_appraisal: Number(data.bank_appraisal),
        registration_fee: Number(data.registration_fee),
        deed_fee: Number(data.deed_fee),
      });
    }
    setLoading(false);
  };

  const setNum = (k: string, v: string) => setForm(f => ({ ...f, [k]: Number(v) || 0 }));

  // Auto-calc ITBI when mode is PERCENT
  const itbiCalculated = form.itbi_mode === "PERCENT"
    ? Number(((purchaseValue * form.itbi_percent) / 100).toFixed(2))
    : form.itbi_value;

  const save = async (goBack: boolean) => {
    setSaving(true);
    const { error } = await supabase.from("study_inputs").update({
      down_payment_acquisition: form.down_payment_acquisition,
      itbi_mode: form.itbi_mode,
      itbi_percent: form.itbi_percent,
      itbi_value: itbiCalculated,
      bank_appraisal: form.bank_appraisal,
      registration_fee: form.registration_fee,
      deed_fee: form.deed_fee,
      step_c_updated_at: new Date().toISOString(),
    }).eq("study_id", id);
    if (error) { toast.error("Erro ao salvar."); setSaving(false); return; }
    await recomputeAndSave(id!, user!.id);
    setSaving(false);
    toast.success("Etapa C salva!");
    if (goBack) navigate(`/studies/${id}/dashboard`);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar />
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        <div className="card-dashboard space-y-5">
          <h2 className="font-bold text-lg">Etapa C — Custos de Aquisição</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Entrada na aquisição (R$)</Label>
              <Input type="number" step="0.01" min="0" value={form.down_payment_acquisition || ""} onChange={e => setNum("down_payment_acquisition", e.target.value)} onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ""; }} />
            </div>
            <div className="space-y-1.5">
              <Label>Modo ITBI</Label>
              <Select value={form.itbi_mode} onValueChange={v => setForm(f => ({ ...f, itbi_mode: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENT">Percentual</SelectItem>
                  <SelectItem value="FIXED">Valor fixo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.itbi_mode === "PERCENT" ? (
              <div className="space-y-1.5">
                <Label>ITBI (%)</Label>
                <Input type="number" step="0.01" min="0" value={form.itbi_percent || ""} onChange={e => setNum("itbi_percent", e.target.value)} onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ""; }} />
                <p className="text-xs text-muted-foreground">Calculado: R$ {itbiCalculated.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>ITBI (R$)</Label>
                <Input type="number" step="0.01" min="0" value={form.itbi_value || ""} onChange={e => setNum("itbi_value", e.target.value)} onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ""; }} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Avaliação bancária (R$)</Label>
              <Input type="number" step="0.01" min="0" value={form.bank_appraisal || ""} onChange={e => setNum("bank_appraisal", e.target.value)} onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ""; }} />
            </div>
            <div className="space-y-1.5">
              <Label>Registro (R$)</Label>
              <Input type="number" step="0.01" min="0" value={form.registration_fee || ""} onChange={e => setNum("registration_fee", e.target.value)} onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ""; }} />
            </div>
            <div className="space-y-1.5">
              <Label>Escritura (R$)</Label>
              <Input type="number" step="0.01" min="0" value={form.deed_fee || ""} onChange={e => setNum("deed_fee", e.target.value)} onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ""; }} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={() => save(false)} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            <Button onClick={() => save(true)} disabled={saving} variant="outline">Salvar e voltar</Button>
            <Button variant="ghost" onClick={() => navigate(`/studies/${id}/dashboard`)}>Cancelar</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
