import { Building2, Settings, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useLocation } from "react-router-dom";

interface GlobalTopbarProps {
  showSettings?: boolean;
}

export default function GlobalTopbar({ showSettings = true }: GlobalTopbarProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const isOnSettings = location.pathname === "/settings";

  return (
    <header className="bg-sidebar text-sidebar-foreground">
      <div className="max-w-[1440px] mx-auto flex items-center justify-between h-14 px-6">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => navigate("/hub")}
        >
          <Building2 className="h-5 w-5 text-sidebar-primary" />
          <span className="font-bold text-base text-sidebar-accent-foreground">
            ConstruGestão
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-sidebar-foreground hidden sm:block">
            {user?.email}
          </span>
          {showSettings && !isOnSettings && (
            <Button
              variant="outline"
              size="sm"
              className="border-sidebar-border text-sidebar-accent-foreground hover:bg-sidebar-accent text-xs"
              onClick={() => navigate("/settings")}
            >
              <Settings className="h-3.5 w-3.5 mr-1.5" />
              Configurações
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="border-sidebar-border text-sidebar-accent-foreground hover:bg-sidebar-accent text-xs"
            onClick={handleLogout}
          >
            <LogOut className="h-3.5 w-3.5 mr-1.5" />
            Sair
          </Button>
        </div>
      </div>
    </header>
  );
}
