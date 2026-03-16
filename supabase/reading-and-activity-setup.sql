alter table if exists public.user_book_reads
add column if not exists status text not null default 'read';

alter table if exists public.user_book_reads
drop constraint if exists user_book_reads_status_check;

alter table if exists public.user_book_reads
add constraint user_book_reads_status_check
check (status in ('read', 'currently-reading'));

create table if not exists public.library_activity (
  id uuid primary key default gen_random_uuid(),
  actor_name text not null,
  action text not null,
  book_id uuid not null references public.books(id) on delete cascade,
  book_title text not null,
  details text,
  created_at timestamptz not null default now()
);

alter table public.library_activity enable row level security;

drop policy if exists "Authenticated users can view activity" on public.library_activity;
create policy "Authenticated users can view activity"
on public.library_activity
for select
to authenticated
using (true);

drop policy if exists "Authenticated users can add activity" on public.library_activity;
create policy "Authenticated users can add activity"
on public.library_activity
for insert
to authenticated
with check (true);
