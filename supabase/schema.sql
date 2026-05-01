create extension if not exists pgcrypto;

drop table if exists public.waitlist_requests cascade;

create table public.waitlist_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  nome text not null,
  cpf text not null,
  telefone text not null,

  praca text not null check (
    praca in ('Chapada', 'Ponta Negra', 'Santa Etelvina', 'Tancredo Neves')
  ),

  horario_label text not null check (
    horario_label in ('Almoço', 'Merenda', 'Jantar')
  ),
  horario_inicio time not null,
  horario_fim time not null,
  escala_dia_label text not null default 'Hoje' check (
    escala_dia_label in ('Hoje', 'Sexta', 'Sábado', 'Domingo')
  ),

  status text not null default 'pendente' check (
    status in ('pendente', 'agendado', 'recusado', 'cancelado')
  ),

  observacao text,
  origem text not null default 'telegram',

  telegram_user_id bigint,
  telegram_username text,
  telegram_chat_id bigint,
  is_used boolean not null default false,
  used_at timestamptz
);

create unique index waitlist_requests_unique_daily
on public.waitlist_requests (
  cpf,
  praca,
  horario_label,
  escala_dia_label,
  ((created_at at time zone 'America/Manaus')::date)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_waitlist_requests_updated_at
before update on public.waitlist_requests
for each row
execute function public.set_updated_at();
