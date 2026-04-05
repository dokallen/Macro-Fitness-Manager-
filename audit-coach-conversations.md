# Coach conversations — Supabase audit

This document describes the `coach_conversations` table used by the multi-conversation coach sidebar, persistence in `app/api/coach-chat/route.ts`, and client list/realtime in `components/coach/ConversationList.tsx`.

## Schema

Run in the Supabase SQL editor (or migrate) **only if the table does not exist**. Confirm in **Table Editor** or:

```sql
select to_regclass('public.coach_conversations');
```

### DDL

```sql
create table if not exists public.coach_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null default '',
  messages jsonb not null default '[]'::jsonb,
  coach_id text not null default 'drdata',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists coach_conversations_user_id_updated_at_idx
  on public.coach_conversations (user_id, updated_at desc);
```

`messages` is a JSON array of objects:

- `role`: `"user"` | `"assistant"`
- `content`: string
- `timestamp`: ISO string
- `coachId`: string

## Row Level Security

Enable RLS and restrict rows to the authenticated user (aligns with the rest of the app using the publishable key + user session):

```sql
alter table public.coach_conversations enable row level security;

create policy "coach_conversations_select_own"
  on public.coach_conversations for select
  using (auth.uid() = user_id);

create policy "coach_conversations_insert_own"
  on public.coach_conversations for insert
  with check (auth.uid() = user_id);

create policy "coach_conversations_update_own"
  on public.coach_conversations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "coach_conversations_delete_own"
  on public.coach_conversations for delete
  using (auth.uid() = user_id);
```

If policies already exist with different names, adjust or drop duplicates before creating.

## Realtime

For the conversation list to update live, include the table in a Supabase Realtime publication (e.g. **Database → Replication** in the dashboard, or SQL appropriate to your project version).

## Generated TypeScript types

`coach_conversations` is not yet in `lib/types/index.ts`. The app uses narrow `as any` accessors around `.from("coach_conversations")` until types are regenerated from Supabase (e.g. `supabase gen types`) and the table definition is merged into `Database`.

## Behavior summary

- New threads: first save uses a title from the first user message (trimmed); after the first assistant reply, the API may replace the title with a short Claude-generated label.
- Long threads: when stored messages exceed 100, the API summarizes the oldest 20 into one assistant summary message and continues.
- `coachTask: "generate_conversation_title"` remains available on the coach-chat API for explicit title generation when needed.
