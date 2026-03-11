# Supabase (Production) Setup

This project currently uses `localStorage` for most data (demo only). For production + real-time updates across devices, use Supabase.

## 1) Create Supabase project
- Go to Supabase dashboard
- Create a new project

## 2) Create tables (Teams/Members + NOC + PPT)
Run this SQL in Supabase SQL Editor:

```sql
-- Needed for gen_random_uuid()
create extension if not exists pgcrypto;

-- Teams (global registration store)
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  team_name text not null unique,
  domain text not null,
  created_at timestamptz not null default now()
);

-- Members (per team)
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  member_index int not null,
  name text not null,
  registration_number text not null,
  registration_number_normalized text not null,
  email text not null,
  email_normalized text not null,
  phone_number text not null,
  phone_number_normalized text not null,
  school text not null,
  program text not null,
  program_other text not null default '',
  branch text not null default '',
  campus text not null,
  stay text not null,
  year_of_study text not null,
  auth_user_id uuid null,
  created_at timestamptz not null default now(),
  unique (email_normalized),
  unique (registration_number_normalized),
  unique (phone_number_normalized),
  unique (team_id, member_index)
);

-- NOC upload metadata
create table if not exists public.noc_uploads (
  team_name text not null,
  member_id text not null,
  file_name text not null,
  file_path text not null,
  uploaded_at timestamptz not null default now(),
  primary key (team_name, member_id)
);

-- Per-member deadline overrides
create table if not exists public.noc_deadlines (
  team_name text not null,
  member_id text not null,
  deadline timestamptz not null,
  primary key (team_name, member_id)
);

-- PPT upload metadata (team-level)
create table if not exists public.ppt_uploads (
  team_id uuid not null references public.teams(id) on delete cascade,
  campus text not null,
  file_name text not null,
  file_path text not null,
  uploaded_at timestamptz not null default now(),
  primary key (team_id, campus)
);

-- PPT deadline overrides (team-level)
create table if not exists public.ppt_deadlines (
  team_id uuid not null references public.teams(id) on delete cascade,
  campus text not null,
  deadline timestamptz not null,
  primary key (team_id, campus)
);

-- Optional helper for login (recommended when you enable RLS)
-- Returns minimal fields needed to sign-in/sign-up via Supabase Auth.
create or replace function public.find_member_for_login(identifier text)
returns table (id uuid, team_id uuid, email text)
language sql
stable
as $$
  select m.id, m.team_id, m.email
  from public.members m
  where m.email_normalized = identifier
     or m.phone_number_normalized = identifier
     or m.registration_number_normalized = identifier
  limit 1;
$$;
```

## 3) Create Storage buckets
- Storage → Create bucket: `noc`
- Storage → Create bucket: `ppt`
- Recommended for production: keep bucket **private** and use signed URLs.

## 4) Environment variables
Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Restart `npm run dev`.

## 5) Security (important)
Right now the code uses the public anon key from the browser. For production, use Supabase Auth + RLS policies so:
- Team members can only see their own team and upload/delete their own NOC
- Admin can view/manage everything

### 5.1 Supabase Auth notes
This app logs in with **identifier + team password**. In Supabase mode:
- The identifier is resolved to the member email (by DB lookup / RPC)
- Then the app calls `supabase.auth.signInWithPassword({ email, password: teamPassword })`
- If the Auth user doesn't exist yet, the app attempts `signUp` automatically

In Supabase Dashboard → Authentication → Providers → Email:
- For a hackathon demo, you may want to disable email confirmations so sign-up works instantly.

### 5.2 Enable RLS and policies (recommended)

Run this SQL (adjust admin email if needed):

```sql
alter table public.teams enable row level security;
alter table public.members enable row level security;
alter table public.noc_uploads enable row level security;
alter table public.noc_deadlines enable row level security;
alter table public.ppt_uploads enable row level security;
alter table public.ppt_deadlines enable row level security;

-- Helper: treat one email as admin
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.email(), '') = 'tcd_gcgc@gitam.edu';
$$;

-- TEAMS
create policy "teams_admin_all"
on public.teams
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "teams_read_own"
on public.teams
for select
to authenticated
using (
  id in (
    select team_id from public.members where auth_user_id = auth.uid()
  )
);

-- Allow anonymous registrations (optional; remove for stricter deployments)
create policy "teams_insert_anon"
on public.teams
for insert
to anon
with check (true);

-- MEMBERS
create policy "members_admin_all"
on public.members
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "members_read_team"
on public.members
for select
to authenticated
using (
  team_id in (
    select team_id from public.members where auth_user_id = auth.uid()
  )
);

-- Allow a logged-in user to claim their member row (bind auth_user_id)
create policy "members_claim_self"
on public.members
for update
to authenticated
using (auth_user_id is null or auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

-- Allow anonymous registrations (optional)
create policy "members_insert_anon"
on public.members
for insert
to anon
with check (true);

-- Allow anon to execute login lookup RPC (recommended)
grant execute on function public.find_member_for_login(text) to anon;

-- NOC tables: restrict to member owner OR admin
create policy "noc_uploads_owner_or_admin"
on public.noc_uploads
for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.members m
    where m.id = (noc_uploads.member_id::uuid)
      and m.auth_user_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.members m
    where m.id = (noc_uploads.member_id::uuid)
      and m.auth_user_id = auth.uid()
  )
);

create policy "noc_deadlines_owner_or_admin"
on public.noc_deadlines
for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.members m
    where m.id = (noc_deadlines.member_id::uuid)
      and m.auth_user_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.members m
    where m.id = (noc_deadlines.member_id::uuid)
      and m.auth_user_id = auth.uid()
  )
);

-- PPT tables: restrict to team member OR admin
create policy "ppt_uploads_team_or_admin"
on public.ppt_uploads
for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.members m
    where m.team_id = ppt_uploads.team_id
      and m.auth_user_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.members m
    where m.team_id = ppt_uploads.team_id
      and m.auth_user_id = auth.uid()
  )
);

create policy "ppt_deadlines_team_or_admin"
on public.ppt_deadlines
for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.members m
    where m.team_id = ppt_deadlines.team_id
      and m.auth_user_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1 from public.members m
    where m.team_id = ppt_deadlines.team_id
      and m.auth_user_id = auth.uid()
  )
);
```

### 5.3 Storage policy (NOC bucket)
If your `noc` bucket is private, you should add Storage policies so only the owner (or admin) can upload/delete their PDF.

This app stores objects as: `<teamName>/<memberUuid>/noc.pdf`.

In SQL Editor:

```sql
-- Enable RLS on storage objects is already on by default in Supabase projects.

-- Allow authenticated users to read their own object (or admin)
create policy "noc_storage_read_owner_or_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'noc'
  and (
    public.is_admin()
    or exists (
      select 1 from public.members m
      where m.id = (split_part(name, '/', 2))::uuid
        and m.auth_user_id = auth.uid()
    )
  )
);

-- Allow upload/update for owner (or admin)
create policy "noc_storage_write_owner_or_admin"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'noc'
  and (
    public.is_admin()
    or exists (
      select 1 from public.members m
      where m.id = (split_part(name, '/', 2))::uuid
        and m.auth_user_id = auth.uid()
    )
  )
);

create policy "noc_storage_update_owner_or_admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'noc'
)
with check (
  bucket_id = 'noc'
);

create policy "noc_storage_delete_owner_or_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'noc'
  and (
    public.is_admin()
    or exists (
      select 1 from public.members m
      where m.id = (split_part(name, '/', 2))::uuid
        and m.auth_user_id = auth.uid()
    )
  )
);
```

If you prefer an even tighter model, we can switch storage paths to `<teamId>/<memberId>/noc.pdf` and enforce both segments.

### 5.4 Storage policy (PPT bucket)
This app stores PPT objects as: `<teamId>/<campus>/ppt.pdf`.

```sql
create policy "ppt_storage_read_team_or_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'ppt'
  and (
    public.is_admin()
    or exists (
      select 1 from public.members m
      where m.team_id = (split_part(name, '/', 1))::uuid
        and m.auth_user_id = auth.uid()
    )
  )
);

create policy "ppt_storage_write_team_or_admin"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'ppt'
  and (
    public.is_admin()
    or exists (
      select 1 from public.members m
      where m.team_id = (split_part(name, '/', 1))::uuid
        and m.auth_user_id = auth.uid()
    )
  )
);

create policy "ppt_storage_delete_team_or_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'ppt'
  and (
    public.is_admin()
    or exists (
      select 1 from public.members m
      where m.team_id = (split_part(name, '/', 1))::uuid
        and m.auth_user_id = auth.uid()
    )
  )
);
```
