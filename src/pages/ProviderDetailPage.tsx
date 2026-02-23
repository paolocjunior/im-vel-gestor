import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, ArrowLeft, Plus } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import GlobalTopbar from "@/components/GlobalTopbar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { recomputeAndSave } from "@/lib/recomputeService";
import { formatBRL } from "@/lib/recompute";

interface ProviderData {
  full_name: string;
  cpf_cnpj: string | null;
}

interface Contract {
  id: string;
  service: string;
  amount: number;
  billing_model: string;
  start_date: string;
  end_date: string | null;
  status: string;
  details: string | null;
}

interface Payment {
  contract_id: string | null;
  amount: number;
  status: string;
}

export default function ProviderDetailPage() {
  const { id: studyId, providerId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [provider, setProvider] = useState<ProviderData | null>(null);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [deleteContractId, setDeleteContractId] = useState<string | null>(null);

  useEffect(() => { if (user && providerId) loadData(); }, [user, providerId]);

  const loadData = async () => {
    const [pRes, cRes, payRes] = await Promise.all([
      supabase.from("study_providers").select("full_name, cpf_cnpj").eq("id", providerId).single(),
      supabase.from("study_provider_contracts")
        .select("id, service, amount, billing_model, start_date, end_date, status, details")
        .eq("provider_id", providerId).eq("study_id", studyId).eq("is_deleted", false)
        .order("start_date", { ascending: true }),
      supabase.from("study_provider_payments")
        .select("contract_id, amount, status")
        .eq("provider_id", providerId).eq("study_id", studyId).eq("is_deleted", false),
    ]);
    setProvider(pRes.data);
    setContracts((cRes.data || []).map(c => ({ ...c, amount: Number(c.amount) })));
    setPayments((payRes.data || []).map(p => ({ ...p, amount: Number(p.amount) })));
  };

  // Pending payment per contract
  const pendingPayment = useMemo(() => {
    const map: Record<string, number> = {};
    contracts.forEach(c => {
      const paid = payments
        .filter(p => p.contract_id === c.id && p.status === "PAID")
        .reduce((sum, p) => sum + p.amount, 0);
      map[c.id] = Math.max(0, c.amount - paid);
    });
    return map;
  }, [contracts, payments]);

  const deleteContract = async () => {
    if (!deleteContractId) return;
    await supabase.from("study_provider_contracts").update({ is_deleted: true }).eq("id", deleteContractId);
    await supabase.from("study_provider_payments").update({ is_deleted: true }).eq("contract_id", deleteContractId);
    await recomputeAndSave(studyId!, user!.id);
    setDeleteContractId(null);
    toast.success("Contrato excluído.");
    loadData();
  };

  const billingLabel = (m: string) => {
    if (m === "FIXED") return "Valor Fixo";
    if (m === "HOURLY") return "Por Hora";
    if (m === "PERCENT") return "Percentual";
    return m;
  };

  if (!provider) return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar />
      <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar />
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold">{provider.full_name}</h1>
          <p className="text-sm text-muted-foreground">{provider.cpf_cnpj || "Sem documento"}</p>
        </div>

        <div className="flex gap-3">
          <Button size="sm" onClick={() => navigate(`/studies/${studyId}/providers/${providerId}/edit?tab=contracts`)}>
            <Plus className="h-4 w-4 mr-1" /> Novo Contrato
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/studies/${studyId}/providers`)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
        </div>

        {contracts.length === 0 ? (
          <div className="border rounded-lg p-8 text-center">
            <p className="text-muted-foreground">Nenhum contrato cadastrado.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {contracts.map((c, i) => (
              <div key={c.id} className="border rounded-lg p-5 space-y-3">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-base">Contrato {i + 1} - {c.service}</h3>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm"
                      onClick={() => navigate(`/studies/${studyId}/providers/${providerId}/edit?tab=contracts&contractId=${c.id}`)}>
                      <Pencil className="h-4 w-4 text-amber-600" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteContractId(c.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Serviço/Função</p>
                    <p className="font-medium">{c.service}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Data Inicial</p>
                    <p className="font-medium">{c.start_date.split("-").reverse().join("/")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Data Final</p>
                    <p className="font-medium">{c.end_date ? c.end_date.split("-").reverse().join("/") : "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Modelo de Cobrança</p>
                    <p className="font-medium">{billingLabel(c.billing_model)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Valor Base</p>
                    <p className="font-medium">{formatBRL(c.amount)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <p className="font-medium">{c.status === "ACTIVE" ? "Ativo" : "Finalizado"}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Pagamento Pendente</p>
                    <p className="font-bold text-destructive">{formatBRL(pendingPayment[c.id] || 0)}</p>
                  </div>
                </div>
                {c.details && (
                  <div className="border-t pt-2">
                    <p className="text-sm text-muted-foreground">Detalhes</p>
                    <p className="text-sm whitespace-pre-line">{c.details}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteContractId} onOpenChange={() => setDeleteContractId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Excluir contrato?</AlertDialogTitle>
            <AlertDialogDescription>O contrato será movido para a lixeira.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteContract} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
