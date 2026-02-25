import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import GlobalTopbar from "@/components/GlobalTopbar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DraftRow {
  id: string;
  quotation_number: number;
  created_at: string;
  vendor_email: string | null;
  study_vendors: {
    nome_fantasia: string | null;
    razao_social: string | null;
  } | null;
  item_count: number;
}

export default function QuotationDraftsPage() {
  const { id: studyId } = useParams();
  const navigate = useNavigate();

  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDraftId, setDeleteDraftId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const backToBudgetPath = `/studies/${studyId}/construction?view=budget`;

  const loadDrafts = useCallback(async () => {
    if (!studyId) return;
    setLoading(true);

    const { data: requests, error: reqError } = await supabase
      .from("quotation_requests" as any)
      .select("id, quotation_number, created_at, vendor_email, study_vendors(nome_fantasia, razao_social)")
      .eq("study_id", studyId)
      .eq("status", "draft")
      .order("quotation_number", { ascending: true });

    if (reqError) {
      toast.error("Erro ao carregar rascunhos");
      setDrafts([]);
      setLoading(false);
      return;
    }

    const requestList = (requests as any[]) || [];
    const requestIds = requestList.map((r) => r.id);
    let itemCountByRequest: Record<string, number> = {};

    if (requestIds.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from("quotation_request_items" as any)
        .select("request_id")
        .in("request_id", requestIds);

      if (itemsError) {
        toast.error("Erro ao carregar itens dos rascunhos");
      } else {
        for (const item of (items as any[]) || []) {
          const requestId = item.request_id as string;
          itemCountByRequest[requestId] = (itemCountByRequest[requestId] || 0) + 1;
        }
      }
    }

    const mappedDrafts: DraftRow[] = requestList.map((row: any) => ({
      id: row.id,
      quotation_number: row.quotation_number,
      created_at: row.created_at,
      vendor_email: row.vendor_email,
      study_vendors: row.study_vendors,
      item_count: itemCountByRequest[row.id] || 0,
    }));

    setDrafts(mappedDrafts);
    setLoading(false);
  }, [studyId]);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  const draftToDelete = useMemo(
    () => drafts.find((d) => d.id === deleteDraftId) || null,
    [drafts, deleteDraftId]
  );

  const formatDate = (iso: string) => {
    if (!iso) return "-";
    return new Date(iso).toLocaleDateString("pt-BR");
  };

  const getVendorLabel = (draft: DraftRow) => {
    return (
      draft.study_vendors?.nome_fantasia ||
      draft.study_vendors?.razao_social ||
      draft.vendor_email ||
      "-"
    );
  };

  const handleDeleteDraft = async () => {
    if (!studyId || !deleteDraftId) return;
    setDeleting(true);

    const { error } = await supabase
      .from("quotation_requests" as any)
      .delete()
      .eq("id", deleteDraftId)
      .eq("study_id", studyId)
      .eq("status", "draft");

    setDeleting(false);

    if (error) {
      toast.error("Erro ao excluir rascunho");
      return;
    }

    setDrafts((prev) => prev.filter((d) => d.id !== deleteDraftId));
    setDeleteDraftId(null);
    toast.success("Rascunho excluido");
  };

  return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-foreground">Rascunhos de Cotacao</h1>
          <Button variant="outline" size="sm" onClick={() => navigate(backToBudgetPath)}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Voltar para Orcamento
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-56">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : drafts.length === 0 ? (
          <div className="rounded-lg border p-10 text-center text-sm text-muted-foreground">
            Nenhum rascunho encontrado.
          </div>
        ) : (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-[120px]">Cotacao</TableHead>
                  <TableHead className="text-xs w-[180px]">Data da criacao</TableHead>
                  <TableHead className="text-xs w-[90px] text-center">Qtde</TableHead>
                  <TableHead className="text-xs">Fornecedor</TableHead>
                  <TableHead className="text-xs w-[70px] text-center" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.map((draft) => (
                  <TableRow
                    key={draft.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/studies/${studyId}/quotation-request?draftId=${draft.id}`)}
                  >
                    <TableCell className="font-mono text-sm">
                      {String(draft.quotation_number).padStart(3, "0")}
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(draft.created_at)}</TableCell>
                    <TableCell className="text-sm text-center font-mono">{draft.item_count}</TableCell>
                    <TableCell className="text-sm">{getVendorLabel(draft)}</TableCell>
                    <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setDeleteDraftId(draft.id)}
                        title="Excluir rascunho"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteDraftId} onOpenChange={(open) => { if (!open) setDeleteDraftId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir rascunho</AlertDialogTitle>
            <AlertDialogDescription>
              {draftToDelete
                ? `Deseja excluir o rascunho da cotacao ${String(draftToDelete.quotation_number).padStart(3, "0")}?`
                : "Deseja excluir este rascunho?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void handleDeleteDraft();
              }}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

