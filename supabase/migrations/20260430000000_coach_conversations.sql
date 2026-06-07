-- Coach conversations table for multi-conversation sidebar
create table if not exists public.coach_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null default 'New Conversation',
  messages jsonb not null default '[]'::jsonb,
  coach_id text not null default 'drdata',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.coach_conversations
  enable row level security;

create policy "Users can manage their own conversations"
  on public.coach_conversations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.coach_conversations is
  'Stores multi-turn coach chat conversations per user';
