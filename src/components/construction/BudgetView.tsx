import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatBRNumber } from "@/components/ui/masked-number-input";
import {
  DollarSign, CheckCircle2, AlertCircle, ShoppingCart, Package, PackageCheck,
  Search, Filter, RefreshCw, ChevronDown, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import BudgetDrawer from "./BudgetDrawer";

/* ─── types ─── */
interface Stage {
  id: string;
  code: string;
  name: string;
  level: number;
  parent_id: string | null;
  stage_type: string | null;
  quantity: number;
  unit_price: number;
  total_value: number;
  start_date: string | null;
  end_date: string | null;
  unit_id: string | null;
  status: string;
}

interface QuotationItem {
  id: string;
  stage_id: string;
  status: string;
  need_date: string | null;
  approved_proposal_id: string | null;
}

interface Proposal {
  id: string;
  quotation_item_id: string;
  vendor_id: string;
  unit_price: number;
  total_price: number;
  delivery_days: number | null;
  proposal_date: string;
  is_winner: boolean;
  vendor_name?: string;
}

interface Unit {
  id: string;
  abbreviation: string;
}

interface Props {
  studyId: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  quoting: "Em cotação",
  approved: "Aprovado",
  ordered: "Pedido",
  received: "Recebido",
  used: "Utilizado",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  quoting: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  ordered: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  received: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  used: "bg-primary/10 text-primary",
};

const TYPE_LABELS: Record<string, string> = {
  material: "Material",
  service: "Serviço",
  labor: "Mão de Obra",
  fee: "Taxas",
};

export default function BudgetView({ studyId }: Props) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [quotationItems, setQuotationItems] = useState<QuotationItem[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // expand rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);

  const isDark = document.documentElement.classList.contains("dark");
  const summaryBg = isDark ? "hsl(180, 28%, 12%)" : "hsl(180, 28%, 88%)";

  /* ─── data fetching ─── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    const [stagesRes, qiRes, proposalsRes, unitsRes] = await Promise.all([
      supabase
        .from("construction_stages" as any)
        .select("id, code, name, level, parent_id, stage_type, quantity, unit_price, total_value, start_date, end_date, unit_id, status")
        .eq("study_id", studyId)
        .eq("is_deleted", false)
        .order("position"),
      supabase
        .from("budget_quotation_items" as any)
        .select("id, stage_id, status, need_date, approved_proposal_id")
        .eq("study_id", studyId)
        .eq("is_deleted", false),
      supabase
        .from("budget_proposals" as any)
        .select("id, quotation_item_id, vendor_id, unit_price, total_price, delivery_days, proposal_date, is_winner")
        .eq("study_id", studyId)
        .eq("is_deleted", false),
      supabase
        .from("construction_units" as any)
        .select("id, abbreviation"),
    ]);

    if (stagesRes.data) setStages(stagesRes.data as any);
    if (qiRes.data) setQuotationItems(qiRes.data as any);

    // enrich proposals with vendor names
    if (proposalsRes.data) {
      const vendorIds = [...new Set((proposalsRes.data as any[]).map((p: any) => p.vendor_id))];
      let vendorMap: Record<string, string> = {};
      if (vendorIds.length > 0) {
        const { data: vendors } = await supabase
          .from("study_vendors")
          .select("id, nome_fantasia, razao_social")
          .in("id", vendorIds);
        if (vendors) {
          for (const v of vendors) {
            vendorMap[v.id] = v.nome_fantasia || v.razao_social || "—";
          }
        }
      }
      setProposals(
        (proposalsRes.data as any[]).map((p: any) => ({
          ...p,
          vendor_name: vendorMap[p.vendor_id] || "—",
        }))
      );
    }

    if (unitsRes.data) setUnits(unitsRes.data as any);
    setLoading(false);
  }, [studyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ─── derived data ─── */
  const unitMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const u of units) m[u.id] = u.abbreviation;
    return m;
  }, [units]);

  const qiByStage = useMemo(() => {
    const m: Record<string, QuotationItem> = {};
    for (const qi of quotationItems) m[qi.stage_id] = qi;
    return m;
  }, [quotationItems]);

  const proposalsByQi = useMemo(() => {
    const m: Record<string, Proposal[]> = {};
    for (const p of proposals) {
      if (!m[p.quotation_item_id]) m[p.quotation_item_id] = [];
      m[p.quotation_item_id].push(p);
    }
    return m;
  }, [proposals]);

  // leaf stages = stages with no children
  const leafStages = useMemo(() => {
    const parentIds = new Set(stages.filter(s => s.parent_id).map(s => s.parent_id!));
    // stages that are NOT parents of any other stage
    const stageIds = new Set(stages.map(s => s.id));
    return stages.filter(s => {
      // check if any other stage has this as parent
      return !stages.some(other => other.parent_id === s.id);
    });
  }, [stages]);

  // filtered leaf stages
  const filteredLeaves = useMemo(() => {
    return leafStages.filter(s => {
      if (search) {
        const q = search.toLowerCase();
        if (!s.code.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q)) return false;
      }
      if (typeFilter !== "all" && s.stage_type !== typeFilter) return false;
      if (statusFilter !== "all") {
        const qi = qiByStage[s.id];
        const st = qi?.status || "pending";
        if (st !== statusFilter) return false;
      }
      return true;
    });
  }, [leafStages, search, typeFilter, statusFilter, qiByStage]);

  /* ─── KPIs ─── */
  const kpis = useMemo(() => {
    let refTotal = 0;
    let approvedTotal = 0;
    let pendingCount = 0;
    let orderedCount = 0;
    let receivedCount = 0;

    for (const s of leafStages) {
      refTotal += Number(s.total_value) || 0;
      const qi = qiByStage[s.id];
      const status = qi?.status || "pending";

      if (status === "approved" || status === "ordered" || status === "received" || status === "used") {
        // find winner proposal
        if (qi) {
          const qiProposals = proposalsByQi[qi.id] || [];
          const winner = qiProposals.find(p => p.is_winner);
          if (winner) approvedTotal += Number(winner.total_price) || 0;
        }
      }

      if (status === "pending" || status === "quoting") pendingCount++;
      if (status === "ordered") orderedCount++;
      if (status === "received" || status === "used") receivedCount++;
    }

    const diff = approvedTotal - refTotal;
    const diffPct = refTotal > 0 ? (diff / refTotal) * 100 : 0;

    return { refTotal, approvedTotal, diff, diffPct, pendingCount, orderedCount, receivedCount };
  }, [leafStages, qiByStage, proposalsByQi]);

  const fmt = (v: number) => formatBRNumber(v);

  const kpiCards = [
    { label: "Valor de Referência", value: `R$ ${fmt(kpis.refTotal)}`, icon: DollarSign },
    { label: "Vlr Orçado Aprovado", value: `R$ ${fmt(kpis.approvedTotal)}`, icon: CheckCircle2 },
    {
      label: "Diferença",
      value: `R$ ${fmt(Math.abs(kpis.diff))} (${kpis.diffPct >= 0 ? "+" : ""}${kpis.diffPct.toFixed(1)}%)`,
      icon: AlertCircle,
    },
    { label: "Pendentes de Cotação", value: String(kpis.pendingCount), icon: Search },
    { label: "Itens em Pedido", value: String(kpis.orderedCount), icon: ShoppingCart },
    { label: "Itens Recebidos", value: String(kpis.receivedCount), icon: PackageCheck },
  ];

  const toggleExpand = (stageId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  };

  const getBestProposal = (stageId: string) => {
    const qi = qiByStage[stageId];
    if (!qi) return null;
    const qiProposals = proposalsByQi[qi.id] || [];
    if (qiProposals.length === 0) return null;
    const winner = qiProposals.find(p => p.is_winner);
    if (winner) return winner;
    // fallback: cheapest
    return qiProposals.reduce((min, p) => (p.unit_price < min.unit_price ? p : min), qiProposals[0]);
  };

  const clearFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setStatusFilter("all");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <h2 className="text-lg font-bold text-foreground">Orçamento</h2>

      {/* KPI Row */}
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar código ou nome..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px] h-9 text-sm">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="material">Material</SelectItem>
            <SelectItem value="service">Serviço</SelectItem>
            <SelectItem value="labor">Mão de Obra</SelectItem>
            <SelectItem value="fee">Taxas</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-9 text-sm">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="quoting">Em cotação</SelectItem>
            <SelectItem value="approved">Aprovado</SelectItem>
            <SelectItem value="ordered">Pedido</SelectItem>
            <SelectItem value="received">Recebido</SelectItem>
            <SelectItem value="used">Utilizado</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={clearFilters} className="h-9">
          Limpar
        </Button>

        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={fetchData} className="h-9">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="text-xs">Código</TableHead>
              <TableHead className="text-xs">Etapa</TableHead>
              <TableHead className="text-xs">Tipo</TableHead>
              <TableHead className="text-xs text-center">Un</TableHead>
              <TableHead className="text-xs text-right">Qtde</TableHead>
              <TableHead className="text-xs text-right">Vlr Ref Unit</TableHead>
              <TableHead className="text-xs text-right">Vlr Ref Total</TableHead>
              <TableHead className="text-xs text-right">Melhor Cot. Unit</TableHead>
              <TableHead className="text-xs text-right">Melhor Cot. Total</TableHead>
              <TableHead className="text-xs">Fornecedor</TableHead>
              <TableHead className="text-xs text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLeaves.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-sm text-muted-foreground py-8">
                  Nenhuma etapa encontrada
                </TableCell>
              </TableRow>
            ) : (
              filteredLeaves.map(stage => {
                const qi = qiByStage[stage.id];
                const status = qi?.status || "pending";
                const best = getBestProposal(stage.id);
                const isExpanded = expandedRows.has(stage.id);
                const stageProposals = qi ? (proposalsByQi[qi.id] || []) : [];

                return (
                  <>
                    <TableRow
                      key={stage.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => { setSelectedStageId(stage.id); setDrawerOpen(true); }}
                    >
                      <TableCell className="px-2" onClick={e => { e.stopPropagation(); if (stageProposals.length > 0) toggleExpand(stage.id); }}>
                        {stageProposals.length > 0 ? (
                          isExpanded
                            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs font-mono">{stage.code}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{stage.name}</TableCell>
                      <TableCell className="text-xs">
                        {stage.stage_type ? TYPE_LABELS[stage.stage_type] || stage.stage_type : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-center">
                        {stage.unit_id ? unitMap[stage.unit_id] || "—" : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">
                        {fmt(stage.quantity)}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">
                        R$ {fmt(stage.unit_price)}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono font-medium">
                        R$ {fmt(stage.total_value)}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">
                        {best ? `R$ ${fmt(best.unit_price)}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono font-medium">
                        {best ? `R$ ${fmt(best.total_price)}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs max-w-[120px] truncate">
                        {best?.vendor_name || "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="secondary"
                          className={cn("text-[10px] px-1.5 py-0.5", STATUS_COLORS[status])}
                        >
                          {STATUS_LABELS[status] || status}
                        </Badge>
                      </TableCell>
                    </TableRow>

                    {/* expanded proposals */}
                    {isExpanded && stageProposals.map(p => (
                      <TableRow key={p.id} className="bg-muted/30">
                        <TableCell />
                        <TableCell />
                        <TableCell colSpan={2} className="text-xs text-muted-foreground pl-6">
                          ↳ {p.vendor_name}
                        </TableCell>
                        <TableCell />
                        <TableCell />
                        <TableCell className="text-xs text-right font-mono text-muted-foreground">
                          R$ {fmt(p.unit_price)}
                        </TableCell>
                        <TableCell />
                        <TableCell />
                        <TableCell className="text-xs text-right font-mono text-muted-foreground">
                          R$ {fmt(p.total_price)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {p.delivery_days ? `${p.delivery_days}d` : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          {p.is_winner && (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0.5">
                              Vencedor
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Footer summary */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{filteredLeaves.length} itens exibidos</span>
        <span>Total de referência: R$ {fmt(kpis.refTotal)}</span>
      </div>

      {/* Drawer */}
      {selectedStageId && (() => {
        const selStage = leafStages.find(s => s.id === selectedStageId);
        const selQi = selStage ? qiByStage[selStage.id] : null;
        const selProposals = selQi ? (proposalsByQi[selQi.id] || []) : [];
        const selUnitAbbr = selStage?.unit_id ? unitMap[selStage.unit_id] || "" : "";
        return (
          <BudgetDrawer
            open={drawerOpen}
            onOpenChange={(o) => { setDrawerOpen(o); if (!o) setSelectedStageId(null); }}
            studyId={studyId}
            stage={selStage || null}
            quotationItem={selQi || null}
            proposals={selProposals}
            unitAbbr={selUnitAbbr}
            onDataChanged={fetchData}
          />
        );
      })()}
    </div>
  );
}
