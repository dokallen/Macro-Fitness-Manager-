-- Macro Fit: core schema, RLS, auth profile sync, realtime
-- Run via Supabase CLI (`supabase db push`) or SQL Editor.

-- ---------------------------------------------------------------------------
-- public.users (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone ('utc', now()),
  display_name text not null default '',
  onboarding_complete boolean not null default false
);

comment on table public.users is 'Application profile; one row per auth user.';

-- ---------------------------------------------------------------------------
-- Trigger: create profile row when a new auth user is created
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, created_at, display_name, onboarding_complete)
  values (
    new.id,
    timezone ('utc', now()),
    coalesce(new.raw_user_meta_data->>'display_name', ''),
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user ();

-- ---------------------------------------------------------------------------
-- user_preferences (key/value; no hardcoded keys)
-- ---------------------------------------------------------------------------
create table public.user_preferences (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.users (id) on delete cascade,
  key text not null,
  value text not null,
  updated_at timestamptz not null default timezone ('utc', now()),
  updated_by text not null default 'user' check (updated_by in ('user', 'coach')),
  unique (user_id, key)
);

create index user_preferences_user_id_idx on public.user_preferences (user_id);

-- ---------------------------------------------------------------------------
-- Workouts
-- ---------------------------------------------------------------------------
create table public.workout_splits (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.users (id) on delete cascade,
  day_number integer not null,
  name text not null,
  created_at timestamptz not null default timezone ('utc', now()),
  unique (user_id, day_number)
);

create index workout_splits_user_id_idx on public.workout_splits (user_id);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.users (id) on delete cascade,
  split_id uuid references public.workout_splits (id) on delete set null,
  logged_at timestamptz not null default timezone ('utc', now()),
  notes text
);

create index workout_sessions_user_id_idx on public.workout_sessions (user_id);
create index workout_sessions_logged_at_idx on public.workout_sessions (logged_at desc);

create table public.workout_sets (
  id uuid primary key default gen_random_uuid (),
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  exercise_name text not null,
  sets integer not null,
  reps integer not null,
  weight numeric,
  unit text not null default ''
);

create index workout_sets_session_id_idx on public.workout_sets (session_id);

-- ---------------------------------------------------------------------------
-- Recipes & macros
-- ---------------------------------------------------------------------------
create table public.recipes (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.users (id) on delete cascade,
  name text not null,
  instructions text[] not null default '{}',
  created_at timestamptz not null default timezone ('utc', now())
);

create index recipes_user_id_idx on public.recipes (user_id);

create table public.recipe_macros (
  id uuid primary key default gen_random_uuid (),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  key text not null,
  value numeric not null,
  unit text not null default ''
);

create index recipe_macros_recipe_id_idx on public.recipe_macros (recipe_id);

-- ---------------------------------------------------------------------------
-- Meal plans
-- ---------------------------------------------------------------------------
create table public.meal_plans (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.users (id) on delete cascade,
  week_start date not null,
  rotation_frequency text not null default '',
  created_at timestamptz not null default timezone ('utc', now())
);

create index meal_plans_user_id_idx on public.meal_plans (user_id);
create index meal_plans_week_start_idx on public.meal_plans (week_start);

create table public.meal_plan_entries (
  id uuid primary key default gen_random_uuid (),
  meal_plan_id uuid not null references public.meal_plans (id) on delete cascade,
  day integer not null,
  meal_number integer not null,
  recipe_id uuid references public.recipes (id) on delete set null
);

create index meal_plan_entries_meal_plan_id_idx on public.meal_plan_entries (meal_plan_id);

-- ---------------------------------------------------------------------------
-- Food logs
-- ---------------------------------------------------------------------------
create table public.food_logs (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.users (id) on delete cascade,
  logged_at timestamptz not null default timezone ('utc', now()),
  meal_number integer not null,
  food_name text not null,
  quantity numeric,
  unit text not null default ''
);

create index food_logs_user_id_idx on public.food_logs (user_id);
create index food_logs_logged_at_idx on public.food_logs (logged_at desc);

create table public.food_log_macros (
  id uuid primary key default gen_random_uuid (),
  food_log_id uuid not null references public.food_logs (id) on delete cascade,
  key text not null,
  value numeric not null
);

create index food_log_macros_food_log_id_idx on public.food_log_macros (food_log_id);

-- ---------------------------------------------------------------------------
-- Progress & cardio
-- ---------------------------------------------------------------------------
create table public.progress_entries (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.users (id) on delete cascade,
  logged_at timestamptz not null default timezone ('utc', now()),
  metric_key text not null,
  value numeric not null,
  unit text not null default ''
);

create index progress_entries_user_id_idx on public.progress_entries (user_id);
create index progress_entries_logged_at_idx on public.progress_entries (logged_at desc);

create table public.cardio_sessions (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.users (id) on delete cascade,
  logged_at timestamptz not null default timezone ('utc', now()),
  type text not null default '',
  duration_minutes numeric,
  notes text
);

create index cardio_sessions_user_id_idx on public.cardio_sessions (user_id);

create table public.cardio_metrics (
  id uuid primary key default gen_random_uuid (),
  cardio_session_id uuid not null references public.cardio_sessions (id) on delete cascade,
  key text not null,
  value numeric not null,
  unit text not null default ''
);

create index cardio_metrics_cardio_session_id_idx on public.cardio_metrics (cardio_session_id);

-- ---------------------------------------------------------------------------
-- Coach chat
-- ---------------------------------------------------------------------------
create table public.coach_messages (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null check (role in ('user', 'coach')),
  content text not null,
  created_at timestamptz not null default timezone ('utc', now())
);

create index coach_messages_user_id_idx on public.coach_messages (user_id);
create index coach_messages_created_at_idx on public.coach_messages (created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.user_preferences enable row level security;
alter table public.workout_splits enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_sets enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_macros enable row level security;
alter table public.meal_plans enable row level security;
alter table public.meal_plan_entries enable row level security;
alter table public.food_logs enable row level security;
alter table public.food_log_macros enable row level security;
alter table public.progress_entries enable row level security;
alter table public.cardio_sessions enable row level security;
alter table public.cardio_metrics enable row level security;
alter table public.coach_messages enable row level security;

-- public.users: read/update own row (profile created by trigger)
create policy "users_select_own"
on public.users for select to authenticated
using (auth.uid () = id);

create policy "users_update_own"
on public.users for update to authenticated
using (auth.uid () = id)
with check (auth.uid () = id);

-- user_preferences
create policy "user_preferences_all_own"
on public.user_preferences for all to authenticated
using (user_id = auth.uid ())
with check (user_id = auth.uid ());

-- workout_splits
create policy "workout_splits_all_own"
on public.workout_splits for all to authenticated
using (user_id = auth.uid ())
with check (user_id = auth.uid ());

-- workout_sessions
create policy "workout_sessions_all_own"
on public.workout_sessions for all to authenticated
using (user_id = auth.uid ())
with check (user_id = auth.uid ());

-- workout_sets (via session ownership)
create policy "workout_sets_all_via_session"
on public.workout_sets for all to authenticated
using (
  exists (
    select 1 from public.workout_sessions ws
    where ws.id = workout_sets.session_id
      and ws.user_id = auth.uid ()
  )
)
with check (
  exists (
    select 1 from public.workout_sessions ws
    where ws.id = workout_sets.session_id
      and ws.user_id = auth.uid ()
  )
);

-- recipes
create policy "recipes_all_own"
on public.recipes for all to authenticated
using (user_id = auth.uid ())
with check (user_id = auth.uid ());

-- recipe_macros (via recipe ownership)
create policy "recipe_macros_all_via_recipe"
on public.recipe_macros for all to authenticated
using (
  exists (
    select 1 from public.recipes r
    where r.id = recipe_macros.recipe_id
      and r.user_id = auth.uid ()
  )
)
with check (
  exists (
    select 1 from public.recipes r
    where r.id = recipe_macros.recipe_id
      and r.user_id = auth.uid ()
  )
);

-- meal_plans
create policy "meal_plans_all_own"
on public.meal_plans for all to authenticated
using (user_id = auth.uid ())
with check (user_id = auth.uid ());

-- meal_plan_entries (via meal plan ownership)
create policy "meal_plan_entries_all_via_plan"
on public.meal_plan_entries for all to authenticated
using (
  exists (
    select 1 from public.meal_plans mp
    where mp.id = meal_plan_entries.meal_plan_id
      and mp.user_id = auth.uid ()
  )
)
with check (
  exists (
    select 1 from public.meal_plans mp
    where mp.id = meal_plan_entries.meal_plan_id
      and mp.user_id = auth.uid ()
  )
);

-- food_logs
create policy "food_logs_all_own"
on public.food_logs for all to authenticated
using (user_id = auth.uid ())
with check (user_id = auth.uid ());

-- food_log_macros (via food log ownership)
create policy "food_log_macros_all_via_log"
on public.food_log_macros for all to authenticated
using (
  exists (
    select 1 from public.food_logs fl
    where fl.id = food_log_macros.food_log_id
      and fl.user_id = auth.uid ()
  )
)
with check (
  exists (
    select 1 from public.food_logs fl
    where fl.id = food_log_macros.food_log_id
      and fl.user_id = auth.uid ()
  )
);

-- progress_entries
create policy "progress_entries_all_own"
on public.progress_entries for all to authenticated
using (user_id = auth.uid ())
with check (user_id = auth.uid ());

-- cardio_sessions
create policy "cardio_sessions_all_own"
on public.cardio_sessions for all to authenticated
using (user_id = auth.uid ())
with check (user_id = auth.uid ());

-- cardio_metrics (via cardio session ownership)
create policy "cardio_metrics_all_via_session"
on public.cardio_metrics for all to authenticated
using (
  exists (
    select 1 from public.cardio_sessions cs
    where cs.id = cardio_metrics.cardio_session_id
      and cs.user_id = auth.uid ()
  )
)
with check (
  exists (
    select 1 from public.cardio_sessions cs
    where cs.id = cardio_metrics.cardio_session_id
      and cs.user_id = auth.uid ()
  )
);

-- coach_messages
create policy "coach_messages_all_own"
on public.coach_messages for all to authenticated
using (user_id = auth.uid ())
with check (user_id = auth.uid ());

-- ---------------------------------------------------------------------------
-- Realtime: home dashboard live updates
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.food_logs;
alter publication supabase_realtime add table public.workout_sessions;
