"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  createTenantBagStatusAction,
  type CompanyProfileActionState,
} from "@/app/company-profile-actions";

const initialState: CompanyProfileActionState = {
  status: "idle",
  message: "",
};

export function TenantBagStatusForm() {
  const [state, formAction] = useActionState(createTenantBagStatusAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state.status]);

  return (
    <form ref={formRef} action={formAction} className="manual-form-grid">
      <input
        className="text-input"
        type="text"
        name="label"
        placeholder="Ex.: BAG com entregador"
        required
      />

      <div className="manual-form-actions">
        <button type="submit" className="primary-button">
          Adicionar status
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
