import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import GlobalTopbar from "@/components/GlobalTopbar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { recomputeAndSave } from "@/lib/recomputeService";
import { MaskedNumberInput } from "@/components/ui/masked-number-input";

export default function StepEPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    sale_value: 0,
    sale_price_per_m2: 0,
    payoff_at_sale: 0,
    brokerage_mode: "PERCENT",
    brokerage_percent: 0,
    brokerage_value: 0,
    income_tax: 0,
    sale_notes: "",
  });

  useEffect(() => { if (user && id) loadData(); }, [user, id]);

  const loadData = async () => {
    const { data } = await supabase.from("study_inputs")
      .select("sale_value, sale_price_per_m2, payoff_at_sale, brokerage_mode, brokerage_percent, brokerage_value, income_tax, sale_notes")
      .eq("study_id", id).single();
    if (data) setForm({
      sale_value: Number(data.sale_value),
      sale_price_per_m2: Number(data.sale_price_per_m2),
      payoff_at_sale: Number(data.payoff_at_sale),
      brokerage_mode: data.brokerage_mode,
      brokerage_percent: Number(data.brokerage_percent),
      brokerage_value: Number(data.brokerage_value),
      income_tax: Number(data.income_tax),
      sale_notes: data.sale_notes || "",
    });
    setLoading(false);
  };

  const setNum = (k: string, v: number) => setForm(f => ({ ...f, [k]: v }));

  const brokerageCalculated = form.brokerage_mode === "PERCENT"
    ? Number(((form.sale_value * form.brokerage_percent) / 100).toFixed(2))
    : form.brokerage_value;

  const validate = (): string[] => {
    const errors: string[] = [];
    if (form.sale_value < 0.01) errors.push("Valor de venda deve ser maior que zero.");
    return errors;
  };

  const save = async (goBack: boolean) => {
    const errors = validate();
    if (errors.length) { errors.forEach(e => toast.error(e)); return; }
    setSaving(true);
    const { error } = await supabase.from("study_inputs").update({
      sale_value: form.sale_value,
      sale_price_per_m2: form.sale_price_per_m2,
      brokerage_mode: form.brokerage_mode,
      brokerage_percent: form.brokerage_percent,
      brokerage_value: form.brokerage_mode === "PERCENT" ? brokerageCalculated : form.brokerage_value,
      income_tax: form.income_tax,
      sale_notes: form.sale_notes || null,
      step_e_updated_at: new Date().toISOString(),
    }).eq("study_id", id);
    if (error) { toast.error("Erro ao salvar."); setSaving(false); return; }
    await recomputeAndSave(id!, user!.id);
    setSaving(false);
    toast.success("Etapa E salva!");
    if (goBack) navigate(`/studies/${id}/dashboard`);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar />
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        <div className="card-dashboard space-y-5">
          <h2 className="font-bold text-lg">Etapa E — Dados da Venda</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Valor de venda (R$)</Label>
              <MaskedNumberInput value={form.sale_value} onValueChange={v => setNum("sale_value", v)} />
            </div>
            <div className="space-y-1.5">
              <Label>Preço/m² de venda (R$)</Label>
              <MaskedNumberInput value={form.sale_price_per_m2} onValueChange={v => setNum("sale_price_per_m2", v)} />
            </div>
            <div className="space-y-1.5">
              <Label>Quitação na venda (R$)</Label>
              <Input type="text" value={form.payoff_at_sale.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} disabled className="bg-muted/30" />
              <p className="text-xs text-muted-foreground">Calculado pela engine</p>
            </div>
            <div className="space-y-1.5">
              <Label>Modo corretagem</Label>
              <Select value={form.brokerage_mode} onValueChange={v => setForm(f => ({ ...f, brokerage_mode: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENT">Percentual</SelectItem>
                  <SelectItem value="FIXED">Valor fixo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.brokerage_mode === "PERCENT" ? (
              <div className="space-y-1.5">
                <Label>Corretagem (%)</Label>
                <MaskedNumberInput value={form.brokerage_percent} onValueChange={v => setNum("brokerage_percent", v)} />
                <p className="text-xs text-muted-foreground">Calculado: R$ {brokerageCalculated.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Corretagem (R$)</Label>
                <MaskedNumberInput value={form.brokerage_value} onValueChange={v => setNum("brokerage_value", v)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Imposto de renda (R$)</Label>
              <MaskedNumberInput value={form.income_tax} onValueChange={v => setNum("income_tax", v)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Observações da venda</Label>
              <Textarea value={form.sale_notes} onChange={e => setForm(f => ({ ...f, sale_notes: e.target.value }))} rows={2} />
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
