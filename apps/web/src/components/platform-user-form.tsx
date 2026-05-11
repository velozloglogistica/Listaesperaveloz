"use client";

import { useActionState } from "react";

import { createPlatformUserAction } from "@/app/platform-actions";

const initialState = {
  status: "idle" as const,
  message: "",
};

export function PlatformUserForm() {
  const [state, formAction] = useActionState(createPlatformUserAction, initialState);

  return (
    <form action={formAction} className="tenant-form-grid">
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

      <select className="select-input" name="profile_type" defaultValue="staff">
        <option value="staff">Funcionario SaaS</option>
        <option value="owner">Owner SaaS</option>
      </select>

      <div className="platform-form-note">
        <strong>Mesmo acesso do owner atual</strong>
        <p>Ambos entram no mesmo painel SaaS e conseguem usar os mesmos menus e modulos.</p>
      </div>

      <div className="manual-form-actions">
        <button type="submit" className="primary-button">
          Criar acesso
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
