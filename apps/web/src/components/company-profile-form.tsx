"use client";

import { useActionState } from "react";

import {
  type CompanyProfileActionState,
  updateTenantSettingsAction,
} from "@/app/company-profile-actions";

const initialState: CompanyProfileActionState = {
  status: "idle",
  message: "",
};

type CompanyProfileFormProps = {
  initialValues: {
    westwind_login: string;
    westwind_password: string;
  };
};

export function CompanyProfileForm({ initialValues }: CompanyProfileFormProps) {
  const [state, formAction] = useActionState(updateTenantSettingsAction, initialState);

  return (
    <form action={formAction} className="hierarchy-form">
      <div className="manual-form-grid hierarchy-form-grid">
        <input
          className="text-input"
          type="text"
          name="westwind_login"
          placeholder="Login da West Wind"
          defaultValue={initialValues.westwind_login}
        />

        <input
          className="text-input"
          type="text"
          name="westwind_password"
          placeholder="Senha da West Wind"
          defaultValue={initialValues.westwind_password}
        />

        <div className="manual-form-actions">
          <button type="submit" className="primary-button">
            Salvar perfil
          </button>
        </div>
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
