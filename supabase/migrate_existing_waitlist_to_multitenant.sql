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

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  slug text not null unique,
  legal_name text,
  timezone text not null default 'America/Manaus',
  is_active boolean not null default true
);

drop trigger if exists trg_tenants_updated_at on public.tenants;
create trigger trg_tenants_updated_at
before update on public.tenants
for each row
execute function public.set_updated_at();

create table if not exists public.app_users (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  full_name text not null,
  email text not null unique,
  role text not null check (role in ('owner', 'area')),
  can_access_waitlist boolean not null default true,
  is_platform_admin boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users (id)
);

alter table public.app_users
add column if not exists role text;

alter table public.app_users
add column if not exists can_access_waitlist boolean not null default true;

alter table public.app_users
add column if not exists is_platform_admin boolean not null default false;

alter table public.app_users
add column if not exists created_by uuid references auth.users (id);

update public.app_users
set role = 'area'
where role is null;

update public.app_users
set can_access_waitlist = true
where can_access_waitlist is null;

update public.app_users
set is_platform_admin = false
where is_platform_admin is null;

alter table public.app_users
alter column role set not null;

alter table public.app_users
alter column can_access_waitlist set not null;

alter table public.app_users
alter column is_platform_admin set not null;

alter table public.app_users
drop constraint if exists app_users_role_check;

alter table public.app_users
add constraint app_users_role_check
check (role in ('owner', 'area'));

drop trigger if exists trg_app_users_updated_at on public.app_users;
create trigger trg_app_users_updated_at
before update on public.app_users
for each row
execute function public.set_updated_at();

create table if not exists public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null references public.app_users (id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'area', 'viewer')),
  can_access_waitlist boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.app_users (id),
  unique (tenant_id, user_id)
);

drop trigger if exists trg_tenant_memberships_updated_at on public.tenant_memberships;
create trigger trg_tenant_memberships_updated_at
before update on public.tenant_memberships
for each row
execute function public.set_updated_at();

insert into public.tenants (name, slug, legal_name, timezone, is_active)
values ('Velozlog', 'velozlog', 'Velozlog', 'America/Manaus', true)
on conflict (slug) do update
set
  name = excluded.name,
  legal_name = excluded.legal_name,
  timezone = excluded.timezone,
  is_active = excluded.is_active;

alter table public.waitlist_requests
add column if not exists tenant_id uuid;

update public.waitlist_requests
set tenant_id = (
  select id
  from public.tenants
  where slug = 'velozlog'
)
where tenant_id is null;

alter table public.waitlist_requests
alter column tenant_id set not null;

alter table public.waitlist_requests
drop constraint if exists waitlist_requests_tenant_id_fkey;

alter table public.waitlist_requests
add constraint waitlist_requests_tenant_id_fkey
foreign key (tenant_id) references public.tenants (id) on delete cascade;

drop index if exists public.waitlist_requests_unique_daily;
drop index if exists public.waitlist_requests_unique_daily_per_tenant;

create unique index waitlist_requests_unique_daily_per_tenant
on public.waitlist_requests (
  tenant_id,
  cpf,
  praca,
  horario_label,
  escala_data
);

create index if not exists waitlist_requests_tenant_date_idx
on public.waitlist_requests (tenant_id, escala_data desc);

create index if not exists waitlist_requests_tenant_status_idx
on public.waitlist_requests (tenant_id, status);

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
  ('waitlist', 'Lista de espera', 'Gerencia fila operacional, filtros, cards e cadastro manual.', true),
  ('users', 'Usuarios', 'Controla acessos, cadastro de logins e equipe da empresa.', true),
  ('hierarchies', 'Hierarquias', 'Cria equipes, perfis internos e segmenta modulos por empresa.', true),
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
where m.slug in ('waitlist', 'users', 'hierarchies')
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
