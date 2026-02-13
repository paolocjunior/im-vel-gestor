import { useState } from "react";
import { Building2, Eye, EyeOff, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";

const LoginPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // TODO: integrar com auth do backend
    setTimeout(() => {
      setIsLoading(false);
      navigate("/hub");
    }, 800);
  };

  return (
    <div className="flex min-h-screen">
      {/* Painel esquerdo - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <Building2 className="h-8 w-8 text-accent" />
          <span className="font-heading text-2xl font-bold text-primary-foreground">
            Constru<span className="text-accent">Gestão</span>
          </span>
        </div>
        <div className="space-y-4">
          <h1 className="font-heading text-4xl font-bold text-primary-foreground leading-tight">
            Gestão inteligente de<br />
            projetos imobiliários
          </h1>
          <p className="text-sidebar-foreground text-lg max-w-md">
            Controle financeiro, obras, fornecedores e estudos de viabilidade em uma única plataforma.
          </p>
        </div>
        <p className="text-sidebar-foreground text-sm">
          © {new Date().getFullYear()} ConstruGestão. Todos os direitos reservados.
        </p>
      </div>

      {/* Painel direito - formulário */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          <div className="lg:hidden flex items-center gap-3 justify-center mb-8">
            <Building2 className="h-8 w-8 text-accent" />
            <span className="font-heading text-2xl font-bold">
              Constru<span className="text-accent">Gestão</span>
            </span>
          </div>

          <div className="space-y-2 text-center">
            <h2 className="font-heading text-2xl font-bold">
              {isSignUp ? "Criar conta" : "Bem-vindo de volta"}
            </h2>
            <p className="text-muted-foreground">
              {isSignUp
                ? "Preencha os dados para criar sua conta"
                : "Entre com suas credenciais para continuar"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                "Carregando..."
              ) : (
                <>
                  {isSignUp ? "Criar conta" : "Entrar"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {isSignUp ? "Já tem uma conta?" : "Não tem uma conta?"}{" "}
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-accent font-medium hover:underline"
            >
              {isSignUp ? "Fazer login" : "Criar conta"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
