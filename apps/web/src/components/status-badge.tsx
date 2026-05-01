import type { WaitlistStatus } from "@/lib/types";

const labels: Record<WaitlistStatus, string> = {
  pendente: "Pendente",
  agendado: "Agendado",
  recusado: "Recusado",
  cancelado: "Cancelado",
};

export function StatusBadge({ status }: { status: WaitlistStatus }) {
  return <span className={`status-badge status-${status}`}>{labels[status]}</span>;
}
