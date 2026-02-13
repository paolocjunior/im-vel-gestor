import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, ArrowLeft, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import GlobalTopbar from "@/components/GlobalTopbar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { lookupCEP } from "@/lib/cepLookup";

interface Vendor {
  id: string;
  cnpj: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  category: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
}

const emptyForm = {
  cnpj: "", razao_social: "", nome_fantasia: "", category: "",
  email: "", phone: "", street: "", street_number: "", complement: "",
  neighborhood: "", city: "", state: "", notes: "",
};

export default function VendorsPage() {
  const { id: studyId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (user && studyId) loadVendors(); }, [user, studyId]);

  const loadVendors = async () => {
    const { data } = await supabase.from("study_vendors")
      .select("id, cnpj, razao_social, nome_fantasia, category, email, phone, city, state")
      .eq("study_id", studyId).eq("is_deleted", false)
      .order("created_at", { ascending: false });
    setVendors(data || []);
    setLoading(false);
  };

  const openNew = () => { setEditId(null); setForm({ ...emptyForm }); setDialogOpen(true); };

  const openEdit = async (vendorId: string) => {
    const { data } = await supabase.from("study_vendors").select("*").eq("id", vendorId).single();
    if (!data) return;
    setEditId(vendorId);
    setForm({
      cnpj: data.cnpj || "", razao_social: data.razao_social || "", nome_fantasia: data.nome_fantasia || "",
      category: data.category || "", email: data.email || "", phone: data.phone || "",
      street: data.street || "", street_number: data.street_number || "", complement: data.complement || "",
      neighborhood: data.neighborhood || "", city: data.city || "", state: data.state || "", notes: data.notes || "",
    });
    setDialogOpen(true);
  };

  const saveVendor = async () => {
    if (!form.razao_social.trim() && !form.nome_fantasia.trim()) {
      toast.error("Informe a razão social ou nome fantasia."); return;
    }
    setSaving(true);
    const payload = { ...form, study_id: studyId! };
    if (editId) {
      await supabase.from("study_vendors").update(payload).eq("id", editId);
    } else {
      await supabase.from("study_vendors").insert(payload);
    }
    setSaving(false);
    setDialogOpen(false);
    toast.success(editId ? "Fornecedor atualizado!" : "Fornecedor criado!");
    loadVendors();
  };

  const deleteVendor = async () => {
    if (!deleteId) return;
    await supabase.from("study_vendors").update({ is_deleted: true }).eq("id", deleteId);
    setDeleteId(null);
    toast.success("Fornecedor excluído.");
    loadVendors();
  };

  const setField = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar />
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/studies/${studyId}/dashboard`)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
            </Button>
            <h1 className="text-xl font-bold">Fornecedores</h1>
          </div>
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo</Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>
        ) : vendors.length === 0 ? (
          <div className="card-dashboard text-center py-12">
            <p className="text-muted-foreground">Nenhum fornecedor cadastrado.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {vendors.map(v => (
              <div key={v.id} className="card-dashboard flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">{v.nome_fantasia || v.razao_social}</p>
                  <p className="text-xs text-muted-foreground">
                    {[v.cnpj, v.category, v.city && v.state ? `${v.city}/${v.state}` : null].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(v.id)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteId(v.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editId ? "Editar Fornecedor" : "Novo Fornecedor"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2"><Label>CNPJ</Label><Input value={form.cnpj} onChange={e => setField("cnpj", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Razão Social</Label><Input value={form.razao_social} onChange={e => setField("razao_social", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Nome Fantasia</Label><Input value={form.nome_fantasia} onChange={e => setField("nome_fantasia", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Categoria</Label><Input value={form.category} onChange={e => setField("category", e.target.value)} placeholder="Ex: Material, Mão de obra" /></div>
            <div className="space-y-1.5"><Label>Telefone</Label><Input value={form.phone} onChange={e => setField("phone", e.target.value)} /></div>
            <div className="space-y-1.5 col-span-2"><Label>E-mail</Label><Input type="email" value={form.email} onChange={e => setField("email", e.target.value)} /></div>
            <div className="space-y-1.5 col-span-2"><Label>Logradouro</Label><Input value={form.street} onChange={e => setField("street", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Número</Label><Input value={form.street_number} onChange={e => setField("street_number", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Complemento</Label><Input value={form.complement} onChange={e => setField("complement", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Bairro</Label><Input value={form.neighborhood} onChange={e => setField("neighborhood", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Cidade</Label><Input value={form.city} onChange={e => setField("city", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>UF</Label><Input value={form.state} onChange={e => setField("state", e.target.value)} maxLength={2} /></div>
            <div className="space-y-1.5 col-span-2"><Label>Observações</Label><Textarea value={form.notes} onChange={e => setField("notes", e.target.value)} rows={2} /></div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={saveVendor} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fornecedor?</AlertDialogTitle>
            <AlertDialogDescription>O fornecedor será movido para a lixeira.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteVendor} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
