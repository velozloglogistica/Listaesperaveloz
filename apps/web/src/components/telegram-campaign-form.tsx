"use client";

import { useActionState, useRef, useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";

import { createTelegramCampaignAction, type CampaignActionState } from "@/app/campaign-actions";

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

export function TelegramCampaignForm() {
  const [state, formAction] = useActionState(createTelegramCampaignAction, initialState);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const buttonIdRef = useRef(2);
  const [buttons, setButtons] = useState<CampaignButton[]>([
    { id: "button-1", label: "Sim" },
    { id: "button-2", label: "Nao" },
  ]);
  const [useButtons, setUseButtons] = useState(false);
  const [useImage, setUseImage] = useState(false);
  const [preview, setPreview] = useState<SpreadsheetPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  function resetPreview() {
    setPreview(null);
    setPreviewError("");
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
    if (!preview) {
      event.preventDefault();
      setPreviewError("Analise a planilha antes de confirmar o disparo.");
      return;
    }

    const shouldProceed = window.confirm(
      `Deseja realmente disparar esta campanha?\n\nAchados com chat_id: ${preview.totalComChatId}\nSem chat_id: ${preview.totalEncontradoSemChatId}\nCPF nao encontrado: ${preview.totalCpfNaoEncontrado}`,
    );

    if (!shouldProceed) {
      event.preventDefault();
    }
  }

  return (
    <form action={formAction} className="hierarchy-form" onSubmit={handleSubmit}>
      <input type="hidden" name="target_mode" value="planilha" />
      <input
        type="hidden"
        name="buttons_json"
        value={JSON.stringify(useButtons ? buttons.map((button) => button.label) : [])}
      />
      <input type="hidden" name="usar_botoes" value={useButtons ? "true" : "false"} />

      <section className="campaign-intro-panel">
        <div className="campaign-intro-copy">
          <span className="campaign-section-eyebrow">Campanhas Telegram</span>
          <h3>Planilha primeiro, disparo depois</h3>
          <p>Suba a planilha com nome e CPF, veja quantos achamos na base pelo CPF e confirme o envio so depois da analise.</p>
        </div>
        <div className="campaign-intro-metrics">
          <div className="campaign-intro-metric">
            <strong>Nome + CPF</strong>
            <span>Lemos somente o nome e o CPF da planilha</span>
          </div>
          <div className="campaign-intro-metric">
            <strong>Preview antes</strong>
            <span>Mostra achados, sem chat_id e nao encontrados</span>
          </div>
          <div className="campaign-intro-metric">
            <strong>Disparo seguro</strong>
            <span>So envia depois da sua confirmacao</span>
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
              <input
                ref={fileInputRef}
                className="text-input"
                type="file"
                name="planilha"
                accept=".xlsx,.xls,.csv"
                required
                onChange={resetPreview}
              />
            </div>

            <p className="campaign-card-copy">
              A planilha pode vir com colunas como {"Nome do entregador parceiro"} e {"Numero da identidade"}. O sistema usa apenas nome e CPF para cruzar com a base.
            </p>

            <div className="campaign-toggle-row">
              <label className="checkbox-card">
                <input
                  type="checkbox"
                  checked={useImage}
                  onChange={(event) => setUseImage(event.target.checked)}
                />
                <span>Adicionar imagem</span>
              </label>
              <label className="checkbox-card">
                <input
                  type="checkbox"
                  checked={useButtons}
                  onChange={(event) => setUseButtons(event.target.checked)}
                />
                <span>Usar botoes</span>
              </label>
              <button type="button" className="secondary-button" onClick={analyzeSpreadsheet} disabled={isAnalyzing}>
                {isAnalyzing ? "Analisando planilha..." : "Analisar planilha"}
              </button>
            </div>
          </div>

          <div className="campaign-card">
            <div className="campaign-card-header">
              <div>
                <span className="campaign-section-eyebrow">Mensagem</span>
                <h3>Conteudo do disparo</h3>
                <p className="campaign-card-copy">
                  Voce pode usar {"{nome}"}, {"{telefone}"}, {"{cpf}"}, {"{hotzone}"} e {"{turno}"}.
                </p>
              </div>
            </div>
            <textarea
              className="textarea-input campaign-message-input"
              name="mensagem"
              placeholder="Ola {nome}, vimos que voce esta agendado para a escala do {turno} na hotzone {hotzone}."
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

          {useButtons ? (
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

      {preview ? (
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
        <SubmitButton disabled={!preview} />
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
