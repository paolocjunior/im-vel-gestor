import { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ModuleItemProps {
  label: string;
  icon: LucideIcon;
  active: boolean;
  ready: boolean;
  onClick: () => void;
}

const ModuleItem = ({ label, icon: Icon, active, ready, onClick }: ModuleItemProps) => {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all focus-ring ${
        active
          ? "bg-primary text-primary-foreground font-semibold shadow-sm"
          : "text-foreground hover:bg-muted font-medium"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate text-left">{label}</span>
      {!ready && (
        <span className="ml-auto text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          Breve
        </span>
      )}
    </button>
  );
};

export default ModuleItem;
