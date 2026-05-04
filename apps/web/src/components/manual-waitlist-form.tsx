"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { createManualWaitlistRequest } from "@/app/actions";
import { HORARIOS, PRACAS } from "@/lib/waitlist-constants";

const initialManualWaitlistState = {
  status: "idle" as const,
  message: "",
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="primary-button">
      {pending ? "Salvando..." : "Adicionar manualmente"}
    </button>
  );
}

export function ManualWaitlistForm({ defaultDate }: { defaultDate: string }) {
  const [state, formAction] = useActionState(
    createManualWaitlistRequest,
    initialManualWaitlistState,
  );
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
        name="nome"
        placeholder="Nome completo"
        required
      />

      <input
        className="text-input"
        type="text"
        name="cpf"
        inputMode="numeric"
        placeholder="CPF"
        required
      />

      <input
        className="text-input"
        type="text"
        name="telefone"
        inputMode="numeric"
        placeholder="Telefone com DDD"
        required
      />

      <select className="select-input" name="praca" required defaultValue="">
        <option value="" disabled>
          Escolha a hotzone
        </option>
        {PRACAS.map((praca) => (
          <option key={praca} value={praca}>
            {praca}
          </option>
        ))}
      </select>

      <select className="select-input" name="horario_label" required defaultValue="">
        <option value="" disabled>
          Escolha o horário
        </option>
        {Object.keys(HORARIOS).map((horario) => (
          <option key={horario} value={horario}>
            {horario}
          </option>
        ))}
      </select>

      <input
        className="text-input"
        type="date"
        name="escala_data"
        defaultValue={defaultDate}
        required
      />

      <div className="manual-form-actions">
        <SubmitButton />
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
