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

insert into public.modules (slug, name, description, is_active)
values (
  'bag_info',
  'Informacoes de BAG',
  'Consulta entregadores, controla BAG e cadastra novas informacoes operacionais.',
  true
)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  is_active = excluded.is_active;

insert into public.tenant_modules (tenant_id, module_id, is_enabled)
select t.id, m.id, true
from public.tenants t
cross join public.modules m
where m.slug = 'bag_info'
on conflict (tenant_id, module_id) do nothing;

create table if not exists public.tenant_settings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid not null unique references public.tenants (id) on delete cascade,
  westwind_login text,
  westwind_password text,
  updated_by uuid references public.app_users (id)
);

drop trigger if exists trg_tenant_settings_updated_at on public.tenant_settings;
create trigger trg_tenant_settings_updated_at
before update on public.tenant_settings
for each row
execute function public.set_updated_at();

create table if not exists public.tenant_cities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_by uuid references public.app_users (id)
);

create unique index if not exists tenant_cities_unique_name_per_tenant
on public.tenant_cities (tenant_id, lower(name));

drop trigger if exists trg_tenant_cities_updated_at on public.tenant_cities;
create trigger trg_tenant_cities_updated_at
before update on public.tenant_cities
for each row
execute function public.set_updated_at();

create table if not exists public.tenant_regions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  city_id uuid not null references public.tenant_cities (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_by uuid references public.app_users (id)
);

create unique index if not exists tenant_regions_unique_name_per_city
on public.tenant_regions (tenant_id, city_id, lower(name));

drop trigger if exists trg_tenant_regions_updated_at on public.tenant_regions;
create trigger trg_tenant_regions_updated_at
before update on public.tenant_regions
for each row
execute function public.set_updated_at();

create table if not exists public.tenant_bag_statuses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  slug text not null,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.app_users (id)
);

create unique index if not exists tenant_bag_statuses_unique_slug_per_tenant
on public.tenant_bag_statuses (tenant_id, slug);

drop trigger if exists trg_tenant_bag_statuses_updated_at on public.tenant_bag_statuses;
create trigger trg_tenant_bag_statuses_updated_at
before update on public.tenant_bag_statuses
for each row
execute function public.set_updated_at();

create table if not exists public.bag_couriers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  partner_delivery_id text not null,
  full_name text not null,
  phone_number text not null,
  whatsapp_web_link text,
  identity_number text,
  city_id uuid not null references public.tenant_cities (id) on delete restrict,
  delivery_vehicle text not null check (delivery_vehicle in ('bicicleta', 'motocicleta')),
  operator_user_id uuid not null references public.app_users (id) on delete restrict,
  joined_telegram_group boolean not null default false,
  preferred_shifts text[] not null default '{}',
  preferred_weekdays text[] not null default '{}',
  observation text,
  bag_status text not null,
  unique (tenant_id, partner_delivery_id)
);

alter table public.bag_couriers
  drop constraint if exists bag_couriers_bag_status_check;

alter table public.bag_couriers
  alter column bag_status drop default;

drop trigger if exists trg_bag_couriers_updated_at on public.bag_couriers;
create trigger trg_bag_couriers_updated_at
before update on public.bag_couriers
for each row
execute function public.set_updated_at();

create index if not exists bag_couriers_tenant_status_idx
on public.bag_couriers (tenant_id, bag_status);

create index if not exists bag_couriers_tenant_city_idx
on public.bag_couriers (tenant_id, city_id);

create table if not exists public.bag_courier_regions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  bag_courier_id uuid not null references public.bag_couriers (id) on delete cascade,
  region_id uuid not null references public.tenant_regions (id) on delete cascade,
  unique (bag_courier_id, region_id)
);

insert into public.tenant_bag_statuses (tenant_id, slug, label, sort_order, is_active)
select
  t.id,
  status_seed.slug,
  status_seed.label,
  status_seed.sort_order,
  true
from public.tenants t
cross join (
  values
    ('bag_com_entregador', 'BAG com entregador', 1),
    ('chamar_para_pegar_bag', 'Chamar para pegar BAG', 2),
    ('desvinculado', 'Desvinculado', 3)
) as status_seed(slug, label, sort_order)
on conflict (tenant_id, slug) do update
set
  label = excluded.label,
  sort_order = excluded.sort_order,
  is_active = true;
