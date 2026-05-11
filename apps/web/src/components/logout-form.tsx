import { signOutAction } from "@/app/auth-actions";

export function LogoutForm() {
  return (
    <form action={signOutAction}>
      <button type="submit" className="secondary-button">
        Sair
      </button>
    </form>
  );
}
