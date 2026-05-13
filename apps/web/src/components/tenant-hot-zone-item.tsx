"use client";

import { useActionState, useEffect, useState } from "react";

import {
  deleteTenantHotZoneAction,
  type CompanyProfileActionState,
  updateTenantHotZoneAction,
} from "@/app/company-profile-actions";

const initialState: CompanyProfileActionState = {
  status: "idle",
  message: "",
};

type TenantHotZoneItemProps = {
  id: string;
  name: string;
  cityName: string;
};

export function TenantHotZoneItem({ id, name, cityName }: TenantHotZoneItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updateTenantHotZoneAction, initialState);
  const [deleteState, deleteAction] = useActionState(deleteTenantHotZoneAction, initialState);

  useEffect(() => {
    if (updateState.status === "success") {
      setIsEditing(false);
    }
  }, [updateState.status]);

  return (
    <article className="user-card user-card-stack">
      <div style={{ display: "grid", gap: 10, width: "100%" }}>
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
            <p>Cidade: {cityName}</p>
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
      </div>

      <div className="user-card-meta" style={{ alignItems: "flex-end" }}>
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
