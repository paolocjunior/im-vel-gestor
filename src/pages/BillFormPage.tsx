import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
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

interface InstallmentRow {
  _key: number;
  due_date: string;
  amount: number;
  payment_method: string;
  account_id: string;
  description: string;
  _frozen: boolean; // user manually edited amount
  // existing DB id (for edit mode)
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
  const mode = searchParams.get("mode") || "create"; // create | edit | view | clone
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
  const [intervalDays, setIntervalDays] = useState(30);
  const [notes, setNotes] = useState("");

  // Installment rows (for 1x..60x)
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [showInstallments, setShowInstallments] = useState(false);

  // À vista payment dialog
  const [avistaConfirmOpen, setAvistaConfirmOpen] = useState(false);

  // Clone change detection
  const [originalSnapshot, setOriginalSnapshot] = useState("");

  const categoryOptions = costCenter && COST_CENTERS[costCenter] ? COST_CENTERS[costCenter] : [];

  useEffect(() => {
    if (user && studyId) { loadVendors(); loadBanks(); }
  }, [user, studyId]);

  useEffect(() => {
    if (user && !isNew) loadBill();
  }, [user, billId]);

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

    // Load installments
    const { data: insts } = await supabase.from("bill_installments")
      .select("*").eq("bill_id", billId).eq("is_deleted", false)
      .order("installment_number");

    if (bill.installment_plan !== "AVISTA") {
      const rows: InstallmentRow[] = (insts || [])
        .filter(i => isEdit ? i.status !== "PAID" : true) // edit: only pending
        .map(i => ({
          _key: nk(),
          due_date: i.due_date,
          amount: Number(i.amount),
          payment_method: i.payment_method || "",
          account_id: i.account_id || "",
          description: i.description || "",
          _frozen: false,
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
    } else {
      generateInstallments(plan, totalAmount, intervalDays, firstDueDate || todayISO(), paymentMethod, accountId, description);
    }
  };

  const handleIntervalChange = (newInterval: number) => {
    setIntervalDays(newInterval);
    if (installmentPlan !== "AVISTA" && installments.length > 0) {
      // Recalculate all due dates based on new interval
      const baseDate = firstDueDate || todayISO();
      setInstallments(prev => prev.map((row, i) => ({
        ...row,
        due_date: addDaysISO(baseDate, newInterval * (i + 1)),
      })));
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
    const frozenSum = rows.filter(r => r._frozen).reduce((s, r) => new Decimal(s).plus(r.amount).toNumber(), 0);
    const unfrozenCount = rows.filter(r => !r._frozen).length;
    if (unfrozenCount === 0) return;
    const remaining = new Decimal(total).minus(frozenSum);
    const perUnfrozen = remaining.div(unfrozenCount).toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber();

    let distributed = new Decimal(0);
    let lastUnfrozenIdx = -1;
    const updated = rows.map((row, i) => {
      if (row._frozen) {
        distributed = distributed.plus(row.amount);
        return row;
      }
      lastUnfrozenIdx = i;
      distributed = distributed.plus(perUnfrozen);
      return { ...row, amount: perUnfrozen };
    });

    // Adjust last unfrozen for rounding
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

  // === Save ===
  const saveBill = async () => {
    if (!description.trim()) { toast.error("Descrição é obrigatória."); return; }
    if (totalAmount <= 0) { toast.error("Valor total deve ser maior que zero."); return; }

    // Validate installment sum
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
      interval_days: intervalDays,
      notes: notes || null,
    };

    if (isEdit && billId) {
      // Update bill
      await supabase.from("bills").update(billPayload).eq("id", billId);
      // Update pending installments
      if (showInstallments) {
        for (const row of installments) {
          const instPayload = {
            due_date: row.due_date,
            amount: row.amount,
            payment_method: row.payment_method || null,
            account_id: row.account_id || null,
            description: row.description || null,
          };
          if (row._dbId) {
            await supabase.from("bill_installments").update(instPayload).eq("id", row._dbId);
          }
        }
      } else if (installmentPlan === "AVISTA") {
        // Update the single installment
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

    if (installmentPlan === "AVISTA") {
      // Single installment
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
      // Ask if already paid
      setAvistaConfirmOpen(true);
      // Store the bill id for the confirm handler
      (window as any).__lastBillId = newBill.id;
    } else {
      // Multiple installments
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
              <Select value={vendorId} onValueChange={setVendorId} disabled={isView}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  <SelectItem value="__add">+ Adicionar Fornecedor</SelectItem>
                </SelectContent>
              </Select>
              {vendorId === "__add" && (() => { navigate(`/studies/${studyId}/vendors`); return null; })()}
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
                <Input type="number" min={1} value={intervalDays} onChange={e => handleIntervalChange(Number(e.target.value) || 1)} disabled={isView} />
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
                  {installments.map((row, i) => (
                    <tr key={row._key} className="border-b">
                      <td className="py-2 px-1 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 px-1">
                        <Input type="date" className="w-36" value={row.due_date}
                          onChange={e => handleInstallmentFieldChange(row._key, "due_date", e.target.value)}
                          disabled={isView} />
                      </td>
                      <td className="py-2 px-1">
                        <MaskedNumberInput className="w-28" value={row.amount}
                          onValueChange={v => handleInstallmentAmountChange(row._key, v)}
                          disabled={isView} />
                      </td>
                      <td className="py-2 px-1">
                        <Select value={row.payment_method} onValueChange={v => handleInstallmentFieldChange(row._key, "payment_method", v)} disabled={isView}>
                          <SelectTrigger className="w-32"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-1">
                        <Select value={row.account_id} onValueChange={v => handleInstallmentFieldChange(row._key, "account_id", v)} disabled={isView}>
                          <SelectTrigger className="w-32"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>
                            {banks.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2 px-1">
                        <Input className="w-40" value={row.description}
                          onChange={e => handleInstallmentFieldChange(row._key, "description", e.target.value)}
                          disabled={isView} />
                      </td>
                    </tr>
                  ))}
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
        <fieldset className="border rounded-lg p-4 space-y-2">
          <legend className="font-bold text-sm px-2">Anexos:</legend>
          <p className="text-sm text-muted-foreground">
            Funcionalidade de anexos em breve.
          </p>
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
              <Button onClick={saveBill} disabled={saving}>{saving ? "Salvando..." : "Salvar e Voltar"}</Button>
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
    </div>
  );
}
