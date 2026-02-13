import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, ArrowLeft, FileText } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GlobalTopbar from "@/components/GlobalTopbar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { recomputeAndSave } from "@/lib/recomputeService";
import { formatBRL } from "@/lib/recompute";
import { lookupCEP } from "@/lib/cepLookup";

interface Provider {
  id: string;
  full_name: string;
  person_type: string;
  cpf_cnpj: string | null;
  phone: string | null;
  email: string | null;
}

interface Contract {
  id: string;
  service: string;
  amount: number;
  status: string;
  billing_model: string;
  start_date: string;
  provider_id: string;
}

const emptyProvider = {
  full_name: "", person_type: "PF", cpf_cnpj: "", phone: "", email: "",
  street: "", street_number: "", complement: "", neighborhood: "", city: "", state: "", cep: "",
  additional_info: "",
  bank_name: "", bank_agency: "", bank_account: "", bank_account_type: "", bank_pix: "", bank_holder_name: "",
};

const emptyContract = {
  provider_id: "", service: "", amount: 0, billing_model: "FIXED",
  start_date: "", end_date: "", status: "ACTIVE", details: "",
};

export default function ProvidersPage() {
  const { id: studyId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("providers");

  // Provider dialog
  const [pDialogOpen, setPDialogOpen] = useState(false);
  const [pEditId, setPEditId] = useState<string | null>(null);
  const [pForm, setPForm] = useState({ ...emptyProvider });
  const [pSaving, setPSaving] = useState(false);
  const [pDeleteId, setPDeleteId] = useState<string | null>(null);

  // Contract dialog
  const [cDialogOpen, setCDialogOpen] = useState(false);
  const [cEditId, setCEditId] = useState<string | null>(null);
  const [cForm, setCForm] = useState({ ...emptyContract });
  const [cSaving, setCSaving] = useState(false);
  const [cDeleteId, setCDeleteId] = useState<string | null>(null);

  useEffect(() => { if (user && studyId) loadAll(); }, [user, studyId]);

  const loadAll = async () => {
    const [pRes, cRes] = await Promise.all([
      supabase.from("study_providers").select("id, full_name, person_type, cpf_cnpj, phone, email")
        .eq("study_id", studyId).eq("is_deleted", false).order("created_at", { ascending: false }),
      supabase.from("study_provider_contracts").select("id, service, amount, status, billing_model, start_date, provider_id")
        .eq("study_id", studyId).eq("is_deleted", false).order("created_at", { ascending: false }),
    ]);
    setProviders(pRes.data || []);
    setContracts(cRes.data || []);
    setLoading(false);
  };

  // --- Provider CRUD ---
  const openNewProvider = () => { setPEditId(null); setPForm({ ...emptyProvider }); setPDialogOpen(true); };
  const openEditProvider = async (pid: string) => {
    const { data } = await supabase.from("study_providers").select("*").eq("id", pid).single();
    if (!data) return;
    setPEditId(pid);
    setPForm({
      full_name: data.full_name, person_type: data.person_type, cpf_cnpj: data.cpf_cnpj || "",
      phone: data.phone || "", email: data.email || "",
      street: data.street || "", street_number: data.street_number || "", complement: data.complement || "",
      neighborhood: data.neighborhood || "", city: data.city || "", state: data.state || "", cep: data.cep || "",
      additional_info: data.additional_info || "",
      bank_name: data.bank_name || "", bank_agency: data.bank_agency || "", bank_account: data.bank_account || "",
      bank_account_type: data.bank_account_type || "", bank_pix: data.bank_pix || "", bank_holder_name: data.bank_holder_name || "",
    });
    setPDialogOpen(true);
  };
  const saveProvider = async () => {
    if (!pForm.full_name.trim()) { toast.error("Nome é obrigatório."); return; }
    setPSaving(true);
    const payload = { ...pForm, study_id: studyId! };
    if (pEditId) {
      await supabase.from("study_providers").update(payload).eq("id", pEditId);
    } else {
      await supabase.from("study_providers").insert(payload);
    }
    setPSaving(false); setPDialogOpen(false);
    toast.success(pEditId ? "Prestador atualizado!" : "Prestador criado!");
    loadAll();
  };
  const deleteProvider = async () => {
    if (!pDeleteId) return;
    await supabase.from("study_providers").update({ is_deleted: true }).eq("id", pDeleteId);
    setPDeleteId(null); toast.success("Prestador excluído."); loadAll();
  };

  // --- Contract CRUD ---
  const openNewContract = () => {
    setCEditId(null);
    setCForm({ ...emptyContract, provider_id: providers[0]?.id || "" });
    setCDialogOpen(true);
  };
  const openEditContract = async (cid: string) => {
    const { data } = await supabase.from("study_provider_contracts").select("*").eq("id", cid).single();
    if (!data) return;
    setCEditId(cid);
    setCForm({
      provider_id: data.provider_id, service: data.service, amount: Number(data.amount),
      billing_model: data.billing_model, start_date: data.start_date, end_date: data.end_date || "",
      status: data.status, details: data.details || "",
    });
    setCDialogOpen(true);
  };
  const saveContract = async () => {
    if (!cForm.service.trim()) { toast.error("Serviço é obrigatório."); return; }
    if (!cForm.provider_id) { toast.error("Selecione o prestador."); return; }
    if (!cForm.start_date) { toast.error("Data de início é obrigatória."); return; }
    setCSaving(true);
    const payload = {
      provider_id: cForm.provider_id, service: cForm.service, amount: cForm.amount,
      billing_model: cForm.billing_model, start_date: cForm.start_date,
      end_date: cForm.end_date || null, status: cForm.status, details: cForm.details || null,
      study_id: studyId!,
    };
    if (cEditId) {
      await supabase.from("study_provider_contracts").update(payload).eq("id", cEditId);
    } else {
      await supabase.from("study_provider_contracts").insert(payload);
    }
    await recomputeAndSave(studyId!, user!.id);
    setCSaving(false); setCDialogOpen(false);
    toast.success(cEditId ? "Contrato atualizado!" : "Contrato criado!");
    loadAll();
  };
  const deleteContract = async () => {
    if (!cDeleteId) return;
    await supabase.from("study_provider_contracts").update({ is_deleted: true }).eq("id", cDeleteId);
    await recomputeAndSave(studyId!, user!.id);
    setCDeleteId(null); toast.success("Contrato excluído."); loadAll();
  };

  const setPField = (k: string, v: string) => setPForm(f => ({ ...f, [k]: v }));
  const setCField = (k: string, v: any) => setCForm(f => ({ ...f, [k]: v }));
  const providerName = (pid: string) => providers.find(p => p.id === pid)?.full_name || "—";

  return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar />
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/studies/${studyId}/dashboard`)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
          </Button>
          <h1 className="text-xl font-bold">Prestadores e Contratos</h1>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="providers">Prestadores ({providers.length})</TabsTrigger>
            <TabsTrigger value="contracts">Contratos ({contracts.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="providers" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={openNewProvider}><Plus className="h-4 w-4 mr-1" /> Novo Prestador</Button>
            </div>
            {loading ? (
              <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>
            ) : providers.length === 0 ? (
              <div className="card-dashboard text-center py-12"><p className="text-muted-foreground">Nenhum prestador cadastrado.</p></div>
            ) : (
              <div className="space-y-2">
                {providers.map(p => (
                  <div key={p.id} className="card-dashboard flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{p.full_name}</p>
                      <p className="text-xs text-muted-foreground">{p.person_type} · {p.cpf_cnpj || "Sem doc"} · {p.phone || "—"}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditProvider(p.id)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => setPDeleteId(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="contracts" className="space-y-4 mt-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={openNewContract} disabled={providers.length === 0}>
                <Plus className="h-4 w-4 mr-1" /> Novo Contrato
              </Button>
            </div>
            {providers.length === 0 && (
              <p className="text-sm text-muted-foreground">Cadastre um prestador antes de criar contratos.</p>
            )}
            {contracts.length === 0 && providers.length > 0 ? (
              <div className="card-dashboard text-center py-12"><p className="text-muted-foreground">Nenhum contrato cadastrado.</p></div>
            ) : (
              <div className="space-y-2">
                {contracts.map(c => (
                  <div key={c.id} className="card-dashboard flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{c.service}</p>
                      <p className="text-xs text-muted-foreground">
                        {providerName(c.provider_id)} · {formatBRL(Number(c.amount))} · {c.status === "ACTIVE" ? "Ativo" : "Encerrado"}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEditContract(c.id)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => setCDeleteId(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Provider Dialog */}
      <Dialog open={pDialogOpen} onOpenChange={setPDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{pEditId ? "Editar Prestador" : "Novo Prestador"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2"><Label>Nome completo *</Label><Input value={pForm.full_name} onChange={e => setPField("full_name", e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={pForm.person_type} onValueChange={v => setPField("person_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PF">Pessoa Física</SelectItem>
                  <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>CPF/CNPJ</Label><Input value={pForm.cpf_cnpj} onChange={e => setPField("cpf_cnpj", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Telefone</Label><Input value={pForm.phone} onChange={e => setPField("phone", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>E-mail</Label><Input value={pForm.email} onChange={e => setPField("email", e.target.value)} /></div>
            <div className="space-y-1.5 col-span-2"><Label>Endereço</Label><Input placeholder="Rua" value={pForm.street} onChange={e => setPField("street", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Nº</Label><Input value={pForm.street_number} onChange={e => setPField("street_number", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Cidade</Label><Input value={pForm.city} onChange={e => setPField("city", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>UF</Label><Input value={pForm.state} onChange={e => setPField("state", e.target.value)} maxLength={2} /></div>
            <div className="col-span-2 border-t pt-3 mt-1"><p className="font-semibold text-sm mb-2">Dados Bancários</p></div>
            <div className="space-y-1.5"><Label>Banco</Label><Input value={pForm.bank_name} onChange={e => setPField("bank_name", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Agência</Label><Input value={pForm.bank_agency} onChange={e => setPField("bank_agency", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Conta</Label><Input value={pForm.bank_account} onChange={e => setPField("bank_account", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>PIX</Label><Input value={pForm.bank_pix} onChange={e => setPField("bank_pix", e.target.value)} /></div>
            <div className="space-y-1.5 col-span-2"><Label>Informações adicionais</Label><Textarea value={pForm.additional_info} onChange={e => setPField("additional_info", e.target.value)} rows={2} /></div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={saveProvider} disabled={pSaving}>{pSaving ? "Salvando..." : "Salvar"}</Button>
            <Button variant="ghost" onClick={() => setPDialogOpen(false)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Contract Dialog */}
      <Dialog open={cDialogOpen} onOpenChange={setCDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{cEditId ? "Editar Contrato" : "Novo Contrato"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Prestador *</Label>
              <Select value={cForm.provider_id} onValueChange={v => setCField("provider_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {providers.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2"><Label>Serviço *</Label><Input value={cForm.service} onChange={e => setCField("service", e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" min="0" value={cForm.amount || ""} onChange={e => setCField("amount", Number(e.target.value) || 0)} onFocus={e => { if (Number(e.target.value) === 0) e.target.value = ""; }} />
            </div>
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Select value={cForm.billing_model} onValueChange={v => setCField("billing_model", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED">Fixo</SelectItem>
                  <SelectItem value="HOURLY">Por hora</SelectItem>
                  <SelectItem value="PERCENT">Percentual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Início *</Label><Input type="date" value={cForm.start_date} onChange={e => setCField("start_date", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Fim</Label><Input type="date" value={cForm.end_date} onChange={e => setCField("end_date", e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={cForm.status} onValueChange={v => setCField("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Ativo</SelectItem>
                  <SelectItem value="CLOSED">Encerrado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2"><Label>Detalhes</Label><Textarea value={cForm.details} onChange={e => setCField("details", e.target.value)} rows={2} /></div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button onClick={saveContract} disabled={cSaving}>{cSaving ? "Salvando..." : "Salvar"}</Button>
            <Button variant="ghost" onClick={() => setCDialogOpen(false)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialogs */}
      <AlertDialog open={!!pDeleteId} onOpenChange={() => setPDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Excluir prestador?</AlertDialogTitle><AlertDialogDescription>O prestador será movido para a lixeira.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteProvider} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!cDeleteId} onOpenChange={() => setCDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Excluir contrato?</AlertDialogTitle><AlertDialogDescription>O contrato será movido para a lixeira.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteContract} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
