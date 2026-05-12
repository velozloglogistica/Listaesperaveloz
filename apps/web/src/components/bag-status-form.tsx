import { updateBagCourierStatus } from "@/app/bag-actions";
import { BAG_STATUS_OPTIONS, type BagStatus } from "@/lib/bag-config";

type BagStatusFormProps = {
  id: string;
  currentStatus: BagStatus;
};

export function BagStatusForm({ id, currentStatus }: BagStatusFormProps) {
  return (
    <form action={updateBagCourierStatus} className="status-form">
      <input type="hidden" name="id" value={id} />
      <select
        name="bag_status"
        defaultValue={currentStatus}
        aria-label="Atualizar status do BAG"
        className="select-input"
      >
        {BAG_STATUS_OPTIONS.map((option) => (
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
