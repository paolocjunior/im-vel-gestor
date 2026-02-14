import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Paperclip, Upload, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MaskedNumberInput } from "@/components/ui/masked-number-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import GlobalTopbar from "@/components/GlobalTopbar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import Decimal from "decimal.js";
import {
  COST_CENTERS, COST_CENTER_OPTIONS, PAYMENT_METHODS,
  INSTALLMENT_OPTIONS, todayISO, addDaysISO,
} from "@/lib/billConstants";
import { formatCNPJ, formatPhone } from "@/lib/cnpjLookup";

interface InstallmentRow {
  _key: number;
  due_date: string;
  amount: number;
  payment_method: string;
  account_id: string;
  description: string;
  _frozen: boolean;
  _dbId?: string;
  _status?: string;
  _paid_at?: string | null;
}

let _ik = 0;
const nk = () => ++_ik;

export default function BillFormPage() {
  const { id: studyId, billId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const mode = searchParams.get("mode") || "create";
  const isView = mode === "view";
  const isClone = mode === "clone";
  const isEdit = mode === "edit";
  const isNew = !billId || billId === "new";

  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [banks, setBanks] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  // Bill form
  const [vendorId, setVendorId] = useState("");
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState(0);
  const [costCenter, setCostCenter] = useState("");
  const [category, setCategory] = useState("");
  const [accountId, setAccountId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [installmentPlan, setInstallmentPlan] = useState("AVISTA");
  const [firstDueDate, setFirstDueDate] = useState(todayISO());
  const [intervalDays, setIntervalDays] = useState<number | "">(30);
  const [notes, setNotes] = useState("");

  // Installment rows
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [showInstallments, setShowInstallments] = useState(false);

  // À vista payment dialog
  const [avistaConfirmOpen, setAvistaConfirmOpen] = useState(false);

  // Clone change detection
  const [originalSnapshot, setOriginalSnapshot] = useState("");

  // Anexos
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<{ id: string; file_name: string; file_path: string; file_size: number | null; }[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  // New vendor dialog
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [vendorForm, setVendorForm] = useState({
    cnpj: "", razao_social: "", nome_fantasia: "", category: "",
    phone: "", email: "", street: "", street_number: "", complement: "",
    neighborhood: "", city: "", state: "", notes: "",
  });
  const [lookingUpCnpj, setLookingUpCnpj] = useState(false);
  const [savingVendor, setSavingVendor] = useState(false);

  const effectiveBillId = (isNew || isClone) ? null : billId;

  const categoryOptions = costCenter && COST_CENTERS[costCenter] ? COST_CENTERS[costCenter] : [];

  useEffect(() => {
    if (user && studyId) { loadVendors(); loadBanks(); }
  }, [user, studyId]);

  useEffect(() => {
    if (user && !isNew) loadBill();
  }, [user, billId]);

  useEffect(() => {
    if (effectiveBillId && studyId) loadAttachments();
  }, [effectiveBillId, studyId]);

  const loadAttachments = async () => {
    if (!effectiveBillId) return;
    const { data } = await supabase.from("documents")
      .select("id, file_name, file_path, file_size")
      .eq("study_id", studyId!)
      .eq("entity", "bill")
      .eq("entity_id", effectiveBillId)
      .eq("is_deleted", false)
      .order("created_at");
    setAttachments(data || []);
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const targetBillId = effectiveBillId;
    if (!targetBillId) {
      setPendingFiles(prev => [...prev, ...Array.from(files)]);
      toast.success("Arquivo(s) adicionado(s). Serão enviados ao salvar.");
      return;
    }
    setUploading(true);
    await uploadFilesToBill(targetBillId, Array.from(files));
    setUploading(false);
    loadAttachments();
    toast.success("Arquivo(s) anexado(s)!");
  };

  const uploadFilesToBill = async (targetBillId: string, files: File[]) => {
    for (const file of files) {
      const path = `${studyId}/${targetBillId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("documents").upload(path, file);
      if (uploadErr) { toast.error(`Erro ao enviar ${file.name}`); continue; }
      await supabase.from("documents").insert({
        study_id: studyId!,
        entity: "bill",
        entity_id: targetBillId,
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        mime_type: file.type || null,
      });
    }
  };

  const handleDeleteAttachment = async (doc: typeof attachments[0]) => {
    await supabase.storage.from("documents").remove([doc.file_path]);
    await supabase.from("documents").update({ is_deleted: true }).eq("id", doc.id);
    setAttachments(prev => prev.filter(a => a.id !== doc.id));
    toast.success("Anexo removido.");
  };

  const handleDownloadAttachment = async (doc: typeof attachments[0]) => {
    const { data } = await supabase.storage.from("documents").download(doc.file_path);
    if (!data) { toast.error("Erro ao baixar arquivo."); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url; a.download = doc.file_name; a.click();
    URL.revokeObjectURL(url);
  };

  const loadVendors = async () => {
    const { data } = await supabase.from("study_vendors")
      .select("id, nome_fantasia, razao_social")
      .eq("study_id", studyId).eq("is_deleted", false).order("razao_social");
    setVendors((data || []).map(v => ({ id: v.id, name: v.nome_fantasia || v.razao_social || "Sem nome" })));
  };

  const loadBanks = async () => {
    const { data } = await supabase.from("financial_institutions")
      .select("id, name").eq("user_id", user!.id).eq("is_active", true).order("name");
    setBanks(data || []);
  };

  const loadBill = async () => {
    const { data: bill } = await supabase.from("bills").select("*").eq("id", billId).single();
    if (!bill) { navigate(`/studies/${studyId}/bills`); return; }

    setVendorId(bill.vendor_id || "");
    setDescription(bill.description);
    setTotalAmount(Number(bill.total_amount));
    setCostCenter(bill.cost_center || "");
    setCategory(bill.category || "");
    setAccountId(bill.account_id || "");
    setPaymentMethod(bill.payment_method || "");
    setInstallmentPlan(bill.installment_plan);
    setFirstDueDate(bill.first_due_date || todayISO());
    setIntervalDays(bill.interval_days || 30);
    setNotes(bill.notes || "");

    const { data: insts } = await supabase.from("bill_installments")
      .select("*").eq("bill_id", billId).eq("is_deleted", false)
      .order("installment_number");

    if (bill.installment_plan !== "AVISTA") {
      const rows: InstallmentRow[] = (insts || [])
        .map(i => ({
          _key: nk(),
          due_date: i.due_date,
          amount: Number(i.amount),
          payment_method: i.payment_method || "",
          account_id: i.account_id || "",
          description: i.description || "",
          _frozen: i.status === "PAID",
          _dbId: i.id,
          _status: i.status,
          _paid_at: i.paid_at,
        }));
      setInstallments(rows);
      setShowInstallments(true);
    }

    if (isClone) {
      setOriginalSnapshot(JSON.stringify({ vendorId: bill.vendor_id || "", description: bill.description, totalAmount: Number(bill.total_amount), costCenter: bill.cost_center || "", category: bill.category || "", accountId: bill.account_id || "", paymentMethod: bill.payment_method || "", installmentPlan: bill.installment_plan, firstDueDate: bill.first_due_date || "", intervalDays: bill.interval_days || 30, notes: bill.notes || "" }));
    }
  };

  // === Installment generation ===
  const generateInstallments = useCallback((plan: string, total: number, interval: number, baseDate: string, pm: string, acc: string, desc: string) => {
    if (plan === "AVISTA") { setShowInstallments(false); setInstallments([]); return; }
    const count = parseInt(plan.replace("x", ""));
    if (isNaN(count) || count < 1) return;
    setShowInstallments(true);

    const perInstallment = new Decimal(total).div(count).toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber();
    const rows: InstallmentRow[] = [];
    for (let i = 0; i < count; i++) {
      const dueDate = addDaysISO(baseDate, interval * (i + 1));
      const amt = i === count - 1
        ? new Decimal(total).minus(new Decimal(perInstallment).times(count - 1)).toNumber()
        : perInstallment;
      rows.push({
        _key: nk(),
        due_date: dueDate,
        amount: Number(amt.toFixed(2)),
        payment_method: pm,
        account_id: acc,
        description: `${desc} ${i + 1}/${count}`,
        _frozen: false,
      });
    }
    setInstallments(rows);
  }, []);

  const handlePlanChange = (plan: string) => {
    setInstallmentPlan(plan);
    if (plan === "AVISTA") {
      setShowInstallments(false);
      setInstallments([]);
      return;
    }

    if (isEdit) {
      // Keep paid installments, regenerate only pending ones
      const paidRows = installments.filter(r => r._status === "PAID");
      const newCount = parseInt(plan.replace("x", ""));
      if (isNaN(newCount) || newCount < 1) return;
      const pendingCount = Math.max(0, newCount - paidRows.length);
      const paidSum = paidRows.reduce((s, r) => new Decimal(s).plus(r.amount).toNumber(), 0);
      const remainingAmount = Math.max(0, new Decimal(totalAmount).minus(paidSum).toNumber());

      const perPending = pendingCount > 0 ? new Decimal(remainingAmount).div(pendingCount).toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber() : 0;
      const baseDate = firstDueDate || todayISO();
      const interval = typeof intervalDays === "number" ? intervalDays : 30;
      const newPendingRows: InstallmentRow[] = [];
      for (let i = 0; i < pendingCount; i++) {
        const dueDate = addDaysISO(baseDate, interval * (paidRows.length + i + 1));
        const amt = i === pendingCount - 1
          ? Number(new Decimal(remainingAmount).minus(new Decimal(perPending).times(pendingCount - 1)).toFixed(2))
          : perPending;
        newPendingRows.push({
          _key: nk(),
          due_date: dueDate,
          amount: amt,
          payment_method: paymentMethod,
          account_id: accountId,
          description: `${description} ${paidRows.length + i + 1}/${newCount}`,
          _frozen: false,
        });
      }
      setInstallments([...paidRows, ...newPendingRows]);
      setShowInstallments(true);
    } else {
      const interval = typeof intervalDays === "number" ? intervalDays : 30;
      generateInstallments(plan, totalAmount, interval, firstDueDate || todayISO(), paymentMethod, accountId, description);
    }
  };

  const handleIntervalChange = (newInterval: number) => {
    setIntervalDays(newInterval);
    if (installmentPlan !== "AVISTA" && installments.length > 0) {
      const baseDate = firstDueDate || todayISO();
      setInstallments(prev => prev.map((row, i) => {
        if (row._status === "PAID") return row; // Don't change paid installment dates
        return { ...row, due_date: addDaysISO(baseDate, newInterval * (i + 1)) };
      }));
    }
  };

  const handleTotalAmountChange = (newTotal: number) => {
    setTotalAmount(newTotal);
    if (installmentPlan !== "AVISTA" && installments.length > 0) {
      redistributeAmounts(installments, newTotal);
    }
  };

  // Residual method redistribution
  const redistributeAmounts = (rows: InstallmentRow[], total: number) => {
    const frozenSum = rows.filter(r => r._frozen || r._status === "PAID").reduce((s, r) => new Decimal(s).plus(r.amount).toNumber(), 0);
    const unfrozenCount = rows.filter(r => !r._frozen && r._status !== "PAID").length;
    if (unfrozenCount === 0) return;
    const remaining = new Decimal(total).minus(frozenSum);
    const perUnfrozen = remaining.div(unfrozenCount).toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber();

    let distributed = new Decimal(0);
    let lastUnfrozenIdx = -1;
    const updated = rows.map((row, i) => {
      if (row._frozen || row._status === "PAID") {
        distributed = distributed.plus(row.amount);
        return row;
      }
      lastUnfrozenIdx = i;
      distributed = distributed.plus(perUnfrozen);
      return { ...row, amount: perUnfrozen };
    });

    if (lastUnfrozenIdx >= 0) {
      const diff = new Decimal(total).minus(distributed).toNumber();
      updated[lastUnfrozenIdx] = { ...updated[lastUnfrozenIdx], amount: Number(new Decimal(updated[lastUnfrozenIdx].amount).plus(diff).toFixed(2)) };
    }
    setInstallments(updated);
  };

  const handleInstallmentAmountChange = (key: number, newAmount: number) => {
    const updated = installments.map(r => r._key === key ? { ...r, amount: newAmount, _frozen: true } : r);
    redistributeAmounts(updated, totalAmount);
  };

  const handleInstallmentFieldChange = (key: number, field: string, value: string) => {
    setInstallments(prev => prev.map(r => r._key === key ? { ...r, [field]: value } : r));
  };

  // === Vendor Dialog ===
  const handleVendorSelect = (value: string) => {
    if (value === "__add") {
      setVendorForm({ cnpj: "", razao_social: "", nome_fantasia: "", category: "", phone: "", email: "", street: "", street_number: "", complement: "", neighborhood: "", city: "", state: "", notes: "" });
      setVendorDialogOpen(true);
    } else {
      setVendorId(value);
    }
  };

  const lookupCNPJInDialog = async () => {
    const clean = vendorForm.cnpj.replace(/\D/g, "");
    if (clean.length !== 14) { toast.error("CNPJ deve ter 14 dígitos."); return; }
    setLookingUpCnpj(true);
    const result = await (await import("@/lib/cnpjLookup")).lookupCNPJ(clean);
    setLookingUpCnpj(false);
    if (!result.ok || !result.data) { toast.error(result.error || "CNPJ não encontrado."); return; }
    const d = result.data;
    setVendorForm(f => ({
      ...f,
      razao_social: d.razao_social || f.razao_social,
      nome_fantasia: d.nome_fantasia || f.nome_fantasia,
      street: d.logradouro || f.street,
      street_number: d.numero || f.street_number,
      complement: d.complemento || f.complement,
      neighborhood: d.bairro || f.neighborhood,
      city: d.municipio || f.city,
      state: d.uf || f.state,
      phone: d.telefone ? formatPhone(d.telefone.split("/")[0].trim()) : f.phone,
      email: d.email || f.email,
    }));
    toast.success("Dados preenchidos pelo CNPJ!");
  };

  const saveNewVendor = async () => {
    if (!vendorForm.razao_social.trim()) { toast.error("Razão Social é obrigatória."); return; }
    if (!vendorForm.nome_fantasia.trim()) { toast.error("Nome Fantasia é obrigatório."); return; }
    setSavingVendor(true);
    const { data, error } = await supabase.from("study_vendors").insert({
      study_id: studyId!,
      cnpj: vendorForm.cnpj.trim() || null,
      razao_social: vendorForm.razao_social.trim(),
      nome_fantasia: vendorForm.nome_fantasia.trim(),
      category: vendorForm.category.trim() || null,
      phone: vendorForm.phone.trim() || null,
      email: vendorForm.email.trim() || null,
      street: vendorForm.street.trim() || null,
      street_number: vendorForm.street_number.trim() || null,
      complement: vendorForm.complement.trim() || null,
      neighborhood: vendorForm.neighborhood.trim() || null,
      city: vendorForm.city.trim() || null,
      state: vendorForm.state.trim().toUpperCase() || null,
      notes: vendorForm.notes.trim() || null,
    }).select("id").single();
    setSavingVendor(false);
    if (error || !data) { toast.error("Erro ao criar fornecedor."); return; }
    toast.success("Fornecedor criado!");
    setVendorDialogOpen(false);
    await loadVendors();
    setVendorId(data.id);
  };

  // === Save ===
  const saveBill = async () => {
    if (!description.trim()) { toast.error("Descrição é obrigatória."); return; }
    if (totalAmount <= 0) { toast.error("Valor total deve ser maior que zero."); return; }

    // Validate installment sum (only count non-paid for edit mode)
    if (showInstallments && installments.length > 0) {
      const sum = installments.reduce((s, r) => new Decimal(s).plus(r.amount).toNumber(), 0);
      const diff = Math.abs(new Decimal(totalAmount).minus(sum).toNumber());
      if (diff > 0.01) {
        toast.error(`Soma das parcelas (R$ ${sum.toFixed(2)}) difere do valor total (R$ ${totalAmount.toFixed(2)}).`);
        return;
      }
    }

    // Clone validation
    if (isClone) {
      const current = JSON.stringify({ vendorId, description, totalAmount, costCenter, category, accountId, paymentMethod, installmentPlan, firstDueDate, intervalDays, notes });
      if (current === originalSnapshot) {
        toast.error("Você pediu para clonar mas não fez nenhuma alteração. Verifique ou cancele a clonagem.");
        return;
      }
    }

    setSaving(true);

    const effectiveInterval = typeof intervalDays === "number" ? intervalDays : 30;

    const billPayload = {
      study_id: studyId!,
      vendor_id: vendorId || null,
      description: description.trim(),
      total_amount: totalAmount,
      cost_center: costCenter || null,
      category: category || null,
      account_id: accountId || null,
      payment_method: paymentMethod || null,
      installment_plan: installmentPlan,
      first_due_date: installmentPlan === "AVISTA" ? firstDueDate : null,
      interval_days: effectiveInterval,
      notes: notes || null,
    };

    if (isEdit && billId) {
      // Update bill
      await supabase.from("bills").update(billPayload).eq("id", billId);

      if (showInstallments) {
        // Delete all old pending installments from DB
        await supabase.from("bill_installments")
          .update({ is_deleted: true })
          .eq("bill_id", billId)
          .eq("status", "PENDING");

        // Insert new pending installments
        const pendingRows = installments.filter(r => r._status !== "PAID");
        const paidCount = installments.filter(r => r._status === "PAID").length;
        if (pendingRows.length > 0) {
          const inserts = pendingRows.map((row, i) => ({
            bill_id: billId,
            study_id: studyId!,
            installment_number: paidCount + i + 1,
            due_date: row.due_date,
            amount: row.amount,
            description: row.description || null,
            payment_method: row.payment_method || null,
            account_id: row.account_id || null,
            status: "PENDING",
          }));
          await supabase.from("bill_installments").insert(inserts);
        }
      } else if (installmentPlan === "AVISTA") {
        // Update the single pending installment
        const { data: existingInsts } = await supabase.from("bill_installments")
          .select("id").eq("bill_id", billId).eq("is_deleted", false).eq("status", "PENDING");
        if (existingInsts && existingInsts.length > 0) {
          await supabase.from("bill_installments").update({
            due_date: firstDueDate, amount: totalAmount,
            payment_method: paymentMethod || null, account_id: accountId || null,
            description: description.trim(),
          }).eq("id", existingInsts[0].id);
        }
      }
      setSaving(false);
      toast.success("Despesa atualizada!");
      navigate(`/studies/${studyId}/bills`);
      return;
    }

    // Create new bill (or clone)
    const { data: newBill, error: billErr } = await supabase.from("bills").insert(billPayload).select("id").single();
    if (billErr || !newBill) { setSaving(false); toast.error("Erro ao salvar despesa."); return; }

    // Upload pending attachments
    if (pendingFiles.length > 0) {
      await uploadFilesToBill(newBill.id, pendingFiles);
      setPendingFiles([]);
    }

    if (installmentPlan === "AVISTA") {
      await supabase.from("bill_installments").insert({
        bill_id: newBill.id,
        study_id: studyId!,
        installment_number: 1,
        due_date: firstDueDate,
        amount: totalAmount,
        description: description.trim(),
        payment_method: paymentMethod || null,
        account_id: accountId || null,
        status: "PENDING",
      });
      setSaving(false);
      setAvistaConfirmOpen(true);
      (window as any).__lastBillId = newBill.id;
    } else {
      const inserts = installments.map((row, i) => ({
        bill_id: newBill.id,
        study_id: studyId!,
        installment_number: i + 1,
        due_date: row.due_date,
        amount: row.amount,
        description: row.description || null,
        payment_method: row.payment_method || null,
        account_id: row.account_id || null,
        status: "PENDING",
      }));
      await supabase.from("bill_installments").insert(inserts);
      setSaving(false);
      toast.success("Despesa criada!");
      navigate(`/studies/${studyId}/bills`);
    }
  };

  const handleAvistaConfirm = async (paid: boolean) => {
    const lastBillId = (window as any).__lastBillId;
    if (paid && lastBillId) {
      await supabase.from("bill_installments").update({ status: "PAID", paid_at: firstDueDate })
        .eq("bill_id", lastBillId).eq("status", "PENDING");
    }
    setAvistaConfirmOpen(false);
    toast.success("Despesa criada!");
    navigate(`/studies/${studyId}/bills`);
  };

  const pageTitle = isView ? "Visualizar Despesa" : isClone ? "Clonar Despesa" : isEdit ? "Editar Despesa" : "Nova Despesa";

  return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar />
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        <h1 className="text-xl font-bold">{pageTitle}</h1>

        {/* Block 1: Informações da Despesa */}
        <fieldset className="border rounded-lg p-4 space-y-4" disabled={isView}>
          <legend className="font-bold text-sm px-2">Informações da Despesa:</legend>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Fornecedor:</Label>
              <Select value={vendorId} onValueChange={handleVendorSelect} disabled={isView}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  <SelectItem value="__add">+ Adicionar Fornecedor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição:</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} maxLength={80} disabled={isView} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor Total:</Label>
              <MaskedNumberInput value={totalAmount} onValueChange={v => handleTotalAmountChange(v)} disabled={isView} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Centro de Custo:</Label>
              <Select value={costCenter} onValueChange={v => { setCostCenter(v); setCategory(""); }} disabled={isView}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {COST_CENTER_OPTIONS.map(cc => <SelectItem key={cc} value={cc}>{cc}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Categoria:</Label>
              <Select value={category} onValueChange={setCategory} disabled={isView || !costCenter}>
                <SelectTrigger><SelectValue placeholder={costCenter ? "Selecione..." : "Selecione o Centro de Custo primeiro"} /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </fieldset>

        {/* Block 2: Condição de Pagamento */}
        <fieldset className="border rounded-lg p-4 space-y-4" disabled={isView}>
          <legend className="font-bold text-sm px-2">Condição de Pagamento:</legend>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="space-y-1.5">
              <Label>Conta:</Label>
              <Select value={accountId} onValueChange={setAccountId} disabled={isView}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {banks.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Forma de Pagamento:</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod} disabled={isView}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Parcelamento:</Label>
              <Select value={installmentPlan} onValueChange={handlePlanChange} disabled={isView}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INSTALLMENT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {installmentPlan === "AVISTA" && (
              <div className="space-y-1.5">
                <Label>1° Vencimento:</Label>
                <Input type="date" value={firstDueDate} onChange={e => setFirstDueDate(e.target.value)} disabled={isView} />
              </div>
            )}
            {installmentPlan !== "AVISTA" && (
              <div className="space-y-1.5">
                <Label>Intervalo (dias):</Label>
                <Input
                  type="number"
                  min={1}
                  value={intervalDays === "" ? "" : intervalDays}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === "") {
                      setIntervalDays("");
                    } else {
                      const num = Number(val);
                      setIntervalDays(num);
                      if (num > 0) handleIntervalChange(num);
                    }
                  }}
                  onBlur={() => {
                    if (intervalDays === "" || intervalDays === 0) {
                      setIntervalDays(30);
                      handleIntervalChange(30);
                    }
                  }}
                  disabled={isView}
                />
              </div>
            )}
          </div>
        </fieldset>

        {/* Block 3: Parcelas */}
        {showInstallments && installments.length > 0 && (
          <fieldset className="border rounded-lg p-4 space-y-4" disabled={isView}>
            <legend className="font-bold text-sm px-2">Parcelas:</legend>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-1">#</th>
                    <th className="text-left py-2 px-1">Vencimento</th>
                    <th className="text-left py-2 px-1">Valor</th>
                    <th className="text-left py-2 px-1">Forma Pgto</th>
                    <th className="text-left py-2 px-1">Conta</th>
                    <th className="text-left py-2 px-1">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {installments.map((row, i) => {
                    const isPaid = row._status === "PAID";
                    const isRowDisabled = isView || isPaid;
                    return (
                    <tr key={row._key} className="border-b">
                      <td className="py-2 px-1 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 px-1">
                        <Input type="date" className="w-36" value={row.due_date}
                          onChange={e => handleInstallmentFieldChange(row._key, "due_date", e.target.value)}
                          disabled={isRowDisabled} />
                      </td>
                      <td className="py-2 px-1">
                        <MaskedNumberInput className="w-28" value={row.amount}
                          onValueChange={v => handleInstallmentAmountChange(row._key, v)}
                          disabled={isRowDisabled} />
                      </td>
                      <td className="py-2 px-1">
                        <Select value={row.payment_method} onValueChange={v => handleInstallmentFieldChange(row._key, "payment_method", v)} disabled={isRowDisabled}>
                          <SelectTrigger className="w-32"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-1">
                        <Select value={row.account_id} onValueChange={v => handleInstallmentFieldChange(row._key, "account_id", v)} disabled={isRowDisabled}>
                          <SelectTrigger className="w-32"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            {banks.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-1">
                        <div className="flex items-center gap-2">
                          <Input className="w-40" value={row.description}
                            onChange={e => handleInstallmentFieldChange(row._key, "description", e.target.value)}
                            disabled={isRowDisabled} />
                          {row._status && (
                            <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${isPaid ? "bg-[#dcfce7] text-[#166534]" : "bg-[#fef3c7] text-[#b45309]"}`}>
                              {isPaid ? "Pago" : "Pendente"}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </fieldset>
        )}

        {/* Block 4: Anotações */}
        <fieldset className="border rounded-lg p-4 space-y-2" disabled={isView}>
          <legend className="font-bold text-sm px-2">Anotações:</legend>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={5} maxLength={500} disabled={isView} />
        </fieldset>

        {/* Block 5: Anexos */}
        <fieldset className="border rounded-lg p-4 space-y-3">
          <legend className="font-bold text-sm px-2">Anexos:</legend>
          {!isView && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => { handleFileUpload(e.target.files); e.target.value = ""; }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                <Upload className="w-4 h-4 mr-1" /> {uploading ? "Enviando..." : "Adicionar Arquivo"}
              </Button>
            </div>
          )}
          {pendingFiles.length > 0 && (
            <div className="space-y-1">
              {pendingFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-sm bg-muted rounded px-2 py-1">
                  <Paperclip className="w-3 h-3" />
                  <span className="flex-1 truncate">{f.name}</span>
                  <span className="text-muted-foreground text-xs">(pendente)</span>
                  {!isView && (
                    <button onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))} className="text-destructive hover:text-destructive/80">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {attachments.length > 0 && (
            <div className="space-y-1">
              {attachments.map(doc => (
                <div key={doc.id} className="flex items-center gap-2 text-sm bg-muted rounded px-2 py-1">
                  <Paperclip className="w-3 h-3" />
                  <span className="flex-1 truncate">{doc.file_name}</span>
                  {doc.file_size && <span className="text-muted-foreground text-xs">{(doc.file_size / 1024).toFixed(0)} KB</span>}
                  <button onClick={() => handleDownloadAttachment(doc)} className="text-primary hover:text-primary/80">
                    <Download className="w-3 h-3" />
                  </button>
                  {!isView && (
                    <button onClick={() => handleDeleteAttachment(doc)} className="text-destructive hover:text-destructive/80">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {attachments.length === 0 && pendingFiles.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum anexo adicionado.</p>
          )}
        </fieldset>

        {/* Buttons */}
        <div className="flex gap-3">
          {isView ? (
            <>
              <Button onClick={() => navigate(`/studies/${studyId}/bills/${billId}?mode=edit`)}>Editar</Button>
              <Button variant="outline" onClick={() => navigate(`/studies/${studyId}/bills`)}>Voltar</Button>
            </>
          ) : (
            <>
              <Button onClick={saveBill} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
              <Button variant="outline" onClick={() => navigate(`/studies/${studyId}/bills`)}>Voltar</Button>
            </>
          )}
        </div>
      </div>

      {/* À vista confirmation */}
      <Dialog open={avistaConfirmOpen} onOpenChange={() => { }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Despesa à vista</DialogTitle></DialogHeader>
          <p className="text-sm">Essa despesa é à vista, já foi feito o pagamento?</p>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => handleAvistaConfirm(false)}>Não</Button>
            <Button onClick={() => handleAvistaConfirm(true)}>Sim</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Vendor Dialog */}
      <Dialog open={vendorDialogOpen} onOpenChange={setVendorDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Novo Fornecedor</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>CNPJ *</Label>
              <Input value={vendorForm.cnpj} onChange={e => setVendorForm(f => ({ ...f, cnpj: formatCNPJ(e.target.value) }))} placeholder="xx.xxx.xxx/xxxx-xx" maxLength={18} />
            </div>
            <div className="space-y-1.5 flex flex-col justify-end">
              <Button size="sm" variant="outline" onClick={lookupCNPJInDialog} disabled={lookingUpCnpj}>
                {lookingUpCnpj ? "Buscando..." : "Buscar CNPJ"}
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label>Razão Social *</Label>
              <Input value={vendorForm.razao_social} onChange={e => setVendorForm(f => ({ ...f, razao_social: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Nome Fantasia *</Label>
              <Input value={vendorForm.nome_fantasia} onChange={e => setVendorForm(f => ({ ...f, nome_fantasia: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria *</Label>
              <Input value={vendorForm.category} onChange={e => setVendorForm(f => ({ ...f, category: e.target.value }))} placeholder="Ex: Material, Mão de obra" />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone *</Label>
              <Input value={vendorForm.phone} onChange={e => setVendorForm(f => ({ ...f, phone: formatPhone(e.target.value) }))} placeholder="(xx)xxxxx-xxxx" maxLength={14} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>E-mail</Label>
              <Input type="email" value={vendorForm.email} onChange={e => setVendorForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Logradouro *</Label>
              <Input value={vendorForm.street} onChange={e => setVendorForm(f => ({ ...f, street: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Número *</Label>
              <Input value={vendorForm.street_number} onChange={e => setVendorForm(f => ({ ...f, street_number: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Complemento</Label>
              <Input value={vendorForm.complement} onChange={e => setVendorForm(f => ({ ...f, complement: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Bairro *</Label>
              <Input value={vendorForm.neighborhood} onChange={e => setVendorForm(f => ({ ...f, neighborhood: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Cidade *</Label>
              <Input value={vendorForm.city} onChange={e => setVendorForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>UF *</Label>
              <Input value={vendorForm.state} onChange={e => setVendorForm(f => ({ ...f, state: e.target.value }))} maxLength={2} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Observações</Label>
              <Textarea value={vendorForm.notes} onChange={e => setVendorForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVendorDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveNewVendor} disabled={savingVendor}>{savingVendor ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
