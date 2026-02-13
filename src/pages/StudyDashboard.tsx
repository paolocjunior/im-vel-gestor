import { useParams, useNavigate } from "react-router-dom";
import {
  Building2,
  ArrowLeft,
  LayoutDashboard,
  ShoppingCart,
  DollarSign,
  Users,
  FileText,
  Wallet,
  HardHat,
  ChevronRight,
  TrendingUp,
  Banknote,
  Percent,
  BarChart3,
  MapPin,
  FileCheck,
  Shovel,
  Store,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import StageCard from "@/components/dashboard/StageCard";
import KpiCard from "@/components/dashboard/KpiCard";
import ModuleItem from "@/components/dashboard/ModuleItem";

const modules = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, ready: true },
  { key: "pedidos", label: "Pedido de Compra", icon: ShoppingCart, ready: false },
  { key: "financeiro", label: "Financeiro", icon: DollarSign, ready: false },
  { key: "fornecedores", label: "Fornecedores", icon: Users, ready: false },
  { key: "contratos", label: "Prestador / Contratos", icon: FileText, ready: false },
  { key: "folha", label: "Folha", icon: Wallet, ready: false },
  { key: "obras", label: "Obras / Construção", icon: HardHat, ready: false },
];

const stages = [
  {
    letter: "A",
    title: "Aquisição do Terreno",
    status: "completo" as const,
    progress: 100,
    icon: MapPin,
    items: [
      { label: "Avaliação do terreno", done: true },
      { label: "Due diligence jurídica", done: true },
      { label: "Escritura registrada", done: true },
    ],
  },
  {
    letter: "B",
    title: "Projetos e Aprovações",
    status: "incompleto" as const,
    progress: 65,
    icon: FileCheck,
    items: [
      { label: "Projeto arquitetônico", done: true },
      { label: "Projeto estrutural", done: true },
      { label: "Alvará de construção", done: false },
    ],
  },
  {
    letter: "C",
    title: "Construção",
    status: "incompleto" as const,
    progress: 20,
    icon: Shovel,
    items: [
      { label: "Fundação", done: true },
      { label: "Estrutura", done: false },
      { label: "Acabamento", done: false },
    ],
  },
  {
    letter: "D",
    title: "Vendas e Marketing",
    status: "nao_iniciado" as const,
    progress: 0,
    icon: Store,
    items: [
      { label: "Material publicitário", done: false },
      { label: "Tabela de vendas", done: false },
      { label: "Corretores contratados", done: false },
    ],
  },
  {
    letter: "E",
    title: "Pós-Entrega",
    status: "nao_iniciado" as const,
    progress: 0,
    icon: Package,
    items: [
      { label: "Vistoria final", done: false },
      { label: "Habite-se", done: false },
      { label: "Entrega de chaves", done: false },
    ],
  },
];

const StudyDashboard = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeModule, setActiveModule] = useState("dashboard");

  return (
    <div className="min-h-screen bg-background">
      {/* Top header */}
      <header className="border-b bg-card sticky top-0 z-20">
        <div className="max-w-[1440px] mx-auto flex items-center justify-between h-14 px-6">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" />
              <span className="font-bold text-lg">
                Constru<span className="text-primary">Gestão</span>
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground">
              <button onClick={() => navigate("/hub")} className="hover:text-foreground transition-colors focus-ring rounded px-1">
                Projetos
              </button>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground font-medium">Projeto #{id}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/hub")}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </div>
      </header>

      {/* Main content - 12 col grid */}
      <div className="max-w-[1440px] mx-auto px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* D1 - Módulos (3/12) */}
          <aside className="md:col-span-3 order-1">
            <div className="card-dashboard space-y-1">
              <h2 className="font-bold text-sm text-muted-foreground uppercase tracking-wide mb-3">
                Módulos
              </h2>
              {modules.map((mod) => (
                <ModuleItem
                  key={mod.key}
                  label={mod.label}
                  icon={mod.icon}
                  active={activeModule === mod.key}
                  ready={mod.ready}
                  onClick={() => setActiveModule(mod.key)}
                />
              ))}
            </div>
          </aside>

          {/* D2 - Etapas A-E (6/12) */}
          <section className="md:col-span-6 order-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">Etapas do Projeto</h2>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success" /> Completo</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning" /> Incompleto</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-neutral" /> Não iniciado</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-info" /> Dispensado</span>
              </div>
            </div>
            <div className="space-y-4 animate-fade-in">
              {stages.map((stage) => (
                <StageCard key={stage.letter} {...stage} />
              ))}
            </div>
          </section>

          {/* D3 - KPIs (3/12) */}
          <aside className="md:col-span-3 order-3 space-y-4">
            <h2 className="font-bold text-sm text-muted-foreground uppercase tracking-wide">
              Indicadores
            </h2>
            <div className="space-y-4 animate-fade-in">
              <KpiCard
                label="VGV Estimado"
                value="R$ 12,5M"
                subtitle="Valor Geral de Vendas"
                icon={TrendingUp}
                trend={{ value: "+3,2% vs. estudo anterior", positive: true }}
              />
              <KpiCard
                label="Custo Total"
                value="R$ 8,2M"
                subtitle="Inclui terreno + obra"
                icon={Banknote}
              />
              <KpiCard
                label="Margem Bruta"
                value="34,4%"
                subtitle="Meta: > 30%"
                icon={Percent}
                trend={{ value: "Acima da meta", positive: true }}
              />
              <KpiCard
                label="TIR Projetada"
                value="18,2% a.a."
                subtitle="Taxa Interna de Retorno"
                icon={BarChart3}
                trend={{ value: "+1,1 p.p.", positive: true }}
              />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default StudyDashboard;
