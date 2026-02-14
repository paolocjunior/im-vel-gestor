import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2 } from "lucide-react";
import GlobalTopbar from "@/components/GlobalTopbar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { lookupCEP } from "@/lib/cepLookup";
import { recomputeAndSave } from "@/lib/recomputeService";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import UnsavedChangesDialog from "@/components/UnsavedChangesDialog";

export default function EditStudyPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: "", cep: "", street: "", street_number: "", complement: "",
    neighborhood: "", city: "", state: "", notes: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  const [initialForm, setInitialForm] = useState<typeof form | null>(null);

  useEffect(() => {
    if (user && id) loadStudy();
  }, [user, id]);

  const loadStudy = async () => {
    const { data } = await supabase.from("studies").select("*").eq("id", id).single();
    if (!data) { navigate("/hub"); return; }
    const loaded = {
      name: data.name || "", cep: data.cep || "", street: data.street || "",
      street_number: data.street_number || "", complement: data.complement || "",
      neighborhood: data.neighborhood || "", city: data.city || "",
      state: data.state || "", notes: data.notes || "",
    };
    setForm(loaded);
    setInitialForm(loaded);
    setLoading(false);
  };

  const { isDirty, blocker, markSaved } = useUnsavedChanges(initialForm, form);

  const handleCEP = async () => {
    setCepLoading(true);
    const result = await lookupCEP(form.cep);
    setCepLoading(false);
    if (result.ok && result.data) {
      setForm(f => ({ ...f, street: result.data!.logradouro, neighborhood: result.data!.bairro, city: result.data!.localidade, state: result.data!.uf }));
      setTimeout(() => document.getElementById("street_number")?.focus(), 100);
    } else {
      toast.error(result.error || "CEP não encontrado.");
    }
  };

  const save = async (goBack: boolean) => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório."); return; }
    setSaving(true);
    const { error } = await supabase.from("studies").update({
      name: form.name.trim(), cep: form.cep, street: form.street, street_number: form.street_number,
      complement: form.complement, neighborhood: form.neighborhood, city: form.city, state: form.state, notes: form.notes,
    }).eq("id", id);
    if (error) { toast.error("Erro ao salvar."); setSaving(false); return; }
    await recomputeAndSave(id!, user!.id);
    setSaving(false);
    markSaved();
    toast.success("Projeto atualizado!");
    if (goBack) navigate(`/studies/${id}/dashboard`);
  };

  const setField = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar />
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-6">
        <div className="card-dashboard space-y-5">
          <h2 className="font-bold text-lg">Editar Dados do Projeto</h2>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nome *</Label><Input value={form.name} onChange={e => setField("name", e.target.value)} /></div>
            <div className="flex gap-2">
              <div className="space-y-1.5 flex-1"><Label>CEP</Label><Input value={form.cep} onChange={e => setField("cep", e.target.value)} /></div>
              <div className="flex items-end"><Button variant="outline" size="sm" onClick={handleCEP} disabled={cepLoading}>{cepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}</Button></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2"><Label>Logradouro</Label><Input value={form.street} onChange={e => setField("street", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Número</Label><Input id="street_number" value={form.street_number} onChange={e => setField("street_number", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Complemento</Label><Input value={form.complement} onChange={e => setField("complement", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Bairro</Label><Input value={form.neighborhood} onChange={e => setField("neighborhood", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Cidade</Label><Input value={form.city} onChange={e => setField("city", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>UF</Label><Input value={form.state} onChange={e => setField("state", e.target.value)} maxLength={2} /></div>
            </div>
            <div className="space-y-1.5"><Label>Observações</Label><Textarea value={form.notes} onChange={e => setField("notes", e.target.value)} rows={3} /></div>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => save(true)} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            <Button variant="outline" onClick={() => navigate(`/studies/${id}/dashboard`)}>Voltar</Button>
          </div>
        </div>
      </div>
      <UnsavedChangesDialog blocker={blocker} />
    </div>
  );
}
