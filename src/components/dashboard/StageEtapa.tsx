import { Button } from "@/components/ui/button";

type StageStatus = "nao_iniciado" | "incompleto" | "completo" | "dispensado";

const statusConfig: Record<StageStatus, { label: string; className: string }> = {
  nao_iniciado: { label: "Não iniciado", className: "bg-neutral/10 text-neutral" },
  incompleto: { label: "Incompleto", className: "bg-warning/10 text-warning" },
  completo: { label: "Completo", className: "bg-success/10 text-success" },
  dispensado: { label: "Dispensado", className: "bg-info/10 text-info" },
};

interface FieldPair {
  label: string;
  value: string;
}

interface StageEtapaProps {
  title: string;
  status: StageStatus;
  colorClass: string;
  fields: FieldPair[];
  onEdit?: () => void;
}

const StageEtapa = ({ title, status, colorClass, fields, onEdit }: StageEtapaProps) => {
  const cfg = statusConfig[status];

  return (
    <div className={`card-dashboard ${colorClass} space-y-4`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">{title}</h3>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${cfg.className}`}>
          {cfg.label}
        </span>
      </div>

      {/* Fields in 2-col grid */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        {fields.map((f, i) => (
          <div key={i}>
            <p className="text-xs text-muted-foreground">{f.label}</p>
            <p className="text-sm font-semibold mt-0.5">{f.value}</p>
          </div>
        ))}
      </div>

      {/* Editar */}
      {onEdit && (
        <Button size="sm" onClick={onEdit} className="mt-1">
          Editar
        </Button>
      )}
    </div>
  );
};

export default StageEtapa;
