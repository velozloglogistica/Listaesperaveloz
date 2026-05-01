alter table public.waitlist_requests
add column if not exists is_used boolean not null default false;

alter table public.waitlist_requests
add column if not exists used_at timestamptz;
