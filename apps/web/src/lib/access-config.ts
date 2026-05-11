export const MODULE_CATALOG = [
  {
    slug: "waitlist",
    name: "Lista de espera",
    description: "Gerencia fila operacional, filtros, cards e cadastro manual.",
  },
  {
    slug: "users",
    name: "Usuarios",
    description: "Controla acessos, cadastro de logins e equipe da empresa.",
  },
  {
    slug: "hierarchies",
    name: "Hierarquias",
    description: "Cria equipes, perfis internos e segmenta modulos por empresa.",
  },
  {
    slug: "reports",
    name: "Relatorios",
    description: "Acompanha indicadores, resultados e visao consolidada.",
  },
  {
    slug: "settings",
    name: "Configuracoes",
    description: "Gerencia parametros internos e preferencias da empresa.",
  },
] as const;

export const PERMISSION_CATALOG = [
  {
    key: "manage_users",
    label: "Cadastrar usuarios",
    description: "Pode criar logins, editar time e liberar acessos internos.",
  },
  {
    key: "manage_hierarchies",
    label: "Gerenciar hierarquias",
    description: "Pode criar equipes, cargos e segmentar modulos por perfil.",
  },
  {
    key: "manage_modules",
    label: "Ajustar modulos internos",
    description: "Pode redistribuir modulos ja liberados para a empresa.",
  },
  {
    key: "view_reports",
    label: "Ver relatorios",
    description: "Pode acessar dashboards e indicadores gerenciais.",
  },
  {
    key: "edit_settings",
    label: "Editar configuracoes",
    description: "Pode alterar parametros internos e configuracoes da empresa.",
  },
] as const;

export const CORE_COMPANY_MODULE_SLUGS = ["waitlist", "users", "hierarchies"] as const;

export type ModuleSlug = (typeof MODULE_CATALOG)[number]["slug"];
export type PermissionKey = (typeof PERMISSION_CATALOG)[number]["key"];
