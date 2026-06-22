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

type CampaignTargetMode = "planilha" | "individual" | "grupo" | "grupo_telegram";
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
  const [targetMode, setTargetMode] = useState<CampaignTargetMode>("planilha");
  const buttonIdRef = useRef(2);
  const [buttons, setButtons] = useState<CampaignButton[]>([
    { id: "button-1", label: "Vou" },
    { id: "button-2", label: "Nao vou" },
  ]);
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
      if (targetMode === "individual") {
        return currentIds[0] === recipientId ? [] : [recipientId];
      }

      return currentIds.includes(recipientId)
        ? currentIds.filter((currentId) => currentId !== recipientId)
        : [...currentIds, recipientId];
    });
  }

  function selectAllFiltered() {
    setSelectedIds((currentIds) => {
      if (targetMode === "individual") {
        const firstRecipient = filteredRecipients[0];
        return firstRecipient ? [firstRecipient.id] : currentIds;
      }

      const nextIds = new Set(currentIds);
      filteredRecipients.forEach((recipient) => nextIds.add(recipient.id));
      return Array.from(nextIds);
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
      <input type="hidden" name="buttons_json" value={JSON.stringify(buttons.map((button) => button.label))} />
      <input type="hidden" name="selected_waitlist_ids" value={JSON.stringify(selectedIds)} />
      <input type="hidden" name="selected_group_ids" value={JSON.stringify(selectedGroupIds)} />

      <section className="campaign-intro-panel">
        <div className="campaign-intro-copy">
          <span className="campaign-section-eyebrow">Campanhas Telegram</span>
          <h3>Monte, personalize e dispare com controle total</h3>
          <p>
            Escolha o publico, envie texto ou imagem com mensagem, configure quantos botoes quiser e acompanhe as respostas em tempo real.
          </p>
        </div>
        <div className="campaign-intro-metrics">
          <div className="campaign-intro-metric">
            <strong>4 modos</strong>
            <span>Planilha, individual, grupo e grupo Telegram</span>
          </div>
          <div className="campaign-intro-metric">
            <strong>2 a 6 botoes</strong>
            <span>Respostas dinamicas no Telegram</span>
          </div>
          <div className="campaign-intro-metric">
            <strong>Foto opcional</strong>
            <span>Junto com a mensagem, no individual ou em massa</span>
          </div>
        </div>
      </section>

      <section className="campaign-builder-grid">
        <div className="campaign-main-panel">
          <div className="campaign-form-grid">
            <div className="campaign-card campaign-card-soft">
              <div className="campaign-card-header">
                <div>
                  <span className="campaign-section-eyebrow">Configuracao</span>
                  <h3>Dados principais</h3>
                </div>
              </div>
              <input
                className="text-input"
                type="text"
                name="nome_campanha"
                placeholder="Nome da campanha"
                required
              />
            </div>

            <div className="campaign-card campaign-card-soft">
              <div className="campaign-mode-toolbar">
                <span className="campaign-section-eyebrow">Destino</span>
                <div className="campaign-mode-toggle">
                  <button
                    type="button"
                    className={targetMode === "planilha" ? "secondary-button campaign-mode-active" : "secondary-button"}
                    onClick={() => setTargetMode("planilha")}
                  >
                    Planilha
                  </button>
                  <button
                    type="button"
                    className={targetMode === "individual" ? "secondary-button campaign-mode-active" : "secondary-button"}
                    onClick={() => {
                      setTargetMode("individual");
                      setSelectedIds((currentIds) => currentIds.slice(0, 1));
                    }}
                  >
                    Individual
                  </button>
                  <button
                    type="button"
                    className={targetMode === "grupo" ? "secondary-button campaign-mode-active" : "secondary-button"}
                    onClick={() => setTargetMode("grupo")}
                  >
                    Grupo da base
                  </button>
                  <button
                    type="button"
                    className={targetMode === "grupo_telegram" ? "secondary-button campaign-mode-active" : "secondary-button"}
                    onClick={() => setTargetMode("grupo_telegram")}
                  >
                    Grupo Telegram
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="campaign-card">
            <div className="campaign-card-header">
              <div>
                <span className="campaign-section-eyebrow">Mensagem</span>
                <h3>Texto do disparo</h3>
              </div>
            </div>
            <textarea
              className="textarea-input campaign-message-input"
              name="mensagem"
              placeholder={
                targetMode === "grupo_telegram"
                  ? "Ola time, hoje teremos uma operacao especial. Ativem os aplicativos e acompanhem as orientacoes abaixo."
                  : "Ola {nome}, vimos que voce esta agendado para a escala do {turno} na hotzone {hotzone}. Hoje tera jogo do Brasil. Voce confirma presenca?"
              }
              rows={7}
              required
            />
          </div>

          <div className="campaign-card">
            <div className="campaign-card-header">
              <div>
                <span className="campaign-section-eyebrow">Midia</span>
                <h3>Imagem opcional</h3>
                <p className="campaign-card-copy">
                  Se quiser, envie foto junto com a mensagem. Quando o texto for grande, o sistema manda a foto primeiro e o texto depois.
                </p>
              </div>
            </div>
            <input className="text-input" type="file" name="imagem_campanha" accept="image/png,image/jpeg,image/webp" />
          </div>

          {targetMode !== "grupo_telegram" ? (
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
                          required
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
          ) : (
            <div className="campaign-card">
              <div className="campaign-card-header">
                <div>
                  <span className="campaign-section-eyebrow">Botoes</span>
                  <h3>Campanha em grupo</h3>
                </div>
              </div>
              <p className="campaign-card-copy">
                No modo `Grupo Telegram`, o disparo funciona como comunicacao do grupo. A mensagem pode ir com foto, mas sem botoes de resposta individuais.
              </p>
            </div>
          )}
          {targetMode === "planilha" ? (
            <div className="campaign-card">
              <div className="campaign-card-header">
                <div>
                  <span className="campaign-section-eyebrow">Origem</span>
                  <h3>Importar planilha</h3>
                </div>
              </div>
              <input
                className="text-input"
                type="file"
                name="planilha"
                accept=".xlsx,.xls,.csv"
                required={targetMode === "planilha"}
              />
              <p className="campaign-card-copy">
                Campos esperados: `cpf`, `nome`, `telefone`, `hotzone` e `turno`.
              </p>
            </div>
          ) : null}
        </div>

        <div className="campaign-side-panel">
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
            {targetMode === "grupo_telegram" ? (
              <p className="campaign-card-copy">No grupo Telegram, o texto e enviado do jeito que voce escrever, sem personalizacao por pessoa.</p>
            ) : null}
          </div>

          <div className="access-panel">
            <h3>Regras do disparo</h3>
            <p>O envio usa apenas `telegram_chat_id`. Sem chat valido, o sistema registra `sem_chat_id`.</p>
            <p>Voce pode disparar por planilha, para uma pessoa individualmente, montar um grupo da base ou enviar direto para grupos oficiais do Telegram.</p>
          </div>

          <div className="access-panel campaign-tips-panel">
            <h3>Dicas rapidas</h3>
            <p>Use botoes curtos como `Sim`, `Nao`, `Vou`, `Nao vou` ou `Confirmo` para facilitar a resposta.</p>
            <p>Antes de disparar, filtre a base para montar grupos operacionais mais precisos.</p>
          </div>
        </div>
      </section>

      {targetMode === "grupo_telegram" ? (
        <section className="campaign-card">
          <div className="campaign-card-header">
            <div>
              <span className="campaign-section-eyebrow">Grupos oficiais</span>
              <h3>Escolha para quais grupos enviar</h3>
              <p className="campaign-card-copy">
                Selecione um ou mais grupos fixos da operacao. O disparo vai usar o `chat_id` do proprio grupo.
              </p>
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

      {targetMode !== "planilha" && targetMode !== "grupo_telegram" ? (
        <section className="campaign-card">
          <div className="campaign-card-header">
            <div>
              <span className="campaign-section-eyebrow">Selecao manual</span>
              <h3>{targetMode === "individual" ? "Escolha uma pessoa" : "Monte seu grupo"}</h3>
              <p className="campaign-card-copy">
                Busque por nome, CPF, telefone, hotzone ou turno e selecione exatamente quem deve receber a campanha.
              </p>
            </div>
            <div className="campaign-selection-actions">
              <button type="button" className="secondary-button" onClick={selectAllFiltered}>
                {targetMode === "individual" ? "Usar primeiro filtrado" : "Selecionar filtrados"}
              </button>
              <button type="button" className="secondary-button" onClick={clearSelection}>
                Limpar selecao
              </button>
            </div>
          </div>

          <div className="campaign-search-toolbar">
            <input
              className="text-input courier-search-input"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, CPF, telefone, hotzone ou turno"
            />
            <label className="checkbox-card">
              <input
                type="checkbox"
                checked={onlyWithChat}
                onChange={(event) => setOnlyWithChat(event.target.checked)}
              />
              <span>Mostrar somente quem tem chat_id</span>
            </label>
            <div className="campaign-selection-summary">
              <strong>{selectedRecipients.length}</strong>
              <span>{targetMode === "individual" ? "selecionado" : "selecionados"}</span>
            </div>
          </div>

          {selectedRecipients.length > 0 ? (
            <div className="campaign-variable-list">
              {selectedRecipients.map((recipient) => (
                <code key={recipient.id}>
                  {recipient.nome} | {recipient.cpf}
                </code>
              ))}
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
              <p>Ajuste a busca ou desative o filtro de `chat_id` para ampliar os resultados.</p>
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
