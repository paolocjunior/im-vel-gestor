import { useState, useEffect } from "react";
import {
  Plus,
  Search,
  FolderOpen,
  TrendingUp,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import GlobalTopbar from "@/components/GlobalTopbar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Study {
  id: string;
  name: string;
  status: string;
  city: string | null;
  state: string | null;
  updated_at: string;
}

const statusMap: Record<string, { label: string; variant: "secondary" | "default" | "outline" }> = {
  DRAFT: { label: "Rascunho", variant: "secondary" },
  COMPLETE: { label: "Completo", variant: "default" },
};

const HubPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadStudies();
  }, [user]);

  const loadStudies = async () => {
    const { data } = await supabase
      .from("studies")
      .select("id, name, status, city, state, updated_at")
      .eq("user_id", user!.id)
      .eq("is_deleted", false)
      .order("updated_at", { ascending: false });
    setStudies(data || []);
    setLoading(false);
  };

  const createStudy = async () => {
    const { data, error } = await supabase
      .from("studies")
      .insert({ user_id: user!.id, name: "Novo Projeto" })
      .select("id")
      .single();
    if (error || !data) { toast.error("Erro ao criar projeto."); return; }

    // Create study_inputs and study_computed
    await Promise.all([
      supabase.from("study_inputs").insert({ study_id: data.id }),
      supabase.from("study_computed").insert({ study_id: data.id }),
    ]);

    navigate(`/studies/${data.id}/dashboard`);
  };

  const filtered = studies.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <GlobalTopbar showSettings={true} />

      <main className="max-w-[1440px] mx-auto px-6 py-8 space-y-8">
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div>
            <h1 className="text-3xl font-bold">Meus Projetos</h1>
            <p className="text-muted-foreground mt-1">
              Gerencie seus estudos e empreendimentos
            </p>
          </div>
          <Button onClick={createStudy}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Projeto
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar projetos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="rounded-lg bg-primary/10 p-3">
                <FolderOpen className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total de Projetos</p>
                <p className="kpi-value">{studies.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="rounded-lg bg-info/10 p-3">
                <TrendingUp className="h-5 w-5 text-info" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Em Estudo</p>
                <p className="kpi-value">
                  {studies.filter((s) => s.status === "DRAFT").length}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="rounded-lg bg-success/10 p-3">
                <Calendar className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Completos</p>
                <p className="kpi-value">
                  {studies.filter((s) => s.status === "COMPLETE").length}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {studies.length === 0 ? "Nenhum projeto criado ainda." : "Nenhum projeto encontrado."}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((study) => {
              const sm = statusMap[study.status] || statusMap.DRAFT;
              return (
                <Card
                  key={study.id}
                  className="cursor-pointer hover:border-primary/30 transition-colors group"
                  onClick={() => navigate(`/studies/${study.id}/dashboard`)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg group-hover:text-primary transition-colors">
                        {study.name}
                      </CardTitle>
                      <Badge variant={sm.variant}>{sm.label}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground">
                      {[study.city, study.state].filter(Boolean).join("/") || "Sem localização"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Atualizado em {new Date(study.updated_at).toLocaleDateString("pt-BR")}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default HubPage;
