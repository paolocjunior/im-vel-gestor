interface ResultCardProps {
  label: string;
  value: string;
  subtitle: string;
}

const ResultCard = ({ label, value, subtitle }: ResultCardProps) => {
  return (
    <div className="card-dashboard space-y-1">
      <p className="text-xs font-semibold">{label}</p>
      <p className="kpi-value">{value}</p>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
};

export default ResultCard;
