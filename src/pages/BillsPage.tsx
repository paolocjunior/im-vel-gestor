import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MaskedNumberInput } from "@/components/ui/masked-number-input";
import { ArrowLeft, ArrowUp, ArrowDown, Paperclip } from "lucide-react";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import GlobalTopbar from "@/components/GlobalTopbar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatBRL } from "@/lib/recompute";
import { formatDateBR, todayISO, PAYMENT_METHODS } from "@/lib/billConstants";

interface Installment {
  id: string;
  bill_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  description: string | null;
  status: string;
  paid_at: string | null;
  payment_method: string | null;
  account_id: string | null;
  // joined
  bill_description: string;
  bill_cost_center: string | null;
  bill_category: string | null;
  bill_installment_plan: string;
  bill_vendor_id: string | null;
  bill_total_amount: number;
}

type SortKey = "due_date" | "description" | "amount" | "cost_center" | "category" | "paid_at" | "status";

type FilterKey = "due_date" | "cost_center" | "category" | "status";

const getDisplayStatus = (status: string, due_date: string) => {
  if (status === "PAID") return "Pago";
  if (due_date < todayISO()) return "Atrasado";
  return "Pendente";
};

function FilterDropdown({ label, options, selected, onToggle }: {
  label: string; options: string[]; selected: string[]; onToggle: (v: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs">
          {label} {selected.length > 0 && `(${selected.length})`} ▼
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 max-h-60 overflow-y-auto p-2" align="start">
        {options.map(o => (
          <label key={o} className="flex items-center gap-2 py-1 px-1 hover:bg-muted rounded cursor-pointer text-sm">
            <Checkbox checked={selected.includes(o)} onCheckedChange={() => onToggle(o)} />
            {o}
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export default function BillsPage() {
  const { id: studyId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [billsWithAttachments, setBillsWithAttachments] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [banks, setBanks] = useState<{ id: string; name: string }[]>([]);

  // Filters
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [filters, setFilters] = useState<Record<FilterKey, string[]>>({
    due_date: [], cost_center: [], category: [], status: [],
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<{
    periodStart: string; periodEnd: string;
    filters: Record<FilterKey, string[]>; searchQuery: string;
  }>({ periodStart: "", periodEnd: "", filters: { due_date: [], cost_center: [], category: [], status: [] }, searchQuery: "" });

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>("due_date");
  const [sortAsc, setSortAsc] = useState(true);

  // Payment dialog
  const [paymentInstId, setPaymentInstId] = useState<string | null>(null);
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [paymentConfirm, setPaymentConfirm] = useState<Installment | null>(null);

  // Payment validation dialog (missing fields)
  const [paymentValidationInst, setPaymentValidationInst] = useState<Installment | null>(null);
  const [paymentValAccount, setPaymentValAccount] = useState("");
  const [paymentValMethod, setPaymentValMethod] = useState("");

  // Delete dialog
  const [deleteInst, setDeleteInst] = useState<Installment | null>(null);
  const [deleteMode, setDeleteMode] = useState<"single" | "all_pending" | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Overdue payment dialog
  const [overdueInst, setOverdueInst] = useState<Installment | null>(null);
  const [overdueInterest, setOverdueInterest] = useState(0);
  const [overdueFine, setOverdueFine] = useState(0);
  const [overduePaymentDate, setOverduePaymentDate] = useState(todayISO());

  useEffect(() => { if (user && studyId) { loadData(); loadBanks(); } }, [user, studyId]);

  const loadBanks = async () => {
    const { data } = await supabase.from("financial_institutions")
      .select("id, name").eq("user_id", user!.id).eq("is_active", true).order("name");
    setBanks(data || []);
  };

  const loadData = async () => {
    // Load installments with bill info
    const { data: bills } = await supabase.from("bills")
      .select("id, description, cost_center, category, installment_plan, vendor_id, total_amount")
      .eq("study_id", studyId).eq("is_deleted", false);
    const { data: insts } = await supabase.from("bill_installments")
      .select("*").eq("study_id", studyId).eq("is_deleted", false)
      .order("due_date", { ascending: true });

    // Load documents to detect which bills have attachments
    const { data: docs } = await supabase.from("documents")
      .select("entity_id").eq("study_id", studyId!).eq("entity", "bill").eq("is_deleted", false);
    const attachSet = new Set<string>();
    (docs || []).forEach(d => { if (d.entity_id) attachSet.add(d.entity_id); });
    setBillsWithAttachments(attachSet);
    
    const billMap: Record<string, any> = {};
    (bills || []).forEach(b => { billMap[b.id] = b; });

    const merged: Installment[] = (insts || []).map(inst => {
      const bill = billMap[inst.bill_id] || {};
      return {
        ...inst,
        amount: Number(inst.amount),
        bill_description: bill.description || "",
        bill_cost_center: bill.cost_center || null,
        bill_category: bill.category || null,
        bill_installment_plan: bill.installment_plan || "AVISTA",
        bill_vendor_id: bill.vendor_id || null,
        bill_total_amount: Number(bill.total_amount || 0),
      };
    }).filter(inst => billMap[inst.bill_id]); // only show installments whose bill exists

    setInstallments(merged);
    setLoading(false);
  };

  // Cascading filter options: each filter's options come from data filtered by ALL OTHER active filters
  // Cascading filter options including period
  const filterOptions = useMemo(() => {
    const getFiltered = (excludeKey: FilterKey) => {
      return installments.filter(inst => {
        // Period always applies
        if (periodStart && inst.due_date < periodStart) return false;
        if (periodEnd && inst.due_date > periodEnd) return false;
        if (excludeKey !== "due_date" && filters.due_date.length && !filters.due_date.includes(formatDateBR(inst.due_date))) return false;
        if (excludeKey !== "cost_center" && filters.cost_center.length && !filters.cost_center.includes(inst.bill_cost_center || "")) return false;
        if (excludeKey !== "category" && filters.category.length && !filters.category.includes(inst.bill_category || "")) return false;
        const statusLabel = getDisplayStatus(inst.status, inst.due_date);
        if (excludeKey !== "status" && filters.status.length && !filters.status.includes(statusLabel)) return false;
        return true;
      });
    };
    return {
      due_date: [...new Set(getFiltered("due_date").map(i => formatDateBR(i.due_date)))].sort(),
      cost_center: [...new Set(getFiltered("cost_center").map(i => i.bill_cost_center || "").filter(Boolean))].sort(),
      category: [...new Set(getFiltered("category").map(i => i.bill_category || "").filter(Boolean))].sort(),
      status: [...new Set(getFiltered("status").map(i => getDisplayStatus(i.status, i.due_date)))].sort(),
    };
  }, [installments, filters, periodStart, periodEnd]);

  const applyFilters = () => {
    setAppliedFilters({ periodStart, periodEnd, filters: { ...filters }, searchQuery });
  };

  const clearAllFilters = () => {
    setPeriodStart(""); setPeriodEnd(""); setSearchQuery("");
    setFilters({ due_date: [], cost_center: [], category: [], status: [] });
    setAppliedFilters({ periodStart: "", periodEnd: "", filters: { due_date: [], cost_center: [], category: [], status: [] }, searchQuery: "" });
  };

  const setPeriodPreset = (preset: "today" | "month" | "year") => {
    const today = todayISO();
    const d = new Date();
    let s: string, e: string;
    if (preset === "today") { s = today; e = today; }
    else if (preset === "month") {
      s = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
      e = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    } else {
      s = `${d.getFullYear()}-01-01`;
      e = `${d.getFullYear()}-12-31`;
    }
    setPeriodStart(s); setPeriodEnd(e);
    setAppliedFilters(prev => ({ ...prev, periodStart: s, periodEnd: e }));
  };

  const toggleFilter = (key: FilterKey, value: string) => {
    setFilters(prev => {
      const arr = prev[key];
      return { ...prev, [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
  };

  // Filtered + sorted
  const displayedInstallments = useMemo(() => {
    const af = appliedFilters;
    let list = installments.filter(inst => {
      if (af.periodStart && inst.due_date < af.periodStart) return false;
      if (af.periodEnd && inst.due_date > af.periodEnd) return false;
      if (af.filters.due_date.length && !af.filters.due_date.includes(formatDateBR(inst.due_date))) return false;
      if (af.filters.cost_center.length && !af.filters.cost_center.includes(inst.bill_cost_center || "")) return false;
      if (af.filters.category.length && !af.filters.category.includes(inst.bill_category || "")) return false;
      const statusLabel = getDisplayStatus(inst.status, inst.due_date);
      if (af.filters.status.length && !af.filters.status.includes(statusLabel)) return false;
      if (af.searchQuery) {
        const q = af.searchQuery.toLowerCase();
        const desc = (inst.description || inst.bill_description || "").toLowerCase();
        if (!desc.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      let va: any, vb: any;
      switch (sortKey) {
        case "due_date": va = a.due_date; vb = b.due_date; break;
        case "description": va = (a.description || a.bill_description).toLowerCase(); vb = (b.description || b.bill_description).toLowerCase(); break;
        case "amount": va = a.amount; vb = b.amount; break;
        case "cost_center": va = (a.bill_cost_center || "").toLowerCase(); vb = (b.bill_cost_center || "").toLowerCase(); break;
        case "category": va = (a.bill_category || "").toLowerCase(); vb = (b.bill_category || "").toLowerCase(); break;
        case "paid_at": va = a.paid_at || ""; vb = b.paid_at || ""; break;
        case "status": va = a.status; vb = b.status; break;
        default: va = a.due_date; vb = b.due_date;
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });

    return list;
  }, [installments, appliedFilters, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortAsc ? <ArrowUp className="h-3 w-3 inline ml-1" /> : <ArrowDown className="h-3 w-3 inline ml-1" />;
  };

  // === Actions ===
  const handlePayment = async () => {
    if (!paymentInstId) return;
    await supabase.from("bill_installments").update({ status: "PAID", paid_at: paymentDate }).eq("id", paymentInstId);
    const inst = installments.find(i => i.id === paymentInstId)!;
    setPaymentInstId(null);
    setPaymentConfirm({ ...inst, paid_at: paymentDate, status: "PAID" });
    loadData();
  };

  const handlePaymentValidationConfirm = async () => {
    if (!paymentValidationInst) return;
    if (!paymentValAccount) { toast.error("Conta é obrigatória."); return; }
    if (!paymentValMethod) { toast.error("Forma de Pagamento é obrigatória."); return; }
    await supabase.from("bill_installments").update({
      account_id: paymentValAccount,
      payment_method: paymentValMethod,
    }).eq("id", paymentValidationInst.id);
    setPaymentDate(todayISO());
    setPaymentInstId(paymentValidationInst.id);
    setPaymentValidationInst(null);
  };

  const handleReopen = async (instId: string) => {
    await supabase.from("bill_installments").update({ status: "PENDING", paid_at: null }).eq("id", instId);
    toast.success("Vencimento reaberto.");
    loadData();
  };

  const handleDeleteClick = (inst: Installment) => {
    if (inst.status === "PAID") {
      toast.error("Vencimento já pago. Volte para Pendente antes de excluir.");
      return;
    }
    setDeleteInst(inst);
    // Check if multi-installment
    const plan = inst.bill_installment_plan;
    if (plan !== "AVISTA" && plan !== "1x") {
      setDeleteMode(null); // user will choose
      setDeleteConfirmOpen(true);
    } else {
      setDeleteMode("single");
      setDeleteConfirmOpen(true);
    }
  };

  const executeDelete = async () => {
    if (!deleteInst) return;
    if (deleteMode === "all_pending") {
      // Delete all pending installments of this bill
      await supabase.from("bill_installments").update({ is_deleted: true })
        .eq("bill_id", deleteInst.bill_id).eq("status", "PENDING");
      // If no installments remain, soft-delete the bill too
      const { data: remaining } = await supabase.from("bill_installments")
        .select("id").eq("bill_id", deleteInst.bill_id).eq("is_deleted", false);
      if (!remaining || remaining.length === 0) {
        await supabase.from("bills").update({ is_deleted: true }).eq("id", deleteInst.bill_id);
      }
    } else {
      await supabase.from("bill_installments").update({ is_deleted: true }).eq("id", deleteInst.id);
      // Check if bill has remaining installments
      const { data: remaining } = await supabase.from("bill_installments")
        .select("id").eq("bill_id", deleteInst.bill_id).eq("is_deleted", false);
      if (!remaining || remaining.length === 0) {
        await supabase.from("bills").update({ is_deleted: true }).eq("id", deleteInst.bill_id);
      }
    }
    setDeleteConfirmOpen(false);
    setDeleteInst(null);
    setDeleteMode(null);
    toast.success("Excluído com sucesso.");
    loadData();
  };

  const handleAction = (action: string, inst: Installment) => {
    switch (action) {
      case "pay": {
        const isOverdue = getDisplayStatus(inst.status, inst.due_date) === "Atrasado";
        if (isOverdue) {
          // Show overdue dialog with interest/fine fields
          setOverdueInst(inst);
          setOverdueInterest(0);
          setOverdueFine(0);
          setOverduePaymentDate(todayISO());
          break;
        }
        // Validate account_id and payment_method
        const hasAccount = !!inst.account_id;
        const hasMethod = !!inst.payment_method;
        if (!hasAccount || !hasMethod) {
          setPaymentValidationInst(inst);
          setPaymentValAccount(inst.account_id || "");
          setPaymentValMethod(inst.payment_method || "");
        } else {
          setPaymentDate(todayISO());
          setPaymentInstId(inst.id);
        }
        break;
      }
      case "reopen":
        handleReopen(inst.id);
        break;
      case "view":
        navigate(`/studies/${studyId}/bills/${inst.bill_id}?mode=view`);
        break;
      case "edit":
        navigate(`/studies/${studyId}/bills/${inst.bill_id}?mode=edit`);
        break;
      case "delete":
        handleDeleteClick(inst);
        break;
      case "clone":
        navigate(`/studies/${studyId}/bills/${inst.bill_id}?mode=clone`);
        break;
    }
  };

  const handleOverduePayment = async () => {
    if (!overdueInst) return;
    // Validate account/method
    if (!overdueInst.account_id || !overdueInst.payment_method) {
      toast.error("Preencha Conta e Forma de Pagamento antes (edite a despesa).");
      return;
    }
    const newAmount = overdueInst.amount + overdueInterest + overdueFine;
    await supabase.from("bill_installments").update({
      amount: newAmount,
      status: "PAID",
      paid_at: overduePaymentDate,
    }).eq("id", overdueInst.id);
    setOverdueInst(null);
    toast.success("Pagamento registrado com juros/multa!");
    loadData();
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <GlobalTopbar />
      <div className="max-w-7xl w-full mx-auto px-6 pt-6 flex flex-col flex-1 min-h-0">
        <div className="flex-shrink-0 space-y-5 pb-5">
        <h1 className="text-xl font-bold">Financeiro</h1>

        <div className="flex items-center justify-between">
          <Button size="sm" onClick={() => navigate(`/studies/${studyId}/bills/new`)}>Nova Despesa</Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/studies/${studyId}/dashboard`)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
        </div>

        {/* Filters */}
        <div className="space-y-3 border rounded-lg p-4">
          {/* Period row */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium">Período:</span>
            <Input type="date" className="w-40" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
            <Input type="date" className="w-40" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
            <Button variant="outline" size="sm" onClick={() => setPeriodPreset("today")}>Hoje</Button>
            <Button variant="outline" size="sm" onClick={() => setPeriodPreset("month")}>Este Mês</Button>
            <Button variant="outline" size="sm" onClick={() => setPeriodPreset("year")}>Este Ano</Button>
          </div>
          {/* Filter dropdowns row */}
          <div className="flex items-center gap-2 flex-wrap">
            <FilterDropdown label="Venc." options={filterOptions.due_date} selected={filters.due_date} onToggle={v => toggleFilter("due_date", v)} />
            <FilterDropdown label="Centro Custo" options={filterOptions.cost_center} selected={filters.cost_center} onToggle={v => toggleFilter("cost_center", v)} />
            <FilterDropdown label="Categoria" options={filterOptions.category} selected={filters.category} onToggle={v => toggleFilter("category", v)} />
            <FilterDropdown label="Status" options={filterOptions.status} selected={filters.status} onToggle={v => toggleFilter("status", v)} />
            <span className="text-sm font-medium">Consulta</span>
            <Input className="w-48" placeholder="Buscar descrição" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            <Button size="sm" onClick={applyFilters}>Aplicar</Button>
            <Button variant="outline" size="sm" onClick={clearAllFilters}>Limpar</Button>
          </div>
        </div>
        </div>

        <div className="flex-1 overflow-auto min-h-0">
        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>
        ) : displayedInstallments.length === 0 ? (
          <div className="border rounded-lg p-8 text-center"><p className="text-muted-foreground">Nenhum vencimento encontrado.</p></div>
        ) : (
          <div className="relative w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("due_date")}>Vencimento <SortIcon col="due_date" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("description")}>Descrição <SortIcon col="description" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("amount")}>Valor <SortIcon col="amount" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("cost_center")}>Centro Custo <SortIcon col="cost_center" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("category")}>Categoria <SortIcon col="category" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("paid_at")}>Data Pagamento <SortIcon col="paid_at" /></TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("status")}>Status <SortIcon col="status" /></TableHead>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Opções</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedInstallments.map(inst => (
                  <TableRow key={inst.id}>
                    <TableCell>{formatDateBR(inst.due_date)}</TableCell>
                    <TableCell>{inst.description || inst.bill_description}</TableCell>
                    <TableCell>{formatBRL(inst.amount)}</TableCell>
                    <TableCell>{inst.bill_cost_center || "—"}</TableCell>
                    <TableCell>{inst.bill_category || "—"}</TableCell>
                    <TableCell>{inst.paid_at ? formatDateBR(inst.paid_at) : "—"}</TableCell>
                    <TableCell>
                      {(() => {
                        const ds = getDisplayStatus(inst.status, inst.due_date);
                        const cls = ds === "Pago" ? "bg-green-100 text-green-800" : ds === "Atrasado" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800";
                        return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{ds}</span>;
                      })()}
                    </TableCell>
                    <TableCell className="w-8 text-center">
                      {billsWithAttachments.has(inst.bill_id) && (
                        <Paperclip className="w-4 h-4 text-muted-foreground inline-block" />
                      )}
                    </TableCell>
                    <TableCell>
                      <Select onValueChange={v => handleAction(v, inst)} value="">
                        <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="Opções" /></SelectTrigger>
                        <SelectContent>
                          {inst.status === "PAID" ? (
                            <SelectItem value="reopen">Voltar p/ Pendente</SelectItem>
                          ) : (
                            <SelectItem value="pay">Informar Pagamento</SelectItem>
                          )}
                          <SelectItem value="view">Visualizar</SelectItem>
                          <SelectItem value="edit">Editar</SelectItem>
                          <SelectItem value="delete">Excluir</SelectItem>
                          <SelectItem value="clone">Clonar</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        </div>
      </div>

      {/* Payment Validation Dialog (missing account/payment method) */}
      <Dialog open={!!paymentValidationInst} onOpenChange={() => setPaymentValidationInst(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Campos obrigatórios</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Preencha os campos abaixo para informar o pagamento:</p>
          <div className="space-y-3">
            {!paymentValidationInst?.account_id && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Conta:</label>
                <Select value={paymentValAccount} onValueChange={setPaymentValAccount}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {banks.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!paymentValidationInst?.payment_method && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Forma de Pagamento:</label>
                <Select value={paymentValMethod} onValueChange={setPaymentValMethod}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentValidationInst(null)}>Cancelar</Button>
            <Button onClick={handlePaymentValidationConfirm}>Informar Pagamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Date Dialog */}
      <Dialog open={!!paymentInstId} onOpenChange={() => setPaymentInstId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Informar Pagamento</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium">Data do Pagamento:</label>
            <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentInstId(null)}>Cancelar</Button>
            <Button onClick={handlePayment}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Confirm Dialog */}
      <Dialog open={!!paymentConfirm} onOpenChange={() => setPaymentConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Pagamento Concluído</DialogTitle></DialogHeader>
          {paymentConfirm && (
            <div className="text-sm space-y-1">
              <p>Pagamento concluído no dia <strong>{formatDateBR(paymentConfirm.paid_at!)}</strong>!</p>
              <p>{paymentConfirm.bill_description}, Venc. {formatDateBR(paymentConfirm.due_date)}, Valor {formatBRL(paymentConfirm.amount)}</p>
              <p>Parcela {paymentConfirm.installment_number}/{paymentConfirm.bill_installment_plan === "AVISTA" ? "1" : paymentConfirm.bill_installment_plan.replace("x", "")}</p>
            </div>
          )}
          <DialogFooter><Button onClick={() => setPaymentConfirm(null)}>OK</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialogs */}
      {deleteInst && deleteInst.bill_installment_plan !== "AVISTA" && deleteInst.bill_installment_plan !== "1x" && deleteMode === null && (
        <AlertDialog open={deleteConfirmOpen} onOpenChange={() => { setDeleteConfirmOpen(false); setDeleteInst(null); }}>
          <AlertDialogContent className="max-w-md overflow-hidden">
            <AlertDialogHeader><AlertDialogTitle>Como deseja excluir?</AlertDialogTitle></AlertDialogHeader>
            <div className="space-y-2">
              <Button className="w-full" variant="outline" onClick={() => { setDeleteMode("single"); }}>Excluir apenas este vencimento</Button>
              <Button className="w-full" variant="outline" onClick={() => { setDeleteMode("all_pending"); }}>Excluir todos os vencimentos pendentes desta despesa</Button>
              <Button className="w-full" variant="ghost" onClick={() => { setDeleteConfirmOpen(false); setDeleteInst(null); }}>Cancelar</Button>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <AlertDialog open={deleteConfirmOpen && deleteMode !== null} onOpenChange={() => { setDeleteConfirmOpen(false); setDeleteInst(null); setDeleteMode(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteMode === "all_pending"
                ? "Todos os vencimentos pendentes desta despesa serão excluídos."
                : "Este vencimento será excluído."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Overdue Payment Dialog */}
      <Dialog open={!!overdueInst} onOpenChange={() => setOverdueInst(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Vencimento Atrasado</DialogTitle></DialogHeader>
          {overdueInst && (
            <div className="space-y-3">
              <p className="text-sm text-destructive font-medium">
                Este vencimento estava previsto para {formatDateBR(overdueInst.due_date)} e está atrasado. Deseja adicionar juros e multa?
              </p>
              <p className="text-sm">Valor original: <strong>{formatBRL(overdueInst.amount)}</strong></p>
              <div className="space-y-1.5">
                <Label>Juros (R$):</Label>
                <MaskedNumberInput value={overdueInterest} onValueChange={setOverdueInterest} />
              </div>
              <div className="space-y-1.5">
                <Label>Multa (R$):</Label>
                <MaskedNumberInput value={overdueFine} onValueChange={setOverdueFine} />
              </div>
              <p className="text-sm font-medium">
                Valor final: <strong>{formatBRL(overdueInst.amount + overdueInterest + overdueFine)}</strong>
              </p>
              <div className="space-y-1.5">
                <Label>Data do Pagamento:</Label>
                <Input type="date" value={overduePaymentDate} onChange={e => setOverduePaymentDate(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverdueInst(null)}>Cancelar</Button>
            <Button onClick={handleOverduePayment}>Confirmar Pagamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
