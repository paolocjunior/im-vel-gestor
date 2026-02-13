import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ShoppingCart, DollarSign, Users, FileText, Wallet, HardHat, Plus, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import StageEtapa from "@/components/dashboard/StageEtapa";
import ResultCard from "@/components/dashboard/ResultCard";
import GlobalTopbar from "@/components/GlobalTopbar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { recomputeAndSave } from "@/lib/recomputeService";
import { formatBRL, formatPercent } from "@/lib/recompute";
import { toast } from "sonner";

type StageStatus = "nao_iniciado" | "incompleto" | "completo" | "dispensado";

const modules = [
  { key: "novo", label: "Novo Projeto", icon: Plus, path: "/hub" },
  { key: "pedidos", label: "Pedido de compra", icon: ShoppingCart },
  { key: "financeiro", label: "Financeiro", icon: DollarSign },
  { key: "fornecedores", label: "Fornecedores", icon: Users, pathSuffix: "/vendors" },
  { key: "contratos", label: "Prestador/Contratos", icon: FileText, pathSuffix: "/providers" },
  { key: "folha", label: "Folha", icon: Wallet },
  { key: "obras", label: "Obras/Construção", icon: HardHat },
];

function getStepStatus(inputs: any, step: "a" | "b" | "c" | "d" | "e"): StageStatus {
  const updatedKey = `step_${step}_updated_at`;
  if (!inputs[updatedKey]) return "nao_iniciado";
  if (step === "b" && !inputs.financing_enabled) return "dispensado";
  // Simple heuristic for completeness
  if (step === "a") {
    if (Number(inputs.purchase_value) > 0 && (Number(inputs.usable_area_m2) > 0 || Number(inputs.total_area_m2) > 0 || Number(inputs.land_area_m2) > 0)) return "completo";
    return "incompleto";
  }
  if (step === "b") {
    if (inputs.financing_enabled && inputs.financing_system && inputs.financing_term_months && Number(inputs.monthly_interest_rate) > 0) return "completo";
    return inputs.financing_enabled ? "incompleto" : "dispensado";
  }
  if (step === "c") {
    // StepC is complete once saved (all fields have valid defaults)
    return "completo";
  }
  if (step === "d") {
    if (inputs.months_to_sale && inputs.months_to_sale >= 1) return "completo";
    return "incompleto";
  }
  if (step === "e") {
    if (Number(inputs.sale_value) >= 0.01) return "completo";
    return "incompleto";
  }
  return inputs[updatedKey] ? "incompleto" : "nao_iniciado";
}

const StudyDashboard = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [study, setStudy] = useState<any>(null);
  const [inputs, setInputs] = useState<any>(null);
  const [computed, setComputed] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  useEffect(() => { if (user && id) loadAll(); }, [user, id]);

  const loadAll = async () => {
    const [studyRes, inputsRes, computedRes] = await Promise.all([
      supabase.from("studies").select("*").eq("id", id).single(),
      supabase.from("study_inputs").select("*").eq("study_id", id).single(),
      supabase.from("study_computed").select("*").eq("study_id", id).single(),
    ]);
    if (!studyRes.data) { navigate("/hub"); return; }
    setStudy(studyRes.data);
    setInputs(inputsRes.data);
    setComputed(computedRes.data);
    setLoading(false);
  };

  const checkViability = async () => {
    setChecking(true);
    await recomputeAndSave(id!, user!.id);
    await loadAll();
    setChecking(false);
    toast.success("Viabilidade verificada!");
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>;

  const fmtMoney = (v: any) => formatBRL(Number(v || 0));
  const fmtPct = (v: any) => formatPercent(Number(v || 0));
  const dash = (v: any) => Number(v) > 0 ? String(v) : "—";

  const missingFields = computed?.missing_fields || [];
  const viability = computed?.viability_indicator || "UNKNOWN";
  const viabilityLabel: Record<string, string> = { VIABLE: "Viável", UNVIABLE: "Inviável", ATTENTION: "Atenção", UNKNOWN: "Indefinido" };
  const viabilityColor: Record<string, string> = { VIABLE: "text-success", UNVIABLE: "text-destructive", ATTENTION: "text-warning", UNKNOWN: "text-muted-foreground" };

  return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar />

      {/* Project info */}
      <div className="max-w-[1440px] mx-auto px-6 py-4 border-b bg-card">
        <h1 className="text-2xl font-bold">{study?.name}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Status: <span className="text-foreground font-medium">{study?.status === "COMPLETE" ? "Completo" : "Rascunho"}</span>
        </p>
        <button onClick={() => navigate(`/studies/${id}/edit`)} className="text-sm text-primary hover:underline font-medium mt-0.5 flex items-center gap-1">
          <Pencil className="h-3 w-3" /> Editar Dados
        </button>
      </div>

      <div className="max-w-[1440px] mx-auto px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

          {/* D1 */}
          <aside className="md:col-span-3 order-1">
            <div className="card-dashboard">
              <h2 className="font-bold text-base mb-4">Módulos</h2>
              <div className="space-y-2">
                {modules.map((mod) => {
                  const Icon = mod.icon;
                  const path = mod.path || ((mod as any).pathSuffix ? `/studies/${id}${(mod as any).pathSuffix}` : undefined);
                  return (
                    <Button key={mod.key} variant="default" size="sm" className="w-full justify-start text-sm"
                      onClick={() => path ? navigate(path) : null} disabled={!path}>
                      <Icon className="h-4 w-4 mr-2 shrink-0" />
                      {mod.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* D2 */}
          <section className="md:col-span-6 order-2 space-y-4">
            <h2 className="font-bold text-base">Etapas</h2>

            {inputs && (
              <>
                <StageEtapa title="Dados do Imóvel/Terreno" status={getStepStatus(inputs, "a")} colorClass="stage-green"
                  fields={[
                    { label: "Valor de compra", value: fmtMoney(inputs.purchase_value) },
                    { label: "Área útil (m²)", value: dash(inputs.usable_area_m2) },
                    { label: "Área total (m²)", value: dash(inputs.total_area_m2) },
                    { label: "Área do terreno (m²)", value: dash(inputs.land_area_m2) },
                    { label: "Valor do m²", value: fmtMoney(inputs.purchase_price_per_m2) },
                  ]}
                  onEdit={() => navigate(`/studies/${id}/steps/a`)} />

                <StageEtapa title="Financiamento" status={getStepStatus(inputs, "b")} colorClass="stage-purple"
                  fields={[
                    { label: "Usar financiamento", value: inputs.financing_enabled ? "Sim" : "Não" },
                    { label: "Sistema", value: inputs.financing_system || "—" },
                    { label: "Entrada (R$)", value: fmtMoney(inputs.down_payment_value) },
                    { label: "Prazo (meses)", value: dash(inputs.financing_term_months) },
                    { label: "Juros mensal (%)", value: Number(inputs.monthly_interest_rate) > 0 ? `${inputs.monthly_interest_rate}%` : "—" },
                    { label: "Valor financiado", value: fmtMoney(computed?.financed_amount) },
                  ]}
                  onEdit={() => navigate(`/studies/${id}/steps/b`)} />

                <StageEtapa title="Custos de Aquisição" status={getStepStatus(inputs, "c")} colorClass="stage-yellow"
                  fields={[
                    { label: "Entrada", value: fmtMoney(inputs.down_payment_acquisition) },
                    { label: "ITBI", value: fmtMoney(inputs.itbi_value) },
                    { label: "Avaliação bancária", value: fmtMoney(inputs.bank_appraisal) },
                    { label: "Registro", value: fmtMoney(inputs.registration_fee) },
                    { label: "Escritura", value: fmtMoney(inputs.deed_fee) },
                  ]}
                  onEdit={() => navigate(`/studies/${id}/steps/c`)} />

                <StageEtapa title="Custos até a Venda" status={getStepStatus(inputs, "d")} colorClass="stage-pink"
                  fields={[
                    { label: "Meses até a venda", value: dash(inputs.months_to_sale) },
                    { label: "Parcela financiamento", value: fmtMoney(inputs.monthly_financing_payment) },
                    { label: "Condomínio", value: fmtMoney(inputs.condo_fee) },
                    { label: "IPTU", value: fmtMoney(inputs.iptu_value) },
                    { label: "Despesas mensais", value: fmtMoney(inputs.monthly_expenses) },
                    { label: "Prestador/Contratos", value: fmtMoney(computed?.provider_contracts_total) },
                  ]}
                  onEdit={() => navigate(`/studies/${id}/steps/d`)} />

                <StageEtapa title="Dados da Venda" status={getStepStatus(inputs, "e")} colorClass="stage-blue"
                  fields={[
                    { label: "Valor de venda", value: fmtMoney(inputs.sale_value) },
                    { label: "Quitação na venda", value: fmtMoney(inputs.payoff_at_sale) },
                    { label: "Corretagem", value: inputs.brokerage_mode === "PERCENT" ? `${inputs.brokerage_percent}%` : fmtMoney(inputs.brokerage_value) },
                    { label: "Imposto de renda", value: fmtMoney(inputs.income_tax) },
                  ]}
                  onEdit={() => navigate(`/studies/${id}/steps/e`)} />

              </>
            )}
          </section>

          {/* D3 */}
          <aside className="md:col-span-3 order-3 space-y-4">
            <h2 className="font-bold text-base">Resultados</h2>

            <ResultCard label="Total custos aquisição" value={fmtMoney(computed?.acquisition_total)} subtitle="Valor de compra" />
            <ResultCard label="Total custos até venda" value={fmtMoney(computed?.holding_total)} subtitle="Meses até a venda" />
            <ResultCard label="Custos desembolsados" value={fmtMoney(computed?.total_disbursed)} subtitle="Valor de compra e meses até a venda" />
            <ResultCard label="Lucro" value={fmtMoney(computed?.profit)} subtitle="Valor de venda" />
            <ResultCard label="ROI" value={fmtPct(computed?.roi)} subtitle="Capital investido e valor de venda" />

            <div className="card-dashboard space-y-3">
              <p className="text-xs font-semibold">Indicador</p>
              <p className={`kpi-value ${viabilityColor[viability]}`}>{viabilityLabel[viability]}</p>
              {missingFields.length > 0 && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {(missingFields as string[]).join(", ")}
                </p>
              )}
              <Button size="sm" className="w-full mt-2" onClick={checkViability} disabled={checking}>
                {checking ? "Verificando..." : "Verificar viabilidade"}
              </Button>
              <div className="space-y-1 text-xs pt-2 border-t">
                <p><span className="inline-block w-2 h-2 rounded-full bg-success mr-1.5" />Viável: ROI &gt; 30%</p>
                <p><span className="inline-block w-2 h-2 rounded-full bg-destructive mr-1.5" />Inviável: ROI &lt; 30%</p>
                <p><span className="inline-block w-2 h-2 rounded-full bg-warning mr-1.5" />Atenção: ROI &lt; 10%</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default StudyDashboard;
