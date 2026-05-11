"use client";

import { useActionState } from "react";

import { createDashboardUserAction } from "@/app/auth-actions";

const initialState = {
  status: "idle" as const,
  message: "",
};

export function UserManagementForm() {
  const [state, formAction] = useActionState(createDashboardUserAction, initialState);

  return (
    <form action={formAction} className="manual-form-grid">
      <input
        className="text-input"
        type="text"
        name="full_name"
        placeholder="Nome completo"
        required
      />

      <input
        className="text-input"
        type="email"
        name="email"
        placeholder="Email de acesso"
        required
      />

      <input
        className="text-input"
        type="password"
        name="password"
        placeholder="Senha inicial"
        minLength={8}
        required
      />

      <select className="select-input" name="role" defaultValue="area">
        <option value="area">Area</option>
        <option value="owner">Owner</option>
      </select>

      <label className="checkbox-card">
        <input type="checkbox" name="can_access_waitlist" defaultChecked />
        <span>Acesso ao modulo Lista de espera</span>
      </label>

      <div className="manual-form-actions">
        <button type="submit" className="primary-button">
          Criar login
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
