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
    | "/equipe-saas"
    | "/usuarios"
    | "/hierarquias"
    | "/perfil";
  title: string;
  description: string;
  user: AppUser;
  children: ReactNode;
};

export function AppShell({ currentPath, title, description, user, children }: AppShellProps) {
  const links = [
    {
      href: "/",
      label: "Inicio",
      visible: canAccessModule(user, "dashboard"),
    },
    { href: "/lista-espera", label: "Lista de espera", visible: canAccessModule(user, "waitlist") },
    { href: "/usuarios", label: "Usuarios", visible: hasCompanyPermission(user, "manage_users") },
    {
      href: "/hierarquias",
      label: "Hierarquias",
      visible: hasCompanyPermission(user, "manage_hierarchies"),
    },
    {
      href: "/informacoes-bag",
      label: "Informacoes de BAG",
      visible: canAccessModule(user, "bag_info"),
    },
    { href: "/perfil", label: "Perfil", visible: true },
    { href: "/equipe-saas", label: "Equipe SaaS", visible: user.is_platform_admin },
    { href: "/empresas", label: "Empresas", visible: user.is_platform_admin },
  ].filter((item) => item.visible);

  const userLabel = user.is_platform_admin
    ? user.role === "area"
      ? "Funcionario SaaS"
      : "Owner SaaS"
    : user.membership?.role || "Usuario";

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <p className="eyebrow">VelozLog SaaS</p>
          <h1>Painel</h1>
          <p>{user.current_tenant.name}</p>
        </div>

        <nav className="sidebar-nav">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={item.href === currentPath ? "sidebar-link sidebar-link-active" : "sidebar-link"}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-user">
          <div>
            <strong>{user.full_name}</strong>
            <p>
              {userLabel} · {user.email}
            </p>
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
