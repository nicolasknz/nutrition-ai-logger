create extension if not exists pgcrypto;

create table if not exists public.meal_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null,
  transcript_snippet text,
  created_at timestamptz not null default now(),
  unique (user_id, id)
);

create table if not exists public.food_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  meal_id uuid not null,
  name text not null,
  quantity text not null,
  calories integer not null check (calories >= 0),
  protein numeric not null check (protein >= 0),
  carbs numeric not null check (carbs >= 0),
  fat numeric not null check (fat >= 0),
  fiber numeric not null check (fiber >= 0),
  micronutrients text,
  "timestamp" timestamptz not null default now(),
  constraint food_items_user_meal_fk
    foreign key (user_id, meal_id)
    references public.meal_groups (user_id, id)
    on delete cascade
);

create table if not exists public.nutrition_goals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  calories numeric check (calories is null or calories > 0),
  protein numeric check (protein is null or protein > 0),
  carbs numeric check (carbs is null or carbs > 0),
  fat numeric check (fat is null or fat > 0),
  fiber numeric check (fiber is null or fiber > 0),
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

drop trigger if exists set_nutrition_goals_updated_at on public.nutrition_goals;
create trigger set_nutrition_goals_updated_at
before update on public.nutrition_goals
for each row
execute function public.set_updated_at();

create index if not exists meal_groups_user_created_at_idx
  on public.meal_groups (user_id, created_at desc);

create index if not exists food_items_user_meal_idx
  on public.food_items (user_id, meal_id);

create index if not exists food_items_user_timestamp_idx
  on public.food_items (user_id, "timestamp" desc);

alter table public.meal_groups enable row level security;
alter table public.food_items enable row level security;
alter table public.nutrition_goals enable row level security;

drop policy if exists meal_groups_select_own on public.meal_groups;
create policy meal_groups_select_own
on public.meal_groups
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists meal_groups_insert_own on public.meal_groups;
create policy meal_groups_insert_own
on public.meal_groups
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists meal_groups_update_own on public.meal_groups;
create policy meal_groups_update_own
on public.meal_groups
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists meal_groups_delete_own on public.meal_groups;
create policy meal_groups_delete_own
on public.meal_groups
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists food_items_select_own on public.food_items;
create policy food_items_select_own
on public.food_items
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists food_items_insert_own on public.food_items;
create policy food_items_insert_own
on public.food_items
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists food_items_update_own on public.food_items;
create policy food_items_update_own
on public.food_items
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists food_items_delete_own on public.food_items;
create policy food_items_delete_own
on public.food_items
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists nutrition_goals_select_own on public.nutrition_goals;
create policy nutrition_goals_select_own
on public.nutrition_goals
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists nutrition_goals_insert_own on public.nutrition_goals;
create policy nutrition_goals_insert_own
on public.nutrition_goals
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists nutrition_goals_update_own on public.nutrition_goals;
create policy nutrition_goals_update_own
on public.nutrition_goals
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists nutrition_goals_delete_own on public.nutrition_goals;
create policy nutrition_goals_delete_own
on public.nutrition_goals
for delete
to authenticated
using (auth.uid() = user_id);
