type SummaryCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
};

export function SummaryCard({ title, value, subtitle }: SummaryCardProps) {
  return (
    <div className="card">
      <p className="card-title">{title}</p>
      <p className="card-value">{value}</p>
      {subtitle ? <p className="card-subtitle">{subtitle}</p> : null}
    </div>
  );
}
