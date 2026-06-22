alter table if exists public.telegram_campaigns
add column if not exists target_group_names jsonb not null default '[]'::jsonb;

alter table if exists public.telegram_campaigns
add column if not exists tem_imagem boolean not null default false;

alter table if exists public.telegram_campaigns
add column if not exists nome_arquivo_imagem text;

alter table if exists public.telegram_campaigns
add column if not exists modo_disparo text not null default 'planilha';

update public.telegram_campaigns
set modo_disparo = 'planilha'
where modo_disparo is null or trim(modo_disparo) = '';

alter table if exists public.telegram_campaigns
drop constraint if exists telegram_campaigns_modo_disparo_check;

alter table if exists public.telegram_campaigns
add constraint telegram_campaigns_modo_disparo_check
check (modo_disparo in ('planilha', 'individual', 'grupo', 'grupo_telegram'));
