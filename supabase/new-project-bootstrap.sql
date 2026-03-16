-- Everest Library: New Supabase project bootstrap
-- Run this once in Supabase SQL Editor (new paid project)

create extension if not exists pgcrypto;

-- -----------------------------
-- Profiles
-- -----------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  avatar_url text,
  role text not null default 'editor' check (role in ('admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'first_name', ''),
    nullif(new.raw_user_meta_data->>'last_name', ''),
    'editor'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user_profile();

-- backfill profiles for already-existing auth users
insert into public.profiles (id, first_name, last_name, role)
select
  u.id,
  nullif(u.raw_user_meta_data->>'first_name', ''),
  nullif(u.raw_user_meta_data->>'last_name', ''),
  'editor'
from auth.users u
on conflict (id) do nothing;

-- -----------------------------
-- Books
-- -----------------------------
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  title text not null,
  author text not null,
  isbn text,
  category text,
  tags text[] not null default '{}'::text[],
  copies integer not null default 1,
  description text,
  cover_url text,
  loaned_to text,
  loan_date date,
  added_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists books_created_at_idx on public.books(created_at desc);
create index if not exists books_tags_gin_idx on public.books using gin(tags);

drop trigger if exists trg_books_updated_at on public.books;
create trigger trg_books_updated_at
before update on public.books
for each row execute function public.set_updated_at();

-- -----------------------------
-- Notes
-- -----------------------------
create table if not exists public.book_notes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  content text not null,
  author_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists book_notes_book_id_idx on public.book_notes(book_id);
create index if not exists book_notes_created_at_idx on public.book_notes(created_at desc);

-- -----------------------------
-- Per-user reading state
-- -----------------------------
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

-- -----------------------------
-- Permission helpers
-- -----------------------------
create or replace function public.can_view_library()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null;
$$;

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

-- -----------------------------
-- RLS enable
-- -----------------------------
alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.book_notes enable row level security;
alter table public.user_book_reads enable row level security;
alter table public.user_currently_reading enable row level security;

-- -----------------------------
-- Profiles policies
-- -----------------------------
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Admins can view all profiles" on public.profiles;

create policy "Users can view own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "Admins can view all profiles"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- -----------------------------
-- Books policies
-- -----------------------------
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

-- -----------------------------
-- Notes policies
-- -----------------------------
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

-- -----------------------------
-- Reading state policies
-- -----------------------------
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

-- -----------------------------
-- Admin role RPC (used by Admin Users page)
-- -----------------------------
create or replace function public.admin_update_user_role(target_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_role text;
  normalized_role text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select p.role
  into caller_role
  from public.profiles p
  where p.id = auth.uid();

  if caller_role is distinct from 'admin' then
    raise exception 'Forbidden: admin role required';
  end if;

  normalized_role := lower(coalesce(new_role, ''));

  if normalized_role not in ('admin', 'editor', 'viewer') then
    raise exception 'Invalid role';
  end if;

  update public.profiles
  set role = normalized_role
  where id = target_user_id;

  if not found then
    raise exception 'Target user profile not found';
  end if;
end;
$$;

grant execute on function public.admin_update_user_role(uuid, text) to authenticated;

-- -----------------------------
-- Optional: promote known admin email now (adjust email if needed)
-- -----------------------------
update public.profiles p
set role = 'admin'
from auth.users u
where p.id = u.id
  and lower(u.email) = 'courtney@futurefocus.co.nz';
