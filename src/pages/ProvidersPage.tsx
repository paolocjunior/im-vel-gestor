import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, ArrowLeft, Eye } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import GlobalTopbar from "@/components/GlobalTopbar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Provider {
  id: string;
  full_name: string;
  cpf_cnpj: string | null;
}

interface Contract {
  id: string;
  provider_id: string;
  service: string;
  status: string;
  start_date: string;
}

type FilterKey = "name" | "cpf_cnpj" | "service" | "status";

export default function ProvidersPage() {
  const { id: studyId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<FilterKey, string[]>>({
    name: [], cpf_cnpj: [], service: [], status: [],
  });

  useEffect(() => { if (user && studyId) loadAll(); }, [user?.id, studyId]);

  const loadAll = async () => {
    const [pRes, cRes] = await Promise.all([
      supabase.from("study_providers")
        .select("id, full_name, cpf_cnpj")
        .eq("study_id", studyId).eq("is_deleted", false)
        .order("full_name", { ascending: true }),
      supabase.from("study_provider_contracts")
        .select("id, provider_id, service, status, start_date")
        .eq("study_id", studyId).eq("is_deleted", false)
        .order("start_date", { ascending: true }),
    ]);
    setProviders(pRes.data || []);
    setContracts(cRes.data || []);
    setLoading(false);
  };

  // Derive service + status per provider
  const providerMeta = useMemo(() => {
    const map: Record<string, { service: string; status: string }> = {};
    providers.forEach(p => {
      const pContracts = contracts.filter(c => c.provider_id === p.id);
      const active = pContracts.filter(c => c.status === "ACTIVE");
      if (active.length > 0) {
        map[p.id] = { service: active[0].service, status: "Ativo" };
      } else if (pContracts.length > 0) {
        map[p.id] = { service: pContracts[0].service, status: "Finalizado" };
      } else {
        map[p.id] = { service: "—", status: "—" };
      }
    });
    return map;
  }, [providers, contracts]);

  // Build enriched list
  const enrichedProviders = useMemo(() =>
    providers.map(p => ({
      ...p,
      service: providerMeta[p.id]?.service || "—",
      status: providerMeta[p.id]?.status || "—",
    })),
  [providers, providerMeta]);

  // Filtered
  const filteredProviders = useMemo(() => {
    return enrichedProviders.filter(p => {
      if (filters.name.length && !filters.name.includes(p.full_name)) return false;
      if (filters.cpf_cnpj.length && !filters.cpf_cnpj.includes(p.cpf_cnpj?.trim() || "")) return false;
      if (filters.service.length && !filters.service.includes(p.service)) return false;
      if (filters.status.length && !filters.status.includes(p.status)) return false;
      return true;
    });
  }, [enrichedProviders, filters]);

  // Cascading filter options
  const filterOptions = useMemo(() => {
    const getFiltered = (excludeKey: FilterKey) => {
      return enrichedProviders.filter(p => {
        if (excludeKey !== "name" && filters.name.length && !filters.name.includes(p.full_name)) return false;
        if (excludeKey !== "cpf_cnpj" && filters.cpf_cnpj.length && !filters.cpf_cnpj.includes(p.cpf_cnpj?.trim() || "")) return false;
        if (excludeKey !== "service" && filters.service.length && !filters.service.includes(p.service)) return false;
        if (excludeKey !== "status" && filters.status.length && !filters.status.includes(p.status)) return false;
        return true;
      });
    };
    const extract = (list: typeof enrichedProviders, key: FilterKey) => {
      const set = new Set<string>();
      list.forEach(p => {
        let val = "";
        if (key === "name") val = p.full_name;
        else if (key === "cpf_cnpj") val = (p.cpf_cnpj || "").trim();
        else if (key === "service") val = p.service;
        else if (key === "status") val = p.status;
        if (val && val !== "—") set.add(val);
      });
      return [...set].sort();
    };
    return {
      name: extract(getFiltered("name"), "name"),
      cpf_cnpj: extract(getFiltered("cpf_cnpj"), "cpf_cnpj"),
      service: extract(getFiltered("service"), "service"),
      status: extract(getFiltered("status"), "status"),
    };
  }, [enrichedProviders, filters]);

  const hasActiveFilters = Object.values(filters).some(f => f.length > 0);
  const clearFilters = () => setFilters({ name: [], cpf_cnpj: [], service: [], status: [] });
  const toggleFilter = (key: FilterKey, value: string) => {
    setFilters(prev => {
      const arr = prev[key];
      return { ...prev, [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
  };

  const deleteProvider = async () => {
    if (!deleteId) return;
    await supabase.from("study_providers").update({ is_deleted: true }).eq("id", deleteId);
    setDeleteId(null);
    toast.success("Prestador excluído.");
    loadAll();
  };

  return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar />
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        <h1 className="text-xl font-bold">Prestador e Contratos</h1>

        <div className="flex items-center justify-between">
          <Button size="sm" onClick={() => navigate(`/studies/${studyId}/providers/new`)}>
            <Plus className="h-4 w-4 mr-1" /> Novo Prestador/Contratos
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/studies/${studyId}/dashboard`)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
        </div>

        {/* Filters */}
        {enrichedProviders.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">Filtros:</span>
            {(["name", "cpf_cnpj", "service", "status"] as FilterKey[]).map(key => {
              const labels: Record<FilterKey, string> = { name: "Nome", cpf_cnpj: "CPF/CNPJ", service: "Serviço", status: "Status" };
              const options = filterOptions[key];
              if (!options.length) return null;
              return (
                <FilterDropdown key={key} label={labels[key]} options={options} selected={filters[key]} onToggle={(val) => toggleFilter(key, val)} />
              );
            })}
            {hasActiveFilters && <Button variant="outline" size="sm" onClick={clearFilters}>Limpar</Button>}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>
        ) : filteredProviders.length === 0 ? (
          <div className="card-dashboard text-center py-12">
            <p className="text-muted-foreground">Nenhum prestador encontrado.</p>
          </div>
        ) : (
          <div className="relative w-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CPF/CNPJ</TableHead>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Opções</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProviders.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.full_name}</TableCell>
                    <TableCell>{p.cpf_cnpj || "—"}</TableCell>
                    <TableCell>{p.service}</TableCell>
                    <TableCell>{p.status}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/studies/${studyId}/providers/${p.id}/view`)} title="Visualizar">
                          <Eye className="h-4 w-4 text-primary" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/studies/${studyId}/providers/${p.id}/edit`)} title="Editar">
                          <Pencil className="h-4 w-4 text-amber-600" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteId(p.id)} title="Excluir">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir prestador?</AlertDialogTitle>
            <AlertDialogDescription>O prestador será movido para a lixeira.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteProvider} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------- Filter Dropdown ---------- */
function FilterDropdown({ label, options, selected, onToggle }: {
  label: string; options: string[]; selected: string[]; onToggle: (val: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs">
          {label} {selected.length > 0 && <span className="ml-1 bg-primary text-primary-foreground rounded-full px-1.5 text-[10px]">{selected.length}</span>}
          <span className="ml-1">▾</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2 max-h-60 overflow-y-auto" align="start">
        {options.map(opt => (
          <label key={opt} className="flex items-center gap-2 py-1 px-1 hover:bg-accent rounded cursor-pointer text-sm">
            <Checkbox checked={selected.includes(opt)} onCheckedChange={() => onToggle(opt)} />
            <span className="truncate">{opt}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}
