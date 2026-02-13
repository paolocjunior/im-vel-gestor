import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { signIn, user } = useAuth();
  const [step, setStep] = useState<1 | 2>(1);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const validateStep1 = async () => {
    setError("");
    if (!currentPassword) { setError("Senha atual é obrigatória."); return; }
    setLoading(true);
    const { error } = await signIn(user?.email || "", currentPassword);
    setLoading(false);
    if (error) { setError("Senha atual incorreta."); return; }
    setStep(2);
  };

  const handleChangePassword = async () => {
    setError("");
    if (newPassword.length < 6) { setError("Nova senha deve ter ao menos 6 caracteres."); return; }
    if (newPassword !== confirmPassword) { setError("As senhas não coincidem."); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) { setError(error.message); return; }
    toast.success("Senha alterada com sucesso!");
    navigate("/settings");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-8">
      <div className="w-full max-w-[560px] space-y-6 animate-fade-in">
        <div className="card-dashboard space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold">Trocar Senha</h2>
            <p className="text-sm text-muted-foreground">
              {step === 1 ? "Confirme sua senha atual para continuar." : "Defina sua nova senha."}
            </p>
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg text-center">
              {error}
            </div>
          )}

          {step === 1 ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Senha atual</Label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <Button onClick={validateStep1} disabled={loading} className="w-full">
                {loading ? "Verificando..." : "Continuar"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nova senha</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Confirmar nova senha</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                />
              </div>
              <Button onClick={handleChangePassword} disabled={loading} className="w-full">
                {loading ? "Salvando..." : "Alterar senha"}
              </Button>
            </div>
          )}

          <div className="flex gap-3 justify-center">
            <Button variant="outline" size="sm" onClick={() => navigate("/settings")}>
              <Settings className="h-4 w-4 mr-1.5" />
              Configurações
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
