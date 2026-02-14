import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import GlobalTopbar from "@/components/GlobalTopbar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { recomputeAndSave } from "@/lib/recomputeService";
import { formatBRL } from "@/lib/recompute";
import { MaskedNumberInput } from "@/components/ui/masked-number-input";
import AttachmentSection from "@/components/AttachmentSection";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";

export default function StepBPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    financing_enabled: false,
    financing_system: "" as string,
    down_payment_value: 0,
    financing_term_months: 0,
    monthly_interest_rate: 0,
  });
  const [computed, setComputed] = useState<any>(null);

  const [initialForm, setInitialForm] = useState<typeof form | null>(null);

  useEffect(() => { if (user && id) loadData(); }, [user, id]);

  const loadData = async () => {
    const [inputsRes, computedRes] = await Promise.all([
      supabase.from("study_inputs").select("financing_enabled, financing_system, down_payment_value, financing_term_months, monthly_interest_rate").eq("study_id", id).single(),
      supabase.from("study_computed").select("financed_amount, first_installment, last_installment, total_paid_financing, total_interest").eq("study_id", id).single(),
    ]);
    if (inputsRes.data) {
      const d = inputsRes.data;
      const loaded = {
        financing_enabled: d.financing_enabled,
        financing_system: d.financing_system || "",
        down_payment_value: Number(d.down_payment_value),
        financing_term_months: d.financing_term_months || 0,
        monthly_interest_rate: Number(d.monthly_interest_rate),
      };
      setForm(loaded);
      setInitialForm(loaded);
    }
    if (computedRes.data) setComputed(computedRes.data);
    setLoading(false);
  };

  const { isDirty, markSaved, guardedNavigate } = useUnsavedChanges(initialForm, form);

  const setNum = (k: string, v: number) => setForm(f => ({ ...f, [k]: v }));

  const validate = (): string[] => {
    const errors: string[] = [];
    if (form.financing_enabled) {
      if (!form.financing_system) errors.push("Selecione o sistema de financiamento.");
      if (!form.financing_term_months || form.financing_term_months < 1) errors.push("Prazo deve ser >= 1 mês.");
      if (form.monthly_interest_rate <= 0) errors.push("Taxa de juros deve ser > 0.");
    }
    if (form.down_payment_value < 0) errors.push("Entrada não pode ser negativa.");
    return errors;
  };

  const save = async (goBack: boolean) => {
    const errors = validate();
    if (errors.length) { errors.forEach(e => toast.error(e)); return; }
    setSaving(true);
    const updateData: any = {
      financing_enabled: form.financing_enabled,
      step_b_updated_at: new Date().toISOString(),
    };
    if (form.financing_enabled) {
      updateData.financing_system = form.financing_system;
      updateData.down_payment_value = form.down_payment_value;
      updateData.financing_term_months = form.financing_term_months;
      updateData.monthly_interest_rate = form.monthly_interest_rate;
    } else {
      updateData.financing_system = null;
      updateData.down_payment_value = 0;
      updateData.financing_term_months = null;
      updateData.monthly_interest_rate = 0;
    }
    // Also sync down_payment_acquisition when financing is enabled
    if (form.financing_enabled && form.down_payment_value > 0) {
      updateData.down_payment_acquisition = form.down_payment_value;
    }
    const { error } = await supabase.from("study_inputs").update(updateData).eq("study_id", id);
    if (error) { toast.error("Erro ao salvar."); setSaving(false); return; }
    await recomputeAndSave(id!, user!.id);
    const { data: newComputed } = await supabase.from("study_computed").select("financed_amount, first_installment, last_installment, total_paid_financing, total_interest").eq("study_id", id).single();
    if (newComputed) setComputed(newComputed);
    setSaving(false);
    markSaved();
    toast.success("Financiamento salvo!");
    if (goBack) navigate(`/studies/${id}/dashboard`);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar />
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        <div className="card-dashboard space-y-5">
          <h2 className="font-bold text-lg">Financiamento</h2>

          <div className="flex items-center gap-3">
            <Label className="text-sm">Usar financiamento?</Label>
            <Switch checked={form.financing_enabled} onCheckedChange={v => setForm(f => ({ ...f, financing_enabled: v }))} />
            <span className="text-sm font-medium">{form.financing_enabled ? "Sim" : "Não"}</span>
          </div>

          {form.financing_enabled ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Sistema</Label>
                <Select value={form.financing_system} onValueChange={v => setForm(f => ({ ...f, financing_system: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRICE">PRICE</SelectItem>
                    <SelectItem value="SAC">SAC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Entrada (R$)</Label>
                <MaskedNumberInput value={form.down_payment_value} onValueChange={v => setNum("down_payment_value", v)} />
              </div>
              <div className="space-y-1.5">
                <Label>Prazo (meses)</Label>
                <MaskedNumberInput value={form.financing_term_months} onValueChange={v => setNum("financing_term_months", v)} decimals={0} />
              </div>
              <div className="space-y-1.5">
                <Label>Juros mensal (%)</Label>
                <MaskedNumberInput value={form.monthly_interest_rate} onValueChange={v => setNum("monthly_interest_rate", v)} decimals={2} />
              </div>
            </div>
          ) : (
            <div className="bg-muted/30 rounded-lg p-4 text-sm text-muted-foreground">
              Compra à vista — sem financiamento configurado.
            </div>
          )}

          {form.financing_enabled && computed && Number(computed.financed_amount) > 0 && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
              <h3 className="font-bold text-sm">Resumo do Financiamento</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Valor financiado:</span> <span className="font-semibold">{formatBRL(Number(computed.financed_amount))}</span></div>
                <div><span className="text-muted-foreground">Parcela inicial:</span> <span className="font-semibold">{formatBRL(Number(computed.first_installment))}</span></div>
                <div><span className="text-muted-foreground">Parcela final:</span> <span className="font-semibold">{formatBRL(Number(computed.last_installment))}</span></div>
                <div><span className="text-muted-foreground">Total pago:</span> <span className="font-semibold">{formatBRL(Number(computed.total_paid_financing))}</span></div>
                <div><span className="text-muted-foreground">Total juros:</span> <span className="font-semibold">{formatBRL(Number(computed.total_interest))}</span></div>
              </div>
            </div>
          )}

          {/* Anexos */}
          <div className="space-y-2 pt-2 border-t">
            <Label className="text-sm font-semibold">Anexos</Label>
            <AttachmentSection studyId={id!} entity="step_b" />
          </div>

          <div className="flex gap-3 pt-2">
            <Button onClick={() => save(true)} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            <Button variant="outline" onClick={() => guardedNavigate(`/studies/${id}/dashboard`)}>Voltar</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
