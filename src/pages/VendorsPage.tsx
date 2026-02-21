import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import UnsavedChangesDialog from "@/components/UnsavedChangesDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, ArrowLeft, Eye, Loader2, X } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
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
import { lookupCNPJ, formatCNPJ, formatPhone } from "@/lib/cnpjLookup";

interface Vendor {
  id: string;
  cnpj: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  category: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
}

const emptyForm = {
  cnpj: "", razao_social: "", nome_fantasia: "", category: "",
  email: "", phone: "", street: "", street_number: "", complement: "",
  neighborhood: "", city: "", state: "", notes: "",
};

type FilterKey = "name" | "cnpj" | "category" | "state";

export default function VendorsPage() {
  const { id: studyId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [filters, setFilters] = useState<Record<FilterKey, string[]>>({
    name: [], cnpj: [], category: [], state: [],
  });
  const formSnapshot = useRef<string>("");
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  useEffect(() => { if (user && studyId) loadVendors(); }, [user?.id, studyId]);

  const loadVendors = async () => {
    const { data } = await supabase.from("study_vendors")
      .select("id, cnpj, razao_social, nome_fantasia, category, email, phone, city, state")
      .eq("study_id", studyId).eq("is_deleted", false)
      .order("razao_social", { ascending: true });
    setVendors(data || []);
    setLoading(false);
  };

  // Cascading filter options: each filter's options come from data filtered by ALL OTHER active filters
  const filterOptions = useMemo(() => {
    const getFiltered = (excludeKey: FilterKey) => {
      return vendors.filter(v => {
        const name = (v.nome_fantasia || v.razao_social || "").trim();
        if (excludeKey !== "name" && filters.name.length && !filters.name.includes(name)) return false;
        if (excludeKey !== "cnpj" && filters.cnpj.length && !filters.cnpj.includes(v.cnpj?.trim() || "")) return false;
        if (excludeKey !== "category" && filters.category.length && !filters.category.includes(v.category?.trim() || "")) return false;
        if (excludeKey !== "state" && filters.state.length && !filters.state.includes(v.state?.trim() || "")) return false;
        return true;
      });
    };
    const extract = (list: Vendor[], key: FilterKey) => {
      const set = new Set<string>();
      list.forEach(v => {
        let val = "";
        if (key === "name") val = (v.nome_fantasia || v.razao_social || "").trim();
        else if (key === "cnpj") val = (v.cnpj || "").trim();
        else if (key === "category") val = (v.category || "").trim();
        else if (key === "state") val = (v.state || "").trim();
        if (val) set.add(val);
      });
      return [...set].sort();
    };
    return {
      name: extract(getFiltered("name"), "name"),
      cnpj: extract(getFiltered("cnpj"), "cnpj"),
      category: extract(getFiltered("category"), "category"),
      state: extract(getFiltered("state"), "state"),
    };
  }, [vendors, filters]);

  // Filtered vendors
  const filteredVendors = useMemo(() => {
    return vendors.filter(v => {
      const name = (v.nome_fantasia || v.razao_social || "").trim();
      if (filters.name.length && !filters.name.includes(name)) return false;
      if (filters.cnpj.length && !filters.cnpj.includes(v.cnpj?.trim() || "")) return false;
      if (filters.category.length && !filters.category.includes(v.category?.trim() || "")) return false;
      if (filters.state.length && !filters.state.includes(v.state?.trim() || "")) return false;
      return true;
    });
  }, [vendors, filters]);

  const hasActiveFilters = Object.values(filters).some(f => f.length > 0);

  const clearFilters = () => setFilters({ name: [], cnpj: [], category: [], state: [] });

  const toggleFilter = (key: FilterKey, value: string) => {
    setFilters(prev => {
      const arr = prev[key];
      return { ...prev, [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
  };

  const openNew = () => { setEditId(null); setViewMode(false); setForm({ ...emptyForm }); formSnapshot.current = JSON.stringify(emptyForm); setDialogOpen(true); };

  const tryCloseDialog = () => {
    if (!viewMode && JSON.stringify(form) !== formSnapshot.current) {
      setShowUnsavedDialog(true);
    } else {
      setDialogOpen(false);
    }
  };
  const openView = async (vendorId: string) => {
    const { data } = await supabase.from("study_vendors").select("*").eq("id", vendorId).single();
    if (!data) return;
    setEditId(vendorId);
    setViewMode(true);
    populateForm(data);
    setDialogOpen(true);
  };

  const openEdit = async (vendorId: string) => {
    const { data } = await supabase.from("study_vendors").select("*").eq("id", vendorId).single();
    if (!data) return;
    setEditId(vendorId);
    setViewMode(false);
    populateForm(data);
    setDialogOpen(true);
  };

  const populateForm = (data: any) => {
    const f = {
      cnpj: data.cnpj || "", razao_social: data.razao_social || "", nome_fantasia: data.nome_fantasia || "",
      category: data.category || "", email: data.email || "", phone: data.phone || "",
      street: data.street || "", street_number: data.street_number || "", complement: data.complement || "",
      neighborhood: data.neighborhood || "", city: data.city || "", state: data.state || "", notes: data.notes || "",
    };
    setForm(f);
    formSnapshot.current = JSON.stringify(f);
  };

  const lookupCNPJHandler = async () => {
    const clean = form.cnpj.replace(/\D/g, "");
    if (clean.length !== 14) { toast.error("CNPJ deve ter 14 dígitos."); return; }
    setLookingUp(true);
    const result = await lookupCNPJ(clean);
    setLookingUp(false);
    if (!result.ok || !result.data) { toast.error(result.error || "Erro ao buscar CNPJ."); return; }
    const d = result.data;
    setForm(f => ({
      ...f,
      razao_social: d.razao_social || f.razao_social,
      nome_fantasia: d.nome_fantasia || f.nome_fantasia,
      phone: d.telefone || f.phone,
      email: d.email || f.email,
      street: d.logradouro || f.street,
      street_number: d.numero || f.street_number,
      complement: d.complemento || f.complement,
      neighborhood: d.bairro || f.neighborhood,
      city: d.municipio || f.city,
      state: d.uf || f.state,
    }));
    toast.success("Dados do CNPJ preenchidos!");
  };

  const saveVendor = async () => {
    const errors: string[] = [];
    if (!form.cnpj.trim()) errors.push("CNPJ");
    if (!form.razao_social.trim()) errors.push("Razão Social");
    if (!form.nome_fantasia.trim()) errors.push("Nome Fantasia");
    if (!form.category.trim()) errors.push("Categoria");
    if (!form.phone.trim()) errors.push("Telefone");
    if (!form.street.trim()) errors.push("Logradouro");
    if (!form.street_number.trim()) errors.push("Número");
    if (!form.neighborhood.trim()) errors.push("Bairro");
    if (!form.city.trim()) errors.push("Cidade");
    if (!form.state.trim()) errors.push("UF");
    if (errors.length) {
      toast.error(`Campos obrigatórios: ${errors.join(", ")}`);
      return;
    }
    setSaving(true);
    const payload = { ...form, study_id: studyId! };
    if (editId) {
      await supabase.from("study_vendors").update(payload).eq("id", editId);
    } else {
      await supabase.from("study_vendors").insert(payload);
    }
    setSaving(false);
    formSnapshot.current = JSON.stringify(form);
    setDialogOpen(false);
    toast.success(editId ? "Fornecedor atualizado!" : "Fornecedor criado!");
    loadVendors();
  };

  const deleteVendor = async () => {
    if (!deleteId) return;
    await supabase.from("study_vendors").update({ is_deleted: true }).eq("id", deleteId);
    setDeleteId(null);
    toast.success("Fornecedor excluído.");
    loadVendors();
  };

  const setField = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar />
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        <h1 className="text-xl font-bold">Fornecedores</h1>

        <div className="flex items-center justify-between">
          <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Novo Fornecedor</Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/studies/${studyId}/dashboard`)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
        </div>

        {/* Filters */}
        {vendors.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">Filtros:</span>
            {(["name", "cnpj", "category", "state"] as FilterKey[]).map(key => {
              const labels: Record<FilterKey, string> = { name: "Nome", cnpj: "CNPJ", category: "Categoria", state: "UF" };
              const options = filterOptions[key];
              if (!options.length) return null;
              return (
                <FilterDropdown
                  key={key}
                  label={labels[key]}
                  options={options}
                  selected={filters[key]}
                  onToggle={(val) => toggleFilter(key, val)}
                />
              );
            })}
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters}>Limpar</Button>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>
        ) : filteredVendors.length === 0 ? (
          <div className="card-dashboard text-center py-12">
            <p className="text-muted-foreground">Nenhum fornecedor encontrado.</p>
          </div>
        ) : (
          <div className="relative w-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Cidade/UF</TableHead>
                  <TableHead className="text-right">Opções</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredVendors.map(v => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium">{v.nome_fantasia || v.razao_social || "—"}</TableCell>
                    <TableCell>{v.cnpj || "—"}</TableCell>
                    <TableCell>{v.category || "—"}</TableCell>
                    <TableCell>{v.city && v.state ? `${v.city}/${v.state}` : "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openView(v.id)} title="Visualizar"><Eye className="h-4 w-4 text-primary" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(v.id)} title="Editar"><Pencil className="h-4 w-4 text-amber-600" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleteId(v.id)} title="Excluir"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

      </div>

      {/* Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) tryCloseDialog(); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewMode ? "Visualizar Fornecedor" : editId ? "Editar Fornecedor" : "Novo Fornecedor"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {/* CNPJ row: half width + button */}
            <div className="space-y-1.5">
              <Label>CNPJ *</Label>
              <Input
                value={form.cnpj}
                onChange={e => setField("cnpj", formatCNPJ(e.target.value))}
                placeholder="xx.xxx.xxx/xxxx-xx"
                maxLength={18}
                disabled={viewMode}
              />
            </div>
            <div className="space-y-1.5 flex flex-col justify-end">
              {!viewMode && (
                <Button size="sm" variant="outline" onClick={lookupCNPJHandler} disabled={lookingUp}>
                  {lookingUp ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  Buscar CNPJ
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Razão Social *</Label>
              <Input value={form.razao_social} onChange={e => setField("razao_social", e.target.value)} disabled={viewMode} />
            </div>
            <div className="space-y-1.5">
              <Label>Nome Fantasia *</Label>
              <Input value={form.nome_fantasia} onChange={e => setField("nome_fantasia", e.target.value)} disabled={viewMode} />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria *</Label>
              <Input value={form.category} onChange={e => setField("category", e.target.value)} placeholder="Ex: Material, Mão de obra" disabled={viewMode} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone *</Label>
              <Input
                value={form.phone}
                onChange={e => setField("phone", formatPhone(e.target.value))}
                placeholder="(xx)xxxxx-xxxx"
                maxLength={14}
                disabled={viewMode}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={e => setField("email", e.target.value)} disabled={viewMode} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Logradouro *</Label>
              <Input value={form.street} onChange={e => setField("street", e.target.value)} disabled={viewMode} />
            </div>
            <div className="space-y-1.5">
              <Label>Número *</Label>
              <Input value={form.street_number} onChange={e => setField("street_number", e.target.value)} disabled={viewMode} />
            </div>
            <div className="space-y-1.5">
              <Label>Complemento</Label>
              <Input value={form.complement} onChange={e => setField("complement", e.target.value)} disabled={viewMode} />
            </div>
            <div className="space-y-1.5">
              <Label>Bairro *</Label>
              <Input value={form.neighborhood} onChange={e => setField("neighborhood", e.target.value)} disabled={viewMode} />
            </div>
            <div className="space-y-1.5">
              <Label>Cidade *</Label>
              <Input value={form.city} onChange={e => setField("city", e.target.value)} disabled={viewMode} />
            </div>
            <div className="space-y-1.5">
              <Label>UF *</Label>
              <Input value={form.state} onChange={e => setField("state", e.target.value)} maxLength={2} disabled={viewMode} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={e => setField("notes", e.target.value)} rows={2} disabled={viewMode} />
            </div>
          </div>
          {!viewMode && (
            <div className="flex gap-3 pt-2">
              <Button onClick={saveVendor} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
              <Button variant="ghost" onClick={tryCloseDialog}>Cancelar</Button>
            </div>
          )}
          {viewMode && (
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => { setViewMode(false); }}>Editar</Button>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>Fechar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fornecedor?</AlertDialogTitle>
            <AlertDialogDescription>O fornecedor será movido para a lixeira.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={deleteVendor} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UnsavedChangesDialog
        open={showUnsavedDialog}
        onStay={() => setShowUnsavedDialog(false)}
        onLeave={() => { setShowUnsavedDialog(false); setDialogOpen(false); }}
      />
    </div>
  );
}

/* ---------- Filter Dropdown Component ---------- */
function FilterDropdown({ label, options, selected, onToggle }: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (val: string) => void;
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
            <Checkbox
              checked={selected.includes(opt)}
              onCheckedChange={() => onToggle(opt)}
            />
            <span className="truncate">{opt}</span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}
