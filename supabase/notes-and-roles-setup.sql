-- Notes + role modes setup for Everest Library
-- Run this in Supabase SQL Editor.

-- 1) Ensure profiles.role exists and supports viewer/editor/admin.
alter table public.profiles
  add column if not exists role text;

-- Normalize any legacy/custom role values before adding constraints.
update public.profiles
set role = case
  when lower(coalesce(role, '')) in ('admin', 'editor', 'viewer') then lower(role)
  when lower(coalesce(role, '')) in ('user', 'member', 'staff') then 'editor'
  else 'editor'
end;

update public.profiles
set role = 'editor'
where role is null;

alter table public.profiles
  alter column role set default 'editor';

alter table public.profiles
  alter column role set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('admin', 'editor', 'viewer'));
  end if;
end $$;

-- 2) Shared notes table, persisted per book.
create table if not exists public.book_notes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  content text not null,
  author_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists book_notes_book_id_idx on public.book_notes(book_id);
create index if not exists book_notes_created_at_idx on public.book_notes(created_at desc);

alter table public.book_notes enable row level security;

-- 3) Helper functions for role checks.
create or replace function public.can_edit_library()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'editor')
  );
$$;

create or replace function public.can_view_library()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null;
$$;

-- 4) Replace books policies with role-aware policies.
drop policy if exists "Users can view own books" on public.books;
drop policy if exists "Users can insert own books" on public.books;
drop policy if exists "Users can update own books" on public.books;
drop policy if exists "Users can delete own books" on public.books;
drop policy if exists "Authenticated users can view books" on public.books;
drop policy if exists "Authenticated users can insert books" on public.books;
drop policy if exists "Authenticated users can update books" on public.books;
drop policy if exists "Authenticated users can delete books" on public.books;

drop policy if exists "Role-based view books" on public.books;
drop policy if exists "Role-based insert books" on public.books;
drop policy if exists "Role-based update books" on public.books;
drop policy if exists "Role-based delete books" on public.books;

create policy "Role-based view books"
on public.books
for select
to authenticated
using (public.can_view_library());

create policy "Role-based insert books"
on public.books
for insert
to authenticated
with check (public.can_edit_library());

create policy "Role-based update books"
on public.books
for update
to authenticated
using (public.can_edit_library())
with check (public.can_edit_library());

create policy "Role-based delete books"
on public.books
for delete
to authenticated
using (public.can_edit_library());

-- 5) Role-aware policies for notes.
drop policy if exists "Role-based view notes" on public.book_notes;
drop policy if exists "Role-based insert notes" on public.book_notes;
drop policy if exists "Role-based update notes" on public.book_notes;
drop policy if exists "Role-based delete notes" on public.book_notes;

create policy "Role-based view notes"
on public.book_notes
for select
to authenticated
using (public.can_view_library());

create policy "Role-based insert notes"
on public.book_notes
for insert
to authenticated
with check (public.can_edit_library());

create policy "Role-based update notes"
on public.book_notes
for update
to authenticated
using (public.can_edit_library())
with check (public.can_edit_library());

create policy "Role-based delete notes"
on public.book_notes
for delete
to authenticated
using (public.can_edit_library());

-- 6) Example: set specific users to roles.
-- Keep Courtney as admin/editor, and set Ray as editor (or viewer if needed).
update public.profiles p
set role = 'editor'
from auth.users u
where p.id = u.id
  and lower(u.email) = 'ray@futurefocus.co.nz';

-- Example to make someone read-only:
-- update public.profiles p
-- set role = 'viewer'
-- from auth.users u
-- where p.id = u.id
--   and lower(u.email) = 'someone@example.com';
