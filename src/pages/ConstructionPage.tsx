import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import GlobalTopbar from "@/components/GlobalTopbar";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ChevronDown, ChevronRight, LayoutDashboard, Layers, Calculator, ShoppingCart, Package, Wallet, FileBarChart, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import ConstructionDashboard from "@/components/construction/ConstructionDashboard";
import ConstructionStages from "@/components/construction/ConstructionStages";

type ViewType = "dashboard" | "stages" | "budget" | "purchase-orders" | "purchases" | "financial" | "reports";

interface StageTreeNode {
  id: string;
  code: string;
  name: string;
  level: number;
  children: StageTreeNode[];
}

export default function ConstructionPage() {
  const { id: studyId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<ViewType>("dashboard");
  const [stagesExpanded, setStagesExpanded] = useState(true);
  const [stageTree, setStageTree] = useState<StageTreeNode[]>([]);
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set());
  const [studyName, setStudyName] = useState("");
  const [incompleteStageNames, setIncompleteStageNames] = useState<string[]>([]);
  const [pendingView, setPendingView] = useState<ViewType | null>(null);

  const fetchStudy = useCallback(async () => {
    if (!studyId) return;
    const { data } = await supabase
      .from("studies")
      .select("name")
      .eq("id", studyId)
      .single();
    if (data) setStudyName(data.name);
  }, [studyId]);

  const fetchStageTree = useCallback(async () => {
    if (!studyId) return;
    const { data } = await supabase
      .from("construction_stages" as any)
      .select("id, code, name, level, parent_id, position")
      .eq("study_id", studyId)
      .eq("is_deleted", false)
      .order("position");
    if (!data) return;

    const map = new Map<string | null, any[]>();
    for (const s of data as any[]) {
      const pid = s.parent_id || null;
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid)!.push(s);
    }

    function buildTree(parentId: string | null): StageTreeNode[] {
      const children = map.get(parentId) || [];
      return children.map((s) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        level: s.level,
        children: buildTree(s.id),
      }));
    }

    setStageTree(buildTree(null));
  }, [studyId]);

  useEffect(() => {
    fetchStudy();
    fetchStageTree();
  }, [fetchStudy, fetchStageTree]);

  const toggleStageExpand = (id: string) => {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleViewChange = (view: ViewType) => {
    if (view === "financial") {
      navigate(`/studies/${studyId}/bills`);
      return;
    }
    if (activeView === "stages" && view !== "stages" && incompleteStageNames.length > 0) {
      setPendingView(view);
      return;
    }
    setActiveView(view);
  };

  const menuItems: { key: ViewType; label: string; icon: React.ElementType }[] = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "stages", label: "Etapas", icon: Layers },
    { key: "budget", label: "Orçamento", icon: Calculator },
    { key: "purchase-orders", label: "Pedido de Compra", icon: ShoppingCart },
    { key: "purchases", label: "Compras", icon: Package },
    { key: "financial", label: "Financeiro", icon: Wallet },
    { key: "reports", label: "Relatórios", icon: FileBarChart },
  ];

  function renderStageNode(node: StageTreeNode, depth: number) {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedStages.has(node.id);
    return (
      <div key={node.id}>
        <button
          className="flex items-center gap-1 w-full text-left py-1 px-1 rounded hover:bg-muted/50 text-sm transition-colors"
          style={{ paddingLeft: `${(depth + 1) * 12}px` }}
          onClick={() => {
            if (hasChildren) toggleStageExpand(node.id);
          }}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-foreground/80">{node.code} - {node.name}</span>
        </button>
        {hasChildren && isExpanded && node.children.map((c) => renderStageNode(c, depth + 1))}
      </div>
    );
  }

  function renderContent() {
    if (!studyId) return null;
    switch (activeView) {
      case "dashboard":
        return <ConstructionDashboard studyId={studyId} stageTree={stageTree} onNavigateStages={() => setActiveView("stages")} />;
      case "stages":
        return (
          <ConstructionStages
            studyId={studyId}
            onStagesChanged={fetchStageTree}
            onIncompleteStagesChange={setIncompleteStageNames}
          />
        );
      default:
        return (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground text-sm">Em breve</p>
          </div>
        );
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <GlobalTopbar />
      <div className="max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-4 flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Obras / Construção</h1>
            {studyName && <p className="text-sm text-muted-foreground">{studyName}</p>}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/studies/${studyId}/dashboard`)}
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Voltar
          </Button>
        </div>

        {/* Main layout */}
        <div className="flex-1 min-h-0">
          <ResizablePanelGroup direction="horizontal" className="rounded-xl border bg-card shadow-sm min-h-[600px]">
            {/* Sidebar */}
            <ResizablePanel defaultSize={20} minSize={14} maxSize={35}>
              <div className="h-full flex flex-col p-3 overflow-y-auto">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 px-1">Menu</p>
                <nav className="space-y-0.5">
                  {menuItems.map((item) => (
                    <div key={item.key}>
                      <div
                        className={cn(
                          "flex items-center gap-2 w-full text-left py-2 px-2 rounded-lg text-sm font-medium transition-colors",
                          activeView === item.key
                            ? "bg-muted text-foreground"
                            : "text-foreground hover:bg-muted/50"
                        )}
                      >
                        <button
                          className="flex items-center gap-2 flex-1 min-w-0"
                          onClick={() => handleViewChange(item.key)}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </button>
                        {item.key === "stages" && (
                          <button
                            className="shrink-0 p-0.5 rounded hover:bg-muted/80"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStagesExpanded(!stagesExpanded);
                            }}
                          >
                            {stagesExpanded
                              ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                              : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                          </button>
                        )}
                      </div>
                      {/* Stage tree under Etapas */}
                      {item.key === "stages" && stagesExpanded && (
                        <div className="mt-1 mb-1">
                          {stageTree.length === 0 ? (
                            <p className="text-xs text-muted-foreground px-3 py-1 italic">
                              Nenhuma etapa criada
                            </p>
                          ) : (
                            stageTree.map((n) => renderStageNode(n, 0))
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </nav>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Content */}
            <ResizablePanel defaultSize={80}>
              <div className="h-full overflow-y-auto p-4 sm:p-6">
                {renderContent()}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>

      {/* Incomplete stages warning */}
      <AlertDialog open={!!pendingView} onOpenChange={() => setPendingView(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Etapas incompletas</AlertDialogTitle>
            <AlertDialogDescription>
              As seguintes etapas/sub-etapas ainda não foram preenchidas (quantidade e valor unitário):
              <br />
              <span className="font-medium text-foreground">
                {incompleteStageNames.join(', ')}
              </span>
              <br />
              Deseja continuar sem preencher?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setActiveView(pendingView!); setPendingView(null); }}>
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
