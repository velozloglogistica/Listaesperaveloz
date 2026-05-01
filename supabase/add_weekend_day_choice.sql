alter table public.waitlist_requests
add column if not exists escala_dia_label text not null default 'Hoje';

alter table public.waitlist_requests
drop constraint if exists waitlist_requests_escala_dia_label_check;

alter table public.waitlist_requests
add constraint waitlist_requests_escala_dia_label_check
check (escala_dia_label in ('Hoje', 'Sexta', 'Sábado', 'Domingo'));

drop index if exists public.waitlist_requests_unique_daily;

create unique index waitlist_requests_unique_daily
on public.waitlist_requests (
  cpf,
  praca,
  horario_label,
  escala_dia_label,
  ((created_at at time zone 'America/Manaus')::date)
);
