import { useState } from "react";
import {
  Building2,
  Plus,
  Search,
  FolderOpen,
  TrendingUp,
  Calendar,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";

interface Project {
  id: string;
  name: string;
  status: "em_estudo" | "aprovado" | "em_obra" | "concluido";
  city: string;
  updatedAt: string;
}

const statusMap = {
  em_estudo: { label: "Em Estudo", variant: "secondary" as const },
  aprovado: { label: "Aprovado", variant: "default" as const },
  em_obra: { label: "Em Obra", variant: "outline" as const },
  concluido: { label: "Concluído", variant: "secondary" as const },
};

const mockProjects: Project[] = [
  { id: "1", name: "Residencial Aurora", status: "em_estudo", city: "São Paulo", updatedAt: "2026-02-10" },
  { id: "2", name: "Edifício Monte Verde", status: "em_obra", city: "Campinas", updatedAt: "2026-02-08" },
  { id: "3", name: "Loteamento Solar", status: "aprovado", city: "Ribeirão Preto", updatedAt: "2026-01-28" },
];

const HubPage = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const filtered = mockProjects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container flex items-center justify-between h-16 px-6">
          <div className="flex items-center gap-3">
            <Building2 className="h-7 w-7 text-accent" />
            <span className="font-heading text-xl font-bold">
              Constru<span className="text-accent">Gestão</span>
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>
      </header>

      <main className="container px-6 py-8 space-y-8">
        {/* Barra de ações */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <div>
            <h1 className="font-heading text-3xl font-bold">Meus Projetos</h1>
            <p className="text-muted-foreground mt-1">
              Gerencie seus estudos e empreendimentos
            </p>
          </div>
          <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="h-4 w-4 mr-2" />
            Novo Projeto
          </Button>
        </div>

        {/* Busca */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar projetos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="rounded-lg bg-accent/10 p-3">
                <FolderOpen className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total de Projetos</p>
                <p className="font-heading text-2xl font-bold">{mockProjects.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="rounded-lg bg-info/10 p-3">
                <TrendingUp className="h-5 w-5 text-info" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Em Andamento</p>
                <p className="font-heading text-2xl font-bold">
                  {mockProjects.filter((p) => p.status === "em_obra").length}
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
                <p className="text-sm text-muted-foreground">Concluídos</p>
                <p className="font-heading text-2xl font-bold">
                  {mockProjects.filter((p) => p.status === "concluido").length}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lista de projetos */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((project) => (
            <Card
              key={project.id}
              className="cursor-pointer hover:border-accent/50 transition-colors group"
              onClick={() => navigate(`/studies/${project.id}/dashboard`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <CardTitle className="font-heading text-lg group-hover:text-accent transition-colors">
                    {project.name}
                  </CardTitle>
                  <Badge variant={statusMap[project.status].variant}>
                    {statusMap[project.status].label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground">{project.city}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Atualizado em {new Date(project.updatedAt).toLocaleDateString("pt-BR")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
};

export default HubPage;
