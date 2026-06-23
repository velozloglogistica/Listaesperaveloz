"use client";

import { useActionState, useMemo, useRef, useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";

import { createTelegramCampaignAction, type CampaignActionState } from "@/app/campaign-actions";
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

type CampaignTargetMode = "planilha" | "individual" | "grupo_telegram";

type CampaignButton = {
  id: string;
  label: string;
};

type SpreadsheetPreviewRow = {
  cpf: string;
  nome: string;
  status: "com_chat_id" | "sem_chat_id" | "cpf_nao_encontrado";
  nome_base: string | null;
  hotzone: string | null;
  turno: string | null;
};

type SpreadsheetPreview = {
  totalPlanilha: number;
  totalComChatId: number;
  totalSemChatId: number;
  totalCpfNaoEncontrado: number;
  totalEncontradoSemChatId: number;
  rows: SpreadsheetPreviewRow[];
};

const initialState: CampaignActionState = {
  status: "idle",
  message: "",
};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="primary-button" disabled={pending || disabled}>
      {pending ? "Disparando campanha..." : "Confirmar e disparar"}
    </button>
  );
}

function getPreviewStatusLabel(status: SpreadsheetPreviewRow["status"]) {
  if (status === "com_chat_id") {
    return "Com chat_id";
  }

  if (status === "sem_chat_id") {
    return "Encontrado sem chat_id";
  }

  return "CPF nao encontrado";
}

export function TelegramCampaignForm({
  baseRecipients,
}: {
  baseRecipients: CampaignRecipientOption[];
}) {
  const [state, formAction] = useActionState(createTelegramCampaignAction, initialState);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const buttonIdRef = useRef(2);
  const [targetMode, setTargetMode] = useState<CampaignTargetMode>("planilha");
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
  const [preview, setPreview] = useState<SpreadsheetPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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

  function resetPreview() {
    setPreview(null);
    setPreviewError("");
  }

  function handleModeChange(mode: CampaignTargetMode) {
    setTargetMode(mode);
    setPreview(null);
    setPreviewError("");
    setIsAnalyzing(false);

    if (mode !== "planilha") {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }

    if (mode === "individual") {
      setSelectedGroupIds([]);
      return;
    }

    if (mode === "grupo_telegram") {
      setSelectedIds([]);
      setUseButtons(false);
      return;
    }

    setSelectedIds([]);
    setSelectedGroupIds([]);
  }

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

  async function analyzeSpreadsheet() {
    const file = fileInputRef.current?.files?.[0];

    if (!file) {
      setPreview(null);
      setPreviewError("Selecione a planilha antes de analisar.");
      return;
    }

    setIsAnalyzing(true);
    setPreviewError("");

    try {
      const formData = new FormData();
      formData.append("planilha", file);

      const response = await fetch("/api/telegram-campaigns/preview", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as SpreadsheetPreview | { error?: string };

      if (!response.ok) {
        setPreview(null);
        setPreviewError(payload && "error" in payload ? payload.error || "Nao foi possivel analisar a planilha." : "Nao foi possivel analisar a planilha.");
        return;
      }

      setPreview(payload as SpreadsheetPreview);
    } catch {
      setPreview(null);
      setPreviewError("Nao foi possivel analisar a planilha agora. Tente novamente.");
    } finally {
      setIsAnalyzing(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (targetMode === "planilha" && !preview) {
      event.preventDefault();
      setPreviewError("Analise a planilha antes de confirmar o disparo.");
      return;
    }

    const confirmationMessage =
      targetMode === "planilha" && preview
        ? `Deseja realmente disparar esta campanha?\n\nAchados com chat_id: ${preview.totalComChatId}\nSem chat_id: ${preview.totalEncontradoSemChatId}\nCPF nao encontrado: ${preview.totalCpfNaoEncontrado}`
        : targetMode === "individual"
          ? "Deseja realmente disparar esta campanha individual?"
          : "Deseja realmente disparar esta campanha para os grupos selecionados?";

    const shouldProceed = window.confirm(confirmationMessage);

    if (!shouldProceed) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} className="hierarchy-form" onSubmit={handleSubmit}>
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
          <h3>Planilha, individual ou grupo</h3>
          <p>Use planilha com preview por CPF, selecione uma pessoa para envio individual ou escolha grupos oficiais do Telegram.</p>
        </div>
        <div className="campaign-intro-metrics">
          <div className="campaign-intro-metric">
            <strong>3 modos</strong>
            <span>Planilha, Individual e Grupo Telegram</span>
          </div>
          <div className="campaign-intro-metric">
            <strong>Preview antes</strong>
            <span>Na planilha voce valida achados e nao achados</span>
          </div>
          <div className="campaign-intro-metric">
            <strong>Foto opcional</strong>
            <span>Com botoes quando fizer sentido no envio</span>
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
                    className={targetMode === "planilha" ? "secondary-button campaign-mode-active" : "secondary-button"}
                    onClick={() => handleModeChange("planilha")}
                  >
                    Planilha
                  </button>
                  <button
                    type="button"
                    className={targetMode === "individual" ? "secondary-button campaign-mode-active" : "secondary-button"}
                    onClick={() => handleModeChange("individual")}
                  >
                    Individual
                  </button>
                  <button
                    type="button"
                    className={targetMode === "grupo_telegram" ? "secondary-button campaign-mode-active" : "secondary-button"}
                    onClick={() => handleModeChange("grupo_telegram")}
                  >
                    Grupo Telegram
                  </button>
                </div>
              </div>
            </div>

            {targetMode === "planilha" ? (
              <>
                <input
                  ref={fileInputRef}
                  className="text-input"
                  type="file"
                  name="planilha"
                  accept=".xlsx,.xls,.csv"
                  required={targetMode === "planilha"}
                  onChange={resetPreview}
                />
                <p className="campaign-card-copy">
                  A planilha pode vir com colunas como {"Nome do entregador parceiro"} e {"Numero da identidade"}. O sistema usa apenas nome e CPF para cruzar com a base.
                </p>
              </>
            ) : null}

            <div className="campaign-toggle-row">
              <label className="checkbox-card">
                <input
                  type="checkbox"
                  checked={useImage}
                  onChange={(event) => setUseImage(event.target.checked)}
                />
                <span>Adicionar imagem</span>
              </label>
              {targetMode !== "grupo_telegram" ? (
                <label className="checkbox-card">
                  <input
                    type="checkbox"
                    checked={useButtons}
                    onChange={(event) => setUseButtons(event.target.checked)}
                  />
                  <span>Usar botoes</span>
                </label>
              ) : null}
              {targetMode === "planilha" ? (
                <button type="button" className="secondary-button" onClick={analyzeSpreadsheet} disabled={isAnalyzing}>
                  {isAnalyzing ? "Analisando planilha..." : "Analisar planilha"}
                </button>
              ) : null}
            </div>
          </div>

          <div className="campaign-card">
            <div className="campaign-card-header">
              <div>
                <span className="campaign-section-eyebrow">Mensagem</span>
                <h3>Conteudo do disparo</h3>
                {targetMode === "grupo_telegram" ? (
                  <p className="campaign-card-copy">No grupo Telegram, a mensagem vai exatamente como voce escrever.</p>
                ) : (
                  <p className="campaign-card-copy">
                    Voce pode usar {"{nome}"}, {"{telefone}"}, {"{cpf}"}, {"{hotzone}"} e {"{turno}"}.
                  </p>
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

          {useButtons && targetMode !== "grupo_telegram" ? (
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
            <div className="campaign-selection-actions">
              <div className="campaign-selection-summary">
                <strong>{selectedRecipient ? "1" : "0"}</strong>
                <span>selecionado</span>
              </div>
            </div>
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

      {targetMode === "planilha" && preview ? (
        <>
          <section className="summary-grid">
            <div className="summary-card">
              <h3>Total na planilha</h3>
              <strong>{preview.totalPlanilha}</strong>
            </div>
            <div className="summary-card">
              <h3>Com chat_id</h3>
              <strong>{preview.totalComChatId}</strong>
            </div>
            <div className="summary-card">
              <h3>Encontrados sem chat_id</h3>
              <strong>{preview.totalEncontradoSemChatId}</strong>
            </div>
            <div className="summary-card">
              <h3>CPF nao encontrado</h3>
              <strong>{preview.totalCpfNaoEncontrado}</strong>
            </div>
          </section>

          <section className="campaign-card">
            <div className="campaign-card-header">
              <div>
                <span className="campaign-section-eyebrow">Pre-analise</span>
                <h3>Resultado do cruzamento por CPF</h3>
                <p className="campaign-card-copy">So os registros com chat_id vao ser disparados. Os demais ficam salvos no relatorio da campanha.</p>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nome da planilha</th>
                    <th>CPF</th>
                    <th>Status</th>
                    <th>Nome na base</th>
                    <th>Hotzone</th>
                    <th>Turno</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.cpf}>
                      <td>{row.nome}</td>
                      <td>{row.cpf}</td>
                      <td>{getPreviewStatusLabel(row.status)}</td>
                      <td>{row.nome_base || "-"}</td>
                      <td>{row.hotzone || "-"}</td>
                      <td>{row.turno || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      <div className="manual-form-actions">
        <SubmitButton
          disabled={
            targetMode === "planilha"
              ? !preview
              : targetMode === "individual"
                ? !selectedRecipient
                : selectedGroupIds.length === 0
          }
        />
      </div>

      {previewError ? (
        <p className="manual-form-feedback manual-form-feedback-error">{previewError}</p>
      ) : null}

      {state.message ? (
        <p className="manual-form-feedback manual-form-feedback-error">{state.message}</p>
      ) : null}
    </form>
  );
}
