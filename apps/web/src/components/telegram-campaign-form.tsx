"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  createTelegramCampaignAction,
  type CampaignActionState,
} from "@/app/campaign-actions";
import { TELEGRAM_GROUP_TARGETS } from "@/lib/telegram-group-targets";

type CampaignRecipientOption = {
  id: string;
  cpf: string;
  nome: string;
  telefone: string | null;
  hotzone: string | null;
  turno: string | null;
  telegram_chat_id: number | null;
  created_at: string;
};

type CampaignTargetMode = "individual" | "grupo_telegram";
type CampaignButton = {
  id: string;
  label: string;
};

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

export function TelegramCampaignForm({
  baseRecipients,
}: {
  baseRecipients: CampaignRecipientOption[];
}) {
  const [state, formAction] = useActionState(createTelegramCampaignAction, initialState);
  const [targetMode, setTargetMode] = useState<CampaignTargetMode>("individual");
  const buttonIdRef = useRef(2);
  const [buttons, setButtons] = useState<CampaignButton[]>([
    { id: "button-1", label: "Sim" },
    { id: "button-2", label: "Nao" },
  ]);
  const [useButtons, setUseButtons] = useState(false);
  const [useImage, setUseImage] = useState(false);
  const [search, setSearch] = useState("");
  const [onlyWithChat, setOnlyWithChat] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  const filteredRecipients = useMemo(() => {
    const normalizedQuery = search
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

    return baseRecipients.filter((recipient) => {
      if (onlyWithChat && !recipient.telegram_chat_id) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        recipient.nome,
        recipient.cpf,
        recipient.telefone || "",
        recipient.hotzone || "",
        recipient.turno || "",
      ]
        .join(" ")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [baseRecipients, onlyWithChat, search]);

  const selectedRecipients = useMemo(
    () => baseRecipients.filter((recipient) => selectedIds.includes(recipient.id)),
    [baseRecipients, selectedIds],
  );
  const selectedRecipient = selectedRecipients[0] || null;

  function updateButton(index: number, value: string) {
    setButtons((currentButtons) =>
      currentButtons.map((button, buttonIndex) =>
        buttonIndex === index ? { ...button, label: value } : button,
      ),
    );
  }

  function addButton() {
    setButtons((currentButtons) => {
      if (currentButtons.length >= 6) {
        return currentButtons;
      }

      buttonIdRef.current += 1;

      return [
        ...currentButtons,
        {
          id: `button-${buttonIdRef.current}`,
          label: `Opcao ${currentButtons.length + 1}`,
        },
      ];
    });
  }

  function removeButton(index: number) {
    setButtons((currentButtons) =>
      currentButtons.length <= 2
        ? currentButtons
        : currentButtons.filter((_, buttonIndex) => buttonIndex !== index),
    );
  }

  function toggleRecipient(recipientId: string) {
    setSelectedIds((currentIds) => {
      return currentIds[0] === recipientId ? [] : [recipientId];
    });
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  function toggleGroup(groupId: string) {
    setSelectedGroupIds((currentIds) =>
      currentIds.includes(groupId)
        ? currentIds.filter((currentId) => currentId !== groupId)
        : [...currentIds, groupId],
    );
  }

  return (
    <form action={formAction} className="hierarchy-form">
      <input type="hidden" name="target_mode" value={targetMode} />
      <input
        type="hidden"
        name="buttons_json"
        value={JSON.stringify(useButtons ? buttons.map((button) => button.label) : [])}
      />
      <input type="hidden" name="usar_botoes" value={useButtons ? "true" : "false"} />
      <input type="hidden" name="selected_waitlist_ids" value={JSON.stringify(selectedIds)} />
      <input type="hidden" name="selected_group_ids" value={JSON.stringify(selectedGroupIds)} />

      <section className="campaign-intro-panel">
        <div className="campaign-intro-copy">
          <span className="campaign-section-eyebrow">Campanhas Telegram</span>
          <h3>Disparo simples e direto</h3>
          <p>Selecione uma pessoa ou um grupo Telegram, escreva a mensagem e escolha se quer usar imagem e botoes.</p>
        </div>
        <div className="campaign-intro-metrics">
          <div className="campaign-intro-metric">
            <strong>2 modos</strong>
            <span>Individual e Grupo Telegram</span>
          </div>
          <div className="campaign-intro-metric">
            <strong>Visual clean</strong>
            <span>Mostra so o que voce decidir usar</span>
          </div>
          <div className="campaign-intro-metric">
            <strong>Foto opcional</strong>
            <span>Com mensagem curta ou longa</span>
          </div>
        </div>
      </section>

      <section className="campaign-builder-grid campaign-builder-grid-clean">
        <div className="campaign-main-panel">
          <div className="campaign-card campaign-card-soft">
            <div className="campaign-form-grid">
              <input
                className="text-input"
                type="text"
                name="nome_campanha"
                placeholder="Nome da campanha"
                required
              />
              <div className="campaign-mode-toolbar">
                <span className="campaign-section-eyebrow">Destino</span>
                <div className="campaign-mode-toggle">
                  <button
                    type="button"
                    className={targetMode === "individual" ? "secondary-button campaign-mode-active" : "secondary-button"}
                    onClick={() => {
                      setTargetMode("individual");
                      setSelectedGroupIds([]);
                    }}
                  >
                    Individual
                  </button>
                  <button
                    type="button"
                    className={targetMode === "grupo_telegram" ? "secondary-button campaign-mode-active" : "secondary-button"}
                    onClick={() => {
                      setTargetMode("grupo_telegram");
                      setSelectedIds([]);
                      setUseButtons(false);
                    }}
                  >
                    Grupo Telegram
                  </button>
                </div>
              </div>
            </div>

            <div className="campaign-toggle-row">
              <label className="checkbox-card">
                <input
                  type="checkbox"
                  checked={useImage}
                  onChange={(event) => setUseImage(event.target.checked)}
                />
                <span>Adicionar imagem</span>
              </label>
              {targetMode === "individual" ? (
                <label className="checkbox-card">
                  <input
                    type="checkbox"
                    checked={useButtons}
                    onChange={(event) => setUseButtons(event.target.checked)}
                  />
                  <span>Usar botoes</span>
                </label>
              ) : null}
            </div>
          </div>

          <div className="campaign-card">
            <div className="campaign-card-header">
              <div>
                <span className="campaign-section-eyebrow">Mensagem</span>
                <h3>Conteudo do disparo</h3>
                {targetMode === "individual" ? (
                  <p className="campaign-card-copy">Voce pode usar `{nome}`, `{telefone}`, `{cpf}`, `{hotzone}` e `{turno}`.</p>
                ) : (
                  <p className="campaign-card-copy">No grupo Telegram, a mensagem vai exatamente como voce escrever.</p>
                )}
              </div>
            </div>
            <textarea
              className="textarea-input campaign-message-input"
              name="mensagem"
              placeholder={
                targetMode === "grupo_telegram"
                  ? "Ola time, hoje teremos uma operacao especial. Ativem os aplicativos e acompanhem as orientacoes abaixo."
                  : "Ola {nome}, vimos que voce esta agendado para a escala do {turno} na hotzone {hotzone}."
              }
              rows={7}
              required
            />
          </div>

          {useImage ? (
            <div className="campaign-card">
              <div className="campaign-card-header">
                <div>
                  <span className="campaign-section-eyebrow">Imagem</span>
                  <h3>Arquivo do disparo</h3>
                  <p className="campaign-card-copy">Aceita JPG, PNG e WEBP.</p>
                </div>
              </div>
              <input className="text-input" type="file" name="imagem_campanha" accept="image/png,image/jpeg,image/webp" />
            </div>
          ) : null}

          {useButtons && targetMode === "individual" ? (
            <div className="campaign-card">
              <div className="campaign-card-header">
                <div>
                  <span className="campaign-section-eyebrow">Botoes</span>
                  <h3>Opcoes de resposta</h3>
                </div>
                <button type="button" className="secondary-button" onClick={addButton} disabled={buttons.length >= 6}>
                  Adicionar botao
                </button>
              </div>

              <div className="campaign-buttons-grid">
                {buttons.map((button, index) => {
                  const normalizedLabel = button.label.trim() || `Botao ${index + 1}`;

                  return (
                    <div key={button.id} className="campaign-button-editor-row">
                      <div className="campaign-button-badge">{index + 1}</div>
                      <div className="campaign-button-editor">
                        <input
                          className="text-input campaign-button-input"
                          type="text"
                          value={button.label}
                          onChange={(event) => updateButton(index, event.target.value)}
                          placeholder={`Botao ${index + 1}`}
                          required={useButtons}
                        />
                        <button
                          type="button"
                          className="secondary-button campaign-button-remove"
                          onClick={() => removeButton(index)}
                          disabled={buttons.length <= 2}
                        >
                          Remover
                        </button>
                      </div>
                      <div className="campaign-button-preview-chip">{normalizedLabel}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {targetMode === "grupo_telegram" ? (
        <section className="campaign-card">
          <div className="campaign-card-header">
            <div>
              <span className="campaign-section-eyebrow">Grupos oficiais</span>
              <h3>Escolha os grupos</h3>
              <p className="campaign-card-copy">Selecione um ou mais grupos oficiais para receber o disparo.</p>
            </div>
          </div>

          <div className="campaign-group-grid">
            {TELEGRAM_GROUP_TARGETS.map((group) => {
              const selected = selectedGroupIds.includes(group.id);

              return (
                <button
                  key={group.id}
                  type="button"
                  className={selected ? "campaign-recipient-card campaign-recipient-card-active" : "campaign-recipient-card"}
                  onClick={() => toggleGroup(group.id)}
                >
                  <div className="campaign-recipient-top">
                    <strong>{group.nome}</strong>
                    <span className="day-chip day-chip-info">Grupo oficial</span>
                  </div>
                  <p>Hotzone: {group.hotzone}</p>
                  <p>Chat ID: {group.telegram_chat_id}</p>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {targetMode === "individual" ? (
        <section className="campaign-card">
          <div className="campaign-card-header">
            <div>
              <span className="campaign-section-eyebrow">Destinatario</span>
              <h3>Escolha uma pessoa</h3>
              <p className="campaign-card-copy">Busque por nome, CPF, telefone, hotzone ou turno.</p>
            </div>
            {selectedRecipient ? (
              <div className="campaign-selection-actions">
                <div className="campaign-selection-summary">
                  <strong>1</strong>
                  <span>selecionado</span>
                </div>
              </div>
            ) : (
              <div className="campaign-selection-actions">
                <div className="campaign-selection-summary">
                  <strong>0</strong>
                  <span>selecionado</span>
                </div>
              </div>
            )}
          </div>

          <div className="campaign-search-toolbar campaign-search-toolbar-clean">
            <input
              className="text-input courier-search-input"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar pessoa por nome, CPF, telefone, hotzone ou turno"
            />
            <label className="checkbox-card">
              <input
                type="checkbox"
                checked={onlyWithChat}
                onChange={(event) => setOnlyWithChat(event.target.checked)}
              />
              <span>Somente com chat_id</span>
            </label>
            {selectedRecipient ? (
              <button type="button" className="secondary-button" onClick={clearSelection}>
                Limpar
              </button>
            ) : null}
          </div>

          {selectedRecipient ? (
            <div className="campaign-recipient-selected">
              <strong>{selectedRecipient.nome}</strong>
              <span>
                {selectedRecipient.cpf} | {selectedRecipient.hotzone || "-"} | {selectedRecipient.turno || "-"}
              </span>
            </div>
          ) : null}

          <div className="campaign-recipient-grid">
            {filteredRecipients.map((recipient) => {
              const selected = selectedIds.includes(recipient.id);

              return (
                <button
                  key={recipient.id}
                  type="button"
                  className={selected ? "campaign-recipient-card campaign-recipient-card-active" : "campaign-recipient-card"}
                  onClick={() => toggleRecipient(recipient.id)}
                >
                  <div className="campaign-recipient-top">
                    <strong>{recipient.nome}</strong>
                    <span className={recipient.telegram_chat_id ? "day-chip day-chip-success" : "day-chip day-chip-muted"}>
                      {recipient.telegram_chat_id ? "Com chat_id" : "Sem chat_id"}
                    </span>
                  </div>
                  <p>CPF: {recipient.cpf}</p>
                  <p>Telefone: {recipient.telefone || "-"}</p>
                  <p>Hotzone: {recipient.hotzone || "-"}</p>
                  <p>Turno: {recipient.turno || "-"}</p>
                </button>
              );
            })}
          </div>

          {filteredRecipients.length === 0 ? (
            <div className="empty-state">
              <h2>Nenhum destinatario encontrado</h2>
              <p>Ajuste a busca ou remova o filtro de `chat_id`.</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="manual-form-actions">
        <SubmitButton />
      </div>

      {state.message ? (
        <p className="manual-form-feedback manual-form-feedback-error">{state.message}</p>
      ) : null}
    </form>
  );
}
