-- Per-user reading state (read + currently reading)
-- Run in Supabase SQL Editor

create extension if not exists pgcrypto;

create table if not exists public.user_book_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, book_id)
);

create index if not exists user_book_reads_user_id_idx on public.user_book_reads(user_id);
create index if not exists user_book_reads_book_id_idx on public.user_book_reads(book_id);

create table if not exists public.user_currently_reading (
  user_id uuid primary key references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  updated_at timestamptz not null default now()
);

create index if not exists user_currently_reading_book_id_idx on public.user_currently_reading(book_id);

alter table public.user_book_reads enable row level security;
alter table public.user_currently_reading enable row level security;

drop policy if exists "Users can view own reads" on public.user_book_reads;
drop policy if exists "Users can insert own reads" on public.user_book_reads;
drop policy if exists "Users can delete own reads" on public.user_book_reads;

create policy "Users can view own reads"
on public.user_book_reads
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own reads"
on public.user_book_reads
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can delete own reads"
on public.user_book_reads
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can view own currently reading" on public.user_currently_reading;
drop policy if exists "Users can insert own currently reading" on public.user_currently_reading;
drop policy if exists "Users can update own currently reading" on public.user_currently_reading;
drop policy if exists "Users can delete own currently reading" on public.user_currently_reading;

create policy "Users can view own currently reading"
on public.user_currently_reading
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own currently reading"
on public.user_currently_reading
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own currently reading"
on public.user_currently_reading
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own currently reading"
on public.user_currently_reading
for delete
to authenticated
using (auth.uid() = user_id);
