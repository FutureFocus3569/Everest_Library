-- Run in Supabase SQL Editor
-- Enables in-app role updates from Admin Users page via RPC.

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
