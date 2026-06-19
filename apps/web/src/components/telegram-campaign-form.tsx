"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  createTelegramCampaignAction,
  type CampaignActionState,
} from "@/app/campaign-actions";

const initialState: CampaignActionState = {
  status: "idle",
  message: "",
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="primary-button" disabled={pending}>
      {pending ? "Disparando campanha..." : "Criar campanha e disparar"}
    </button>
  );
}

export function TelegramCampaignForm() {
  const [state, formAction] = useActionState(createTelegramCampaignAction, initialState);

  return (
    <form action={formAction} className="hierarchy-form">
      <div className="campaign-form-grid">
        <input
          className="text-input"
          type="text"
          name="nome_campanha"
          placeholder="Nome da campanha"
          required
        />
        <input className="text-input" type="text" name="botao_1" placeholder="Botao 1" required />
        <input className="text-input" type="text" name="botao_2" placeholder="Botao 2" required />
        <input
          className="text-input"
          type="file"
          name="planilha"
          accept=".xlsx,.xls,.csv"
          required
        />
      </div>

      <textarea
        className="textarea-input"
        name="mensagem"
        placeholder="Ola {nome}, vimos que voce esta agendado para a escala do {turno} na hotzone {hotzone}."
        rows={6}
        required
      />

      <div className="campaign-helper-grid">
        <div className="access-panel">
          <h3>Variaveis disponiveis</h3>
          <p>Use os placeholders abaixo para personalizar a mensagem.</p>
          <div className="campaign-variable-list">
            <code>{"{nome}"}</code>
            <code>{"{telefone}"}</code>
            <code>{"{cpf}"}</code>
            <code>{"{hotzone}"}</code>
            <code>{"{turno}"}</code>
          </div>
        </div>

        <div className="access-panel">
          <h3>Formato da planilha</h3>
          <p>Campos esperados: `cpf`, `nome`, `telefone`, `hotzone` e `turno`.</p>
          <p>
            O sistema cruza o CPF com `waitlist_requests`, usa `telegram_chat_id` para enviar e
            registra `sem_chat_id` quando nao encontra chat valido.
          </p>
        </div>
      </div>

      <div className="manual-form-actions">
        <SubmitButton />
      </div>

      {state.message ? (
        <p className="manual-form-feedback manual-form-feedback-error">{state.message}</p>
      ) : null}
    </form>
  );
}
