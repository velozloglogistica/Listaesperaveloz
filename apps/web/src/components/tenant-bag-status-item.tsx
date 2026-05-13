"use client";

import { useActionState, useEffect, useState } from "react";

import {
  deleteTenantBagStatusAction,
  type CompanyProfileActionState,
  updateTenantBagStatusAction,
} from "@/app/company-profile-actions";

const initialState: CompanyProfileActionState = {
  status: "idle",
  message: "",
};

type TenantBagStatusItemProps = {
  id: string;
  label: string;
  slug: string;
};

export function TenantBagStatusItem({ id, label, slug }: TenantBagStatusItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [updateState, updateAction] = useActionState(updateTenantBagStatusAction, initialState);
  const [deleteState, deleteAction] = useActionState(deleteTenantBagStatusAction, initialState);

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
            <input className="text-input" type="text" name="label" defaultValue={label} required />
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
            <strong>{label}</strong>
            <p>Codigo interno: {slug}</p>
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
        <span className="day-chip">Ativo</span>
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
