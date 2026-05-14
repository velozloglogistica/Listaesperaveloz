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
  canManageOwner?: boolean;
  ownerLocked?: boolean;
};

export function TenantUserForm({
  hierarchies,
  action = createTenantUserWithHierarchyAction,
  submitLabel = "Criar usuario",
  initialValues,
  canManageOwner = true,
  ownerLocked = false,
}: TenantUserFormProps) {
  const [state, formAction] = useActionState(action, initialState);
  const isOwnerProfile = initialValues?.base_profile === "owner";

  const profileProps =
    isOwnerProfile
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
        disabled={ownerLocked}
        required
      />

      <input
        className="text-input"
        type="email"
        name="email"
        placeholder="Email de acesso"
        defaultValue={initialValues?.email || ""}
        disabled={ownerLocked}
        required
      />

      <input
        className="text-input"
        type="password"
        name="password"
        placeholder={initialValues?.user_id ? "Nova senha (opcional)" : "Senha inicial"}
        minLength={initialValues?.user_id ? undefined : 8}
        disabled={ownerLocked}
        required={!initialValues?.user_id}
      />

      <select
        className="select-input"
        name="base_profile"
        {...profileProps}
        disabled={ownerLocked || !canManageOwner}
      >
        <option value="member">Usuario da empresa</option>
        <option value="owner">Owner da empresa</option>
      </select>

      <select
        className="select-input"
        name="hierarchy_id"
        defaultValue={initialValues?.hierarchy_id || ""}
        disabled={ownerLocked || isOwnerProfile}
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

      {!canManageOwner ? (
        <div className="platform-form-note platform-form-note-warning">
          <strong>Owner protegido</strong>
          <p>Somente owner da empresa pode conceder ou remover acesso de owner.</p>
        </div>
      ) : null}

      {ownerLocked ? (
        <div className="platform-form-note platform-form-note-warning">
          <strong>Edicao bloqueada</strong>
          <p>Este usuario e owner. Apenas outro owner pode alterar esse acesso.</p>
        </div>
      ) : null}

      <label className="checkbox-card">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={initialValues?.is_active ?? true}
          disabled={ownerLocked}
        />
        <span>Usuario ativo</span>
      </label>

      <div className="manual-form-actions">
        <button type="submit" className="primary-button" disabled={ownerLocked}>
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
