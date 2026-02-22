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
  Area,
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
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

interface ExecutiveDataPoint {
  label: string;
  pvAcum: number;
  acAcum: number;
  // For fill between curves
  fillGreen: number | null; // AC > PV portion (adiantamento)
  fillRed: number | null;   // PV > AC portion (atraso)
}

export default function SCurveExecutiveChart({ studyId }: Props) {
  const [data, setData] = useState<ExecutiveDataPoint[]>([]);
  const [status, setStatus] = useState<"loading" | "no-leaves" | "no-values" | "ok">("loading");

  const fetchData = useCallback(async () => {
    setStatus("loading");

    const { data: stagesRaw } = await supabase
      .from("construction_stages" as any)
      .select("id, parent_id")
      .eq("study_id", studyId)
      .eq("is_deleted", false);

    const stages: StageMinimal[] = (stagesRaw as any[] | null) ?? [];

    const { data: mvRaw } = await supabase
      .from("construction_stage_monthly_values" as any)
      .select("stage_id, month_key, value, value_type")
      .eq("study_id", studyId)
      .in("value_type", ["planned", "actual"]);

    const monthlyValues: MonthlyValueRow[] = (mvRaw as any[] | null) ?? [];

    const result = buildSCurveData(stages, monthlyValues);

    if (result.status !== "ok") {
      setStatus(result.status);
      return;
    }

    const execData: ExecutiveDataPoint[] = result.data.map((d) => ({
      label: d.label,
      pvAcum: d.pvAcum,
      acAcum: d.acAcum,
      fillGreen: d.acAcum > d.pvAcum ? d.acAcum : null,
      fillRed: d.acAcum < d.pvAcum ? d.pvAcum : null,
    }));

    setData(execData);
    setStatus("ok");
  }, [studyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-muted-foreground">Carregando Curva S Executiva...</p>
      </div>
    );
  }

  if (status === "no-leaves") {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center gap-2">
        <Info className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Nenhuma etapa-folha cadastrada neste estudo.
        </p>
      </div>
    );
  }

  if (status === "no-values") {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center gap-2">
        <Info className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Etapas cadastradas, mas ainda sem valores planejados ou realizados para gerar a Curva S.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Curva S Financeira — Executivo</h3>
        <p className="text-[10px] text-muted-foreground">Baseado em competência mensal</p>
      </div>

      <div className="w-full" style={{ height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <defs>
              <linearGradient id="areaGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="areaRed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10 }}
              className="fill-muted-foreground"
            />
            <YAxis
              tickFormatter={(v: number) => formatBRL(v)}
              tick={{ fontSize: 10 }}
              className="fill-muted-foreground"
              width={90}
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
            <Legend wrapperStyle={{ fontSize: 11 }} />

            {/* Area fills for visual difference */}
            <Area
              type="monotone"
              dataKey="acAcum"
              name="Realizado (AC Acumulado)"
              stroke="none"
              fill="url(#areaGreen)"
              fillOpacity={1}
              connectNulls
            />
            <Area
              type="monotone"
              dataKey="pvAcum"
              name="_pvFill"
              stroke="none"
              fill="hsl(var(--background))"
              fillOpacity={1}
              legendType="none"
              connectNulls
            />

            {/* Main curves */}
            <Line
              type="monotone"
              dataKey="pvAcum"
              name="Baseline (PV Acumulado)"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={3}
              dot={false}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="acAcum"
              name="Realizado (AC Acumulado)"
              stroke="hsl(25, 95%, 53%)"
              strokeWidth={3}
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
