import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import GlobalTopbar from "@/components/GlobalTopbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Trash2, Plus, ArrowLeft, Loader2, FileText, FileSpreadsheet } from "lucide-react";
import { formatCPFCNPJ, formatPhone, formatCNPJ } from "@/lib/cnpjLookup";
import { quotationPdfBlob, downloadQuotationPdf } from "@/lib/quotationPdf";
import { downloadQuotationExcel } from "@/lib/quotationExcel";
import PdfPreview from "@/components/PdfPreview";

interface StageItem {
  stage_id: string;
  code: string;
  name: string;
  unit_abbr: string;
  quantity: number;
  observation: string;
}

interface Vendor {
  id: string;
  nome_fantasia: string | null;
  razao_social: string | null;
  email: string | null;
  cnpj: string | null;
  phone: string | null;
}

interface Profile {
  full_name: string | null;
  person_type: string;
  cpf_cnpj: string | null;
  inscricao_estadual: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  street_number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  cep: string | null;
}

const DEFAULT_MESSAGE = `Prezado(a),

Segue solicitação de cotação para os itens listados abaixo.

Solicitamos o envio dos preços unitários e condições de pagamento.

Atenciosamente.`;

export default function QuotationRequestPage() {
  const { id: studyId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const requestType = searchParams.get("type") || "email";
  const stageIdsParam = searchParams.get("stages") || "";

  const [profile, setProfile] = useState<Profile | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [items, setItems] = useState<StageItem[]>([]);
  const [allStages, setAllStages] = useState<{ id: string; code: string; name: string; unit_id: string | null; quantity: number }[]>([]);
  const [units, setUnits] = useState<Record<string, string>>({});

  const [vendorId, setVendorId] = useState("");
  const [vendorEmail, setVendorEmail] = useState("");
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [quotationNumber, setQuotationNumber] = useState(1);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  // Add stage dialog
  const [addStageOpen, setAddStageOpen] = useState(false);

  // Add vendor dialog
  const [addVendorOpen, setAddVendorOpen] = useState(false);
  const [newVendorName, setNewVendorName] = useState("");
  const [newVendorCnpj, setNewVendorCnpj] = useState("");
  const [newVendorEmail, setNewVendorEmail] = useState("");
  const [newVendorPhone, setNewVendorPhone] = useState("");
  const [savingVendor, setSavingVendor] = useState(false);

  /* ─── Load data ─── */
  const fetchData = useCallback(async () => {
    if (!studyId || !user) return;
    setLoading(true);

    const [profileRes, vendorsRes, stagesRes, unitsRes, countRes] = await Promise.all([
      supabase.from("profiles").select("full_name, person_type, cpf_cnpj, inscricao_estadual, email, phone, street, street_number, complement, neighborhood, city, state, cep").eq("user_id", user.id).single(),
      supabase.from("study_vendors").select("id, nome_fantasia, razao_social, email, cnpj, phone").eq("study_id", studyId).eq("is_deleted", false),
      supabase.from("construction_stages").select("id, code, name, unit_id, quantity, stage_type").eq("study_id", studyId).eq("is_deleted", false).order("position"),
      supabase.from("construction_units").select("id, abbreviation"),
      supabase.from("quotation_requests" as any).select("quotation_number").eq("study_id", studyId).order("quotation_number", { ascending: false }).limit(1),
    ]);

    if (profileRes.data) setProfile(profileRes.data as any);
    if (vendorsRes.data) setVendors(vendorsRes.data);

    // Build unit map
    const unitMap: Record<string, string> = {};
    if (unitsRes.data) {
      for (const u of unitsRes.data as any[]) unitMap[u.id] = u.abbreviation;
    }
    setUnits(unitMap);

    // Filter material stages
    const materialStages = (stagesRes.data as any[] || []).filter((s: any) => {
      const hasChildren = (stagesRes.data as any[]).some((o: any) => o.parent_id === s.id);
      return !hasChildren && s.stage_type === "material";
    });
    setAllStages(materialStages);

    // Build items from URL params
    const stageIds = stageIdsParam.split(",").filter(Boolean);
    const selectedItems: StageItem[] = [];
    for (const sid of stageIds) {
      const stage = materialStages.find((s: any) => s.id === sid);
      if (stage) {
        selectedItems.push({
          stage_id: stage.id,
          code: stage.code,
          name: stage.name,
          unit_abbr: stage.unit_id ? unitMap[stage.unit_id] || "" : "",
          quantity: stage.quantity,
          observation: "",
        });
      }
    }
    setItems(selectedItems);

    // Next quotation number
    const lastNum = (countRes.data as any)?.[0]?.quotation_number || 0;
    setQuotationNumber(lastNum + 1);

    setLoading(false);
  }, [studyId, user, stageIdsParam]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ─── Vendor selection ─── */
  const handleVendorChange = (vid: string) => {
    setVendorId(vid);
    const v = vendors.find(x => x.id === vid);
    setVendorEmail(v?.email || "");
  };

  /* ─── Remove item ─── */
  const removeItem = (stageId: string) => {
    setItems(prev => prev.filter(i => i.stage_id !== stageId));
  };

  /* ─── Add stage from dialog ─── */
  const availableStages = useMemo(() => {
    const usedIds = new Set(items.map(i => i.stage_id));
    return allStages.filter(s => !usedIds.has(s.id));
  }, [allStages, items]);

  const addStage = (stageId: string) => {
    const stage = allStages.find(s => s.id === stageId);
    if (!stage) return;
    setItems(prev => [...prev, {
      stage_id: stage.id,
      code: stage.code,
      name: stage.name,
      unit_abbr: stage.unit_id ? units[stage.unit_id] || "" : "",
      quantity: stage.quantity,
      observation: "",
    }]);
    setAddStageOpen(false);
  };

  /* ─── Add vendor inline ─── */
  const handleAddVendor = async () => {
    if (!newVendorName.trim()) { toast.error("Nome do fornecedor é obrigatório"); return; }
    setSavingVendor(true);
    const { data, error } = await supabase.from("study_vendors").insert({
      study_id: studyId!,
      nome_fantasia: newVendorName.trim(),
      cnpj: newVendorCnpj || null,
      email: newVendorEmail || null,
      phone: newVendorPhone || null,
    }).select("id, nome_fantasia, razao_social, email, cnpj, phone").single();

    if (error) {
      toast.error("Erro ao adicionar fornecedor");
    } else if (data) {
      setVendors(prev => [...prev, data]);
      setVendorId(data.id);
      setVendorEmail(data.email || "");
      setAddVendorOpen(false);
      setNewVendorName(""); setNewVendorCnpj(""); setNewVendorEmail(""); setNewVendorPhone("");
      toast.success("Fornecedor adicionado");
    }
    setSavingVendor(false);
  };

  /* ─── Save draft ─── */
  const handleSaveDraft = async () => {
    if (items.length === 0) { toast.error("Adicione pelo menos um item"); return; }
    setSaving(true);

    const { data: req, error: reqErr } = await supabase
      .from("quotation_requests" as any)
      .insert({
        study_id: studyId!,
        vendor_id: vendorId || null,
        vendor_email: vendorEmail || null,
        request_type: requestType,
        status: "draft",
        message: message || null,
      })
      .select("id, quotation_number")
      .single();

    if (reqErr || !req) {
      toast.error("Erro ao salvar cotação");
      setSaving(false);
      return;
    }

    const itemsToInsert = items.map((item, idx) => ({
      request_id: (req as any).id,
      stage_id: item.stage_id,
      observation: item.observation || null,
      position: idx,
    }));

    const { error: itemsErr } = await supabase
      .from("quotation_request_items" as any)
      .insert(itemsToInsert);

    if (itemsErr) {
      toast.error("Erro ao salvar itens da cotação");
    } else {
      toast.success(`Cotação ${String((req as any).quotation_number).padStart(3, "0")} salva como rascunho`);
      navigate(`/studies/${studyId}/construction`);
    }
    setSaving(false);
  };

  /* ─── Build params for PDF / Excel ─── */
  const buildExportParams = () => ({
    quotationNumber,
    profile: profile!,
    vendor: vendorId ? vendors.find(v => v.id === vendorId) || null : null,
    vendorEmail,
    items,
    message,
  });

  /* ─── PDF Preview ─── */
  const handlePreviewPdf = () => {
    if (items.length === 0) { toast.error("Adicione pelo menos um item"); return; }
    const blob = quotationPdfBlob(buildExportParams());
    const url = URL.createObjectURL(blob);
    setPdfPreviewUrl(url);
  };

  /* ─── Excel Download ─── */
  const handleDownloadExcel = () => {
    if (items.length === 0) { toast.error("Adicione pelo menos um item"); return; }
    downloadQuotationExcel(buildExportParams());
    toast.success("Excel gerado com sucesso");
  };

  /* ─── Format helpers ─── */
  const formatAddress = (p: Profile) => {
    const parts = [p.street, p.street_number, p.complement, p.neighborhood, p.city, p.state].filter(Boolean);
    return parts.join(", ") || "—";
  };

  const formatDoc = (p: Profile) => {
    if (!p.cpf_cnpj) return "—";
    return formatCPFCNPJ(p.cpf_cnpj, p.person_type);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <GlobalTopbar />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const isPF = profile?.person_type === "PF";

  return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar />
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/studies/${studyId}/construction`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-bold text-foreground">Nova Solicitação de Cotação</h1>
        </div>

        {/* Sub-header */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Etapas selecionadas: <strong>{items.length}</strong>
          </span>
          <span className="text-sm font-mono font-bold text-foreground">
            Cotação: {String(quotationNumber).padStart(3, "0")}
          </span>
        </div>

        {/* Emitente */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Emitente (Meus Dados)</h3>
            <Button variant="link" size="sm" className="text-xs h-auto p-0" onClick={() => navigate("/profile/complete")}>
              Editar meus dados
            </Button>
          </div>
          {profile && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">{isPF ? "Nome" : "Razão Social"}</span>
                <p className="font-medium">{profile.full_name || "—"}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">{isPF ? "CPF" : "CNPJ"}</span>
                <p className="font-medium">{formatDoc(profile)}</p>
              </div>
              {!isPF && (
                <div>
                  <span className="text-xs text-muted-foreground">I.E.</span>
                  <p className="font-medium">{profile.inscricao_estadual || "—"}</p>
                </div>
              )}
              <div>
                <span className="text-xs text-muted-foreground">E-mail</span>
                <p className="font-medium">{profile.email || "—"}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Telefone</span>
                <p className="font-medium">{profile.phone ? formatPhone(profile.phone) : "—"}</p>
              </div>
              <div className="sm:col-span-2">
                <span className="text-xs text-muted-foreground">Endereço</span>
                <p className="font-medium">{formatAddress(profile)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Fornecedor */}
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Fornecedor</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Fornecedor</Label>
              <Select value={vendorId} onValueChange={handleVendorChange}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Selecionar fornecedor..." />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.nome_fantasia || v.razao_social || "—"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="link" size="sm" className="text-xs h-auto p-0" onClick={() => setAddVendorOpen(true)}>
                + Adicionar fornecedor
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">E-mail destino</Label>
              <Input
                className="h-9 text-sm"
                placeholder="email@fornecedor.com"
                value={vendorEmail}
                onChange={e => setVendorEmail(e.target.value)}
              />
              {requestType === "email" && !vendorEmail && (
                <p className="text-[10px] text-destructive">⚠️ Obrigatório para envio por e-mail</p>
              )}
            </div>
          </div>
        </div>

        {/* Itens */}
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Itens da Cotação</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-[80px]">Código</TableHead>
                  <TableHead className="text-xs">Descrição</TableHead>
                  <TableHead className="text-xs text-center w-[50px]">Un</TableHead>
                  <TableHead className="text-xs text-right w-[70px]">Qtde</TableHead>
                  <TableHead className="text-xs">Observação</TableHead>
                  <TableHead className="text-xs w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                      Nenhum item selecionado
                    </TableCell>
                  </TableRow>
                ) : items.map(item => (
                  <TableRow key={item.stage_id}>
                    <TableCell className="text-xs font-mono">{item.code}</TableCell>
                    <TableCell className="text-xs">{item.name}</TableCell>
                    <TableCell className="text-xs text-center">{item.unit_abbr || "—"}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{item.quantity}</TableCell>
                    <TableCell>
                      <Input
                        className="h-7 text-xs"
                        placeholder="Observação..."
                        value={item.observation}
                        onChange={e => {
                          const val = e.target.value;
                          setItems(prev => prev.map(i =>
                            i.stage_id === item.stage_id ? { ...i, observation: val } : i
                          ));
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(item.stage_id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => setAddStageOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar item
          </Button>
        </div>

        {/* Mensagem */}
        <div className="rounded-lg border p-4 space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Mensagem</h3>
          <Textarea
            className="min-h-[120px] text-sm"
            value={message}
            onChange={e => setMessage(e.target.value)}
          />
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
          <Button variant="outline" size="sm" className="text-xs" onClick={handlePreviewPdf} disabled={items.length === 0}>
            <FileText className="h-3.5 w-3.5 mr-1" /> Pré-visualizar PDF
          </Button>
          <Button variant="outline" size="sm" className="text-xs" onClick={handleDownloadExcel} disabled={items.length === 0}>
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Baixar Excel
          </Button>
          <Button variant="secondary" size="sm" onClick={handleSaveDraft} disabled={saving} className="text-xs">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Salvar Rascunho
          </Button>
          <div className="flex-1" />
          <Button size="sm" disabled className="text-xs">
            Enviar Solicitação
          </Button>
        </div>
      </div>

      {/* Add Stage Dialog */}
      <Dialog open={addStageOpen} onOpenChange={setAddStageOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Adicionar Item</DialogTitle>
          </DialogHeader>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {availableStages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Todas as etapas de material já foram adicionadas</p>
            ) : availableStages.map(s => (
              <button
                key={s.id}
                className="w-full text-left px-3 py-2 hover:bg-muted rounded text-sm"
                onClick={() => addStage(s.id)}
              >
                <span className="font-mono text-xs mr-2">{s.code}</span>
                {s.name}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Vendor Dialog */}
      <Dialog open={addVendorOpen} onOpenChange={setAddVendorOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Adicionar Fornecedor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome Fantasia *</Label>
              <Input className="h-9 text-sm" value={newVendorName} onChange={e => setNewVendorName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">CNPJ</Label>
              <Input className="h-9 text-sm" value={newVendorCnpj} onChange={e => setNewVendorCnpj(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">E-mail</Label>
              <Input className="h-9 text-sm" value={newVendorEmail} onChange={e => setNewVendorEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Telefone</Label>
              <Input className="h-9 text-sm" value={newVendorPhone} onChange={e => setNewVendorPhone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddVendorOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleAddVendor} disabled={savingVendor}>
              {savingVendor ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF Preview Dialog */}
      <Dialog open={!!pdfPreviewUrl} onOpenChange={(open) => { if (!open) { if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl); setPdfPreviewUrl(null); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-base">Pré-visualização do PDF</DialogTitle>
          </DialogHeader>
          {pdfPreviewUrl && (
            <PdfPreview
              fileUrl={pdfPreviewUrl}
              fileName={`cotacao-${String(quotationNumber).padStart(3, "0")}.pdf`}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
