"use client";

import { useActionState } from "react";

import { createTenantWithOwnerAction } from "@/app/platform-actions";
import { MODULE_CATALOG } from "@/lib/access-config";

const initialState = {
  status: "idle" as const,
  message: "",
};

export function TenantForm() {
  const [state, formAction] = useActionState(createTenantWithOwnerAction, initialState);

  return (
    <form action={formAction} className="hierarchy-form">
      <div className="tenant-form-grid">
        <input
          className="text-input"
          type="text"
          name="company_name"
          placeholder="Nome da empresa"
          required
        />

        <input
          className="text-input"
          type="text"
          name="company_slug"
          placeholder="Slug da empresa"
          required
        />

        <input
          className="text-input"
          type="text"
          name="owner_name"
          placeholder="Nome do owner inicial"
          required
        />

        <input
          className="text-input"
          type="email"
          name="owner_email"
          placeholder="Email do owner"
          required
        />

        <input
          className="text-input"
          type="password"
          name="owner_password"
          placeholder="Senha inicial"
          minLength={8}
          required
        />

        <div className="manual-form-actions">
          <button type="submit" className="primary-button">
            Criar empresa
          </button>
        </div>
      </div>

      <div className="access-panel">
        <h3>Modulos liberados para a empresa</h3>
        <p>O owner do SaaS escolhe o que essa empresa pode contratar e distribuir internamente.</p>
        <div className="access-checkbox-grid">
          {MODULE_CATALOG.map((module) => (
            <label key={module.slug} className="checkbox-card checkbox-card-stack">
              <input
                type="checkbox"
                name="module_slugs"
                value={module.slug}
                defaultChecked={["waitlist", "users", "hierarchies"].includes(module.slug)}
              />
              <span>
                <strong>{module.name}</strong>
                <small>{module.description}</small>
              </span>
            </label>
          ))}
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
