-- Expand categories from doors+flooring to the full import-eligible set
alter table public.material_items drop constraint if exists material_items_category_check;
alter table public.material_items add constraint material_items_category_check
  check (category in ('doors', 'flooring', 'tile', 'windows', 'storefront', 'cabinets', 'fixtures', 'lighting', 'railings', 'hvac'));

-- Update the default categories on new analyses
alter table public.analyses
  alter column categories set default array['doors', 'flooring', 'tile', 'windows', 'storefront', 'cabinets', 'fixtures', 'lighting', 'railings', 'hvac'];
