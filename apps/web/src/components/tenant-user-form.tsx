"use client";

import type { ComponentProps } from "react";
import { useActionState } from "react";

import {
  type CompanyActionState,
  createTenantUserWithHierarchyAction,
} from "@/app/company-actions";

const initialState = {
  status: "idle" as const,
  message: "",
};

type TenantHierarchyOption = {
  id: string;
  name: string;
  description: string | null;
};

type TenantUserFormProps = {
  hierarchies: TenantHierarchyOption[];
  action?: (
    state: CompanyActionState,
    formData: FormData,
  ) => Promise<CompanyActionState>;
  submitLabel?: string;
  initialValues?: {
    user_id?: string;
    full_name?: string;
    email?: string;
    base_profile?: "member" | "owner";
    hierarchy_id?: string;
    is_active?: boolean;
  };
};

export function TenantUserForm({
  hierarchies,
  action = createTenantUserWithHierarchyAction,
  submitLabel = "Criar usuario",
  initialValues,
}: TenantUserFormProps) {
  const [state, formAction] = useActionState(action, initialState);

  const profileProps =
    initialValues?.base_profile === "owner"
      ? ({ defaultValue: "owner" } satisfies Pick<
          ComponentProps<"select">,
          "defaultValue"
        >)
      : ({ defaultValue: "member" } satisfies Pick<ComponentProps<"select">, "defaultValue">);

  return (
    <form action={formAction} className="manual-form-grid user-form-grid">
      {initialValues?.user_id ? <input type="hidden" name="user_id" value={initialValues.user_id} /> : null}

      <input
        className="text-input"
        type="text"
        name="full_name"
        placeholder="Nome completo"
        defaultValue={initialValues?.full_name || ""}
        required
      />

      <input
        className="text-input"
        type="email"
        name="email"
        placeholder="Email de acesso"
        defaultValue={initialValues?.email || ""}
        required
      />

      <input
        className="text-input"
        type="password"
        name="password"
        placeholder={initialValues?.user_id ? "Nova senha (opcional)" : "Senha inicial"}
        minLength={initialValues?.user_id ? undefined : 8}
        required={!initialValues?.user_id}
      />

      <select className="select-input" name="base_profile" {...profileProps}>
        <option value="member">Usuario da empresa</option>
        <option value="owner">Owner da empresa</option>
      </select>

      <select
        className="select-input"
        name="hierarchy_id"
        defaultValue={initialValues?.hierarchy_id || ""}
      >
        <option value="">Selecione a hierarquia</option>
        {hierarchies.map((hierarchy) => (
          <option key={hierarchy.id} value={hierarchy.id}>
            {hierarchy.name}
          </option>
        ))}
      </select>

      <div className="platform-form-note">
        <strong>Acesso vem da hierarquia</strong>
        <p>
          Para usuario comum, a hierarquia decide modulos e permissoes. Owner recebe acesso total
          da empresa.
        </p>
      </div>

      <label className="checkbox-card">
        <input type="checkbox" name="is_active" defaultChecked={initialValues?.is_active ?? true} />
        <span>Usuario ativo</span>
      </label>

      <div className="manual-form-actions">
        <button type="submit" className="primary-button">
          {submitLabel}
        </button>
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
