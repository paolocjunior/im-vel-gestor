import { useState, useEffect } from "react";
import {
  Plus,
  Search,
  FolderOpen,
  TrendingUp,
  Calendar,
  Copy,
  Trash2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";
import GlobalTopbar from "@/components/GlobalTopbar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { lookupCEP } from "@/lib/cepLookup";

interface Study {
  id: string;
  name: string;
  status: string;
  city: string | null;
  state: string | null;
  updated_at: string;
}

const statusMap: Record<string, { label: string; variant: "secondary" | "default" }> = {
  DRAFT: { label: "Rascunho", variant: "secondary" },
  COMPLETE: { label: "Completo", variant: "default" },
};

const emptyForm = {
  name: "", cep: "", street: "", street_number: "", complement: "",
  neighborhood: "", city: "", state: "", notes: "",
};

const HubPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ ...emptyForm });
  const [creating, setCreating] = useState(false);
  const [cepStatus, setCepStatus] = useState<"idle" | "loading" | "found" | "error">("idle");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => { if (user) loadStudies(); }, [user]);

  const loadStudies = async () => {
    const { data } = await supabase
      .from("studies").select("id, name, status, city, state, updated_at")
      .eq("user_id", user!.id).eq("is_deleted", false)
      .order("updated_at", { ascending: false });
    setStudies(data || []);
    setLoading(false);
  };

  const handleCEP = async () => {
    setCepStatus("loading");
    const result = await lookupCEP(form.cep);
    if (result.ok && result.data) {
      setForm(f => ({
        ...f,
        street: result.data!.logradouro,
        neighborhood: result.data!.bairro,
        city: result.data!.localidade,
        state: result.data!.uf,
      }));
      setCepStatus("found");
      // Focus number field
      setTimeout(() => document.getElementById("street_number")?.focus(), 100);
    } else {
      setCepStatus("error");
      toast.error(result.error || "CEP não encontrado.");
    }
  };

  const createStudy = async () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório."); return; }
    setCreating(true);
    const { data, error } = await supabase
      .from("studies").insert({
        user_id: user!.id, name: form.name.trim(), cep: form.cep, street: form.street,
        street_number: form.street_number, complement: form.complement,
        neighborhood: form.neighborhood, city: form.city, state: form.state, notes: form.notes,
      }).select("id").single();
    if (error || !data) { toast.error("Erro ao criar projeto."); setCreating(false); return; }
    await Promise.all([
      supabase.from("study_inputs").insert({ study_id: data.id }),
      supabase.from("study_computed").insert({ study_id: data.id }),
    ]);
    setCreating(false);
    navigate(`/studies/${data.id}/dashboard`);
  };

  const duplicateStudy = async (studyId: string) => {
    const [studyRes, inputsRes, lineItemsRes] = await Promise.all([
      supabase.from("studies").select("*").eq("id", studyId).single(),
      supabase.from("study_inputs").select("*").eq("study_id", studyId).single(),
      supabase.from("study_line_items").select("*").eq("study_id", studyId).eq("is_deleted", false),
    ]);
    if (!studyRes.data) { toast.error("Projeto não encontrado."); return; }
    const s = studyRes.data;
    const { data: newStudy } = await supabase.from("studies").insert({
      user_id: user!.id, name: `${s.name} (cópia)`, notes: s.notes, cep: s.cep,
      street: s.street, street_number: s.street_number, complement: s.complement,
      neighborhood: s.neighborhood, city: s.city, state: s.state, status: "DRAFT",
    }).select("id").single();
    if (!newStudy) { toast.error("Erro ao duplicar."); return; }
    // Clone inputs
    if (inputsRes.data) {
      const { id, study_id, created_at, updated_at, ...rest } = inputsRes.data as any;
      await supabase.from("study_inputs").insert({ ...rest, study_id: newStudy.id });
    }
    await supabase.from("study_computed").insert({ study_id: newStudy.id });
    // Clone line items
    if (lineItemsRes.data) {
      for (const li of lineItemsRes.data) {
        const { id, study_id, created_at, updated_at, ...rest } = li as any;
        await supabase.from("study_line_items").insert({ ...rest, study_id: newStudy.id });
      }
    }
    toast.success("Projeto duplicado!");
    loadStudies();
  };

  const deleteStudy = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("studies").update({ is_deleted: true }).eq("id", deleteId);
    setDeleteId(null);
    if (error) {
      toast.error("Erro ao excluir projeto.");
      return;
    }
    toast.success("Projeto excluído.");
    loadStudies();
  };

  const filtered = studies.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  const setField = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar />

      <main className="max-w-[1440px] mx-auto px-6 py-8 space-y-8">
        <h1 className="text-3xl font-bold">Meus Projetos</h1>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card><CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-primary/10 p-3"><FolderOpen className="h-5 w-5 text-primary" /></div>
            <div><p className="text-sm text-muted-foreground">Total</p><p className="kpi-value">{studies.length}</p></div>
          </CardContent></Card>
          <Card><CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-info/10 p-3"><TrendingUp className="h-5 w-5 text-info" /></div>
            <div><p className="text-sm text-muted-foreground">Em Estudo</p><p className="kpi-value">{studies.filter(s => s.status === "DRAFT").length}</p></div>
          </CardContent></Card>
          <Card><CardContent className="flex items-center gap-4 p-5">
            <div className="rounded-lg bg-success/10 p-3"><Calendar className="h-5 w-5 text-success" /></div>
            <div><p className="text-sm text-muted-foreground">Completos</p><p className="kpi-value">{studies.filter(s => s.status === "COMPLETE").length}</p></div>
          </CardContent></Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Novo Projeto */}
          <div className="card-dashboard space-y-4">
            <h2 className="font-bold text-base">Novo Projeto</h2>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={e => setField("name", e.target.value)} placeholder="Ex: Residencial Aurora" />
              </div>
              <div className="flex gap-2">
                <div className="space-y-1.5 flex-1">
                  <Label>CEP</Label>
                  <Input value={form.cep} onChange={e => setField("cep", e.target.value)} placeholder="00000-000" />
                </div>
                <div className="flex items-end">
                  <Button variant="outline" size="sm" onClick={handleCEP} disabled={cepStatus === "loading"}>
                    {cepStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar CEP"}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2"><Label>Logradouro</Label><Input value={form.street} onChange={e => setField("street", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Número</Label><Input id="street_number" value={form.street_number} onChange={e => setField("street_number", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Complemento</Label><Input value={form.complement} onChange={e => setField("complement", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Bairro</Label><Input value={form.neighborhood} onChange={e => setField("neighborhood", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Cidade</Label><Input value={form.city} onChange={e => setField("city", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>UF</Label><Input value={form.state} onChange={e => setField("state", e.target.value)} maxLength={2} /></div>
              </div>
              <div className="space-y-1.5"><Label>Observações</Label><Textarea value={form.notes} onChange={e => setField("notes", e.target.value)} rows={2} /></div>
              <Button onClick={createStudy} disabled={creating} className="w-full">
                {creating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Criando...</> : <><Plus className="h-4 w-4 mr-2" />Criar projeto</>}
              </Button>
            </div>
          </div>

          {/* Gerenciar */}
          <div className="card-dashboard space-y-4">
            <h2 className="font-bold text-base">Gerenciar Projetos</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nome..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <div className="max-h-[500px] overflow-y-auto space-y-2">
              {loading ? (
                <div className="flex justify-center py-8"><div className="animate-spin h-6 w-6 border-4 border-primary border-t-transparent rounded-full" /></div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">{studies.length === 0 ? "Nenhum projeto criado." : "Nenhum resultado."}</p>
              ) : filtered.map(study => {
                const sm = statusMap[study.status] || statusMap.DRAFT;
                return (
                  <div key={study.id} className="flex items-center justify-between p-3 rounded-lg border hover:border-primary/30 transition-colors">
                    <div className="cursor-pointer flex-1" onClick={() => navigate(`/studies/${study.id}/dashboard`)}>
                      <p className="font-semibold text-sm">{study.name}</p>
                      <p className="text-xs text-muted-foreground">{[study.city, study.state].filter(Boolean).join("/") || "Sem local"} · {new Date(study.updated_at).toLocaleDateString("pt-BR")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={sm.variant} className="text-xs">{sm.label}</Badge>
                      <Button variant="ghost" size="sm" onClick={() => duplicateStudy(study.id)} title="Duplicar"><Copy className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleteId(study.id)} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir projeto?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação moverá o projeto para a lixeira. Os dados não serão apagados permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteStudy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default HubPage;
