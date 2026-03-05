import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRNumber } from "@/components/ui/masked-number-input";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Plus, CheckCircle2, XCircle, ShoppingCart, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

/* ─── shared types (keep in sync with BudgetView) ─── */
interface Stage {
  id: string;
  code: string;
  name: string;
  stage_type: string | null;
  quantity: number;
  unit_price: number;
  total_value: number;
  start_date: string | null;
  end_date: string | null;
  unit_id: string | null;
  status: string;
}

interface QuotationItem {
  id: string;
  stage_id: string;
  status: string;
  need_date: string | null;
  approved_proposal_id: string | null;
}

interface Proposal {
  id: string;
  quotation_item_id: string;
  vendor_id: string;
  unit_price: number;
  total_price: number;
  quantity: number | null;
  proposal_date: string;
  is_winner: boolean;
  vendor_name?: string;
  notes?: string | null;
}

interface HistoryEntry {
  id: string;
  action: string;
  details: string | null;
  created_at: string;
}

interface Vendor {
  id: string;
  nome_fantasia: string | null;
  razao_social: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studyId: string;
  stage: Stage | null;
  quotationItem: QuotationItem | null;
  proposals: Proposal[];
  unitAbbr: string;
  onDataChanged: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  quoting: "Em cotação",
  approved: "Aprovado",
  ordered: "Pedido",
  received: "Recebido",
  used: "Utilizado",
};

const TYPE_LABELS: Record<string, string> = {
  material: "Material",
  servico: "Serviço",
  mao_de_obra: "Mão de Obra",
  taxas: "Taxas",
};

export default function BudgetDrawer({
  open, onOpenChange, studyId, stage, quotationItem, proposals, unitAbbr, onDataChanged,
}: Props) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);

  // new proposal form
  const [showNewProposal, setShowNewProposal] = useState(false);
  const [newVendorId, setNewVendorId] = useState("");
  const [newUnitPrice, setNewUnitPrice] = useState("");
  const [newQuantity, setNewQuantity] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newDate, setNewDate] = useState<Date | undefined>(new Date());

  // edit proposal
  const [editingProposalId, setEditingProposalId] = useState<string | null>(null);
  const [editUnitPrice, setEditUnitPrice] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const fmt = (v: number) => formatBRNumber(v);

  const handleUnitPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "");
    if (!digits) { setNewUnitPrice(""); return; }
    const num = parseInt(digits, 10) / 100;
    setNewUnitPrice(num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  };

  const parseCurrencyInput = (value: string): number =>
    parseFloat(value.replace(/\./g, "").replace(",", ".")) || 0;

  /* ─── fetch history + vendors ─── */
  const fetchHistory = useCallback(async () => {
    if (!quotationItem) { setHistory([]); return; }
    setLoadingHistory(true);
    const { data } = await supabase
      .from("budget_history" as any)
      .select("id, action, details, created_at")
      .eq("quotation_item_id", quotationItem.id)
      .order("created_at", { ascending: false });
    if (data) setHistory(data as any);
    setLoadingHistory(false);
  }, [quotationItem]);

  const fetchVendors = useCallback(async () => {
    const { data } = await supabase
      .from("study_vendors")
      .select("id, nome_fantasia, razao_social")
      .eq("study_id", studyId)
      .eq("is_deleted", false);
    if (data) setVendors(data);
  }, [studyId]);

  useEffect(() => {
    if (open) {
      fetchHistory();
      fetchVendors();
    }
  }, [open, fetchHistory, fetchVendors]);

  if (!stage) return null;

  const currentStatus = quotationItem?.status || "pending";

  // Central quantity logic — drives all enable/disable decisions
  const approvedQty = proposals.filter(p => p.is_winner).reduce((sum, p) => sum + (p.quantity || 0), 0);
  const remainingQty = stage.quantity - approvedQty;
  const hasRemainingQty = remainingQty > 0;

  /* ─── ensure quotation item exists ─── */
  const ensureQI = async (): Promise<string | null> => {
    if (quotationItem) return quotationItem.id;
    const { data, error } = await supabase
      .from("budget_quotation_items" as any)
      .insert({ study_id: studyId, stage_id: stage.id, status: "quoting" })
      .select("id")
      .single();
    if (error) { toast.error("Erro ao criar item de cotação"); return null; }
    return (data as any).id;
  };

  /* ─── add proposal ─── */
  const handleAddProposal = async () => {
    if (!newVendorId || !newUnitPrice) {
      toast.error("Preencha fornecedor e preço unitário");
      return;
    }
    const parsedQty = parseInt(newQuantity, 10);
    if (!parsedQty || parsedQty <= 0) {
      toast.error("Quantidade deve ser maior que zero");
      return;
    }
    if (parsedQty > remainingQty) {
      toast.error(`Quantidade máxima disponível: ${remainingQty}`);
      return;
    }
    setSaving(true);
    const qiId = await ensureQI();
    if (!qiId) { setSaving(false); return; }

    const unitPrice = parseCurrencyInput(newUnitPrice);
    const totalPrice = unitPrice * parsedQty;

    const { error } = await supabase.from("budget_proposals" as any).insert({
      quotation_item_id: qiId,
      study_id: studyId,
      vendor_id: newVendorId,
      unit_price: unitPrice,
      total_price: totalPrice,
      quantity: parsedQty,
      notes: newNotes || null,
      proposal_date: newDate ? format(newDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
    });

    if (error) {
      toast.error("Erro ao salvar proposta");
    } else {
      // Always set to quoting when there's remaining qty (even if previously ordered/approved)
      if (currentStatus !== "quoting") {
        await supabase.from("budget_quotation_items" as any)
          .update({ status: "quoting" })
          .eq("id", qiId);
      }
      // log history
      const vendorName = vendors.find(v => v.id === newVendorId);
      await supabase.from("budget_history" as any).insert({
        quotation_item_id: qiId,
        study_id: studyId,
        action: "proposal_added",
        details: `Proposta adicionada: ${vendorName?.nome_fantasia || vendorName?.razao_social || "—"} — R$ ${fmt(unitPrice)}/un (restante: ${remainingQty - parsedQty}/${stage.quantity})`,
      });

      toast.success("Proposta adicionada");
      resetNewForm();
      onDataChanged();
      fetchHistory();
    }
    setSaving(false);
  };

  /* ─── approve proposal ─── */
  const handleApprove = async (proposalId: string) => {
    const proposal = proposals.find(p => p.id === proposalId);
    if (!proposal) return;

    const proposalQty = proposal.quantity || 0;
    if (proposalQty > remainingQty) {
      toast.error(`Quantidade excede o restante da etapa. Restante: ${remainingQty}, esta cotação: ${proposalQty}`);
      return;
    }

    setSaving(true);
    const qiId = quotationItem!.id;

    await supabase.from("budget_proposals" as any)
      .update({ is_winner: true })
      .eq("id", proposalId);

    // Check if total approved quantity now covers the full stage quantity
    const newRemainingQty = remainingQty - proposalQty;
    if (newRemainingQty <= 0) {
      // All quantity covered — mark as approved
      await supabase.from("budget_quotation_items" as any)
        .update({ status: "approved", approved_proposal_id: proposalId })
        .eq("id", qiId);
      await supabase.from("construction_stages" as any)
        .update({ status: "orcamento" })
        .eq("id", stage.id);
    } else {
      // Still missing quantity — keep as quoting
      await supabase.from("budget_quotation_items" as any)
        .update({ status: "quoting" })
        .eq("id", qiId);
    }

    const newApprovedQty = approvedQty + proposalQty;
    await supabase.from("budget_history" as any).insert({
      quotation_item_id: qiId,
      study_id: studyId,
      action: "approved",
      details: `Cotação aprovada: ${proposal?.vendor_name || "—"} — R$ ${fmt(proposal?.total_price || 0)} (qtde: ${proposalQty}, total aprovado: ${newApprovedQty}/${stage.quantity})`,
    });

    toast.success("Cotação aprovada");
    onDataChanged();
    fetchHistory();
    setSaving(false);
  };

  /* ─── reprovar proposta individual ─── */
  const handleRejectProposal = async (proposalId: string) => {
    if (!quotationItem) return;
    setSaving(true);

    await supabase.from("budget_proposals" as any)
      .update({ is_winner: false })
      .eq("id", proposalId);

    const rejectedProposal = proposals.find(p => p.id === proposalId);
    const rejectedQty = rejectedProposal?.quantity || 0;
    const remainingWinners = proposals.filter(p => p.id !== proposalId && p.is_winner);
    const newApprovedQty = remainingWinners.reduce((sum, p) => sum + (p.quantity || 0), 0);

    if (remainingWinners.length === 0) {
      // No winners left — revert to quoting/pending
      await supabase.from("budget_quotation_items" as any)
        .update({ status: proposals.length > 1 ? "quoting" : "pending", approved_proposal_id: null })
        .eq("id", quotationItem.id);
      await supabase.from("construction_stages" as any)
        .update({ status: "pending" })
        .eq("id", stage.id);
    } else if (newApprovedQty < stage.quantity) {
      // Quantity no longer fully covered — revert to quoting
      await supabase.from("budget_quotation_items" as any)
        .update({ status: "quoting" })
        .eq("id", quotationItem.id);
      await supabase.from("construction_stages" as any)
        .update({ status: "pending" })
        .eq("id", stage.id);
    }

    await supabase.from("budget_history" as any).insert({
      quotation_item_id: quotationItem.id,
      study_id: studyId,
      action: "rejected",
      details: `Cotação reprovada: ${rejectedProposal?.vendor_name || "—"} (qtde: ${rejectedQty}, restante aprovado: ${newApprovedQty}/${stage.quantity})`,
    });

    toast.success("Cotação reprovada");
    onDataChanged();
    fetchHistory();
    setSaving(false);
  };

  /* ─── edit proposal ─── */
  const startEdit = (p: Proposal) => {
    setEditingProposalId(p.id);
    setEditUnitPrice(p.unit_price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setEditQuantity(String(p.quantity || ""));
    setEditNotes(p.notes || "");
  };

  const cancelEdit = () => {
    setEditingProposalId(null);
    setEditUnitPrice("");
    setEditQuantity("");
    setEditNotes("");
  };

  const handleEditUnitPriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "");
    if (!digits) { setEditUnitPrice(""); return; }
    const num = parseInt(digits, 10) / 100;
    setEditUnitPrice(num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  };

  const handleSaveEdit = async (proposalId: string) => {
    if (!editUnitPrice) { toast.error("Preencha o preço unitário"); return; }
    const parsedQty = parseInt(editQuantity, 10);
    if (!parsedQty || parsedQty <= 0) { toast.error("Quantidade deve ser maior que zero"); return; }

    if (parsedQty > remainingQty) {
      toast.error(`Quantidade máxima disponível: ${remainingQty}`);
      return;
    }

    setSaving(true);
    const unitPrice = parseCurrencyInput(editUnitPrice);
    const totalPrice = unitPrice * parsedQty;

    const { error } = await supabase.from("budget_proposals" as any)
      .update({ unit_price: unitPrice, total_price: totalPrice, quantity: parsedQty, notes: editNotes || null })
      .eq("id", proposalId);

    if (error) {
      toast.error("Erro ao atualizar cotação");
    } else {
      toast.success("Cotação atualizada");
      cancelEdit();
      onDataChanged();
    }
    setSaving(false);
  };

  /* ─── delete proposal ─── */
  const handleDeleteProposal = async (proposalId: string) => {
    setSaving(true);
    const proposal = proposals.find(p => p.id === proposalId);

    const { error } = await supabase.from("budget_proposals" as any)
      .update({ is_deleted: true })
      .eq("id", proposalId);

    if (error) {
      toast.error("Erro ao excluir cotação");
    } else {
      if (quotationItem) {
        const remaining = proposals.filter(p => p.id !== proposalId && !p.is_winner);
        const remainingWinners = proposals.filter(p => p.id !== proposalId && p.is_winner);
        const allRemaining = proposals.filter(p => p.id !== proposalId);
        if (allRemaining.length === 0) {
          await supabase.from("budget_quotation_items" as any)
            .update({ status: "pending", approved_proposal_id: null })
            .eq("id", quotationItem.id);
          await supabase.from("construction_stages" as any)
            .update({ status: "pending" })
            .eq("id", stage.id);
        }

        await supabase.from("budget_history" as any).insert({
          quotation_item_id: quotationItem.id,
          study_id: studyId,
          action: "proposal_deleted",
          details: `Cotação excluída: ${proposal?.vendor_name || "—"} — R$ ${fmt(proposal?.total_price || 0)}`,
        });
      }
      toast.success("Cotação excluída");
      onDataChanged();
      fetchHistory();
    }
    setSaving(false);
  };

  /* ─── generate PO ─── */
  const handleGeneratePO = async () => {
    if (!quotationItem) return;
    const winner = proposals.find(p => p.is_winner);
    if (!winner) { toast.error("Nenhuma proposta vencedora"); return; }
    setSaving(true);

    // create purchase order
    const { data: order, error: orderErr } = await supabase
      .from("purchase_orders")
      .insert({ study_id: studyId, vendor_id: winner.vendor_id, status: "DRAFT" })
      .select("id")
      .single();

    if (orderErr || !order) {
      toast.error("Erro ao criar pedido de compra");
      setSaving(false);
      return;
    }

    // create order item
    await supabase.from("purchase_order_items").insert({
      order_id: order.id,
      description: `${stage.code} — ${stage.name}`,
      quantity_ordered: stage.quantity,
      unit_price: winner.unit_price,
      unit: unitAbbr || null,
    });

    // update status
    await supabase.from("budget_quotation_items" as any)
      .update({ status: "ordered" })
      .eq("id", quotationItem.id);

    // sync construction_stages.status
    await supabase.from("construction_stages" as any)
      .update({ status: "pedido" })
      .eq("id", stage.id);

    // log
    await supabase.from("budget_history" as any).insert({
      quotation_item_id: quotationItem.id,
      study_id: studyId,
      action: "order_generated",
      details: `Pedido de compra gerado — Fornecedor: ${winner.vendor_name || "—"}`,
    });

    toast.success("Pedido de compra gerado com sucesso");
    onDataChanged();
    fetchHistory();
    setSaving(false);
  };

  const resetNewForm = () => {
    setShowNewProposal(false);
    setNewVendorId("");
    setNewUnitPrice("");
    setNewQuantity("");
    setNewNotes("");
    setNewDate(new Date());
  };

  const formatDateBR = (d: string) => {
    if (!d) return "—";
    const parts = d.split("T")[0].split("-");
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-base">
            {stage.code} — {stage.name}
          </SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="data" className="flex-1">
          <TabsList className="w-full">
            <TabsTrigger value="data" className="flex-1 text-xs">Dados</TabsTrigger>
            <TabsTrigger value="quotes" className="flex-1 text-xs">Cotações</TabsTrigger>
            <TabsTrigger value="history" className="flex-1 text-xs">Histórico</TabsTrigger>
          </TabsList>

          {/* ─── Tab: Dados ─── */}
          <TabsContent value="data" className="space-y-3 mt-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Tipo</span>
                <p className="font-medium">{stage.stage_type ? TYPE_LABELS[stage.stage_type] || stage.stage_type : "—"}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Unidade</span>
                <p className="font-medium">{unitAbbr || "—"}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Quantidade</span>
                <p className="font-medium">{fmt(stage.quantity)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Vlr Unit. Referência</span>
                <p className="font-medium">R$ {fmt(stage.unit_price)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Vlr Total Referência</span>
                <p className="font-medium">R$ {fmt(stage.total_value)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Status</span>
                <p className="font-medium">{STATUS_LABELS[currentStatus] || currentStatus}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Início Previsto</span>
                <p className="font-medium">{stage.start_date ? formatDateBR(stage.start_date) : "—"}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Fim Previsto</span>
                <p className="font-medium">{stage.end_date ? formatDateBR(stage.end_date) : "—"}</p>
              </div>
            </div>
          </TabsContent>

          {/* ─── Tab: Cotações ─── */}
          <TabsContent value="quotes" className="space-y-4 mt-4">
            {proposals.length === 0 && !showNewProposal && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma cotação registrada</p>
            )}

            {proposals.map(p => {
              const isEditing = editingProposalId === p.id;
              // Can edit/delete: not a winner AND not fully used
              const canEditDelete = !p.is_winner && currentStatus !== "used";

              if (isEditing) {
                return (
                  <div key={p.id} className="rounded-lg border border-dashed border-primary p-3 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">Editar Cotação — {p.vendor_name || "—"}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-muted-foreground">Preço Unitário (R$)</label>
                        <Input className="h-9 text-sm" placeholder="0,00" value={editUnitPrice} onChange={handleEditUnitPriceChange} inputMode="numeric" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Qtde (máx: {remainingQty})</label>
                        <Input className="h-9 text-sm" type="number" min={1} placeholder="0" value={editQuantity} onChange={e => setEditQuantity(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Observações</label>
                      <Textarea className="text-sm min-h-[50px]" placeholder="Condições, observações..." value={editNotes} onChange={e => setEditNotes(e.target.value)} />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleSaveEdit(p.id)} disabled={saving} className="flex-1">Salvar</Button>
                      <Button size="sm" variant="outline" onClick={cancelEdit} className="flex-1">Cancelar</Button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={p.id}
                  className={cn(
                    "rounded-lg border p-3 space-y-2",
                    p.is_winner && "border-green-500 bg-green-50 dark:bg-green-900/10"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{p.vendor_name || "—"}</span>
                    {p.is_winner && (
                      <Badge className="text-[10px] bg-green-600">
                        Aprovado
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Unit.</span>
                      <p className="font-mono">R$ {fmt(p.unit_price)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total</span>
                      <p className="font-mono font-medium">R$ {fmt(p.total_price)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Qtde</span>
                      <p>{p.quantity != null ? fmt(p.quantity) : "—"}</p>
                    </div>
                  </div>
                  {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatDateBR(p.proposal_date)}</span>
                    <div className="flex items-center gap-1">
                      {canEditDelete && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => startEdit(p)}
                            disabled={saving}
                            title="Editar cotação"
                          >
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleDeleteProposal(p.id)}
                            disabled={saving}
                            title="Excluir cotação"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </>
                      )}
                      {p.is_winner ? (
                        hasRemainingQty && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive border-destructive/40"
                            onClick={() => handleRejectProposal(p.id)}
                            disabled={saving}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Reprovar
                          </Button>
                        )
                      ) : (
                        (() => {
                          const wouldExceed = (p.quantity || 0) > remainingQty;
                          return (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => handleApprove(p.id)}
                              disabled={saving || wouldExceed}
                              title={wouldExceed ? `Qtde excede o restante (${remainingQty})` : "Aprovar cotação"}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Aprovar
                            </Button>
                          );
                        })()
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* New Proposal Form */}
            {showNewProposal ? (
              <div className="rounded-lg border border-dashed p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Nova Cotação</p>

                <Select value={newVendorId} onValueChange={setNewVendorId}>
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

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Preço Unitário (R$)</label>
                    <Input
                      className="h-9 text-sm"
                      placeholder="0,00"
                      value={newUnitPrice}
                      onChange={handleUnitPriceChange}
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Qtde (máx: {remainingQty})</label>
                    <Input
                      className="h-9 text-sm"
                      type="number"
                      min={1}
                      max={remainingQty}
                      placeholder="0"
                      value={newQuantity}
                      onChange={e => setNewQuantity(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Data da Proposta</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full h-9 justify-start text-left text-sm", !newDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {newDate ? format(newDate, "dd/MM/yyyy") : "Selecionar data"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={newDate}
                        onSelect={setNewDate}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Observações</label>
                  <Textarea
                    className="text-sm min-h-[60px]"
                    placeholder="Condições, observações..."
                    value={newNotes}
                    onChange={e => setNewNotes(e.target.value)}
                  />
                </div>

                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddProposal} disabled={saving} className="flex-1">
                    Salvar
                  </Button>
                  <Button size="sm" variant="outline" onClick={resetNewForm} className="flex-1">
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={!hasRemainingQty}
                title={!hasRemainingQty ? "Quantidade total da etapa já coberta pelas cotações aprovadas" : "Adicionar nova cotação"}
                onClick={() => {
                  setNewQuantity(String(remainingQty));
                  setShowNewProposal(true);
                }}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                {!hasRemainingQty ? "Qtde total já aprovada" : `+ Nova Cotação (restam ${remainingQty})`}
              </Button>
            )}
          </TabsContent>

          {/* ─── Tab: Histórico ─── */}
          <TabsContent value="history" className="mt-4">
            {loadingHistory ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum histórico</p>
            ) : (
              <div className="space-y-2">
                {history.map(h => (
                  <div key={h.id} className="rounded-lg border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-[10px]">
                        {h.action === "proposal_added" && "Proposta"}
                        {h.action === "approved" && "Aprovação"}
                        {h.action === "rejected" && "Reprovação"}
                        {h.action === "order_generated" && "Pedido"}
                        {!["proposal_added", "approved", "rejected", "order_generated"].includes(h.action) && h.action}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDateBR(h.created_at)}
                      </span>
                    </div>
                    {h.details && <p className="text-xs text-muted-foreground">{h.details}</p>}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Footer actions */}
        <SheetFooter className="mt-6 flex-row gap-2 sm:flex-row">
          {!hasRemainingQty && proposals.some(p => p.is_winner) && currentStatus !== "ordered" && currentStatus !== "received" && currentStatus !== "used" && (
            <Button
              size="sm"
              onClick={handleGeneratePO}
              disabled={saving}
              className="flex-1"
            >
              <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
              Gerar Pedido
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
