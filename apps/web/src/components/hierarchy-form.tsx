"use client";

import { useActionState } from "react";

import { createHierarchyAction, type CompanyActionState } from "@/app/company-actions";
import type { TenantEnabledModule } from "@/lib/company-access";
import { PERMISSION_CATALOG } from "@/lib/access-config";

const initialState = {
  status: "idle" as const,
  message: "",
};

type HierarchyFormProps = {
  enabledModules: TenantEnabledModule[];
  action?: (
    state: CompanyActionState,
    formData: FormData,
  ) => Promise<CompanyActionState>;
  submitLabel?: string;
  initialValues?: {
    hierarchy_id?: string;
    name?: string;
    description?: string;
    module_slugs?: string[];
    permission_keys?: string[];
    is_active?: boolean;
  };
};

export function HierarchyForm({
  enabledModules,
  action = createHierarchyAction,
  submitLabel = "Criar hierarquia",
  initialValues,
}: HierarchyFormProps) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="hierarchy-form">
      {initialValues?.hierarchy_id ? (
        <input type="hidden" name="hierarchy_id" value={initialValues.hierarchy_id} />
      ) : null}

      <div className="manual-form-grid hierarchy-form-grid">
        <input
          className="text-input"
          type="text"
          name="name"
          placeholder="Nome da hierarquia"
          defaultValue={initialValues?.name || ""}
          required
        />

        <input
          className="text-input"
          type="text"
          name="description"
          placeholder="Descricao interna"
          defaultValue={initialValues?.description || ""}
        />

        <label className="checkbox-card">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={initialValues?.is_active ?? true}
          />
          <span>Hierarquia ativa</span>
        </label>

        <div className="manual-form-actions">
          <button type="submit" className="primary-button">
            {submitLabel}
          </button>
        </div>
      </div>

      <div className="access-grid">
        <div className="access-panel">
          <h3>Modulos liberados para essa hierarquia</h3>
          <p>O owner da empresa escolhe quais modulos esse grupo interno pode abrir.</p>
          <div className="access-checkbox-grid">
            {enabledModules.map((module) => (
              <label key={module.id} className="checkbox-card checkbox-card-stack">
                <input
                  type="checkbox"
                  name="module_slugs"
                  value={module.slug}
                  defaultChecked={
                    initialValues?.module_slugs
                      ? initialValues.module_slugs.includes(module.slug)
                      : module.slug === "waitlist"
                  }
                />
                <span>
                  <strong>{module.name}</strong>
                  <small>{module.description}</small>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="access-panel">
          <h3>Permissoes internas</h3>
          <p>Escolha se a hierarquia pode cadastrar usuarios, mexer em equipes ou so operar.</p>
          <div className="access-checkbox-grid">
            {PERMISSION_CATALOG.map((permission) => (
              <label key={permission.key} className="checkbox-card checkbox-card-stack">
                <input
                  type="checkbox"
                  name="permission_keys"
                  value={permission.key}
                  defaultChecked={initialValues?.permission_keys?.includes(permission.key) || false}
                />
                <span>
                  <strong>{permission.label}</strong>
                  <small>{permission.description}</small>
                </span>
              </label>
            ))}
          </div>
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
