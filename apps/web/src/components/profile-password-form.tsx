"use client";

import { useActionState } from "react";

import { changeOwnPasswordAction, type ProfileActionState } from "@/app/auth-actions";

const initialState: ProfileActionState = {
  status: "idle",
  message: "",
};

export function ProfilePasswordForm() {
  const [state, formAction] = useActionState(changeOwnPasswordAction, initialState);

  return (
    <form action={formAction} className="profile-form">
      <input
        className="text-input"
        type="password"
        name="password"
        placeholder="Nova senha"
        minLength={8}
        required
      />
      <input
        className="text-input"
        type="password"
        name="confirm_password"
        placeholder="Confirmar nova senha"
        minLength={8}
        required
      />
      <div className="manual-form-actions">
        <button type="submit" className="primary-button">
          Atualizar senha
        </button>
      </div>

      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "manual-form-feedback manual-form-feedback-error"
              : "manual-form-feedback manual-form-feedback-success"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
