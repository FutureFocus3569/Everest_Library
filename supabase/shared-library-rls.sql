-- Shared library access for all authenticated users
-- Run this in Supabase SQL editor after confirming your project uses the `books` table shown in this app.

alter table public.books enable row level security;

-- Remove older per-user policies if they exist.
drop policy if exists "Users can view own books" on public.books;
drop policy if exists "Users can insert own books" on public.books;
drop policy if exists "Users can update own books" on public.books;
drop policy if exists "Users can delete own books" on public.books;

-- Shared access policies: any signed-in user can read/write the shared library.
drop policy if exists "Authenticated users can view books" on public.books;
drop policy if exists "Authenticated users can insert books" on public.books;
drop policy if exists "Authenticated users can update books" on public.books;
drop policy if exists "Authenticated users can delete books" on public.books;

create policy "Authenticated users can view books"
on public.books
for select
to authenticated
using (true);

create policy "Authenticated users can insert books"
on public.books
for insert
to authenticated
with check (true);

create policy "Authenticated users can update books"
on public.books
for update
to authenticated
using (true)
with check (true);

create policy "Authenticated users can delete books"
on public.books
for delete
to authenticated
using (true);
