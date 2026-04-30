-- Meal plan archive + rotation metadata (additive; existing rows default to active)
alter table public.meal_plans
  add column if not exists status text not null default 'active';

alter table public.meal_plans
  add column if not exists plan_json jsonb;

alter table public.meal_plans
  add column if not exists week_number integer;

alter table public.meal_plans
  add column if not exists plan_end_date date;

comment on column public.meal_plans.status is 'active | archived';
comment on column public.meal_plans.plan_json is 'Snapshot of weekly plan entries for history / restore';
