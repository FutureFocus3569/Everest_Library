-- Add profile photo support
alter table public.profiles
add column if not exists avatar_url text;

-- Optional: keep this field editable for users under existing profile RLS policies.
-- No additional policy changes required if your current profiles UPDATE policy allows users to update their own row.
