-- Ensure books.tags exists as text[] and is persisted correctly
-- Run this in Supabase SQL Editor

do $$
declare
  col_udt text;
begin
  select c.udt_name
  into col_udt
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'books'
    and c.column_name = 'tags';

  if col_udt is null then
    execute 'alter table public.books add column tags text[] not null default ''{}''::text[]';
  elsif col_udt = 'text' then
    execute 'alter table public.books alter column tags type text[] using case when tags is null or btrim(tags) = '''' then ''{}''::text[] else string_to_array(tags, '','') end';
  elsif col_udt = 'jsonb' then
    execute 'alter table public.books alter column tags type text[] using coalesce((select array_agg(value) from jsonb_array_elements_text(tags) as value), ''{}''::text[])';
  end if;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'books'
      and c.column_name = 'tags'
      and c.udt_name = '_text'
  ) then
    execute 'update public.books set tags = ''{}''::text[] where tags is null';
    execute 'alter table public.books alter column tags set default ''{}''::text[]';
    execute 'alter table public.books alter column tags set not null';
    execute 'create index if not exists books_tags_gin_idx on public.books using gin(tags)';
  end if;
end $$;
