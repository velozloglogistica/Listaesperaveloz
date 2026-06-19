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

create table if not exists public.telegram_campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  nome_campanha text not null,
  mensagem text not null,
  botao_1 text not null,
  botao_2 text not null,
  botoes jsonb not null default '[]'::jsonb,
  modo_disparo text not null default 'planilha' check (
    modo_disparo in ('planilha', 'individual', 'grupo')
  ),
  total_planilha integer not null default 0,
  total_com_chat_id integer not null default 0,
  total_sem_chat_id integer not null default 0,
  total_enviado integer not null default 0,
  total_erro integer not null default 0
);

create index if not exists telegram_campaigns_tenant_created_idx
on public.telegram_campaigns (tenant_id, created_at desc);

drop trigger if exists trg_telegram_campaigns_updated_at on public.telegram_campaigns;
create trigger trg_telegram_campaigns_updated_at
before update on public.telegram_campaigns
for each row
execute function public.set_updated_at();

create table if not exists public.telegram_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  campaign_id uuid not null references public.telegram_campaigns (id) on delete cascade,
  cpf text not null,
  nome text not null,
  telefone text,
  hotzone text,
  turno text,
  telegram_chat_id bigint,
  status_disparo text not null default 'sem_chat_id' check (
    status_disparo in ('enviado', 'sem_chat_id', 'erro_envio')
  ),
  status_resposta text not null default 'aguardando' check (
    status_resposta in ('aguardando', 'respondido')
  ),
  resposta text,
  erro text,
  enviado_em timestamptz,
  respondido_em timestamptz
);

create unique index if not exists telegram_campaign_recipients_unique_campaign_cpf_idx
on public.telegram_campaign_recipients (tenant_id, campaign_id, cpf);

create index if not exists telegram_campaign_recipients_campaign_created_idx
on public.telegram_campaign_recipients (tenant_id, campaign_id, created_at desc);

create index if not exists telegram_campaign_recipients_status_idx
on public.telegram_campaign_recipients (tenant_id, status_disparo, status_resposta);

create index if not exists telegram_campaign_recipients_chat_id_idx
on public.telegram_campaign_recipients (tenant_id, telegram_chat_id);

drop trigger if exists trg_telegram_campaign_recipients_updated_at on public.telegram_campaign_recipients;
create trigger trg_telegram_campaign_recipients_updated_at
before update on public.telegram_campaign_recipients
for each row
execute function public.set_updated_at();

alter table public.telegram_campaigns enable row level security;
alter table public.telegram_campaign_recipients enable row level security;

drop policy if exists telegram_campaigns_select_same_tenant on public.telegram_campaigns;
create policy telegram_campaigns_select_same_tenant
on public.telegram_campaigns
for select
to authenticated
using (
  tenant_id in (select public.current_tenant_ids())
);

drop policy if exists telegram_campaigns_insert_same_tenant on public.telegram_campaigns;
create policy telegram_campaigns_insert_same_tenant
on public.telegram_campaigns
for insert
to authenticated
with check (
  tenant_id in (select public.current_tenant_ids())
);

drop policy if exists telegram_campaigns_update_same_tenant on public.telegram_campaigns;
create policy telegram_campaigns_update_same_tenant
on public.telegram_campaigns
for update
to authenticated
using (
  tenant_id in (select public.current_tenant_ids())
)
with check (
  tenant_id in (select public.current_tenant_ids())
);

drop policy if exists telegram_campaign_recipients_select_same_tenant on public.telegram_campaign_recipients;
create policy telegram_campaign_recipients_select_same_tenant
on public.telegram_campaign_recipients
for select
to authenticated
using (
  tenant_id in (select public.current_tenant_ids())
);

drop policy if exists telegram_campaign_recipients_insert_same_tenant on public.telegram_campaign_recipients;
create policy telegram_campaign_recipients_insert_same_tenant
on public.telegram_campaign_recipients
for insert
to authenticated
with check (
  tenant_id in (select public.current_tenant_ids())
);

drop policy if exists telegram_campaign_recipients_update_same_tenant on public.telegram_campaign_recipients;
create policy telegram_campaign_recipients_update_same_tenant
on public.telegram_campaign_recipients
for update
to authenticated
using (
  tenant_id in (select public.current_tenant_ids())
)
with check (
  tenant_id in (select public.current_tenant_ids())
);
