import { useState } from "react";
import { Building2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function PasswordResetPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/settings/change-password`,
    });
    setLoading(false);
    setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="w-full max-w-[460px] space-y-6 animate-fade-in">
        <div className="flex items-center gap-3 justify-center">
          <Building2 className="h-8 w-8 text-primary" />
          <span className="text-2xl font-bold">ConstruGestão</span>
        </div>

        <div className="card-dashboard space-y-6">
          <div className="space-y-2 text-center">
            <h2 className="text-xl font-bold">Recuperar senha</h2>
            <p className="text-sm text-muted-foreground">
              Informe seu e-mail e enviaremos as instruções de recuperação.
            </p>
          </div>

          {sent ? (
            <div className="bg-success/10 text-success text-sm p-4 rounded-lg text-center">
              Se uma conta com esse e-mail existir, você receberá as instruções em breve.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
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
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Enviando..." : "Enviar instruções"}
              </Button>
            </form>
          )}

          <Link to="/login" className="flex items-center gap-2 text-sm text-primary hover:underline justify-center">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao login
          </Link>
        </div>
      </div>
    </div>
  );
}
