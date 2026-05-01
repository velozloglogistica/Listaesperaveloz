alter table public.waitlist_requests
add column if not exists escala_dia_label text not null default 'Hoje';

alter table public.waitlist_requests
add column if not exists escala_data date;

alter table public.waitlist_requests
drop constraint if exists waitlist_requests_escala_dia_label_check;

alter table public.waitlist_requests
add constraint waitlist_requests_escala_dia_label_check
check (escala_dia_label in ('Hoje', 'Sexta', 'Sábado', 'Domingo'));

update public.waitlist_requests
set escala_data = case
  when escala_dia_label = 'Hoje' then ((created_at at time zone 'America/Manaus')::date)
  when escala_dia_label = 'Sexta' then (
    ((created_at at time zone 'America/Manaus')::date)
    + ((5 - extract(dow from (created_at at time zone 'America/Manaus'))::int + 7) % 7)
  )
  when escala_dia_label = 'Sábado' then (
    ((created_at at time zone 'America/Manaus')::date)
    + ((6 - extract(dow from (created_at at time zone 'America/Manaus'))::int + 7) % 7)
  )
  when escala_dia_label = 'Domingo' then (
    ((created_at at time zone 'America/Manaus')::date)
    + ((0 - extract(dow from (created_at at time zone 'America/Manaus'))::int + 7) % 7)
  )
  else ((created_at at time zone 'America/Manaus')::date)
end
where escala_data is null;

alter table public.waitlist_requests
alter column escala_data set default ((now() at time zone 'America/Manaus')::date);

alter table public.waitlist_requests
alter column escala_data set not null;

drop index if exists public.waitlist_requests_unique_daily;

create unique index waitlist_requests_unique_daily
on public.waitlist_requests (
  cpf,
  praca,
  horario_label,
  escala_data
);
