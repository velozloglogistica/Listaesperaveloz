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

create table if not exists public.app_users (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  full_name text not null,
  email text not null unique,
  role text not null check (role in ('owner', 'area')),
  can_access_waitlist boolean not null default true,
  is_active boolean not null default true,
  created_by uuid references auth.users (id)
);

drop trigger if exists trg_app_users_updated_at on public.app_users;

create trigger trg_app_users_updated_at
before update on public.app_users
for each row
execute function public.set_updated_at();

alter table public.app_users enable row level security;

drop policy if exists app_users_select_own on public.app_users;
create policy app_users_select_own
on public.app_users
for select
to authenticated
using (auth.uid() = id);
