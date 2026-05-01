import { StatusBadge } from "@/components/status-badge";
import { StatusForm } from "@/components/status-form";
import type { WaitlistRequest } from "@/lib/types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Manaus",
  }).format(new Date(value));
}

function formatScaleDate(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function maskCpf(cpf: string) {
  const clean = cpf.replace(/\D/g, "");
  if (clean.length !== 11) return cpf;
  return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
}

function formatPhone(phone: string) {
  const clean = phone.replace(/\D/g, "");
  if (clean.length === 11) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  }
  if (clean.length === 10) {
    return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  }
  return phone;
}

export function RequestsTable({ requests }: { requests: WaitlistRequest[] }) {
  if (requests.length === 0) {
    return (
      <div className="empty-state">
        <h2>Nenhuma solicitação encontrada</h2>
        <p>Ajuste os filtros ou aguarde novas entradas do bot.</p>
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="requests-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Nome</th>
            <th>CPF</th>
            <th>Telefone</th>
            <th>Praça</th>
            <th>Horário</th>
            <th>Dia</th>
            <th>Data escala</th>
            <th>Status</th>
            <th>Origem</th>
            <th>Ação</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request.id}>
              <td>{formatDate(request.created_at)}</td>
              <td>
                <strong>{request.nome}</strong>
                {request.telegram_username ? (
                  <div className="muted">@{request.telegram_username}</div>
                ) : null}
              </td>
              <td>{maskCpf(request.cpf)}</td>
              <td>{formatPhone(request.telefone)}</td>
              <td>{request.praca}</td>
              <td>{request.horario_label}</td>
              <td>{request.escala_dia_label}</td>
              <td>{formatScaleDate(request.escala_data)}</td>
              <td>
                <StatusBadge status={request.status} />
                <div className="muted">{request.is_used ? "Usado" : "Disponível"}</div>
              </td>
              <td>{request.origem}</td>
              <td>
                <StatusForm id={request.id} currentStatus={request.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
