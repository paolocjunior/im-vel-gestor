import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2 } from "lucide-react";
import GlobalTopbar from "@/components/GlobalTopbar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { recomputeAndSave } from "@/lib/recomputeService";
import { formatBRL } from "@/lib/recompute";

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

  useEffect(() => { if (user && id) loadData(); }, [user, id]);

  const loadData = async () => {
    const { data } = await supabase.from("study_inputs").select("purchase_value, usable_area_m2, total_area_m2, land_area_m2, purchase_price_per_m2, price_per_m2_manual").eq("study_id", id).single();
    if (data) setForm({
      purchase_value: Number(data.purchase_value),
      usable_area_m2: Number(data.usable_area_m2),
      total_area_m2: Number(data.total_area_m2),
      land_area_m2: Number(data.land_area_m2),
      purchase_price_per_m2: Number(data.purchase_price_per_m2),
      price_per_m2_manual: data.price_per_m2_manual,
    });
    setLoading(false);
  };

  const setNum = (k: string, v: string) => setForm(f => ({ ...f, [k]: Number(v) || 0 }));

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
    toast.success("Etapa A salva!");
    if (goBack) navigate(`/studies/${id}/dashboard`);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar />
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        <div className="card-dashboard space-y-5">
          <h2 className="font-bold text-lg">Etapa A — Dados do Imóvel/Terreno</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Valor de compra (R$)</Label>
              <Input type="number" step="0.01" min="0" value={form.purchase_value || ""} onChange={e => setNum("purchase_value", e.target.value)} onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ""; }} />
            </div>
            <div className="space-y-1.5">
              <Label>Área útil (m²)</Label>
              <Input type="number" step="0.01" min="0" value={form.usable_area_m2 || ""} onChange={e => setNum("usable_area_m2", e.target.value)} onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ""; }} />
            </div>
            <div className="space-y-1.5">
              <Label>Área total (m²)</Label>
              <Input type="number" step="0.01" min="0" value={form.total_area_m2 || ""} onChange={e => setNum("total_area_m2", e.target.value)} onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ""; }} />
            </div>
            <div className="space-y-1.5">
              <Label>Área do terreno (m²)</Label>
              <Input type="number" step="0.01" min="0" value={form.land_area_m2 || ""} onChange={e => setNum("land_area_m2", e.target.value)} onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ""; }} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor do m² (R$)</Label>
              <Input type="number" step="0.01" min="0" value={form.purchase_price_per_m2 || ""} onChange={e => { setNum("purchase_price_per_m2", e.target.value); setForm(f => ({ ...f, price_per_m2_manual: true })); }} onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ""; }} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={form.price_per_m2_manual} onCheckedChange={v => setForm(f => ({ ...f, price_per_m2_manual: v }))} />
              <Label className="text-sm font-normal">Valor/m² manual</Label>
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
