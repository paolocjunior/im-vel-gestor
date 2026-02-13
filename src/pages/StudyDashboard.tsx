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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

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
  { key: "A", label: "Etapa A – Aquisição do Terreno", progress: 100 },
  { key: "B", label: "Etapa B – Projetos e Aprovações", progress: 65 },
  { key: "C", label: "Etapa C – Construção", progress: 20 },
  { key: "D", label: "Etapa D – Vendas e Marketing", progress: 0 },
  { key: "E", label: "Etapa E – Pós-Entrega", progress: 0 },
];

const StudyDashboard = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeModule, setActiveModule] = useState("dashboard");

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col shrink-0">
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-sidebar-primary" />
            <span className="font-heading text-lg font-bold text-sidebar-accent-foreground">
              Constru<span className="text-sidebar-primary">Gestão</span>
            </span>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {modules.map((mod) => {
            const Icon = mod.icon;
            const isActive = activeModule === mod.key;
            return (
              <button
                key={mod.key}
                onClick={() => setActiveModule(mod.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-primary font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{mod.label}</span>
                {!mod.ready && (
                  <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
                    Em breve
                  </Badge>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground hover:text-sidebar-accent-foreground"
            onClick={() => navigate("/hub")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar ao Hub
          </Button>
        </div>
      </aside>

      {/* Conteúdo principal */}
      <main className="flex-1 overflow-auto">
        <header className="border-b bg-card px-8 py-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <button onClick={() => navigate("/hub")} className="hover:text-foreground transition-colors">
              Projetos
            </button>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium">Projeto #{id}</span>
          </div>
          <h1 className="font-heading text-2xl font-bold">Dashboard do Estudo</h1>
        </header>

        <div className="p-8 space-y-6 animate-fade-in">
          {/* KPIs placeholder */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "VGV Estimado", value: "R$ 12.500.000", color: "accent" },
              { label: "Custo Total", value: "R$ 8.200.000", color: "info" },
              { label: "Margem Bruta", value: "34,4%", color: "success" },
              { label: "TIR Projetada", value: "18,2% a.a.", color: "warning" },
            ].map((kpi) => (
              <Card key={kpi.label}>
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground">{kpi.label}</p>
                  <p className="font-heading text-2xl font-bold mt-1">{kpi.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Etapas A-E */}
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">Etapas do Projeto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {stages.map((stage) => (
                <div key={stage.key} className="space-y-1.5">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium">{stage.label}</span>
                    <span className="text-muted-foreground">{stage.progress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-500"
                      style={{ width: `${stage.progress}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Placeholder módulos */}
          {activeModule !== "dashboard" && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <HardHat className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-heading text-lg font-semibold">
                  Módulo em desenvolvimento
                </h3>
                <p className="text-muted-foreground text-sm mt-1 max-w-sm">
                  Este módulo será implementado nas próximas etapas. Acompanhe o progresso pelo checklist.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
};

export default StudyDashboard;
