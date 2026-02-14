import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import GlobalTopbar from "@/components/GlobalTopbar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { recomputeAndSave } from "@/lib/recomputeService";
import { MaskedNumberInput } from "@/components/ui/masked-number-input";
import AttachmentSection from "@/components/AttachmentSection";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import UnsavedChangesDialog from "@/components/UnsavedChangesDialog";

export default function StepAPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    purchase_value: 0,
    usable_area_m2: 0,
    total_area_m2: 0,
    land_area_m2: 0,
    purchase_price_per_m2: 0,
    price_per_m2_manual: false,
  });

  const [initialForm, setInitialForm] = useState<typeof form | null>(null);

  useEffect(() => { if (user && id) loadData(); }, [user, id]);

  const loadData = async () => {
    const { data } = await supabase.from("study_inputs").select("purchase_value, usable_area_m2, total_area_m2, land_area_m2, purchase_price_per_m2, price_per_m2_manual").eq("study_id", id).single();
    if (data) {
      const loaded = {
        purchase_value: Number(data.purchase_value),
        usable_area_m2: Number(data.usable_area_m2),
        total_area_m2: Number(data.total_area_m2),
        land_area_m2: Number(data.land_area_m2),
        purchase_price_per_m2: Number(data.purchase_price_per_m2),
        price_per_m2_manual: data.price_per_m2_manual,
      };
      setForm(loaded);
      setInitialForm(loaded);
    }
    setLoading(false);
  };

  const { isDirty, markSaved, guardedNavigate, showDialog, onStay, onLeave } = useUnsavedChanges(initialForm, form);

  const setNum = (k: string, v: number) => setForm(f => {
    const next = { ...f, [k]: v };
    // Auto-calculate price per m² when not manual
    if (!next.price_per_m2_manual && (k === "purchase_value" || k === "usable_area_m2" || k === "total_area_m2" || k === "land_area_m2")) {
      const area = next.usable_area_m2 || next.total_area_m2 || next.land_area_m2;
      next.purchase_price_per_m2 = area > 0 && next.purchase_value > 0 ? Number((next.purchase_value / area).toFixed(2)) : 0;
    }
    return next;
  });

  const validate = (): string[] => {
    const errors: string[] = [];
    if (form.purchase_value < 0) errors.push("Valor de compra não pode ser negativo.");
    if (form.usable_area_m2 < 0 || form.total_area_m2 < 0 || form.land_area_m2 < 0) errors.push("Áreas não podem ser negativas.");
    if (form.purchase_value > 0) {
      const hasArea = form.usable_area_m2 > 0 || form.total_area_m2 > 0 || form.land_area_m2 > 0;
      if (!hasArea) errors.push("Informe ao menos uma área válida quando houver valor de compra.");
    }
    return errors;
  };

  const save = async (goBack: boolean) => {
    const errors = validate();
    if (errors.length) { errors.forEach(e => toast.error(e)); return; }
    setSaving(true);
    const { error } = await supabase.from("study_inputs").update({
      purchase_value: form.purchase_value,
      usable_area_m2: form.usable_area_m2,
      total_area_m2: form.total_area_m2,
      land_area_m2: form.land_area_m2,
      purchase_price_per_m2: form.purchase_price_per_m2,
      price_per_m2_manual: form.price_per_m2_manual,
      step_a_updated_at: new Date().toISOString(),
    }).eq("study_id", id);
    if (error) { toast.error("Erro ao salvar."); setSaving(false); return; }
    await recomputeAndSave(id!, user!.id);
    setSaving(false);
    markSaved();
    toast.success("Dados do imóvel salvos!");
    if (goBack) navigate(`/studies/${id}/dashboard`);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar />
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        <div className="card-dashboard space-y-5">
          <h2 className="font-bold text-lg">Dados do Imóvel/Terreno</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Valor de compra (R$)</Label>
              <MaskedNumberInput value={form.purchase_value} onValueChange={v => setNum("purchase_value", v)} />
            </div>
            <div className="space-y-1.5">
              <Label>Área útil (m²)</Label>
              <MaskedNumberInput value={form.usable_area_m2} onValueChange={v => setNum("usable_area_m2", v)} />
            </div>
            <div className="space-y-1.5">
              <Label>Área total (m²)</Label>
              <MaskedNumberInput value={form.total_area_m2} onValueChange={v => setNum("total_area_m2", v)} />
            </div>
            <div className="space-y-1.5">
              <Label>Área do terreno (m²)</Label>
              <MaskedNumberInput value={form.land_area_m2} onValueChange={v => setNum("land_area_m2", v)} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor do m² (R$)</Label>
              <MaskedNumberInput value={form.purchase_price_per_m2} onValueChange={v => { setNum("purchase_price_per_m2", v); setForm(f => ({ ...f, price_per_m2_manual: true })); }} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={form.price_per_m2_manual} onCheckedChange={v => setForm(f => ({ ...f, price_per_m2_manual: v }))} />
              <Label className="text-sm font-normal">Valor/m² manual</Label>
            </div>
          </div>
          {/* Anexos */}
          <div className="space-y-2 pt-2 border-t">
            <Label className="text-sm font-semibold">Anexos</Label>
            <AttachmentSection studyId={id!} entity="step_a" />
          </div>

          <div className="flex gap-3 pt-2">
            <Button onClick={() => save(true)} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            <Button variant="outline" onClick={() => guardedNavigate(`/studies/${id}/dashboard`)}>Voltar</Button>
          </div>
        </div>
      </div>
      <UnsavedChangesDialog open={showDialog} onStay={onStay} onLeave={onLeave} />
    </div>
  );
}