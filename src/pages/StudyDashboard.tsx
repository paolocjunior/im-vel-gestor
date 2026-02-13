import { useParams, useNavigate } from "react-router-dom";
import {
  ShoppingCart,
  DollarSign,
  Users,
  FileText,
  Wallet,
  HardHat,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import StageEtapa from "@/components/dashboard/StageEtapa";
import ResultCard from "@/components/dashboard/ResultCard";
import GlobalTopbar from "@/components/GlobalTopbar";

const modules = [
  { key: "novo", label: "Novo Projeto", icon: Plus },
  { key: "pedidos", label: "Pedido de compra", icon: ShoppingCart },
  { key: "financeiro", label: "Financeiro", icon: DollarSign },
  { key: "fornecedores", label: "Fornecedores", icon: Users },
  { key: "contratos", label: "Prestador/Contratos", icon: FileText },
  { key: "folha", label: "Folha", icon: Wallet },
  { key: "obras", label: "Obras/Construção", icon: HardHat },
];

const StudyDashboard = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar />

      {/* Project info */}
      <div className="max-w-[1440px] mx-auto px-6 py-4 border-b bg-card">
        <h1 className="text-2xl font-bold">Vila Romana</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Status do projeto: <span className="text-foreground font-medium">Rascunho</span>
        </p>
        <button className="text-sm text-primary hover:underline font-medium mt-0.5">
          Editar Dados
        </button>
      </div>

      {/* 3-column layout */}
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

          {/* D1 - Módulos */}
          <aside className="md:col-span-3 order-1">
            <div className="card-dashboard">
              <h2 className="font-bold text-base mb-4">Módulos</h2>
              <div className="space-y-2">
                {modules.map((mod) => {
                  const Icon = mod.icon;
                  return (
                    <Button
                      key={mod.key}
                      variant="default"
                      size="sm"
                      className="w-full justify-start text-sm"
                    >
                      <Icon className="h-4 w-4 mr-2 shrink-0" />
                      {mod.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* D2 - Etapas */}
          <section className="md:col-span-6 order-2 space-y-4">
            <h2 className="font-bold text-base">Etapas</h2>

            <StageEtapa title="Dados do Imóvel/Terreno" status="nao_iniciado" colorClass="stage-green"
              fields={[
                { label: "Valor de compra", value: "—" },
                { label: "Área útil (m²)", value: "—" },
                { label: "Área total (m²)", value: "—" },
                { label: "Área do terreno (m²)", value: "—" },
                { label: "Valor do m²", value: "—" },
              ]}
              onEdit={() => {}} />

            <StageEtapa title="Financiamento" status="dispensado" colorClass="stage-purple"
              fields={[
                { label: "Usar financiamento", value: "Não" },
                { label: "Sistema", value: "—" },
                { label: "Entrada (R$)", value: "R$ 0,00" },
                { label: "Prazo (meses)", value: "—" },
                { label: "Juros mensal (%)", value: "—" },
                { label: "Valor financiado", value: "R$ 0,00" },
              ]}
              onEdit={() => {}} />

            <StageEtapa title="Custos de Aquisição" status="nao_iniciado" colorClass="stage-yellow"
              fields={[
                { label: "Entrada", value: "R$ 0,00" },
                { label: "ITBI", value: "R$ 0,00" },
                { label: "Avaliação bancária", value: "R$ 0,00" },
                { label: "Registro", value: "R$ 0,00" },
                { label: "Escritura", value: "R$ 0,00" },
              ]}
              onEdit={() => {}} />

            <StageEtapa title="Custos até a Venda" status="nao_iniciado" colorClass="stage-pink"
              fields={[
                { label: "Meses até a venda", value: "—" },
                { label: "Parcela financiamento", value: "R$ 0,00" },
                { label: "Condomínio", value: "R$ 0,00" },
                { label: "IPTU", value: "R$ 0,00" },
                { label: "Despesas mensais", value: "R$ 0,00" },
                { label: "Prestador/Contratos", value: "R$ 5.500,00" },
              ]}
              onEdit={() => {}} />

            <StageEtapa title="Dados da Venda" status="nao_iniciado" colorClass="stage-blue"
              fields={[
                { label: "Valor de venda", value: "—" },
                { label: "Quitação na venda", value: "R$ 0,00" },
                { label: "Corretagem", value: "—" },
                { label: "Imposto de renda", value: "R$ 0,00" },
              ]}
              onEdit={() => {}} />
          </section>

          {/* D3 - Resultados */}
          <aside className="md:col-span-3 order-3 space-y-4">
            <h2 className="font-bold text-base">Resultados</h2>

            <ResultCard label="Total custos aquisição" value="R$ 0,00" subtitle="Valor de compra" />
            <ResultCard label="Total custos até venda" value="R$ 0,00" subtitle="Meses até a venda" />
            <ResultCard label="Custos desembolsados" value="R$ 0,00" subtitle="Valor de compra e meses até a venda" />
            <ResultCard label="Lucro" value="R$ 0,00" subtitle="Valor de venda" />
            <ResultCard label="ROI" value="0,00%" subtitle="Capital investido e valor de venda" />

            <div className="card-dashboard space-y-3">
              <p className="text-xs font-semibold">Indicador</p>
              <p className="kpi-value">Indefinido</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Informe o valor de compra, informe ao menos uma área válida, informe os meses até a venda, informe o valor de venda
              </p>
              <Button size="sm" className="w-full mt-2">
                Verificar viabilidade
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
