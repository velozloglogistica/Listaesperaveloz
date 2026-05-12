"use client";

import { useActionState, useEffect, useRef } from "react";

import { createTenantCityAction, type BagActionState } from "@/app/bag-actions";

const initialState: BagActionState = {
  status: "idle",
  message: "",
};

export function BagCityForm() {
  const [state, formAction] = useActionState(createTenantCityAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state.status]);

  return (
    <form ref={formRef} action={formAction} className="manual-form-grid">
      <input className="text-input" type="text" name="name" placeholder="Nome da cidade" required />

      <div className="manual-form-actions">
        <button type="submit" className="primary-button">
          Adicionar cidade
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
