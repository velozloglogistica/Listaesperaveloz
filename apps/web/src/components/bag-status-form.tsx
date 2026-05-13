import { updateBagCourierStatus } from "@/app/bag-actions";
import { type BagStatus } from "@/lib/bag-config";

type BagStatusFormProps = {
  id: string;
  currentStatus: BagStatus;
  statuses: Array<{
    slug: string;
    label: string;
  }>;
};

export function BagStatusForm({ id, currentStatus, statuses }: BagStatusFormProps) {
  return (
    <form action={updateBagCourierStatus} className="status-form">
      <input type="hidden" name="id" value={id} />
      <select
        name="bag_status"
        defaultValue={currentStatus}
        aria-label="Atualizar status do BAG"
        className="select-input"
      >
        {statuses.map((option) => (
          <option key={option.slug} value={option.slug}>
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
