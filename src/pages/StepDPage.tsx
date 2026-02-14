import { useState, useEffect } from "react";
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
import { MaskedNumberInput } from "@/components/ui/masked-number-input";
import AttachmentSection from "@/components/AttachmentSection";

export default function StepDPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    months_to_sale: 0,
    monthly_financing_payment: 0,
    has_condo_fee: false,
    condo_fee: 0,
    iptu_mode: "mensal",
    iptu_value: 0,
    monthly_expenses: 0,
  });

  useEffect(() => { if (user && id) loadData(); }, [user, id]);

  const loadData = async () => {
    const { data } = await supabase.from("study_inputs")
      .select("months_to_sale, monthly_financing_payment, has_condo_fee, condo_fee, iptu_mode, iptu_value, monthly_expenses")
      .eq("study_id", id).single();
    if (data) setForm({
      months_to_sale: data.months_to_sale || 0,
      monthly_financing_payment: Number(data.monthly_financing_payment),
      has_condo_fee: data.has_condo_fee,
      condo_fee: Number(data.condo_fee),
      iptu_mode: data.iptu_mode,
      iptu_value: Number(data.iptu_value),
      monthly_expenses: Number(data.monthly_expenses),
    });
    setLoading(false);
  };

  const setNum = (k: string, v: number) => setForm(f => ({ ...f, [k]: v }));

  const validate = (): string[] => {
    const errors: string[] = [];
    if (form.months_to_sale < 1) errors.push("Meses até a venda deve ser >= 1.");
    return errors;
  };

  const save = async (goBack: boolean) => {
    const errors = validate();
    if (errors.length) { errors.forEach(e => toast.error(e)); return; }
    setSaving(true);
    const { error } = await supabase.from("study_inputs").update({
      months_to_sale: form.months_to_sale,
      has_condo_fee: form.has_condo_fee,
      condo_fee: form.has_condo_fee ? form.condo_fee : 0,
      iptu_mode: form.iptu_mode,
      iptu_value: form.iptu_value,
      monthly_expenses: form.monthly_expenses,
      step_d_updated_at: new Date().toISOString(),
    }).eq("study_id", id);
    if (error) { toast.error("Erro ao salvar."); setSaving(false); return; }
    await recomputeAndSave(id!, user!.id);
    setSaving(false);
    toast.success("Custos até a venda salvos!");
    if (goBack) navigate(`/studies/${id}/dashboard`);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar />
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        <div className="card-dashboard space-y-5">
          <h2 className="font-bold text-lg">Custos até a Venda</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Meses até a venda</Label>
              <MaskedNumberInput value={form.months_to_sale} onValueChange={v => setNum("months_to_sale", v)} decimals={0} />
            </div>
            <div className="space-y-1.5">
              <Label>Parcela financiamento (R$)</Label>
              <Input type="text" value={form.monthly_financing_payment.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} disabled className="bg-muted/30" />
              <p className="text-xs text-muted-foreground">Calculado no Financiamento</p>
            </div>
            <div className="flex items-center gap-2 pt-4">
              <Switch checked={form.has_condo_fee} onCheckedChange={v => setForm(f => ({ ...f, has_condo_fee: v }))} />
              <Label className="text-sm font-normal">Tem condomínio?</Label>
            </div>
            {form.has_condo_fee && (
              <div className="space-y-1.5">
                <Label>Condomínio mensal (R$)</Label>
                <MaskedNumberInput value={form.condo_fee} onValueChange={v => setNum("condo_fee", v)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Modo IPTU</Label>
              <Select value={form.iptu_mode} onValueChange={v => setForm(f => ({ ...f, iptu_mode: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Mensal</SelectItem>
                  <SelectItem value="anual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>IPTU (R$) — {form.iptu_mode === "anual" ? "valor anual" : "valor mensal"}</Label>
              <MaskedNumberInput value={form.iptu_value} onValueChange={v => setNum("iptu_value", v)} />
            </div>
            <div className="space-y-1.5">
              <Label>Outras despesas mensais (R$)</Label>
              <MaskedNumberInput value={form.monthly_expenses} onValueChange={v => setNum("monthly_expenses", v)} />
            </div>
          </div>
          {/* Anexos */}
          <div className="space-y-2 pt-2 border-t">
            <Label className="text-sm font-semibold">Anexos</Label>
            <AttachmentSection studyId={id!} entity="step_d" />
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
