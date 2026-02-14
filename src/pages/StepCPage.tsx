import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import GlobalTopbar from "@/components/GlobalTopbar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { recomputeAndSave } from "@/lib/recomputeService";
import { MaskedNumberInput } from "@/components/ui/masked-number-input";
import AttachmentSection from "@/components/AttachmentSection";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import UnsavedChangesDialog from "@/components/UnsavedChangesDialog";

export default function StepCPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showMismatchDialog, setShowMismatchDialog] = useState(false);
  const [financingDownPayment, setFinancingDownPayment] = useState(0);
  const [financingEnabled, setFinancingEnabled] = useState(false);
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

  const [initialForm, setInitialForm] = useState<typeof form | null>(null);

  useEffect(() => { if (user && id) loadData(); }, [user, id]);

  const loadData = async () => {
    const { data } = await supabase.from("study_inputs")
      .select("down_payment_acquisition, itbi_mode, itbi_percent, itbi_value, bank_appraisal, registration_fee, deed_fee, purchase_value, financing_enabled, down_payment_value")
      .eq("study_id", id).single();
    if (data) {
      const finEnabled = data.financing_enabled;
      const finDown = Number(data.down_payment_value);
      setFinancingEnabled(finEnabled);
      setFinancingDownPayment(finDown);
      setPurchaseValue(Number(data.purchase_value));
      const loaded = {
        down_payment_acquisition: finEnabled && finDown > 0 ? finDown : Number(data.down_payment_acquisition),
        itbi_mode: data.itbi_mode,
        itbi_percent: Number(data.itbi_percent),
        itbi_value: Number(data.itbi_value),
        bank_appraisal: Number(data.bank_appraisal),
        registration_fee: Number(data.registration_fee),
        deed_fee: Number(data.deed_fee),
      };
      setForm(loaded);
      setInitialForm(loaded);
    }
    setLoading(false);
  };

  const { isDirty, blocker, markSaved } = useUnsavedChanges(initialForm, form);

  const setNum = (k: string, v: number) => setForm(f => ({ ...f, [k]: v }));

  const itbiCalculated = form.itbi_mode === "PERCENT"
    ? Number(((purchaseValue * form.itbi_percent) / 100).toFixed(2))
    : form.itbi_value;

  const save = async (goBack: boolean) => {
    // Validate mismatch if financing is enabled
    if (financingEnabled && financingDownPayment > 0 && form.down_payment_acquisition !== financingDownPayment) {
      setShowMismatchDialog(true);
      return;
    }
    await doSave(goBack);
  };

  const doSave = async (goBack: boolean) => {
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
    markSaved();
    toast.success("Custos de aquisição salvos!");
    if (goBack) navigate(`/studies/${id}/dashboard`);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar />
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        <div className="card-dashboard space-y-5">
          <h2 className="font-bold text-lg">Custos de Aquisição</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Entrada na aquisição (R$)</Label>
              <MaskedNumberInput value={form.down_payment_acquisition} onValueChange={v => setNum("down_payment_acquisition", v)} />
              {financingEnabled && financingDownPayment > 0 && (
                <p className="text-xs text-muted-foreground">Preenchido automaticamente pela entrada do financiamento</p>
              )}
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
                <MaskedNumberInput value={form.itbi_percent} onValueChange={v => setNum("itbi_percent", v)} />
                <p className="text-xs text-muted-foreground">Calculado: R$ {itbiCalculated.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>ITBI (R$)</Label>
                <MaskedNumberInput value={form.itbi_value} onValueChange={v => setNum("itbi_value", v)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Avaliação bancária (R$)</Label>
              <MaskedNumberInput value={form.bank_appraisal} onValueChange={v => setNum("bank_appraisal", v)} />
            </div>
            <div className="space-y-1.5">
              <Label>Registro (R$)</Label>
              <MaskedNumberInput value={form.registration_fee} onValueChange={v => setNum("registration_fee", v)} />
            </div>
            <div className="space-y-1.5">
              <Label>Escritura (R$)</Label>
              <MaskedNumberInput value={form.deed_fee} onValueChange={v => setNum("deed_fee", v)} />
            </div>
          </div>
          {/* Anexos */}
          <div className="space-y-2 pt-2 border-t">
            <Label className="text-sm font-semibold">Anexos</Label>
            <AttachmentSection studyId={id!} entity="step_c" />
          </div>

          <div className="flex gap-3 pt-2">
            <Button onClick={() => save(true)} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            <Button variant="outline" onClick={() => navigate(`/studies/${id}/dashboard`)}>Voltar</Button>
          </div>
        </div>
      </div>

      <Dialog open={showMismatchDialog} onOpenChange={setShowMismatchDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Valores incompatíveis</DialogTitle>
            <DialogDescription>
              O valor de entrada na aquisição ({form.down_payment_acquisition.toLocaleString("pt-BR", { minimumFractionDigits: 2, style: "currency", currency: "BRL" })}) está diferente do valor de entrada configurado no financiamento ({financingDownPayment.toLocaleString("pt-BR", { minimumFractionDigits: 2, style: "currency", currency: "BRL" })}).
              <br /><br />
              Quando o financiamento está ativo, a entrada na aquisição deve ser igual à entrada do financiamento, pois representam o mesmo desembolso. Corrija o valor ou atualize o financiamento para manter a consistência.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => {
              setForm(f => ({ ...f, down_payment_acquisition: financingDownPayment }));
              setShowMismatchDialog(false);
            }}>Usar valor do financiamento</Button>
            <Button variant="ghost" onClick={() => setShowMismatchDialog(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <UnsavedChangesDialog blocker={blocker} />
    </div>
  );
}