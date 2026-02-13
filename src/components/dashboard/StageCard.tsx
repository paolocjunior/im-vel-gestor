import { LucideIcon } from "lucide-react";

interface StageStatus {
  key: "nao_iniciado" | "incompleto" | "completo" | "dispensado";
  label: string;
}

const statusStyles: Record<StageStatus["key"], { bg: string; text: string; dot: string }> = {
  nao_iniciado: { bg: "bg-neutral/10", text: "text-neutral", dot: "bg-neutral" },
  incompleto: { bg: "bg-warning/10", text: "text-warning", dot: "bg-warning" },
  completo: { bg: "bg-success/10", text: "text-success", dot: "bg-success" },
  dispensado: { bg: "bg-info/10", text: "text-info", dot: "bg-info" },
};

const statusLabels: Record<StageStatus["key"], string> = {
  nao_iniciado: "Não iniciado",
  incompleto: "Incompleto",
  completo: "Completo",
  dispensado: "Dispensado",
};

interface StageCardProps {
  letter: string;
  title: string;
  status: StageStatus["key"];
  progress: number;
  items: { label: string; done: boolean }[];
  icon: LucideIcon;
}

const StageCard = ({ letter, title, status, progress, items, icon: Icon }: StageCardProps) => {
  const style = statusStyles[status];

  return (
    <div className="card-dashboard space-y-4 hover:border-primary/30 transition-colors cursor-pointer focus-ring" tabIndex={0}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary font-bold text-sm shrink-0">
            {letter}
          </div>
          <div>
            <h3 className="font-bold text-sm leading-tight">{title}</h3>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${style.bg} ${style.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
          {statusLabels[status]}
        </span>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Progresso</span>
          <span className="font-semibold">{progress}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              status === "completo" ? "bg-success" : status === "dispensado" ? "bg-info" : "bg-primary"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Checklist */}
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${
              item.done ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
            }`}>
              {item.done ? "✓" : "–"}
            </span>
            <span className={item.done ? "text-foreground" : "text-muted-foreground"}>
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default StageCard;
