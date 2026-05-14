"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import { createBagCourierAction, type BagActionState } from "@/app/bag-actions";
import { BAG_SHIFT_OPTIONS, BAG_VEHICLE_OPTIONS, BAG_WEEKDAY_OPTIONS } from "@/lib/bag-config";

const initialState: BagActionState = {
  status: "idle",
  message: "",
};

type BagCourierFormProps = {
  cities: Array<{
    id: string;
    name: string;
  }>;
  regions: Array<{
    id: string;
    city_id: string;
    city_name: string;
    name: string;
  }>;
  operators: Array<{
    id: string;
    full_name: string;
    role: string;
  }>;
  statuses: Array<{
    slug: string;
    label: string;
  }>;
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="primary-button" disabled={pending}>
      {pending ? "Salvando entregador..." : "Salvar entregador"}
    </button>
  );
}

export function BagCourierForm({ cities, regions, operators, statuses }: BagCourierFormProps) {
  const [state, formAction] = useActionState(createBagCourierAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const initialCityId = cities[0]?.id || "";
  const initialStatus = statuses[0]?.slug || "";
  const [selectedCityId, setSelectedCityId] = useState(initialCityId);

  const filteredRegions = useMemo(
    () => regions.filter((region) => region.city_id === selectedCityId),
    [regions, selectedCityId],
  );

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      setSelectedCityId(initialCityId);
    }
  }, [initialCityId, state.status]);

  return (
    <form ref={formRef} action={formAction} className="hierarchy-form">
      <div className="access-grid">
        <div className="access-panel">
          <h3>1. Dados do entregador</h3>
          <p>Preencha primeiro as informacoes principais do cadastro.</p>

          <div className="manual-form-grid hierarchy-form-grid">
            <input
              className="text-input"
              type="text"
              name="partner_delivery_id"
              placeholder="ID do entregador parceiro"
              required
            />

            <input
              className="text-input"
              type="text"
              name="full_name"
              placeholder="Nome do entregador parceiro"
              required
            />

            <input
              className="text-input"
              type="text"
              name="phone_number"
              inputMode="numeric"
              placeholder="Numero de telefone"
              required
            />
          </div>

          <div className="manual-form-grid hierarchy-form-grid">
            <input
              className="text-input"
              type="url"
              name="whatsapp_web_link"
              placeholder="Link do WhatsApp Web"
            />

            <input
              className="text-input"
              type="text"
              name="identity_number"
              placeholder="Numero de identidade"
            />

            <select
              className="select-input"
              name="city_id"
              value={selectedCityId}
              onChange={(event) => setSelectedCityId(event.target.value)}
              required
            >
              <option value="" disabled>
                Escolha a cidade
              </option>
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="access-panel">
          <h3>2. Configuracao operacional</h3>
          <p>Defina quem cadastrou, qual o status da BAG e como esse entregador vai operar.</p>

          <div className="manual-form-grid hierarchy-form-grid">
            <select className="select-input" name="operator_user_id" required defaultValue="">
              <option value="" disabled>
                Operador responsavel
              </option>
              {operators.map((operator) => (
                <option key={operator.id} value={operator.id}>
                  {operator.full_name} · {operator.role}
                </option>
              ))}
            </select>

            <select className="select-input" name="bag_status" required defaultValue={initialStatus}>
              {statuses.map((status) => (
                <option key={status.slug} value={status.slug}>
                  {status.label}
                </option>
              ))}
            </select>

            <select className="select-input" name="delivery_vehicle" required defaultValue="">
              <option value="" disabled>
                Veiculo de entrega
              </option>
              {BAG_VEHICLE_OPTIONS.map((vehicle) => (
                <option key={vehicle.value} value={vehicle.value}>
                  {vehicle.label}
                </option>
              ))}
            </select>
          </div>

          <label className="checkbox-card">
            <input type="checkbox" name="joined_telegram_group" />
            <span>Entrou no grupo do Telegram?</span>
          </label>

          <textarea
            className="text-input"
            name="observation"
            placeholder="Observacao"
            rows={4}
          />
        </div>
      </div>

      <div className="access-grid">
        <div className="access-panel">
          <h3>3. Hot Zones desejadas</h3>
          <p>Escolha as Hot Zones da cidade selecionada para esse entregador.</p>
          <div className="access-checkbox-grid">
            {filteredRegions.length > 0 ? (
              filteredRegions.map((region) => (
                <label key={region.id} className="checkbox-card checkbox-card-stack">
                  <input type="checkbox" name="region_ids" value={region.id} />
                  <span>
                    <strong>{region.name}</strong>
                    <small>{region.city_name}</small>
                  </span>
                </label>
              ))
            ) : (
              <div className="platform-form-note">
                <strong>Cadastre Hot Zones primeiro</strong>
                <p>Essa cidade ainda nao possui Hot Zones ativas para selecionar.</p>
              </div>
            )}
          </div>
        </div>

        <div className="access-panel">
          <h3>4. Turnos</h3>
          <p>Marque todos os turnos que o entregador deseja operar.</p>
          <div className="access-checkbox-grid">
            {BAG_SHIFT_OPTIONS.map((shift) => (
              <label key={shift.value} className="checkbox-card checkbox-card-stack">
                <input type="checkbox" name="preferred_shifts" value={shift.value} />
                <span>
                  <strong>{shift.label}</strong>
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="access-panel">
        <h3>5. Dias da semana</h3>
        <p>Defina em quais dias o entregador gostaria de atuar.</p>
        <div className="access-checkbox-grid">
          {BAG_WEEKDAY_OPTIONS.map((weekday) => (
            <label key={weekday.value} className="checkbox-card checkbox-card-stack">
              <input type="checkbox" name="preferred_weekdays" value={weekday.value} />
              <span>
                <strong>{weekday.label}</strong>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="access-panel">
        <h3>6. Finalizar cadastro</h3>
        <p>Revise os dados preenchidos acima e confirme o cadastro do entregador.</p>
        <div className="manual-form-actions">
          <SubmitButton />
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
