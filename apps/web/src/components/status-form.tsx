import { updateWaitlistStatus } from "@/app/actions";
import type { WaitlistStatus } from "@/lib/types";

const options: Array<{ value: WaitlistStatus; label: string }> = [
  { value: "pendente", label: "Pendente" },
  { value: "agendado", label: "Agendado" },
  { value: "recusado", label: "Recusado" },
  { value: "cancelado", label: "Cancelado" },
];

type StatusFormProps = {
  id: string;
  currentStatus: WaitlistStatus;
};

export function StatusForm({ id, currentStatus }: StatusFormProps) {
  return (
    <form action={updateWaitlistStatus} className="status-form">
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        defaultValue={currentStatus}
        aria-label="Atualizar status"
        className="select-input"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button type="submit" className="secondary-button">
        Salvar
      </button>
    </form>
  );
}
