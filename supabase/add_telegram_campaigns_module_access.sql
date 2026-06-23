insert into public.modules (slug, name, description, is_active)
values (
  'telegram_campaigns',
  'Campanhas Telegram',
  'Dispara campanhas operacionais pelo Telegram com mensagem, imagem e botoes opcionais.',
  true
)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  is_active = excluded.is_active;

insert into public.tenant_modules (tenant_id, module_id, is_enabled, created_by)
select
  waitlist_access.tenant_id,
  telegram_module.id,
  waitlist_access.is_enabled,
  waitlist_access.created_by
from public.tenant_modules as waitlist_access
join public.modules as waitlist_module
  on waitlist_module.id = waitlist_access.module_id
 and waitlist_module.slug = 'waitlist'
join public.modules as telegram_module
  on telegram_module.slug = 'telegram_campaigns'
where waitlist_access.is_enabled = true
on conflict (tenant_id, module_id) do nothing;

insert into public.tenant_hierarchy_modules (hierarchy_id, module_id)
select
  hierarchy_access.hierarchy_id,
  telegram_module.id
from public.tenant_hierarchy_modules as hierarchy_access
join public.modules as waitlist_module
  on waitlist_module.id = hierarchy_access.module_id
 and waitlist_module.slug = 'waitlist'
join public.modules as telegram_module
  on telegram_module.slug = 'telegram_campaigns'
on conflict (hierarchy_id, module_id) do nothing;
