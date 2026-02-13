import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MaskedNumberInput } from "@/components/ui/masked-number-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Plus, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import GlobalTopbar from "@/components/GlobalTopbar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { lookupCEP } from "@/lib/cepLookup";
import { formatCPFCNPJ, formatPhone } from "@/lib/cnpjLookup";
import { recomputeAndSave } from "@/lib/recomputeService";

interface Contract {
  id: string;
  service: string;
  amount: number;
  billing_model: string;
  start_date: string;
  end_date: string | null;
  status: string;
  details: string | null;
}

interface Payment {
  _key: string; // local key
  id?: string;
  payment_date: string;
  contract_id: string;
  amount: number;
  payment_method: string;
  status: string;
  _deleted?: boolean;
}

const emptyProvider = {
  full_name: "", person_type: "PF", cpf_cnpj: "", phone: "", email: "",
  cep: "", street: "", street_number: "", complement: "", neighborhood: "", city: "", state: "",
  additional_info: "",
  bank_name: "", bank_agency: "", bank_account: "", bank_account_type: "", bank_pix: "", bank_holder_name: "",
};

const emptyContract = {
  service: "", amount: 0, billing_model: "FIXED",
  start_date: "", end_date: "", status: "ACTIVE", details: "",
};

let _paymentKey = 0;
const nextKey = () => `pk_${++_paymentKey}`;

export default function ProviderFormPage() {
  const { id: studyId, providerId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isNew = !providerId || providerId === "new";
  const [savedProviderId, setSavedProviderId] = useState<string | null>(isNew ? null : providerId!);
  const [tab, setTab] = useState(searchParams.get("tab") || "personal");
  const [form, setForm] = useState({ ...emptyProvider });
  const [saving, setSaving] = useState(false);
  const [lookingUpCep, setLookingUpCep] = useState(false);

  // Contracts
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractForm, setContractForm] = useState({ ...emptyContract });
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [contractSaving, setContractSaving] = useState(false);
  const [deleteContractId, setDeleteContractId] = useState<string | null>(null);

  // Payments
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [deletePaymentKey, setDeletePaymentKey] = useState<string | null>(null);

  // Financial institutions for bank dropdown
  const [banks, setBanks] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (user && studyId) {
      loadBanks();
      if (!isNew) loadProvider();
    }
  }, [user, studyId, providerId]);

  const loadBanks = async () => {
    const { data } = await supabase.from("financial_institutions")
      .select("id, name").eq("user_id", user!.id).eq("is_active", true).order("name");
    setBanks(data || []);
  };

  const loadProvider = async () => {
    const { data } = await supabase.from("study_providers").select("*").eq("id", providerId).single();
    if (!data) return;
    setForm({
      full_name: data.full_name, person_type: data.person_type, cpf_cnpj: data.cpf_cnpj || "",
      phone: data.phone || "", email: data.email || "",
      cep: data.cep || "", street: data.street || "", street_number: data.street_number || "",
      complement: data.complement || "", neighborhood: data.neighborhood || "",
      city: data.city || "", state: data.state || "", additional_info: data.additional_info || "",
      bank_name: data.bank_name || "", bank_agency: data.bank_agency || "",
      bank_account: data.bank_account || "", bank_account_type: data.bank_account_type || "",
      bank_pix: data.bank_pix || "", bank_holder_name: data.bank_holder_name || "",
    });
    loadContracts();
    loadPayments();
  };

  const loadContracts = async () => {
    const { data } = await supabase.from("study_provider_contracts")
      .select("id, service, amount, billing_model, start_date, end_date, status, details")
      .eq("provider_id", providerId).eq("study_id", studyId).eq("is_deleted", false)
      .order("start_date", { ascending: false });
    setContracts((data || []).map(c => ({ ...c, amount: Number(c.amount), end_date: c.end_date || null, details: c.details || null })));
  };

  const loadPayments = async () => {
    const { data } = await supabase.from("study_provider_payments")
      .select("id, payment_date, contract_id, amount, payment_method, status")
      .eq("provider_id", providerId).eq("study_id", studyId).eq("is_deleted", false)
      .order("payment_date", { ascending: true });
    setPayments((data || []).map(p => ({
      _key: nextKey(), id: p.id, payment_date: p.payment_date,
      contract_id: p.contract_id || "", amount: Number(p.amount),
      payment_method: p.payment_method || "", status: p.status,
    })));
  };

  const setField = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  // === CEP ===
  const handleCepLookup = async () => {
    const clean = form.cep.replace(/\D/g, "");
    if (clean.length !== 8) { toast.error("CEP deve ter 8 dígitos."); return; }
    setLookingUpCep(true);
    const result = await lookupCEP(clean);
    setLookingUpCep(false);
    if (!result.ok || !result.data) { toast.error(result.error || "CEP não encontrado."); return; }
    const d = result.data;
    setForm(f => ({
      ...f,
      street: d.logradouro || f.street,
      neighborhood: d.bairro || f.neighborhood,
      city: d.localidade || f.city,
      state: d.uf || f.state,
    }));
    toast.success("Endereço preenchido!");
  };

  // === Save Personal ===
  const savePersonal = async () => {
    if (!form.full_name.trim()) { toast.error("Nome completo é obrigatório."); return; }
    if (!form.cpf_cnpj.trim()) { toast.error("CPF/CNPJ é obrigatório."); return; }
    if (!form.person_type) { toast.error("Tipo é obrigatório."); return; }
    setSaving(true);
    const payload = {
      full_name: form.full_name.trim(), person_type: form.person_type,
      cpf_cnpj: form.cpf_cnpj.trim(), phone: form.phone.trim(), email: form.email.trim(),
      cep: form.cep.trim(), street: form.street.trim(), street_number: form.street_number.trim(),
      complement: form.complement.trim(), neighborhood: form.neighborhood.trim(),
      city: form.city.trim(), state: form.state.trim().toUpperCase(),
      additional_info: form.additional_info.trim(),
      study_id: studyId!,
    };
    if (savedProviderId) {
      await supabase.from("study_providers").update(payload).eq("id", savedProviderId);
    } else {
      const { data } = await supabase.from("study_providers").insert(payload).select("id").single();
      if (data) {
        setSavedProviderId(data.id);
        navigate(`/studies/${studyId}/providers/${data.id}/edit`, { replace: true });
      }
    }
    setSaving(false);
    toast.success("Dados pessoais salvos!");
  };

  // === Contracts ===
  const openNewContract = () => { setEditingContractId(null); setContractForm({ ...emptyContract }); };
  const openEditContract = (c: Contract) => {
    setEditingContractId(c.id);
    setContractForm({
      service: c.service, amount: c.amount, billing_model: c.billing_model,
      start_date: c.start_date, end_date: c.end_date || "", status: c.status, details: c.details || "",
    });
  };

  const saveContract = async () => {
    if (!contractForm.service.trim()) { toast.error("Serviço é obrigatório."); return; }
    if (!contractForm.start_date) { toast.error("Data inicial é obrigatória."); return; }
    if (contractForm.amount <= 0) { toast.error("Valor deve ser maior que zero."); return; }
    if (contractForm.end_date && contractForm.end_date < contractForm.start_date) {
      toast.error("Data final não pode ser anterior à data inicial."); return;
    }
    setContractSaving(true);
    const payload = {
      provider_id: savedProviderId!, service: contractForm.service.trim(),
      amount: contractForm.amount, billing_model: contractForm.billing_model,
      start_date: contractForm.start_date, end_date: contractForm.end_date || null,
      status: contractForm.status, details: contractForm.details.trim() || null,
      study_id: studyId!,
    };
    if (editingContractId) {
      await supabase.from("study_provider_contracts").update(payload).eq("id", editingContractId);
    } else {
      await supabase.from("study_provider_contracts").insert(payload);
    }
    await recomputeAndSave(studyId!, user!.id);
    setContractSaving(false);
    toast.success(editingContractId ? "Contrato atualizado!" : "Contrato criado!");
    setEditingContractId(null);
    setContractForm({ ...emptyContract });
    loadContracts();
  };

  const deleteContract = async () => {
    if (!deleteContractId) return;
    await supabase.from("study_provider_contracts").update({ is_deleted: true }).eq("id", deleteContractId);
    await recomputeAndSave(studyId!, user!.id);
    setDeleteContractId(null);
    toast.success("Contrato excluído.");
    loadContracts();
  };

  // === Payments ===
  const addPaymentRow = () => {
    setPayments(prev => [...prev, {
      _key: nextKey(), payment_date: "", contract_id: "", amount: 0,
      payment_method: "", status: "PENDING",
    }]);
  };

  const updatePayment = (key: string, field: string, value: any) => {
    setPayments(prev => prev.map(p => p._key === key ? { ...p, [field]: value } : p));
  };

  const handleDeletePayment = () => {
    if (!deletePaymentKey) return;
    const target = payments.find(p => p._key === deletePaymentKey);
    if (target?.id) {
      // Mark for deletion
      setPayments(prev => prev.map(p => p._key === deletePaymentKey ? { ...p, _deleted: true } : p));
    } else {
      // Remove unsaved row
      setPayments(prev => prev.filter(p => p._key !== deletePaymentKey));
    }
    setDeletePaymentKey(null);
  };

  const savePayments = async () => {
    // Save bank data
    const bankPayload = {
      bank_name: form.bank_name, bank_agency: form.bank_agency,
      bank_account: form.bank_account, bank_account_type: form.bank_account_type,
      bank_pix: form.bank_pix, bank_holder_name: form.bank_holder_name,
    };
    await supabase.from("study_providers").update(bankPayload).eq("id", savedProviderId!);

    // Process payments
    setPaymentSaving(true);
    const toDelete = payments.filter(p => p._deleted && p.id);
    const toUpsert = payments.filter(p => !p._deleted);

    // Validate non-empty rows
    for (const p of toUpsert) {
      const isEmpty = !p.payment_date && !p.contract_id && p.amount === 0 && !p.payment_method;
      if (isEmpty) continue;
      if (!p.payment_date) { toast.error("Data é obrigatória em todas as linhas de pagamento."); setPaymentSaving(false); return; }
      if (!p.contract_id) { toast.error("Contrato é obrigatório em todas as linhas de pagamento."); setPaymentSaving(false); return; }
      if (p.amount <= 0) { toast.error("Valor deve ser maior que zero."); setPaymentSaving(false); return; }
      if (!p.payment_method) { toast.error("Forma de pagamento é obrigatória."); setPaymentSaving(false); return; }
    }

    // Delete
    for (const p of toDelete) {
      await supabase.from("study_provider_payments").update({ is_deleted: true }).eq("id", p.id!);
    }
    // Insert / update
    for (const p of toUpsert) {
      const isEmpty = !p.payment_date && !p.contract_id && p.amount === 0 && !p.payment_method;
      if (isEmpty) continue;
      const payload = {
        provider_id: savedProviderId!, study_id: studyId!,
        payment_date: p.payment_date, contract_id: p.contract_id || null,
        amount: p.amount, payment_method: p.payment_method, status: p.status,
      };
      if (p.id) {
        await supabase.from("study_provider_payments").update(payload).eq("id", p.id);
      } else {
        await supabase.from("study_provider_payments").insert(payload);
      }
    }
    setPaymentSaving(false);
    toast.success("Pagamentos salvos!");
    loadPayments();
  };

  const goBack = () => navigate(`/studies/${studyId}/providers`);
  const tabsDisabled = !savedProviderId;

  return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar />
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        <h1 className="text-xl font-bold">Cadastro de Prestador/Contratos</h1>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="personal">Dados Pessoais</TabsTrigger>
            <TabsTrigger value="contracts" disabled={tabsDisabled}>Contratos</TabsTrigger>
            <TabsTrigger value="payments" disabled={tabsDisabled}>Pagamentos</TabsTrigger>
          </TabsList>

          {/* ===== DADOS PESSOAIS ===== */}
          <TabsContent value="personal" className="space-y-6 mt-4">
            <fieldset className="border rounded-lg p-4 space-y-4">
              <legend className="font-bold text-sm px-2">DADOS PESSOAIS</legend>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-3 space-y-1.5">
                  <Label>Nome Completo *</Label>
                  <Input value={form.full_name} onChange={e => setField("full_name", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>CPF/CNPJ *</Label>
                  <Input value={form.cpf_cnpj}
                    onChange={e => setField("cpf_cnpj", formatCPFCNPJ(e.target.value, form.person_type))}
                    maxLength={form.person_type === "PJ" ? 18 : 14} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo *</Label>
                  <Select value={form.person_type} onValueChange={v => { setField("person_type", v); setField("cpf_cnpj", ""); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PF">Pessoa Física</SelectItem>
                      <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Telefone</Label>
                  <Input value={form.phone} onChange={e => setField("phone", formatPhone(e.target.value))} maxLength={14} />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail</Label>
                  <Input type="email" value={form.email} onChange={e => setField("email", e.target.value)} />
                </div>
              </div>
            </fieldset>

            <fieldset className="border rounded-lg p-4 space-y-4">
              <legend className="font-bold text-sm px-2">ENDEREÇO</legend>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>CEP</Label>
                  <div className="flex gap-2">
                    <Input value={form.cep} onChange={e => setField("cep", e.target.value)} maxLength={9} />
                    <Button size="sm" variant="outline" onClick={handleCepLookup} disabled={lookingUpCep}>
                      {lookingUpCep ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar CEP"}
                    </Button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-3 space-y-1.5">
                  <Label>Logradouro</Label>
                  <Input value={form.street} onChange={e => setField("street", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Número</Label>
                  <Input value={form.street_number} onChange={e => setField("street_number", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Complemento</Label>
                  <Input value={form.complement} onChange={e => setField("complement", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Bairro</Label>
                  <Input value={form.neighborhood} onChange={e => setField("neighborhood", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Cidade</Label>
                  <Input value={form.city} onChange={e => setField("city", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>UF</Label>
                  <Input value={form.state} onChange={e => setField("state", e.target.value)} maxLength={2} />
                </div>
              </div>
            </fieldset>

            <fieldset className="border rounded-lg p-4 space-y-4">
              <legend className="font-bold text-sm px-2">INFORMAÇÕES ADICIONAIS</legend>
              <Textarea value={form.additional_info} onChange={e => setField("additional_info", e.target.value)} rows={3} />
            </fieldset>

            <div className="flex gap-3">
              <Button onClick={savePersonal} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
              <Button variant="outline" onClick={goBack}>Voltar</Button>
            </div>
          </TabsContent>

          {/* ===== CONTRATOS ===== */}
          <TabsContent value="contracts" className="space-y-6 mt-4">
            <fieldset className="border rounded-lg p-4 space-y-4">
              <legend className="font-bold text-sm px-2">CONTRATO</legend>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Serviço *</Label>
                  <Input value={contractForm.service} onChange={e => setContractForm(f => ({ ...f, service: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Data Inicial *</Label>
                  <Input type="date" value={contractForm.start_date} onChange={e => setContractForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Data Final</Label>
                  <Input type="date" value={contractForm.end_date} onChange={e => setContractForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Modelo de Cobrança</Label>
                  <Select value={contractForm.billing_model} onValueChange={v => setContractForm(f => ({ ...f, billing_model: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FIXED">Valor Fixo</SelectItem>
                      <SelectItem value="HOURLY">Por Hora</SelectItem>
                      <SelectItem value="PERCENT">Percentual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Valor (R$) *</Label>
                  <MaskedNumberInput value={contractForm.amount} onValueChange={v => setContractForm(f => ({ ...f, amount: v }))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={contractForm.status} onValueChange={v => setContractForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Ativo</SelectItem>
                      <SelectItem value="CLOSED">Finalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-3 space-y-1.5">
                  <Label>Detalhes do Contrato</Label>
                  <Textarea value={contractForm.details} onChange={e => setContractForm(f => ({ ...f, details: e.target.value }))} rows={4} />
                </div>
              </div>
            </fieldset>

            <div className="flex gap-3">
              <Button onClick={saveContract} disabled={contractSaving}>{contractSaving ? "Salvando..." : "Salvar"}</Button>
              <Button variant="outline" onClick={goBack}>Voltar</Button>
            </div>

            {/* Existing contracts list */}
            {contracts.length > 0 && (
              <div className="space-y-3 pt-4 border-t">
                <p className="font-bold text-sm">Contratos cadastrados</p>
                {contracts.map((c, i) => (
                  <div key={c.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex justify-between items-start">
                      <p className="font-semibold text-sm">Contrato {i + 1} — {c.service}</p>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditContract(c)}>Editar</Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteContractId(c.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-muted-foreground">
                      <span>Início: {c.start_date}</span>
                      <span>Fim: {c.end_date || "—"}</span>
                      <span>Valor: {c.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                      <span>Status: {c.status === "ACTIVE" ? "Ativo" : "Finalizado"}</span>
                    </div>
                    {c.details && <p className="text-sm whitespace-pre-line">{c.details}</p>}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ===== PAGAMENTOS ===== */}
          <TabsContent value="payments" className="space-y-6 mt-4">
            <fieldset className="border rounded-lg p-4 space-y-4">
              <legend className="font-bold text-sm px-2">DADOS BANCÁRIOS</legend>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Banco</Label>
                  <Select value={form.bank_name} onValueChange={v => setField("bank_name", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {banks.map(b => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                      {banks.length === 0 && <SelectItem value="__none" disabled>Nenhuma instituição cadastrada</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Agência</Label>
                  <Input value={form.bank_agency} onChange={e => setField("bank_agency", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Conta</Label>
                  <Input value={form.bank_account} onChange={e => setField("bank_account", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo Conta</Label>
                  <Select value={form.bank_account_type} onValueChange={v => setField("bank_account_type", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Corrente">Corrente</SelectItem>
                      <SelectItem value="Poupança">Poupança</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>PIX</Label>
                  <Input value={form.bank_pix} onChange={e => setField("bank_pix", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Nome Titular</Label>
                  <Input value={form.bank_holder_name} onChange={e => setField("bank_holder_name", e.target.value)} />
                </div>
              </div>
            </fieldset>

            <fieldset className="border rounded-lg p-4 space-y-4">
              <legend className="font-bold text-sm px-2">HISTÓRICO DE PAGAMENTOS</legend>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-semibold">Data</th>
                      <th className="text-left p-2 font-semibold">Contrato</th>
                      <th className="text-left p-2 font-semibold">Valor (R$)</th>
                      <th className="text-left p-2 font-semibold">Forma</th>
                      <th className="text-left p-2 font-semibold">Status</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.filter(p => !p._deleted).map(p => (
                      <tr key={p._key} className="border-b">
                        <td className="p-2">
                          <Input type="date" value={p.payment_date} className="h-8 text-sm"
                            onChange={e => updatePayment(p._key, "payment_date", e.target.value)} />
                        </td>
                        <td className="p-2">
                          <Select value={p.contract_id} onValueChange={v => updatePayment(p._key, "contract_id", v)}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              {contracts.filter(c => c.status === "ACTIVE").map((c, i) => (
                                <SelectItem key={c.id} value={c.id}>Contrato {i + 1}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2">
                          <MaskedNumberInput value={p.amount} onValueChange={v => updatePayment(p._key, "amount", v)} className="h-8 text-sm" />
                        </td>
                        <td className="p-2">
                          <Select value={p.payment_method} onValueChange={v => updatePayment(p._key, "payment_method", v)}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Pix">Pix</SelectItem>
                              <SelectItem value="Transferência">Transferência</SelectItem>
                              <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                              <SelectItem value="Cheque">Cheque</SelectItem>
                              <SelectItem value="Boleto">Boleto</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2">
                          <Select value={p.status} onValueChange={v => updatePayment(p._key, "status", v)}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="PAID">Pago</SelectItem>
                              <SelectItem value="PENDING">Pendente</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-2">
                          <Button variant="ghost" size="sm" onClick={() => setDeletePaymentKey(p._key)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button variant="outline" size="sm" onClick={addPaymentRow}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar Pagamento
              </Button>
            </fieldset>

            <div className="flex gap-3">
              <Button onClick={savePayments} disabled={paymentSaving}>{paymentSaving ? "Salvando..." : "Salvar"}</Button>
              <Button variant="outline" onClick={goBack}>Voltar</Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete contract dialog */}
      <AlertDialog open={!!deleteContractId} onOpenChange={() => setDeleteContractId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Excluir contrato?</AlertDialogTitle>
            <AlertDialogDescription>O contrato será movido para a lixeira.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteContract} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete payment dialog */}
      <AlertDialog open={!!deletePaymentKey} onOpenChange={() => setDeletePaymentKey(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Excluir pagamento?</AlertDialogTitle>
            <AlertDialogDescription>Este pagamento será removido.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePayment} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
