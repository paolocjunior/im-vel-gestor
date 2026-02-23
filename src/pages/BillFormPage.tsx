import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Paperclip, Upload, X, Download, ZoomIn, ZoomOut } from "lucide-react";
import PdfPreview from "@/components/PdfPreview";
import { MonthRangePicker } from "@/components/MonthRangePicker";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import UnsavedChangesDialog from "@/components/UnsavedChangesDialog";
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
  COST_CENTERS, PAYMENT_METHODS,
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
  const fromParam = searchParams.get("from") || "";
  const billsListUrl = `/studies/${studyId}/bills${fromParam ? `?from=${fromParam}` : ""}`;
  const isView = mode === "view";
  const isClone = mode === "clone";
  const isEdit = mode === "edit";
  const isNew = !billId || billId === "new";

  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [banks, setBanks] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  // Dynamic cost centers from DB
  const [dbCostCenters, setDbCostCenters] = useState<{ id: string; name: string; categories: string[] }[]>([]);
  const sortWithOutrosLast = (items: string[]) => {
    const outros = items.filter(i => i.toLowerCase() === "outros");
    const rest = items.filter(i => i.toLowerCase() !== "outros").sort((a, b) => a.localeCompare(b, "pt-BR"));
    return [...rest, ...outros];
  };
  const costCenterOptions = sortWithOutrosLast(dbCostCenters.length > 0 ? dbCostCenters.map(cc => cc.name) : Object.keys(COST_CENTERS));

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

  // Bill type: compras or recorrente
  const [billType, setBillType] = useState("");
  const [recurrence, setRecurrence] = useState("");
  const [recurrenceDay, setRecurrenceDay] = useState(1);
  const [recurrencePeriod, setRecurrencePeriod] = useState<{start: {year: number; month: number}; end: {year: number; month: number}} | null>(null);

  // Installment rows
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [showInstallments, setShowInstallments] = useState(false);

  // À vista payment dialog
  const [avistaConfirmOpen, setAvistaConfirmOpen] = useState(false);

  // Attachment preview
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewName, setPreviewName] = useState("");
  const [previewType, setPreviewType] = useState("");
  const [imgZoom, setImgZoom] = useState(1);

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

  // Add cost center dialog
  const [addCCDialogOpen, setAddCCDialogOpen] = useState(false);
  const [newCCName, setNewCCName] = useState("");
  const [savingCC, setSavingCC] = useState(false);

  // Add category dialog
  const [addCatDialogOpen, setAddCatDialogOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [savingCat, setSavingCat] = useState(false);

  const effectiveBillId = (isNew || isClone) ? null : billId;

  const categoryOptions = useMemo(() => {
    if (!costCenter) return [];
    const dbCC = dbCostCenters.find(cc => cc.name === costCenter);
    const raw = dbCC ? dbCC.categories : (COST_CENTERS[costCenter] || []);
    return sortWithOutrosLast(raw);
  }, [costCenter, dbCostCenters]);

  // Unsaved changes tracking
  const [initialFormData, setInitialFormData] = useState<any>(null);
  const currentFormData = useMemo(() => ({
    vendorId, description, totalAmount, costCenter, category, accountId,
    paymentMethod, installmentPlan, firstDueDate, intervalDays, notes,
    installments: installments.map(i => ({ due_date: i.due_date, amount: i.amount, payment_method: i.payment_method, account_id: i.account_id, description: i.description })),
  }), [vendorId, description, totalAmount, costCenter, category, accountId, paymentMethod, installmentPlan, firstDueDate, intervalDays, notes, installments]);

  const { guardedNavigate, showDialog, onStay, onLeave, markSaved } = useUnsavedChanges(
    isView ? currentFormData : initialFormData,
    currentFormData
  );

  // Load cost centers from DB
  const loadCostCenters = async () => {
    const { data: ccData } = await supabase.from("user_cost_centers")
      .select("id, name")
      .eq("user_id", user!.id)
      .eq("is_active", true)
      .order("name");
    const { data: catData } = await supabase.from("user_categories")
      .select("id, cost_center_id, name")
      .eq("user_id", user!.id)
      .eq("is_active", true)
      .order("name");
    const ccs = ((ccData as any[]) || []).map((cc: any) => ({
      id: cc.id,
      name: cc.name,
      categories: ((catData as any[]) || []).filter((cat: any) => cat.cost_center_id === cc.id).map((cat: any) => cat.name),
    }));
    setDbCostCenters(ccs);
  };

  const saveNewCostCenter = async () => {
    if (!newCCName.trim()) { toast.error("Nome é obrigatório."); return; }
    setSavingCC(true);
    const { error } = await supabase.from("user_cost_centers").insert({ name: newCCName.trim(), user_id: user!.id });
    setSavingCC(false);
    if (error) { toast.error("Erro ao criar centro de custo."); return; }
    await loadCostCenters();
    setCostCenter(newCCName.trim());
    setCategory("");
    setAddCCDialogOpen(false);
    toast.success("Centro de custo criado!");
  };

  const saveNewCategory = async () => {
    if (!newCatName.trim()) { toast.error("Nome é obrigatório."); return; }
    const cc = dbCostCenters.find(c => c.name === costCenter);
    if (!cc) { toast.error("Centro de custo não encontrado."); return; }
    setSavingCat(true);
    const { error } = await supabase.from("user_categories").insert({ name: newCatName.trim(), cost_center_id: cc.id, user_id: user!.id });
    setSavingCat(false);
    if (error) { toast.error("Erro ao criar categoria."); return; }
    await loadCostCenters();
    setCategory(newCatName.trim());
    setAddCatDialogOpen(false);
    toast.success("Categoria criada!");
  };

  useEffect(() => {
    if (user && studyId) { loadVendors(); loadBanks(); loadCostCenters(); }
  }, [user?.id, studyId]);

  const STORAGE_KEY = `bill_form_draft_${studyId}`;

  // Stage ID for taxas linking
  const [stageId, setStageId] = useState<string | null>(null);

  // Whether this bill is linked to a taxas stage (locks type/plan)
  const isFromTaxasStage = !!stageId || !!searchParams.get("stageId");

  // Pre-fill from URL params (e.g. coming from Medição/Execução for Taxas)
  useEffect(() => {
    if (isNew && !isClone) {
      const prefillDesc = searchParams.get("stageName");
      const prefillAmount = searchParams.get("amount");
      const prefillStageId = searchParams.get("stageId");
      if (prefillDesc) setDescription(decodeURIComponent(prefillDesc));
      if (prefillAmount) setTotalAmount(Number(prefillAmount) || 0);
      if (prefillStageId) {
        setStageId(prefillStageId);
        // Auto-lock to non-recurring à vista for taxas
        setBillType("compras");
        setInstallmentPlan("AVISTA");
      }
    }
  }, []);

  // Set initial snapshot for new bills
  useEffect(() => {
    if (isNew && !isClone && initialFormData === null) {
      const prefillDesc = searchParams.get("stageName");
      const prefillAmount = searchParams.get("amount");
      setInitialFormData({
        vendorId: "", description: prefillDesc ? decodeURIComponent(prefillDesc) : "", 
        totalAmount: prefillAmount ? (Number(prefillAmount) || 0) : 0, costCenter: "", category: "",
        accountId: "", paymentMethod: "", installmentPlan: "AVISTA",
        firstDueDate: todayISO(), intervalDays: 30, notes: "", installments: [],
      });
    }
  }, [isNew, isClone, initialFormData]);

  useEffect(() => {
    if (user && !isNew) loadBill();
  }, [user?.id, billId]);

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
    let successCount = 0;
    let failCount = 0;
    for (const file of Array.from(files)) {
      const ok = await uploadSingleFile(targetBillId, file);
      if (ok) successCount++; else failCount++;
    }
    setUploading(false);
    await loadAttachments();
    if (successCount > 0) toast.success(`${successCount} arquivo(s) anexado(s)!`);
    if (failCount > 0) toast.error(`${failCount} arquivo(s) falharam.`);
  };

  const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

  const uploadSingleFile = async (targetBillId: string, file: File): Promise<boolean> => {
    const safeName = sanitizeFileName(file.name);
    const path = `${studyId}/${targetBillId}/${Date.now()}_${safeName}`;
    const { error: uploadErr } = await supabase.storage.from("documents").upload(path, file);
    if (uploadErr) { toast.error(`Erro ao enviar ${file.name}: ${uploadErr.message}`, { duration: 10000 }); console.error("Upload error:", uploadErr); return false; }
    const { error: insertErr } = await supabase.from("documents").insert({
      study_id: studyId!,
      entity: "bill",
      entity_id: targetBillId,
      file_name: file.name,
      file_path: path,
      file_size: file.size,
      mime_type: file.type || null,
    });
    if (insertErr) { toast.error(`Erro ao registrar ${file.name}: ${insertErr.message}`, { duration: 10000 }); console.error("Insert error:", insertErr); return false; }
    return true;
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

  const handlePreviewAttachment = async (doc: typeof attachments[0]) => {
    const { data } = await supabase.storage.from("documents").download(doc.file_path);
    if (!data) { toast.error("Erro ao carregar arquivo."); return; }
    const url = URL.createObjectURL(data);
    setPreviewUrl(url);
    setPreviewName(doc.file_name);
    setPreviewType(data.type || "");
    setPreviewOpen(true);
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
    if (!bill) { navigate(billsListUrl); return; }

    setVendorId(bill.vendor_id || "");
    setStageId((bill as any).stage_id || null);
    setDescription(bill.description);
    setTotalAmount(Number(bill.total_amount));
    setCostCenter(bill.cost_center || "");
    setCategory(bill.category || "");
    setAccountId(bill.account_id || "");
    setPaymentMethod(bill.payment_method || "");
    setInstallmentPlan(bill.installment_plan);
    if (bill.installment_plan === "RECORRENTE") setBillType("recorrente");
    else setBillType("compras");
    // If linked to a stage, lock stageId
    if ((bill as any).stage_id) setStageId((bill as any).stage_id);
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

    // Set initial snapshot for edit/clone
    const loadedInstallments = (insts || []).filter(i => bill.installment_plan !== "AVISTA").map(i => ({
      due_date: i.due_date, amount: Number(i.amount), payment_method: i.payment_method || "",
      account_id: i.account_id || "", description: i.description || "",
    }));
    setInitialFormData({
      vendorId: bill.vendor_id || "", description: bill.description, totalAmount: Number(bill.total_amount),
      costCenter: bill.cost_center || "", category: bill.category || "", accountId: bill.account_id || "",
      paymentMethod: bill.payment_method || "", installmentPlan: bill.installment_plan,
      firstDueDate: bill.first_due_date || todayISO(), intervalDays: bill.interval_days || 30,
      notes: bill.notes || "", installments: loadedInstallments,
    });
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

  // Recurrence installment generation
  useEffect(() => {
    if (billType === "recorrente" && recurrence && recurrenceDay && recurrencePeriod) {
      const { start, end } = recurrencePeriod;
      const dates: string[] = [];
      if (recurrence === "Mensal") {
        let y = start.year, m = start.month;
        while (y < end.year || (y === end.year && m <= end.month)) {
          const lastDay = new Date(y, m, 0).getDate();
          const day = Math.min(recurrenceDay, lastDay);
          dates.push(`${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
          m++; if (m > 12) { m = 1; y++; }
        }
      } else {
        const iv = recurrence === "Quinzenal" ? 15 : 7;
        const firstLastDay = new Date(start.year, start.month, 0).getDate();
        const firstDay = Math.min(recurrenceDay, firstLastDay);
        let current = new Date(start.year, start.month - 1, firstDay);
        const endLastDay = new Date(end.year, end.month, 0).getDate();
        const endDate = new Date(end.year, end.month - 1, endLastDay);
        while (current <= endDate) {
          dates.push(current.toISOString().slice(0, 10));
          current = new Date(current);
          current.setDate(current.getDate() + iv);
        }
      }
      setInstallments(dates.map(d => ({
        _key: nk(), due_date: d, amount: totalAmount, payment_method: paymentMethod,
        account_id: accountId, description: description, _frozen: false,
      })));
      setShowInstallments(dates.length > 0);
    } else if (billType === "recorrente") {
      setInstallments([]);
      setShowInstallments(false);
    }
  }, [billType, recurrence, recurrenceDay, recurrencePeriod]);

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
        if (row._status === "PAID") return row;
        return { ...row, due_date: addDaysISO(baseDate, newInterval * (i + 1)) };
      }));
    }
  };

  const handleFirstDueDateChange = (newDate: string) => {
    setFirstDueDate(newDate);
    if (installmentPlan !== "AVISTA" && installments.length > 0 && newDate) {
      const interval = typeof intervalDays === "number" ? intervalDays : 30;
      setInstallments(prev => prev.map((row, i) => {
        if (row._status === "PAID") return row;
        return { ...row, due_date: addDaysISO(newDate, interval * (i + 1)) };
      }));
    }
  };

  const handleTotalAmountChange = (newTotal: number) => {
    setTotalAmount(newTotal);
    if (billType === "recorrente" && installments.length > 0) {
      setInstallments(prev => prev.map(r => r._frozen ? r : { ...r, amount: newTotal }));
    } else if (installmentPlan !== "AVISTA" && installments.length > 0) {
      redistributeAmounts(installments, newTotal);
    }
  };

  // Sync payment method changes to unfrozen installments
  const handlePaymentMethodChange = (newPM: string) => {
    setPaymentMethod(newPM);
    if (installments.length > 0) {
      setInstallments(prev => prev.map(r => r._frozen || r._status === "PAID" ? r : { ...r, payment_method: newPM }));
    }
  };

  // Sync account changes to unfrozen installments
  const handleAccountChange = (newAcc: string) => {
    setAccountId(newAcc);
    if (installments.length > 0) {
      setInstallments(prev => prev.map(r => r._frozen || r._status === "PAID" ? r : { ...r, account_id: newAcc }));
    }
  };

  // Sync description changes to unfrozen installments
  const handleDescriptionChange = (newDesc: string) => {
    setDescription(newDesc);
    if (installments.length > 0) {
      if (billType === "recorrente") {
        setInstallments(prev => prev.map(r => r._frozen || r._status === "PAID" ? r : { ...r, description: newDesc }));
      } else {
        const count = installments.length;
        setInstallments(prev => prev.map((r, i) => r._frozen || r._status === "PAID" ? r : { ...r, description: `${newDesc} ${i + 1}/${count}` }));
      }
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
    if (billType === "recorrente") {
      setInstallments(prev => prev.map(r => r._key === key ? { ...r, amount: newAmount } : r));
    } else {
      const updated = installments.map(r => r._key === key ? { ...r, amount: newAmount, _frozen: true } : r);
      redistributeAmounts(updated, totalAmount);
    }
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

  // Sync bill data back to construction stage (for taxas)
  const syncBillToStage = async (sId: string, amount: number, dueDate: string) => {
    await supabase.from("construction_stages" as any).update({
      total_value: amount,
      start_date: dueDate || null,
    }).eq("id", sId);
  };

  // === Save ===
  const saveBill = async () => {
    // Fornecedor is optional (e.g. government taxes without a visible CNPJ)
    if (!description.trim()) { toast.error("Descrição é obrigatória."); return; }
    if (totalAmount <= 0) { toast.error("Valor total deve ser maior que zero."); return; }
    if (!costCenter) { toast.error("Centro de Custo é obrigatório."); return; }
    if (!category) { toast.error("Categoria é obrigatória."); return; }

    // Validate installment sum (only for compras, not recorrente)
    if (billType !== "recorrente" && showInstallments && installments.length > 0) {
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
    const effectivePlan = billType === "recorrente" ? "RECORRENTE" : installmentPlan;

    const billPayload: any = {
      study_id: studyId!,
      vendor_id: vendorId || null,
      description: description.trim(),
      total_amount: totalAmount,
      cost_center: costCenter || null,
      category: category || null,
      account_id: accountId || null,
      payment_method: paymentMethod || null,
      installment_plan: effectivePlan,
      first_due_date: effectivePlan === "AVISTA" ? firstDueDate : null,
      interval_days: effectiveInterval,
      notes: notes || null,
      stage_id: stageId || null,
    };

    if (isEdit && billId) {
      // Update bill
      await supabase.from("bills").update(billPayload).eq("id", billId);

      // Sync value and date back to linked construction stage (taxas)
      if (stageId) {
        await syncBillToStage(stageId, totalAmount, firstDueDate);
      }

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
      } else if (effectivePlan === "AVISTA") {
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
      markSaved();
      sessionStorage.removeItem(STORAGE_KEY);
      navigate(billsListUrl);
      return;
    }

    // Create new bill (or clone)
    const { data: newBill, error: billErr } = await supabase.from("bills").insert(billPayload).select("id").single();
    if (billErr || !newBill) { setSaving(false); toast.error("Erro ao salvar despesa."); return; }

    // Sync value and date back to linked construction stage (taxas)
    if (stageId) {
      await syncBillToStage(stageId, totalAmount, firstDueDate);
    }

    // Upload pending attachments
    if (pendingFiles.length > 0) {
      for (const file of pendingFiles) {
        await uploadSingleFile(newBill.id, file);
      }
      setPendingFiles([]);
    }

    if (effectivePlan === "AVISTA") {
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
      // If from taxas stage, skip the "já pagou?" dialog
      if (isFromTaxasStage) {
        toast.success("Despesa criada!");
        markSaved();
        sessionStorage.removeItem(STORAGE_KEY);
        navigate(billsListUrl);
      } else {
        setAvistaConfirmOpen(true);
        (window as any).__lastBillId = newBill.id;
      }
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
      markSaved();
      sessionStorage.removeItem(STORAGE_KEY);
      navigate(billsListUrl);
    }
  };

  const handleAvistaConfirm = async (paid: boolean) => {
    const lastBillId = (window as any).__lastBillId;
    if (paid && lastBillId) {
      await supabase.from("bill_installments").update({ status: "PAID", paid_at: firstDueDate })
        .eq("bill_id", lastBillId).eq("status", "PENDING");
      // If linked to a taxas stage, update status to pago
      if (stageId) {
        await supabase.from("construction_stages" as any).update({
          status: "pago",
          actual_start_date: firstDueDate,
          actual_end_date: firstDueDate,
        }).eq("id", stageId);
      }
    }
    setAvistaConfirmOpen(false);
    toast.success("Despesa criada!");
    markSaved();
    sessionStorage.removeItem(STORAGE_KEY);
    navigate(billsListUrl);
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
              <Input value={description} onChange={e => handleDescriptionChange(e.target.value)} maxLength={80} disabled={isView} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor Total:</Label>
              <MaskedNumberInput value={totalAmount} onValueChange={v => handleTotalAmountChange(v)} disabled={isView} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Centro de Custo:</Label>
              <Select value={costCenter} onValueChange={v => {
                if (v === "__add_cc") { setNewCCName(""); setAddCCDialogOpen(true); return; }
                setCostCenter(v); setCategory("");
              }} disabled={isView}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {costCenterOptions.map(cc => <SelectItem key={cc} value={cc}>{cc}</SelectItem>)}
                  <SelectItem value="__add_cc">+ Adicionar Centro de Custo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Categoria:</Label>
              <Select value={category} onValueChange={v => {
                if (v === "__add_cat") { setNewCatName(""); setAddCatDialogOpen(true); return; }
                setCategory(v);
              }} disabled={isView || !costCenter}>
                <SelectTrigger><SelectValue placeholder={costCenter ? "Selecione..." : "Selecione o Centro de Custo primeiro"} /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  {costCenter && <SelectItem value="__add_cat">+ Adicionar Categoria</SelectItem>}
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
              <Label>Tipo:</Label>
              <Select value={billType} onValueChange={v => {
                setBillType(v);
                if (v === "compras") {
                  setRecurrence(""); setRecurrenceDay(1); setRecurrencePeriod(null);
                  setInstallments([]); setShowInstallments(false);
                } else if (v === "recorrente") {
                  setInstallmentPlan("AVISTA");
                  setInstallments([]); setShowInstallments(false);
                }
              }} disabled={isView || isFromTaxasStage}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="compras">Não Recorrente</SelectItem>
                  <SelectItem value="recorrente">Recorrente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {billType === "recorrente" ? (
              <>
                <div className="space-y-1.5">
                  <Label>Recorrência:</Label>
                  <Select value={recurrence} onValueChange={setRecurrence} disabled={isView}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Semanal">Semanal</SelectItem>
                      <SelectItem value="Quinzenal">Quinzenal</SelectItem>
                      <SelectItem value="Mensal">Mensal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Dia do Venc.:</Label>
                  <Select value={String(recurrenceDay)} onValueChange={v => setRecurrenceDay(Number(v))} disabled={isView}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 31 }, (_, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Período:</Label>
                  <MonthRangePicker value={recurrencePeriod} onChange={setRecurrencePeriod} disabled={isView} />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Parcelamento:</Label>
                  <Select value={installmentPlan} onValueChange={handlePlanChange} disabled={isView || !billType || isFromTaxasStage}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INSTALLMENT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>1° Vencimento:</Label>
                  <Input type="date" value={firstDueDate} onChange={e => handleFirstDueDateChange(e.target.value)} disabled={isView || !billType} />
                </div>
                {installmentPlan !== "AVISTA" && billType === "compras" && (
                  <div className="space-y-1.5">
                    <Label>Intervalo (dias):</Label>
                    <Input
                      type="number"
                      min={1}
                      value={intervalDays === "" ? "" : intervalDays}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === "") { setIntervalDays(""); }
                        else { const num = Number(val); setIntervalDays(num); if (num > 0) handleIntervalChange(num); }
                      }}
                      onBlur={() => { if (intervalDays === "" || intervalDays === 0) { setIntervalDays(30); handleIntervalChange(30); } }}
                      disabled={isView}
                    />
                  </div>
                )}
              </>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="space-y-1.5">
              <Label>Conta:</Label>
              <Select value={accountId} onValueChange={handleAccountChange} disabled={isView}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {banks.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Forma de Pagamento:</Label>
              <Select value={paymentMethod} onValueChange={handlePaymentMethodChange} disabled={isView}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </fieldset>

        {/* Block 3: Parcelas */}
        {showInstallments && installments.length > 0 && (
          <fieldset className="border rounded-lg p-4 space-y-4" disabled={isView}>
            <legend className="font-bold text-sm px-2">{billType === "recorrente" ? "Vencimentos:" : "Parcelas:"}</legend>
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
                  <span
                    className="flex-1 truncate cursor-pointer hover:underline"
                    onClick={() => handlePreviewAttachment(doc)}
                    title="Clique para visualizar"
                  >
                    {doc.file_name}
                  </span>
                  {doc.file_size && <span className="text-muted-foreground text-xs">{(doc.file_size / 1024).toFixed(0)} KB</span>}
                  <button onClick={() => handleDownloadAttachment(doc)} className="text-primary hover:text-primary/80" title="Download">
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

        {/* Attachment Preview Dialog */}
        <Dialog open={previewOpen} onOpenChange={() => { setPreviewOpen(false); if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(""); setImgZoom(1); }}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{previewName}</DialogTitle></DialogHeader>
            {previewType.startsWith("image/") ? (
              <div className="flex flex-col items-center gap-3">
                <div className="overflow-auto max-h-[65vh] max-w-full">
                  <img src={previewUrl} alt={previewName} className="object-contain mx-auto transition-transform" style={{ transform: `scale(${imgZoom})`, transformOrigin: "center center" }} />
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => setImgZoom(z => Math.max(0.25, z - 0.25))}><ZoomOut className="w-4 h-4" /></Button>
                  <span className="text-sm text-muted-foreground w-16 text-center">{Math.round(imgZoom * 100)}%</span>
                  <Button variant="outline" size="icon" onClick={() => setImgZoom(z => Math.min(4, z + 0.25))}><ZoomIn className="w-4 h-4" /></Button>
                  <Button variant="outline" size="sm" onClick={() => setImgZoom(1)}>Reset</Button>
                </div>
              </div>
            ) : previewType === "application/pdf" ? (
              <PdfPreview fileUrl={previewUrl} fileName={previewName} />
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">Visualização não disponível para este tipo de arquivo. Use o botão de download.</p>
            )}
          </DialogContent>
        </Dialog>

        {/* Buttons */}
        <div className="flex gap-3">
          {isView ? (
            <>
              <Button onClick={() => navigate(`/studies/${studyId}/bills/${billId}?mode=edit${fromParam ? `&from=${fromParam}` : ""}`)}>Editar</Button>
              <Button variant="outline" onClick={() => navigate(billsListUrl)}>Voltar</Button>
            </>
          ) : (
            <>
              <Button onClick={saveBill} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
              <Button variant="outline" onClick={() => guardedNavigate(billsListUrl)}>Voltar</Button>
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

      {/* Add Cost Center Dialog */}
      <Dialog open={addCCDialogOpen} onOpenChange={setAddCCDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Novo Centro de Custo</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={newCCName} onChange={e => setNewCCName(e.target.value)} placeholder="Ex: Obra, Marketing" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCCDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveNewCostCenter} disabled={savingCC}>{savingCC ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Category Dialog */}
      <Dialog open={addCatDialogOpen} onOpenChange={setAddCatDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Nova Categoria</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Centro de Custo: <strong>{costCenter}</strong></p>
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Ex: Ferramentas, Pintura" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCatDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveNewCategory} disabled={savingCat}>{savingCat ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UnsavedChangesDialog open={showDialog} onStay={onStay} onLeave={onLeave} />
    </div>
  );
}
