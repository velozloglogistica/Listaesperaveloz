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

create table if not exists public.performance_notification_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  source_table text not null default 'performance',
  source_date date not null,
  notified_at timestamptz not null default now(),
  run_reference text not null,
  courier_name text not null,
  courier_phone text,
  horario text,
  praca text,
  pedidos integer not null default 0,
  pedidos_ofertados integer not null default 0,
  pedidos_rejeitados integer not null default 0,
  pedidos_cancelados integer not null default 0,
  tsh numeric(5,2),
  ar numeric(5,2),
  caa numeric(5,2),
  overtime numeric(5,2),
  severity text not null default 'moderado' check (severity in ('baixo', 'moderado', 'alto', 'critico')),
  reason_codes text[] not null default '{}',
  reason_text text not null,
  slack_status_code integer,
  slack_response_body text,
  slack_message text not null,
  was_sent boolean not null default false,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists performance_notification_logs_tenant_notified_idx
on public.performance_notification_logs (tenant_id, notified_at desc);

create index if not exists performance_notification_logs_tenant_source_date_idx
on public.performance_notification_logs (tenant_id, source_date desc);

create index if not exists performance_notification_logs_tenant_run_reference_idx
on public.performance_notification_logs (tenant_id, run_reference);

drop trigger if exists trg_performance_notification_logs_updated_at on public.performance_notification_logs;
create trigger trg_performance_notification_logs_updated_at
before update on public.performance_notification_logs
for each row
execute function public.set_updated_at();

create or replace function public.current_tenant_ids()
returns setof uuid
language sql
stable
as $$
  select tm.tenant_id
  from public.tenant_memberships tm
  where tm.user_id = auth.uid()
    and tm.is_active = true
    and exists (
      select 1
      from public.app_users au
      where au.id = tm.user_id
        and au.is_active = true
    );
$$;

alter table public.performance_notification_logs enable row level security;

drop policy if exists performance_notification_logs_select_same_tenant on public.performance_notification_logs;
create policy performance_notification_logs_select_same_tenant
on public.performance_notification_logs
for select
to authenticated
using (
  tenant_id in (select public.current_tenant_ids())
);

drop policy if exists performance_notification_logs_insert_same_tenant on public.performance_notification_logs;
create policy performance_notification_logs_insert_same_tenant
on public.performance_notification_logs
for insert
to authenticated
with check (
  tenant_id in (select public.current_tenant_ids())
);

drop policy if exists performance_notification_logs_update_same_tenant on public.performance_notification_logs;
create policy performance_notification_logs_update_same_tenant
on public.performance_notification_logs
for update
to authenticated
using (
  tenant_id in (select public.current_tenant_ids())
)
with check (
  tenant_id in (select public.current_tenant_ids())
);
