import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  buildSCurveData,
  SCurveResult,
  StageMinimal,
  MonthlyValueRow,
} from "./sCurveUtils";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Info } from "lucide-react";

interface Props {
  studyId: string;
}

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

export default function SCurveChart({ studyId }: Props) {
  const [result, setResult] = useState<SCurveResult | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Query 1: active stages (id, parent_id)
    const { data: stagesRaw } = await supabase
      .from("construction_stages" as any)
      .select("id, parent_id")
      .eq("study_id", studyId)
      .eq("is_deleted", false);

    const stages: StageMinimal[] = (stagesRaw as any[] | null) ?? [];

    // Query 2: monthly values — explicit value_type filter
    const { data: mvRaw } = await supabase
      .from("construction_stage_monthly_values" as any)
      .select("stage_id, month_key, value, value_type")
      .eq("study_id", studyId)
      .in("value_type", ["planned", "actual"]);

    const monthlyValues: MonthlyValueRow[] = (mvRaw as any[] | null) ?? [];

    const res = buildSCurveData(stages, monthlyValues);
    setResult(res);
    setLoading(false);
  }, [studyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-muted-foreground">Carregando Curva S...</p>
      </div>
    );
  }

  if (!result) return null;

  if (result.status === "no-leaves") {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center gap-2">
        <Info className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Nenhuma etapa-folha cadastrada neste estudo.
        </p>
      </div>
    );
  }

  if (result.status === "no-values") {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center gap-2">
        <Info className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Etapas cadastradas, mas ainda sem valores planejados ou realizados para gerar a Curva S.
        </p>
      </div>
    );
  }

  const { data } = result;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Curva S Financeira</h3>
        <p className="text-[10px] text-muted-foreground">Baseado em competência mensal</p>
      </div>

      <div className="w-full" style={{ height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} barGap={4} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10 }}
              className="fill-muted-foreground"
            />
            <YAxis
              tickFormatter={(v: number) => {
                if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
                return String(v);
              }}
              tick={{ fontSize: 10 }}
              className="fill-muted-foreground"
              width={55}
            />
            <Tooltip
              formatter={(value: number, name: string) => [formatBRL(value), name]}
              labelStyle={{ fontWeight: 600 }}
              contentStyle={{
                fontSize: 12,
                borderRadius: 8,
                border: "1px solid hsl(var(--border))",
                backgroundColor: "hsl(var(--background))",
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11 }}
            />

            {/* Barras mensais lado a lado */}
            <Bar
              dataKey="pvMensal"
              name="PV Mensal"
              fill="hsl(var(--primary))"
              opacity={0.3}
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="acMensal"
              name="AC Mensal"
              fill="hsl(var(--chart-2))"
              opacity={0.3}
              radius={[2, 2, 0, 0]}
            />

            {/* Linhas acumuladas */}
            <Line
              type="monotone"
              dataKey="pvAcum"
              name="PV Acumulado"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="acAcum"
              name="AC Acumulado"
              stroke="hsl(var(--chart-2))"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="desvioAcum"
              name="Desvio Acumulado"
              stroke="hsl(var(--destructive))"
              strokeWidth={1.5}
              strokeDasharray="6 3"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
