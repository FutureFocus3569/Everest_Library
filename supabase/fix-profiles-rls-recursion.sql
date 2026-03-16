-- Fix recursive RLS check on public.profiles that can cause 500 errors

create or replace function public.is_admin_user()
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
      and p.role = 'admin'
  );
$$;

revoke all on function public.is_admin_user() from public;
grant execute on function public.is_admin_user() to authenticated;

drop policy if exists "Admins can view all profiles" on public.profiles;

create policy "Admins can view all profiles"
on public.profiles
for select
to authenticated
using (public.is_admin_user());
