"use client";

import { useActionState, useEffect, useRef } from "react";

import { createTenantRegionAction, type BagActionState } from "@/app/bag-actions";

const initialState: BagActionState = {
  status: "idle",
  message: "",
};

type BagRegionFormProps = {
  cities: Array<{
    id: string;
    name: string;
  }>;
};

export function BagRegionForm({ cities }: BagRegionFormProps) {
  const [state, formAction] = useActionState(createTenantRegionAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state.status]);

  return (
    <form ref={formRef} action={formAction} className="manual-form-grid">
      <select className="select-input" name="city_id" required defaultValue={cities[0]?.id || ""}>
        <option value="" disabled>
          Selecione a cidade
        </option>
        {cities.map((city) => (
          <option key={city.id} value={city.id}>
            {city.name}
          </option>
        ))}
      </select>

      <input className="text-input" type="text" name="name" placeholder="Nome da regiao" required />

      <div className="manual-form-actions">
        <button type="submit" className="primary-button">
          Adicionar regiao
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
