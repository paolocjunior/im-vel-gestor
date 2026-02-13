import { useState } from "react";
import { Building2, Eye, EyeOff, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate, Navigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const LoginPage = () => {
  const navigate = useNavigate();
  const { user, loading, signIn, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");

  if (!loading && user) return <Navigate to="/hub" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    if (isSignUp) {
      const { error } = await signUp(email, password, fullName);
      setIsLoading(false);
      if (error) {
        setError(error);
        return;
      }
      toast.success("Conta criada! Verifique seu e-mail para confirmar.");
      setIsSignUp(false);
    } else {
      const { error } = await signIn(email, password);
      setIsLoading(false);
      if (error) {
        setError(error);
        return;
      }
      navigate("/hub");
    }
  };

  const isBlocked = error === "Muitas tentativas. Aguarde alguns minutos.";

  return (
    <div className="flex min-h-screen">
      {/* Painel esquerdo - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-sidebar flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <Building2 className="h-8 w-8 text-sidebar-primary" />
          <span className="text-2xl font-bold text-sidebar-accent-foreground">
            ConstruGestão
          </span>
        </div>
        <div className="space-y-4">
          <h1 className="text-4xl font-bold text-sidebar-accent-foreground leading-tight">
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
      <div className="flex w-full lg:w-1/2 items-center justify-center p-8 bg-background">
        <div className="w-full max-w-[460px] space-y-8 animate-fade-in">
          <div className="lg:hidden flex items-center gap-3 justify-center mb-8">
            <Building2 className="h-8 w-8 text-primary" />
            <span className="text-2xl font-bold">ConstruGestão</span>
          </div>

          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-bold">
              {isSignUp ? "Criar conta" : "Login"}
            </h2>
            <p className="text-muted-foreground">
              {isSignUp
                ? "Preencha os dados para criar sua conta"
                : "Entre com suas credenciais para continuar"}
            </p>
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome completo</Label>
                <Input
                  id="fullName"
                  placeholder="Seu nome"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            )}

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

            {!isSignUp && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="remember"
                    checked={rememberMe}
                    onCheckedChange={(v) => setRememberMe(v === true)}
                  />
                  <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">
                    Manter sessão ativa
                  </Label>
                </div>
                <Link to="/password-reset" className="text-sm text-primary hover:underline">
                  Esqueci minha senha
                </Link>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading || isBlocked}>
              {isBlocked ? (
                "Bloqueado temporariamente"
              ) : isLoading ? (
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
              onClick={() => { setIsSignUp(!isSignUp); setError(""); }}
              className="text-primary font-medium hover:underline"
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
