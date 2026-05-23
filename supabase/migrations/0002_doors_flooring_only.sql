-- Rescope from {windows, doors, flooring} → {doors, flooring}.
-- Run after 0001_init.sql. Drops any existing window items and updates the
-- category check constraint + the analyses.categories default.

delete from public.material_items where category = 'windows';

alter table public.material_items
  drop constraint if exists material_items_category_check;

alter table public.material_items
  add constraint material_items_category_check
  check (category in ('doors', 'flooring'));

alter table public.analyses
  alter column categories set default array['doors', 'flooring'];

update public.analyses
   set categories = array(select unnest(categories) except select 'windows')
 where 'windows' = any(categories);
