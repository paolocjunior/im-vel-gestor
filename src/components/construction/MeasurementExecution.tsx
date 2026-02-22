import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, CalendarIcon, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRNumber } from "@/components/ui/masked-number-input";
import { formatCPFCNPJ, formatPhone, validateCPF, validateCNPJ } from "@/lib/cnpjLookup";
import { toast } from "sonner";
import { PAYMENT_METHODS, todayISO } from "@/lib/billConstants";

interface StageRow {
  id: string;
  parent_id: string | null;
  code: string;
  name: string;
  level: number;
  position: number;
  unit_id: string | null;
  quantity: number;
  unit_price: number;
  total_value: number;
  start_date: string | null;
  end_date: string | null;
  stage_type: string | null;
  dependency_id: string | null;
  status: string;
}

interface UnitItem {
  id: string;
  name: string;
  abbreviation: string;
  has_decimals: boolean;
}

interface Props {
  studyId: string;
}

function formatDateShort(d: string | null) {
  if (!d) return "";
  const date = new Date(d + "T12:00:00");
  const day = String(date.getDate()).padStart(2, "0");
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${day}/${months[date.getMonth()]}`;
}

function getStageTypeLabel(type: string | null): string {
  switch (type) {
    case 'servico': return 'Serviço';
    case 'mao_de_obra': return 'Mão de Obra';
    case 'material': return 'Material';
    case 'taxas': return 'Taxas';
    default: return '—';
  }
}

function getStageColor(rootIndex: number, subIndex: number): string {
  const goldenAngle = 137.508;
  const hue = (rootIndex * goldenAngle) % 360;
  const saturation = 28;
  const lightness = subIndex < 0 ? 86 : Math.min(93, 89 + subIndex * 1.5);
  return `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`;
}

function getStageColorDark(rootIndex: number, subIndex: number): string {
  const goldenAngle = 137.508;
  const hue = (rootIndex * goldenAngle) % 360;
  const saturation = 25;
  const lightness = subIndex < 0 ? 14 : Math.max(10, 20 - subIndex * 1.5);
  return `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`;
}

const getStatusBg = (status: string) => {
  switch (status) {
    case "stopped": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    case "in_progress": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    case "finished": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case "orcamento": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "pedido": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
    case "recebido": return "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300";
    case "utilizado": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    case "em_aberto": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    case "pago": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
    default: return "bg-muted text-muted-foreground";
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case "stopped": return "Parado";
    case "in_progress": return "Em andamento";
    case "finished": return "Finalizado";
    case "orcamento": return "Orçamento";
    case "pedido": return "Pedido";
    case "recebido": return "Recebido";
    case "utilizado": return "Utilizado";
    case "em_aberto": return "Em Aberto";
    case "pago": return "Pago";
    default: return "—";
  }
};

export default function MeasurementExecution({ studyId }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stages, setStages] = useState<StageRow[]>([]);
  const [units, setUnits] = useState<UnitItem[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [selectedStageIds, setSelectedStageIds] = useState<Set<string>>(new Set());
  const [filterApplied, setFilterApplied] = useState(false);
  const isDark = document.documentElement.classList.contains("dark");

  // Payment dialog state
  const [payStage, setPayStage] = useState<StageRow | null>(null);
  const [payAccount, setPayAccount] = useState("");
  const [payMethod, setPayMethod] = useState("");
  const [payDate, setPayDate] = useState(todayISO());
  const [banks, setBanks] = useState<{ id: string; name: string }[]>([]);
  const [payingLoading, setPayingLoading] = useState(false);

  // Mão de Obra measurement dialog state
  const [moStage, setMoStage] = useState<StageRow | null>(null);
  const [moHours, setMoHours] = useState("");
  const [moDate, setMoDate] = useState(todayISO());
  const [moProviderId, setMoProviderId] = useState("");
  const [moNotes, setMoNotes] = useState("");
  const [moSaving, setMoSaving] = useState(false);
  const [moRealizado, setMoRealizado] = useState(0);
  const [providers, setProviders] = useState<{ id: string; full_name: string }[]>([]);
  const [actionKey, setActionKey] = useState(0); // forces Select re-render to reset to placeholder

  // Inline provider creation modal state
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [newProviderName, setNewProviderName] = useState("");
  const [newProviderType, setNewProviderType] = useState("PF");
  const [newProviderCpfCnpj, setNewProviderCpfCnpj] = useState("");
  const [newProviderPhone, setNewProviderPhone] = useState("");
  const [savingProvider, setSavingProvider] = useState(false);

  const fetchProviders = useCallback(async () => {
    const { data } = await supabase.from("study_providers")
      .select("id, full_name")
      .eq("study_id", studyId)
      .eq("is_deleted", false)
      .order("full_name");
    if (data) setProviders(data);
  }, [studyId]);

  const fetchMoRealizado = useCallback(async (stageId: string) => {
    const { data } = await supabase.from("construction_measurements" as any)
      .select("quantity")
      .eq("stage_id", stageId)
      .eq("is_deleted", false);
    const total = (data || []).reduce((sum: number, m: any) => sum + Number(m.quantity), 0);
    setMoRealizado(total);
  }, []);

  const fetchStages = useCallback(async () => {
    const { data } = await supabase
      .from("construction_stages" as any)
      .select("id, parent_id, code, name, level, position, unit_id, quantity, unit_price, total_value, start_date, end_date, stage_type, dependency_id, status")
      .eq("study_id", studyId)
      .eq("is_deleted", false)
      .order("position");
    if (data) setStages(data as any[]);
  }, [studyId]);

  const fetchUnits = useCallback(async () => {
    const { data } = await supabase
      .from("construction_units" as any)
      .select("id, name, abbreviation, has_decimals")
      .eq("is_active", true)
      .order("name");
    if (data) setUnits(data as any[]);
  }, []);

  const fetchBanks = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("financial_institutions")
      .select("id, name").eq("user_id", user.id).eq("is_active", true).order("name");
    if (data) setBanks(data);
  }, [user?.id]);

  useEffect(() => { fetchStages(); fetchUnits(); fetchBanks(); fetchProviders(); }, [fetchStages, fetchUnits, fetchBanks, fetchProviders]);

  // Save new provider from inline modal
  const saveNewProvider = async () => {
    if (!newProviderName.trim()) { toast.error("Nome completo é obrigatório."); return; }
    if (!newProviderCpfCnpj.trim()) { toast.error("CPF/CNPJ é obrigatório."); return; }
    if (newProviderType === "PF" && !validateCPF(newProviderCpfCnpj)) { toast.error("CPF inválido."); return; }
    if (newProviderType === "PJ" && !validateCNPJ(newProviderCpfCnpj)) { toast.error("CNPJ inválido."); return; }
    setSavingProvider(true);
    const { data, error } = await supabase.from("study_providers").insert({
      full_name: newProviderName.trim(),
      person_type: newProviderType,
      cpf_cnpj: newProviderCpfCnpj.trim(),
      phone: newProviderPhone.trim(),
      study_id: studyId,
    }).select("id").single();
    setSavingProvider(false);
    if (error) { toast.error("Erro ao salvar prestador."); return; }
    if (data) {
      await fetchProviders();
      setMoProviderId(data.id);
      setShowProviderModal(false);
      setNewProviderName("");
      setNewProviderType("PF");
      setNewProviderCpfCnpj("");
      setNewProviderPhone("");
      toast.success("Prestador cadastrado!");
    }
  };

  useEffect(() => {
    const roots = stages.filter(s => !s.parent_id);
    setExpanded(new Set(roots.map(s => s.id)));
  }, [stages.length]);

  const rootStages = stages.filter(s => !s.parent_id);

  const visibleStages = useMemo(() => {
    const result: StageRow[] = [];
    const addStage = (stage: StageRow) => {
      if (filterApplied && selectedStageIds.size > 0) {
        const isSelected = selectedStageIds.has(stage.id);
        const hasSelectedDescendant = stages.some(s => {
          let cur = s;
          while (cur.parent_id) {
            if (cur.parent_id === stage.id && selectedStageIds.has(cur.id)) return true;
            const parent = stages.find(p => p.id === cur.parent_id);
            if (!parent) break;
            cur = parent;
          }
          return false;
        });
        if (!isSelected && !hasSelectedDescendant) return;
      }
      result.push(stage);
      if (expanded.has(stage.id)) {
        stages.filter(s => s.parent_id === stage.id).sort((a, b) => a.position - b.position).forEach(addStage);
      }
    };
    rootStages.sort((a, b) => a.position - b.position).forEach(addStage);
    return result;
  }, [stages, expanded, filterApplied, selectedStageIds, rootStages]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allStageOptions = stages.map(s => ({ id: s.id, label: `${s.code} - ${s.name}` }));
  const toggleStageFilter = (id: string) => {
    setSelectedStageIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const applyFilters = () => setFilterApplied(true);
  const clearFilters = () => {
    setPeriodStart(""); setPeriodEnd("");
    setSelectedStageIds(new Set());
    setFilterApplied(false);
  };

  const totalValue = stages.reduce((sum, s) => {
    const hasChildren = stages.some(c => c.parent_id === s.id);
    return sum + (hasChildren ? 0 : Number(s.total_value) || 0);
  }, 0);

  const allDates = stages.flatMap(s => [s.start_date, s.end_date]).filter(Boolean) as string[];
  const minDate = allDates.length > 0 ? allDates.sort()[0] : null;
  const maxDate = allDates.length > 0 ? allDates.sort().reverse()[0] : null;

  const formatDateFull = (d: string | null) => {
    if (!d) return "--/--/----";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  const getDeepTotal = (s: StageRow): number => {
    const children = stages.filter(child => child.parent_id === s.id);
    if (children.length === 0) return s.total_value || 0;
    return children.reduce((sum, child) => sum + getDeepTotal(child), 0);
  };

  const getDeepPeriod = (s: StageRow): { minDate: string | null; maxDate: string | null } => {
    const children = stages.filter(child => child.parent_id === s.id);
    if (children.length === 0) return { minDate: s.start_date, maxDate: s.end_date };
    let minD: string | null = null;
    let maxD: string | null = null;
    for (const child of children) {
      const childPeriod = getDeepPeriod(child);
      if (childPeriod.minDate && (!minD || childPeriod.minDate < minD)) minD = childPeriod.minDate;
      if (childPeriod.maxDate && (!maxD || childPeriod.maxDate > maxD)) maxD = childPeriod.maxDate;
    }
    return { minDate: minD, maxDate: maxD };
  };

  const getRootIndex = (stage: StageRow): number => {
    if (!stage.parent_id) return rootStages.indexOf(stage);
    let current = stage;
    while (current.parent_id) {
      const parent = stages.find(s => s.id === current.parent_id);
      if (!parent) break;
      current = parent;
    }
    return rootStages.indexOf(current);
  };

  const getSubIndex = (stage: StageRow): number => {
    if (!stage.parent_id) return -1;
    const siblings = stages.filter(s => s.parent_id === stage.parent_id).sort((a, b) => a.position - b.position);
    return siblings.indexOf(stage);
  };

  // Handle measurement action selection
  const handleMeasurementAction = async (stage: StageRow, action: string) => {
    // Increment key to force Select re-render (reset to placeholder)
    setActionKey(k => k + 1);

    switch (action) {
      // Material actions
      case "orcamento":
        toast.info("Tela de Orçamento será implementada em breve");
        break;
      case "pedido":
        toast.info("Tela de Pedido será implementada em breve");
        break;
      case "compras":
        toast.info("Tela de Compras será implementada em breve");
        break;

      // Taxas actions
      case "cadastrar": {
        const { data: existingBills } = await supabase
          .from("bills")
          .select("id")
          .eq("study_id", studyId)
          .eq("description", `Taxas - ${stage.code} - ${stage.name}`)
          .eq("is_deleted", false);

        if (existingBills && existingBills.length > 0) {
          toast.warning("Esta taxa já foi cadastrada no financeiro.");
          return;
        }
        navigate(`/studies/${studyId}/bills/new?from=${encodeURIComponent(`/studies/${studyId}/construction`)}&stageId=${stage.id}&stageName=${encodeURIComponent(`Taxas - ${stage.code} - ${stage.name}`)}&amount=${stage.total_value}`);
        break;
      }
      case "pagar": {
        const { data: existingBill } = await supabase
          .from("bills")
          .select("id")
          .eq("stage_id", stage.id)
          .eq("is_deleted", false)
          .maybeSingle();
        if (!existingBill) {
          toast.error("Cadastre a taxa no financeiro antes de pagar.");
          return;
        }
        if (stage.status === "pago") {
          toast.warning("Esta taxa já foi paga.");
          return;
        }
        setPayStage(stage);
        setPayAccount("");
        setPayMethod("");
        setPayDate(todayISO());
        break;
      }

      // Serviço / Mão de Obra actions
      case "incluir_medicao": {
        if (stage.stage_type === 'mao_de_obra') {
          setMoStage(stage);
          setMoHours("");
          setMoDate(todayISO());
          setMoProviderId("");
          setMoNotes("");
          await fetchMoRealizado(stage.id);
        } else {
          toast.info("Incluir Medição para Serviço será implementada em breve");
        }
        break;
      }
      case "retificar_medicao":
        toast.info("Retificar Medição será implementada em breve");
        break;
      case "estornar_medicao":
        toast.info("Estornar Medição será implementada em breve");
        break;
    }
  };

  // Execute payment for taxas stage
  const executePayment = async () => {
    if (!payStage) return;
    if (!payAccount) { toast.error("Conta é obrigatória."); return; }
    if (!payMethod) { toast.error("Forma de Pagamento é obrigatória."); return; }

    setPayingLoading(true);

    // Find linked bill and installment
    const { data: bill } = await supabase
      .from("bills")
      .select("id")
      .eq("stage_id", payStage.id)
      .eq("is_deleted", false)
      .maybeSingle();

    if (!bill) {
      toast.error("Despesa não encontrada. Cadastre a taxa primeiro.");
      setPayingLoading(false);
      return;
    }

    // Update installment to PAID
    await supabase.from("bill_installments")
      .update({
        status: "PAID",
        paid_at: payDate,
        account_id: payAccount,
        payment_method: payMethod,
      })
      .eq("bill_id", bill.id)
      .eq("is_deleted", false)
      .eq("status", "PENDING");

    // Update bill header account/method
    await supabase.from("bills")
      .update({
        account_id: payAccount,
        payment_method: payMethod,
      })
      .eq("id", bill.id);

    // Update stage status to pago
    await supabase.from("construction_stages" as any)
      .update({
        status: "pago",
        actual_start_date: payDate,
        actual_end_date: payDate,
      })
      .eq("id", payStage.id);

    // Insert monthly value for the payment month in physical-financial schedule
    const paidDate = new Date(payDate + "T12:00:00");
    const monthKey = `${paidDate.getFullYear()}-${String(paidDate.getMonth() + 1).padStart(2, "0")}`;
    // Remove any existing actual monthly value for this stage first
    await supabase.from("construction_stage_monthly_values" as any)
      .delete()
      .eq("stage_id", payStage.id)
      .eq("study_id", studyId)
      .eq("value_type", "actual");
    // Insert the paid value in the correct month as actual
    await supabase.from("construction_stage_monthly_values" as any)
      .insert({
        stage_id: payStage.id,
        study_id: studyId,
        month_key: monthKey,
        value: payStage.total_value,
        value_type: "actual",
      } as any);

    setPayingLoading(false);
    setPayStage(null);
    toast.success("Pagamento registrado com sucesso!");
     fetchStages();
  };

  // Save Mão de Obra measurement
  const saveMoMeasurement = async () => {
    if (!moStage) return;
    const qty = parseFloat(moHours.replace(",", "."));
    if (!qty || qty <= 0) { toast.error("Informe as horas apontadas."); return; }
    if (!moDate) { toast.error("Informe a data."); return; }

    setMoSaving(true);

    const unit = units.find(u => u.id === moStage.unit_id);
    const unitAbbrev = unit?.abbreviation || "h";

    let contractId: string | null = null;

    // If provider selected, find or create contract
    const hasProvider = moProviderId && moProviderId !== "__none__";
    if (hasProvider) {
      // Check if contract for this stage already exists for this provider
      const { data: existingContracts } = await supabase.from("study_provider_contracts")
        .select("id")
        .eq("provider_id", moProviderId)
        .eq("study_id", studyId)
        .eq("service", moStage.name)
        .eq("is_deleted", false);

      if (existingContracts && existingContracts.length > 0) {
        contractId = existingContracts[0].id;
      } else {
        // Create new contract
        const { data: newContract } = await supabase.from("study_provider_contracts")
          .insert({
            provider_id: moProviderId,
            study_id: studyId,
            service: moStage.name,
            amount: 0,
            billing_model: "FIXED",
            start_date: moStage.start_date || todayISO(),
            end_date: moStage.end_date || null,
            status: "ACTIVE",
            details: `Total de ${unitAbbrev} planejadas: ${formatBRNumber(moStage.quantity, unit?.has_decimals ? 2 : 0)}${unitAbbrev}`,
          })
          .select("id")
          .single();
        if (newContract) contractId = newContract.id;
      }
    }

    // Insert measurement record with unit_price for historical preservation
    await supabase.from("construction_measurements" as any)
      .insert({
        study_id: studyId,
        stage_id: moStage.id,
        measurement_date: moDate,
        quantity: qty,
        unit_price: moStage.unit_price,
        provider_id: hasProvider ? moProviderId : null,
        contract_id: contractId,
        notes: moNotes.trim() || null,
        measurement_type: "inclusion",
      } as any);

    // Update contract details with measurement log
    if (contractId) {
      // Fetch all measurements for this stage to rebuild details
      const { data: allMeasurements } = await supabase.from("construction_measurements" as any)
        .select("measurement_date, quantity, measurement_type")
        .eq("stage_id", moStage.id)
        .eq("contract_id", contractId)
        .eq("is_deleted", false)
        .order("measurement_date");

      if (allMeasurements) {
        const totalApontado = (allMeasurements as any[]).reduce((sum: number, m: any) => {
          return sum + (m.measurement_type === 'reversal' ? -Number(m.quantity) : Number(m.quantity));
        }, 0);

        const valorTotal = totalApontado * moStage.unit_price;

        let details = `Total de ${unitAbbrev} planejadas: ${formatBRNumber(moStage.quantity, unit?.has_decimals ? 2 : 0)}${unitAbbrev}\n\n`;
        for (const m of allMeasurements as any[]) {
          const [y, mo, d] = m.measurement_date.split("-");
          const prefix = m.measurement_type === 'reversal' ? '(ESTORNO) ' : m.measurement_type === 'rectification' ? '(RETIFICAÇÃO) ' : '';
          details += `${prefix}${d}/${mo}/${y} - ${formatBRNumber(Number(m.quantity), unit?.has_decimals ? 2 : 0)}${unitAbbrev} apontadas\n`;
        }

        // Always show running total
        details += `\nTotal de ${unitAbbrev} apontadas: ${formatBRNumber(totalApontado, unit?.has_decimals ? 2 : 0)}${unitAbbrev}\n`;
        details += `Valor acumulado (R$ ${formatBRNumber(moStage.unit_price)}/${unitAbbrev}) = R$ ${formatBRNumber(valorTotal)}`;

        // Always update contract amount with accumulated value
        await supabase.from("study_provider_contracts")
          .update({ amount: valorTotal, details: details.trim() })
          .eq("id", contractId);
      }
    }

    // Update stage status based on progress
    const newRealizado = moRealizado + qty;
    if (newRealizado >= moStage.quantity) {
      // Finished
      await supabase.from("construction_stages" as any)
        .update({ status: "finished", actual_end_date: moDate })
        .eq("id", moStage.id);

      // If had no actual_start_date, set it
      if (!moStage.start_date) {
        await supabase.from("construction_stages" as any)
          .update({ actual_start_date: moDate })
          .eq("id", moStage.id);
      }
    } else if (newRealizado > 0) {
      // In progress
      const updatePayload: any = { status: "in_progress" };
      // Set actual_start_date on first measurement
      if (moRealizado === 0) {
        updatePayload.actual_start_date = moDate;
      }
      await supabase.from("construction_stages" as any)
        .update(updatePayload)
        .eq("id", moStage.id);
    }

    // Recalculate AC for the month from ALL measurements (source of truth)
    const mDate = new Date(moDate + "T12:00:00");
    const monthKey = `${mDate.getFullYear()}-${String(mDate.getMonth() + 1).padStart(2, "0")}`;

    // Fetch all measurements for this stage in this month
    const monthStart = `${monthKey}-01`;
    const lastDay = new Date(mDate.getFullYear(), mDate.getMonth() + 1, 0).getDate();
    const monthEnd = `${monthKey}-${String(lastDay).padStart(2, "0")}`;

    const { data: monthMeasurements } = await supabase.from("construction_measurements" as any)
      .select("quantity, unit_price, measurement_type")
      .eq("stage_id", moStage.id)
      .eq("is_deleted", false)
      .gte("measurement_date", monthStart)
      .lte("measurement_date", monthEnd);

    const acMonth = (monthMeasurements || []).reduce((sum: number, m: any) => {
      const sign = m.measurement_type === 'reversal' ? -1 : 1;
      return sum + sign * Number(m.quantity) * Number(m.unit_price);
    }, 0);

    // Upsert AC value for this month (value_type = 'actual')
    const { data: existingAC } = await supabase.from("construction_stage_monthly_values" as any)
      .select("id")
      .eq("stage_id", moStage.id)
      .eq("study_id", studyId)
      .eq("month_key", monthKey)
      .eq("value_type", "actual")
      .maybeSingle();

    if (existingAC) {
      await supabase.from("construction_stage_monthly_values" as any)
        .update({ value: acMonth })
        .eq("id", (existingAC as any).id);
    } else if (acMonth > 0) {
      await supabase.from("construction_stage_monthly_values" as any)
        .insert({
          stage_id: moStage.id,
          study_id: studyId,
          month_key: monthKey,
          value: acMonth,
          value_type: "actual",
        } as any);
    }

    setMoSaving(false);
    setMoStage(null);
    toast.success("Apontamento registrado com sucesso!");
    fetchStages();
  };

  function renderMeasurementColumn(stage: StageRow) {
    const hasChildren = stages.some(s => s.parent_id === stage.id);
    if (hasChildren || !stage.stage_type) {
      return <div className="w-[150px] h-8" />;
    }

    if (stage.stage_type === 'material') {
      return (
        <Select key={`${stage.id}-mat-${actionKey}`} onValueChange={(v) => handleMeasurementAction(stage, v)}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue placeholder="Ação..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="orcamento" className="text-xs">Orçamento</SelectItem>
            <SelectItem value="pedido" className="text-xs">Pedido</SelectItem>
            <SelectItem value="compras" className="text-xs">Compras</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    if (stage.stage_type === 'taxas') {
      return (
        <Select key={`${stage.id}-tax-${actionKey}`} onValueChange={(v) => handleMeasurementAction(stage, v)}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue placeholder="Ação..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cadastrar" className="text-xs">Cadastrar</SelectItem>
            <SelectItem value="pagar" className="text-xs">Pagar</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    // servico or mao_de_obra
    return (
      <Select key={`${stage.id}-mo-${actionKey}`} onValueChange={(v) => handleMeasurementAction(stage, v)}>
        <SelectTrigger className="w-[150px] h-8 text-xs">
          <SelectValue placeholder="Ação..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="incluir_medicao" className="text-xs">Incluir Medição</SelectItem>
          <SelectItem value="retificar_medicao" className="text-xs">Retificar Medição</SelectItem>
          <SelectItem value="estornar_medicao" className="text-xs">Estornar Medição</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  function renderStageRow(stage: StageRow, depth: number) {
    const children = stages.filter(s => s.parent_id === stage.id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(stage.id);
    const isLeaf = !hasChildren;
    const unit = units.find(u => u.id === stage.unit_id);
    const rootIdx = getRootIndex(stage);
    const subIdx = getSubIndex(stage);
    const bgColor = isDark ? getStageColorDark(rootIdx, subIdx) : getStageColor(rootIdx, subIdx);
    const stageTotalValue = getDeepTotal(stage);
    const stagePeriod = hasChildren ? getDeepPeriod(stage) : null;
    const isTaxas = stage.stage_type === 'taxas';

    const depStage = stage.dependency_id ? stages.find(s => s.id === stage.dependency_id) : null;

    const displayPeriod = stage.start_date && stage.end_date
      ? `${formatDateShort(stage.start_date)} - ${formatDateShort(stage.end_date)}`
      : "";

    const renderFields = () => {
      if (isLeaf) {
        return (
          <>
            {/* Tipo */}
            <div className="w-24 h-8 flex items-center justify-center px-1">
              <span className={cn("text-foreground/80", !stage.stage_type && "text-muted-foreground/50")}>
                {getStageTypeLabel(stage.stage_type)}
              </span>
            </div>

            {/* Unidade */}
            <div className="w-16 h-8 flex items-center justify-center px-1">
              <span className={cn("text-foreground/80", !unit && "text-muted-foreground/50")}>
                {isTaxas ? "" : (unit ? unit.abbreviation : "—")}
              </span>
            </div>

            {/* Qtde */}
            <div className="w-16 h-8 flex items-center justify-end px-1">
              <span className="text-foreground/80">
                {isTaxas ? "" : (stage.quantity > 0 ? formatBRNumber(stage.quantity, unit?.has_decimals ? 2 : 0) : "—")}
              </span>
            </div>

            {/* V. Unit */}
            <div className="w-24 h-8 flex items-center justify-end px-1">
              <span className="text-foreground/80">
                {isTaxas ? "" : (stage.unit_price > 0 ? formatBRNumber(stage.unit_price) : "—")}
              </span>
            </div>

            {/* V. Total */}
            <div className="w-24 h-8 flex items-center justify-end px-1">
              <span className="text-foreground/80 font-medium">
                {stageTotalValue > 0 ? formatBRNumber(stageTotalValue) : "—"}
              </span>
            </div>

            {/* Dependência */}
            <div className="w-20 h-8 flex items-center justify-center px-1">
              <span className={cn("text-foreground/80", !depStage && "text-muted-foreground/50")}>
                {depStage ? depStage.code : "—"}
              </span>
            </div>

            {/* Período */}
            <div className="w-[160px] h-8 flex items-center px-1 gap-1">
              <CalendarIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className={cn("whitespace-nowrap text-foreground/80", !displayPeriod && "text-muted-foreground/50")}>
                {isTaxas ? (stage.start_date ? formatDateShort(stage.start_date) : "—") : (displayPeriod || "—")}
              </span>
            </div>

            {/* Medição - type-specific dropdown */}
            {renderMeasurementColumn(stage)}
          </>
        );
      }

      // Parent fields
      return (
        <>
          <div className="w-24 h-8" />
          <div className="w-16 h-8" />
          <div className="w-16 h-8" />
          <div className="w-24 h-8" />
          <div className="w-24 h-8 flex items-center justify-end px-1">
            <span className="text-foreground/80 font-medium">
              {stageTotalValue > 0 ? formatBRNumber(stageTotalValue) : "—"}
            </span>
          </div>
          <div className="w-20 h-8 flex items-center justify-center px-1">
            <span className={cn("text-foreground/80", !depStage && "text-muted-foreground/50")}>
              {depStage ? depStage.code : "—"}
            </span>
          </div>
          {stagePeriod && (stagePeriod.minDate || stagePeriod.maxDate) ? (
            <div className="w-[160px] h-8 flex items-center text-foreground/80 px-1 gap-1">
              <CalendarIcon className="h-3 w-3 shrink-0 text-muted-foreground/50" />
              <span className="whitespace-nowrap">
                {stagePeriod.minDate ? formatDateShort(stagePeriod.minDate) : "?"} - {stagePeriod.maxDate ? formatDateShort(stagePeriod.maxDate) : "?"}
              </span>
            </div>
          ) : (
            <div className="w-[160px] h-8" />
          )}
          <div className="w-[150px] h-8" />
        </>
      );
    };

    return (
      <div key={stage.id}>
        <div
          className={cn(
            "flex items-center gap-1.5 py-2 px-2 border-b border-border/50 hover:brightness-95 transition-all",
            hasChildren && "font-semibold"
          )}
          style={{ paddingLeft: `${depth * 20 + 8}px`, backgroundColor: bgColor }}
        >
          <button className="shrink-0" onClick={() => toggleExpand(stage.id)}>
            {hasChildren || isExpanded ? (
              isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
            )}
          </button>

          <div className="flex-1 min-w-0 overflow-x-auto scrollbar-thin">
            <span className="text-sm whitespace-nowrap">
              {stage.code} - {stage.name}
            </span>
          </div>

          <div className={cn("flex items-center gap-0.5 shrink-0 ml-4", stage.level === 0 ? "text-sm" : "text-xs")}>
            {renderFields()}
          </div>
        </div>

        {isExpanded && children.sort((a, b) => a.position - b.position).map(c => renderStageRow(c, depth + 1))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-foreground">Medição / Execução</h2>

      {/* Summary */}
      <div className="rounded-xl p-4 flex items-center justify-between" style={{ backgroundColor: isDark ? 'hsl(180, 28%, 12%)' : 'hsl(180, 28%, 88%)' }}>
        {minDate && maxDate ? (
          <div>
            <p className="text-xs text-muted-foreground">Período</p>
            <p className="text-base font-semibold">{formatDateFull(minDate)} — {formatDateFull(maxDate)}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma data definida</p>
        )}
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Valor Total</p>
          <p className="text-base font-semibold">R$ {formatBRNumber(totalValue)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border p-3 bg-card shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">Período:</span>
          <Input type="date" className="w-36 h-8 text-xs" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
          <Input type="date" className="w-36 h-8 text-xs" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs h-8">
                Etapas {selectedStageIds.size > 0 && `(${selectedStageIds.size})`} ▼
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 max-h-60 overflow-y-auto p-2" align="start">
              {allStageOptions.map(opt => (
                <label key={opt.id} className="flex items-center gap-2 py-1 px-1 hover:bg-muted rounded cursor-pointer text-sm">
                  <Checkbox checked={selectedStageIds.has(opt.id)} onCheckedChange={() => toggleStageFilter(opt.id)} />
                  <span className="truncate">{opt.label}</span>
                </label>
              ))}
            </PopoverContent>
          </Popover>

          <Button size="sm" className="h-8 text-xs" onClick={applyFilters}>Aplicar</Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={clearFilters}>Limpar</Button>
        </div>
      </div>

      {/* Headers */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-1.5 py-2 px-2 bg-muted border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <div className="w-6 shrink-0" />
          <div className="flex-1 min-w-0">Etapa</div>
          <div className="flex items-center gap-0.5 shrink-0 ml-4">
            <div className="w-24 text-center">Tipo</div>
            <div className="w-16 text-center">Un.</div>
            <div className="w-16 text-right">Qtde</div>
            <div className="w-24 text-right">V. Unit.</div>
            <div className="w-24 text-right">V. Total</div>
            <div className="w-20 text-center">Dep.</div>
            <div className="w-[160px] text-center">Período</div>
            <div className="w-[150px] text-center">Medição</div>
          </div>
        </div>

        {/* Rows */}
        <div className="overflow-y-auto" style={{ maxHeight: "calc(100vh - 340px)" }}>
          {visibleStages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma etapa encontrada</p>
          ) : (
            rootStages.sort((a, b) => a.position - b.position).map(stage => {
              if (filterApplied && selectedStageIds.size > 0 && !visibleStages.find(v => v.id === stage.id)) return null;
              return renderStageRow(stage, 0);
            })
          )}
        </div>
      </div>

      {/* Payment Dialog */}
      <Dialog open={!!payStage} onOpenChange={(open) => { if (!open) setPayStage(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Pagar Taxa</DialogTitle>
          </DialogHeader>
          {payStage && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {payStage.code} - {payStage.name}
              </p>
              <p className="text-sm font-medium">
                Valor: R$ {formatBRNumber(payStage.total_value)}
              </p>
              <div className="space-y-1.5">
                <Label>Conta *</Label>
                <Select value={payAccount} onValueChange={setPayAccount}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {banks.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Forma de Pagamento *</Label>
                <Select value={payMethod} onValueChange={setPayMethod}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Data do Pagamento</Label>
                <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setPayStage(null)}>Cancelar</Button>
            <Button onClick={executePayment} disabled={payingLoading}>
              {payingLoading ? "Registrando..." : "Confirmar Pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mão de Obra Measurement Dialog */}
      <Dialog open={!!moStage} onOpenChange={(open) => { if (!open) setMoStage(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mão de Obra - {moStage?.code} {moStage?.name}</DialogTitle>
          </DialogHeader>
          {moStage && (() => {
            const unit = units.find(u => u.id === moStage.unit_id);
            const unitAbbrev = unit?.abbreviation || "h";
            const planejado = moStage.quantity;
            const saldo = planejado - moRealizado;
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="text-muted-foreground text-xs">Planejado</p>
                    <p className="font-semibold">{formatBRNumber(planejado, unit?.has_decimals ? 2 : 0)} {unitAbbrev}</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="text-muted-foreground text-xs">Realizado</p>
                    <p className="font-semibold">{formatBRNumber(moRealizado, unit?.has_decimals ? 2 : 0)} {unitAbbrev}</p>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-center">
                    <p className="text-muted-foreground text-xs">Saldo</p>
                    <p className={cn("font-semibold", saldo < 0 && "text-destructive")}>{formatBRNumber(saldo, unit?.has_decimals ? 2 : 0)} {unitAbbrev}</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>{unit?.name || "Horas"} apontadas agora *</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={moHours}
                      onChange={e => setMoHours(e.target.value)}
                      placeholder="0"
                      className="flex-1"
                    />
                    <span className="text-sm text-muted-foreground">{unitAbbrev}</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Data *</Label>
                  <Input type="date" value={moDate} onChange={e => setMoDate(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <Label>Equipe/Responsável</Label>
                  <div className="flex items-center gap-2">
                    <Select value={moProviderId} onValueChange={setMoProviderId}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Selecione (opcional)..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Nenhum</SelectItem>
                        {providers.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      onClick={() => setShowProviderModal(true)}
                      title="Adicionar prestador"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Observação</Label>
                  <Textarea
                    value={moNotes}
                    onChange={e => setMoNotes(e.target.value)}
                    placeholder="Observação opcional..."
                    rows={2}
                  />
                </div>
              </div>
            );
          })()}
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setMoStage(null)}>Cancelar</Button>
            <Button onClick={saveMoMeasurement} disabled={moSaving}>
              {moSaving ? "Salvando..." : "Salvar Apontamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inline Provider Creation Modal (nested on top of MO modal) */}
      <Dialog open={showProviderModal} onOpenChange={(open) => { if (!open) setShowProviderModal(false); }}>
        <DialogContent className="max-w-sm z-[60]">
          <DialogHeader>
            <DialogTitle>Cadastro Rápido de Prestador</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome Completo *</Label>
              <Input value={newProviderName} onChange={e => setNewProviderName(e.target.value)} placeholder="Nome do prestador" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo *</Label>
                <Select value={newProviderType} onValueChange={v => { setNewProviderType(v); setNewProviderCpfCnpj(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PF">Pessoa Física</SelectItem>
                    <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{newProviderType === "PJ" ? "CNPJ" : "CPF"} *</Label>
                <Input value={newProviderCpfCnpj} onChange={e => setNewProviderCpfCnpj(formatCPFCNPJ(e.target.value, newProviderType))} maxLength={newProviderType === "PJ" ? 18 : 14} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={newProviderPhone} onChange={e => setNewProviderPhone(formatPhone(e.target.value))} maxLength={14} />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setShowProviderModal(false)}>Cancelar</Button>
            <Button onClick={saveNewProvider} disabled={savingProvider}>
              {savingProvider ? "Salvando..." : "Salvar Prestador"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
