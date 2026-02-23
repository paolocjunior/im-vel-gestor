import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import GlobalTopbar from "@/components/GlobalTopbar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { lookupCEP } from "@/lib/cepLookup";
import { formatCPFCNPJ, formatPhone } from "@/lib/cnpjLookup";

const emptyForm = {
  full_name: "", person_type: "PF", cpf_cnpj: "", phone: "", email: "",
  cep: "", street: "", street_number: "", complement: "", neighborhood: "", city: "", state: "",
  additional_info: "",
  bank_name: "", bank_agency: "", bank_account: "", bank_account_type: "", bank_pix: "", bank_holder_name: "",
};

export default function ProfileCompletionPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [lookingUpCep, setLookingUpCep] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();
      if (data) {
        setForm({
          full_name: data.full_name || "",
          person_type: (data as any).person_type || "PF",
          cpf_cnpj: (data as any).cpf_cnpj || "",
          phone: (data as any).phone || "",
          email: (data as any).email || user.email || "",
          cep: (data as any).cep || "",
          street: (data as any).street || "",
          street_number: (data as any).street_number || "",
          complement: (data as any).complement || "",
          neighborhood: (data as any).neighborhood || "",
          city: (data as any).city || "",
          state: (data as any).state || "",
          additional_info: (data as any).additional_info || "",
          bank_name: (data as any).bank_name || "",
          bank_agency: (data as any).bank_agency || "",
          bank_account: (data as any).bank_account || "",
          bank_account_type: (data as any).bank_account_type || "",
          bank_pix: (data as any).bank_pix || "",
          bank_holder_name: (data as any).bank_holder_name || "",
        });
      } else {
        setForm(f => ({ ...f, email: user.email || "" }));
      }
      setLoaded(true);
    })();
  }, [user]);

  const setField = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

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

  const handleSave = async () => {
    if (!form.full_name.trim()) { toast.error("Nome completo é obrigatório."); return; }
    if (!form.cpf_cnpj.trim()) { toast.error("CPF/CNPJ é obrigatório."); return; }
    if (!form.person_type) { toast.error("Tipo é obrigatório."); return; }

    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name.trim(),
        person_type: form.person_type,
        cpf_cnpj: form.cpf_cnpj.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        cep: form.cep.trim(),
        street: form.street.trim(),
        street_number: form.street_number.trim(),
        complement: form.complement.trim(),
        neighborhood: form.neighborhood.trim(),
        city: form.city.trim(),
        state: form.state.trim().toUpperCase(),
        additional_info: form.additional_info.trim(),
        bank_name: form.bank_name.trim(),
        bank_agency: form.bank_agency.trim(),
        bank_account: form.bank_account.trim(),
        bank_account_type: form.bank_account_type,
        bank_pix: form.bank_pix.trim(),
        bank_holder_name: form.bank_holder_name.trim(),
      } as any)
      .eq("user_id", user!.id);

    setSaving(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    toast.success("Cadastro atualizado!");
    navigate("/hub");
  };

  if (!loaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar showSettings={false} />
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">Complete seu Cadastro</h1>
          <p className="text-sm text-muted-foreground">
            Preencha os campos obrigatórios (*) para continuar usando o sistema. Esses dados serão usados em documentos de cotação.
          </p>
        </div>

        {/* DADOS PESSOAIS */}
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

        {/* ENDEREÇO */}
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

        {/* DADOS BANCÁRIOS */}
        <fieldset className="border rounded-lg p-4 space-y-4">
          <legend className="font-bold text-sm px-2">DADOS BANCÁRIOS</legend>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Banco</Label>
              <Input value={form.bank_name} onChange={e => setField("bank_name", e.target.value)} />
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
              <Label>Tipo de Conta</Label>
              <Select value={form.bank_account_type} onValueChange={v => setField("bank_account_type", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="corrente">Corrente</SelectItem>
                  <SelectItem value="poupanca">Poupança</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Chave PIX</Label>
              <Input value={form.bank_pix} onChange={e => setField("bank_pix", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Titular da Conta</Label>
              <Input value={form.bank_holder_name} onChange={e => setField("bank_holder_name", e.target.value)} />
            </div>
          </div>
        </fieldset>

        {/* INFORMAÇÕES ADICIONAIS */}
        <fieldset className="border rounded-lg p-4 space-y-4">
          <legend className="font-bold text-sm px-2">INFORMAÇÕES ADICIONAIS</legend>
          <Textarea value={form.additional_info} onChange={e => setField("additional_info", e.target.value)} rows={3} />
        </fieldset>

        <div className="flex gap-3">
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar e Continuar"}</Button>
        </div>
      </div>
    </div>
  );
}
