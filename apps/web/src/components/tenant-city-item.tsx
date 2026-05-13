"use client";

import { useActionState, useEffect, useState } from "react";

import {
  deleteTenantCityAction,
  type CompanyProfileActionState,
  updateTenantCityAction,
} from "@/app/company-profile-actions";
import { TenantHotZoneItem } from "@/components/tenant-hot-zone-item";

const initialState: CompanyProfileActionState = {
  status: "idle",
  message: "",
};

type TenantCityItemProps = {
  id: string;
  name: string;
  hotZones: Array<{
    id: string;
    name: string;
    cityName: string;
  }>;
};

export function TenantCityItem({ id, name, hotZones }: TenantCityItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updateTenantCityAction, initialState);
  const [deleteState, deleteAction] = useActionState(deleteTenantCityAction, initialState);

  useEffect(() => {
    if (updateState.status === "success") {
      setIsEditing(false);
    }
  }, [updateState.status]);

  return (
    <article className="user-card user-card-stack">
      <div style={{ display: "grid", gap: 14, width: "100%" }}>
        {isEditing ? (
          <form action={updateAction} className="manual-form-grid hierarchy-form-grid">
            <input type="hidden" name="id" value={id} />
            <input className="text-input" type="text" name="name" defaultValue={name} required />
            <div className="filters-actions">
              <button type="submit" className="primary-button">
                Salvar
              </button>
              <button type="button" className="secondary-button" onClick={() => setIsEditing(false)}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div>
            <strong>{name}</strong>
            <p>{hotZones.length} Hot Zone(s) cadastrada(s)</p>
          </div>
        )}

        {updateState.message ? (
          <p
            className={
              updateState.status === "error"
                ? "manual-form-feedback manual-form-feedback-error"
                : "manual-form-feedback manual-form-feedback-success"
            }
          >
            {updateState.message}
          </p>
        ) : null}

        {deleteState.message ? (
          <p
            className={
              deleteState.status === "error"
                ? "manual-form-feedback manual-form-feedback-error"
                : "manual-form-feedback manual-form-feedback-success"
            }
          >
            {deleteState.message}
          </p>
        ) : null}

        <div style={{ display: "grid", gap: 10 }}>
          {hotZones.length > 0 ? (
            hotZones.map((hotZone) => (
              <TenantHotZoneItem
                key={hotZone.id}
                id={hotZone.id}
                name={hotZone.name}
                cityName={hotZone.cityName}
              />
            ))
          ) : (
            <div className="platform-form-note">
              <strong>Sem Hot Zones</strong>
              <p>Cadastre Hot Zones para essa cidade no painel ao lado.</p>
            </div>
          )}
        </div>
      </div>

      <div className="user-card-meta" style={{ alignItems: "flex-end" }}>
        <span className="day-chip">Ativa</span>
        {!isEditing ? (
          <div className="filters-actions">
            <button type="button" className="secondary-button" onClick={() => setIsEditing(true)}>
              Editar
            </button>
            <form action={deleteAction}>
              <input type="hidden" name="id" value={id} />
              <button type="submit" className="secondary-button">
                Excluir
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </article>
  );
}
