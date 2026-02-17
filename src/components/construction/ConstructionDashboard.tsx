import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRNumber } from "@/components/ui/masked-number-input";
import { Ruler, DollarSign, ShoppingCart, TrendingUp, BarChart3, Layers } from "lucide-react";

interface StageTreeNode {
  id: string;
  code: string;
  name: string;
  level: number;
  children: StageTreeNode[];
}

interface Props {
  studyId: string;
  stageTree: StageTreeNode[];
  onNavigateStages: () => void;
}

interface KpiData {
  totalPago: number;
  pedidoCompra: number;
  totalAPedir: number;
  totalGeral: number;
  m2Construido: number;
  valorM2: number;
}

export default function ConstructionDashboard({ studyId, stageTree, onNavigateStages }: Props) {
  const [kpi, setKpi] = useState<KpiData>({
    totalPago: 0,
    pedidoCompra: 0,
    totalAPedir: 0,
    totalGeral: 0,
    m2Construido: 0,
    valorM2: 0,
  });

  const isDark = document.documentElement.classList.contains("dark");

  const fetchKpis = useCallback(async () => {
    const { data: stages } = await supabase
      .from("construction_stages" as any)
      .select("total_value, area_m2, status")
      .eq("study_id", studyId)
      .eq("is_deleted", false);

    if (!stages) return;

    let totalGeral = 0;
    let totalPago = 0;
    let m2Construido = 0;

    for (const s of stages as any[]) {
      totalGeral += Number(s.total_value) || 0;
      if (s.status === "completed") {
        totalPago += Number(s.total_value) || 0;
        m2Construido += Number(s.area_m2) || 0;
      }
    }

    const valorM2 = m2Construido > 0 ? totalPago / m2Construido : 0;

    setKpi({
      totalPago,
      pedidoCompra: 0,
      totalAPedir: totalGeral - totalPago,
      totalGeral,
      m2Construido,
      valorM2,
    });
  }, [studyId]);

  useEffect(() => {
    fetchKpis();
  }, [fetchKpis]);

  const fmt = (v: number) => (v ? formatBRNumber(v) : "0,00");
  const fmtM2 = (v: number) => (v ? formatBRNumber(v) : "0,00");

  const kpiCards = [
    { label: "m² Construído", value: `${fmtM2(kpi.m2Construido)} m²`, icon: Ruler },
    { label: "Total a Pedir", value: `R$ ${fmt(kpi.totalAPedir)}`, icon: ShoppingCart },
    { label: "Total Pago", value: `R$ ${fmt(kpi.totalPago)}`, icon: DollarSign },
    { label: "Valor m²", value: `R$ ${fmtM2(kpi.valorM2)}`, icon: TrendingUp },
    { label: "Pedido de Compra", value: `R$ ${fmt(kpi.pedidoCompra)}`, icon: BarChart3 },
    { label: "Total Geral", value: `R$ ${fmt(kpi.totalGeral)}`, icon: Layers },
  ];

  const summaryBg = isDark ? 'hsl(180, 28%, 12%)' : 'hsl(180, 28%, 88%)';

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-foreground">Dashboard</h2>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map((card) => (
          <div 
            key={card.label} 
            className="rounded-xl p-3 space-y-1.5"
            style={{ backgroundColor: summaryBg }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide leading-tight">
                {card.label}
              </span>
              <card.icon className="h-3.5 w-3.5 text-primary shrink-0" />
            </div>
            <p className="text-sm font-bold text-foreground leading-tight">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Gantt placeholder */}
      <div className="card-dashboard">
        <h3 className="text-sm font-semibold text-foreground mb-4">Cronograma de Gantt</h3>
        {stageTree.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Layers className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">Nenhuma etapa criada ainda</p>
            <button
              className="mt-3 text-sm text-primary hover:text-primary-hover font-medium transition-colors"
              onClick={onNavigateStages}
            >
              Criar primeira etapa →
            </button>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground italic py-8 text-center">
            Cronograma será exibido após cadastrar etapas com datas.
          </div>
        )}
      </div>
    </div>
  );
}
