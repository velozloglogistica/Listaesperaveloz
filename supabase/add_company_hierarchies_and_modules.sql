create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.modules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  slug text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true
);

drop trigger if exists trg_modules_updated_at on public.modules;
create trigger trg_modules_updated_at
before update on public.modules
for each row
execute function public.set_updated_at();

insert into public.modules (slug, name, description, is_active)
values
  ('dashboard', 'Dashboard', 'Mostra a visao inicial da empresa com indicadores e atalhos dos modulos.', true),
  ('waitlist', 'Lista de espera', 'Gerencia fila operacional, filtros, cards e cadastro manual.', true),
  ('users', 'Usuarios', 'Controla acessos, cadastro de logins e equipe da empresa.', true),
  ('hierarchies', 'Hierarquias', 'Cria equipes, perfis internos e segmenta modulos por empresa.', true),
  ('bag_info', 'Informacoes de BAG', 'Consulta entregadores, controla BAG e cadastra novas informacoes operacionais.', true),
  ('reports', 'Relatorios', 'Acompanha indicadores, resultados e visao consolidada.', true),
  ('settings', 'Configuracoes', 'Gerencia parametros internos e preferencias da empresa.', true)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  is_active = excluded.is_active;

create table if not exists public.tenant_modules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete cascade,
  is_enabled boolean not null default true,
  created_by uuid references public.app_users (id),
  unique (tenant_id, module_id)
);

drop trigger if exists trg_tenant_modules_updated_at on public.tenant_modules;
create trigger trg_tenant_modules_updated_at
before update on public.tenant_modules
for each row
execute function public.set_updated_at();

insert into public.tenant_modules (tenant_id, module_id, is_enabled)
select t.id, m.id, true
from public.tenants t
cross join public.modules m
where m.slug in ('dashboard', 'waitlist', 'users', 'hierarchies')
on conflict (tenant_id, module_id) do nothing;

create table if not exists public.tenant_hierarchies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid references public.app_users (id)
);

create unique index if not exists tenant_hierarchies_unique_name_per_tenant
on public.tenant_hierarchies (tenant_id, lower(name));

drop trigger if exists trg_tenant_hierarchies_updated_at on public.tenant_hierarchies;
create trigger trg_tenant_hierarchies_updated_at
before update on public.tenant_hierarchies
for each row
execute function public.set_updated_at();

create table if not exists public.tenant_hierarchy_modules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  hierarchy_id uuid not null references public.tenant_hierarchies (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete cascade,
  unique (hierarchy_id, module_id)
);

create table if not exists public.tenant_hierarchy_permissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  hierarchy_id uuid not null references public.tenant_hierarchies (id) on delete cascade,
  permission_key text not null,
  unique (hierarchy_id, permission_key)
);

create table if not exists public.tenant_user_hierarchies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.app_users (id) on delete cascade,
  hierarchy_id uuid not null references public.tenant_hierarchies (id) on delete cascade,
  assigned_by uuid references public.app_users (id),
  unique (tenant_id, user_id, hierarchy_id)
);
