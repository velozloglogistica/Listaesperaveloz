import Link from "next/link";
import type { ReactNode } from "react";

import { LogoutForm } from "@/components/logout-form";
import { canAccessModule, hasCompanyPermission, type AppUser } from "@/lib/auth";

type AppShellProps = {
  currentPath:
    | "/"
    | "/empresas"
    | "/lista-espera"
    | "/informacoes-bag"
    | "/perfil-empresa"
    | "/equipe-saas"
    | "/usuarios"
    | "/hierarquias"
    | "/perfil";
  title: string;
  description: string;
  user: AppUser;
  children: ReactNode;
};

type SidebarItem = {
  href: AppShellProps["currentPath"];
  label: string;
  shortLabel: string;
  group: "Geral" | "Gestao" | "Operacao" | "Conta";
  visible: boolean;
};

export function AppShell({ currentPath, title, description, user, children }: AppShellProps) {
  const links = [
    {
      href: "/",
      label: "Inicio",
      shortLabel: "I",
      group: "Geral",
      visible: canAccessModule(user, "dashboard"),
    },
    {
      href: "/lista-espera",
      label: "Lista de espera",
      shortLabel: "L",
      group: "Geral",
      visible: canAccessModule(user, "waitlist"),
    },
    {
      href: "/usuarios",
      label: "Usuarios",
      shortLabel: "U",
      group: "Gestao",
      visible: hasCompanyPermission(user, "manage_users"),
    },
    {
      href: "/hierarquias",
      label: "Hierarquias",
      shortLabel: "H",
      group: "Gestao",
      visible: hasCompanyPermission(user, "manage_hierarchies"),
    },
    {
      href: "/equipe-saas",
      label: "Equipe SaaS",
      shortLabel: "S",
      group: "Gestao",
      visible: user.is_platform_admin,
    },
    {
      href: "/informacoes-bag",
      label: "Entregadores",
      shortLabel: "E",
      group: "Operacao",
      visible: canAccessModule(user, "bag_info"),
    },
    {
      href: "/empresas",
      label: "Empresas",
      shortLabel: "M",
      group: "Operacao",
      visible: user.is_platform_admin,
    },
    {
      href: "/perfil-empresa",
      label: "Perfil da empresa",
      shortLabel: "P",
      group: "Conta",
      visible: hasCompanyPermission(user, "edit_settings"),
    },
    { href: "/perfil", label: "Perfil", shortLabel: "C", group: "Conta", visible: true },
  ] satisfies SidebarItem[];
  const visibleLinks = links.filter((item) => item.visible);
  const groupedLinks = ["Geral", "Gestao", "Operacao", "Conta"].map((group) => ({
    group,
    items: visibleLinks.filter((item) => item.group === group),
  }));

  const userLabel = user.is_platform_admin
    ? user.role === "area"
      ? "Funcionario SaaS"
      : "Owner SaaS"
    : user.membership?.role || "Usuario";

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">
            <img
              src="https://raw.githubusercontent.com/velozloglogistica/Listaesperaveloz/main/convidados%20(84).png"
              alt="Logo da Veloz"
              className="sidebar-brand-logo"
            />
            <div>
              <strong>VELOZLOG</strong>
              <p>SaaS</p>
            </div>
          </div>
          <div className="sidebar-tenant-card">
            <span className="sidebar-tenant-badge">{user.current_tenant.name.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{user.current_tenant.name}</strong>
              <p>{userLabel}</p>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {groupedLinks.map((section) =>
            section.items.length > 0 ? (
              <div key={section.group} className="sidebar-section">
                <p className="sidebar-section-title">{section.group}</p>
                <div className="sidebar-section-links">
                  {section.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={item.href === currentPath ? "sidebar-link sidebar-link-active" : "sidebar-link"}
                    >
                      <span className="sidebar-link-icon" aria-hidden="true">
                        {item.shortLabel}
                      </span>
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null,
          )}
        </nav>

        <div className="sidebar-user">
          <div>
            <strong>{user.full_name}</strong>
            <p>{user.email}</p>
            <small>{userLabel}</small>
          </div>
          <LogoutForm />
        </div>
      </aside>

      <main className="app-content">
        <section className="hero">
          <div className="hero-topbar">
            <div>
              <p className="eyebrow">VelozLog</p>
              <h2>{title}</h2>
              <p className="hero-copy">{description}</p>
            </div>
          </div>
        </section>

        {children}
      </main>
    </div>
  );
}
