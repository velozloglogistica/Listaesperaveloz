import { toggleUsedState } from "@/app/actions";

type UsedToggleFormProps = {
  id: string;
  isUsed: boolean;
};

export function UsedToggleForm({ id, isUsed }: UsedToggleFormProps) {
  return (
    <form action={toggleUsedState}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="currentValue" value={String(isUsed)} />
      <button
        type="submit"
        className={isUsed ? "secondary-button small-button" : "primary-button small-button"}
      >
        {isUsed ? "Reabrir nome" : "Marcar como usado"}
      </button>
    </form>
  );
}
