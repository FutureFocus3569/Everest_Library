-- Per-user To Read list
-- Run in Supabase SQL Editor

create extension if not exists pgcrypto;

create table if not exists public.user_to_read (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, book_id)
);

create index if not exists user_to_read_user_id_idx on public.user_to_read(user_id);
create index if not exists user_to_read_book_id_idx on public.user_to_read(book_id);

alter table public.user_to_read enable row level security;

drop policy if exists "Users can view own to-read" on public.user_to_read;
drop policy if exists "Users can insert own to-read" on public.user_to_read;
drop policy if exists "Users can delete own to-read" on public.user_to_read;

create policy "Users can view own to-read"
on public.user_to_read
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own to-read"
on public.user_to_read
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can delete own to-read"
on public.user_to_read
for delete
to authenticated
using (auth.uid() = user_id);
