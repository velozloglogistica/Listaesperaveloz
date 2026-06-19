alter table if exists public.telegram_campaigns
add column if not exists botoes jsonb not null default '[]'::jsonb;

alter table if exists public.telegram_campaigns
add column if not exists modo_disparo text not null default 'planilha';

update public.telegram_campaigns
set botoes = to_jsonb(
  array_remove(
    array[
      nullif(trim(botao_1), ''),
      nullif(trim(botao_2), '')
    ],
    null
  )
)
where coalesce(jsonb_array_length(botoes), 0) = 0;

update public.telegram_campaigns
set modo_disparo = 'planilha'
where modo_disparo is null or trim(modo_disparo) = '';
