-- BizLocate CRM schema — run once in Supabase SQL editor (Dashboard > SQL Editor > New query)
-- Mirrors docs/architecture.md and docs/modules/*.md

-- ============================================================
-- Tables
-- ============================================================

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  manager_id uuid -- fk added after profiles exists (circular ref)
);

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  ic text,
  role text not null check (role in ('ADMIN', 'MANAGER', 'SALESPERSON')),
  team_id uuid references teams (id) on delete set null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  active_pool_limit int check (active_pool_limit is null or active_pool_limit >= 0),
  inactive_pool_limit int check (inactive_pool_limit is null or inactive_pool_limit >= 0),
  auto_assign_enabled boolean not null default true
);

-- Run this alone against an already-provisioned database:
-- alter table profiles add column if not exists phone text;
-- alter table profiles add column if not exists ic text;
-- alter table profiles rename column customer_limit to active_pool_limit;
-- alter table profiles add column if not exists inactive_pool_limit int check (inactive_pool_limit is null or inactive_pool_limit >= 0);
-- alter table profiles add column if not exists auto_assign_enabled boolean not null default true;
-- create or replace function handle_new_user() returns trigger as $$
-- begin
--   insert into public.profiles (id, name, email, phone, ic, role, team_id, status, active_pool_limit, inactive_pool_limit)
--   values (
--     new.id,
--     coalesce(new.raw_user_meta_data ->> 'name', new.email),
--     new.email,
--     nullif(new.raw_user_meta_data ->> 'phone', ''),
--     nullif(new.raw_user_meta_data ->> 'ic', ''),
--     coalesce(new.raw_user_meta_data ->> 'role', 'SALESPERSON'),
--     nullif(new.raw_user_meta_data ->> 'team_id', '')::uuid,
--     'ACTIVE',
--     nullif(new.raw_user_meta_data ->> 'active_pool_limit', '')::int,
--     nullif(new.raw_user_meta_data ->> 'inactive_pool_limit', '')::int
--   );
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;

alter table teams
  add constraint teams_manager_id_fkey foreign key (manager_id) references profiles (id) on delete set null;

create table pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  "order" int not null,
  is_default boolean not null default false,
  requires_amount boolean not null default false,
  exclude_from_auto_assign boolean not null default false
);

create table areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  auto_assign_enabled boolean not null default true,
  auto_assign_resumed_at timestamptz not null default now(),
  last_auto_assigned_user_id uuid references profiles (id) on delete set null
);

create table sub_areas (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas (id) on delete cascade,
  name text not null,
  unique (area_id, name)
);

create table area_teams (
  area_id uuid not null references areas (id) on delete cascade,
  team_id uuid not null references teams (id) on delete cascade,
  primary key (area_id, team_id)
);

create table business_tag_industries (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table business_tag_categories (
  id uuid primary key default gen_random_uuid(),
  industry_id uuid not null references business_tag_industries (id) on delete cascade,
  name text not null,
  unique (industry_id, name)
);

create table business_tag_types (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references business_tag_categories (id) on delete cascade,
  name text not null,
  unique (category_id, name)
);

create table lead_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table property_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table purposes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table languages (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table firsttime_branch_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table races (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table target_races (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table target_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table mandatory_field_settings (
  field_key text primary key,
  required boolean not null default true
);

create table removal_reasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  optional_phone text,
  assigned_to uuid references profiles (id) on delete set null,
  assigned_to_2 uuid references profiles (id) on delete set null,
  assigned_to_3 uuid references profiles (id) on delete set null,
  pool_1 text check (pool_1 in ('ACTIVE', 'INACTIVE')),
  pool_2 text check (pool_2 in ('ACTIVE', 'INACTIVE')),
  pool_3 text check (pool_3 in ('ACTIVE', 'INACTIVE')),
  pool_1_since timestamptz,
  pool_2_since timestamptz,
  pool_3_since timestamptz,
  stage_1 uuid references pipeline_stages (id),
  stage_2 uuid references pipeline_stages (id),
  stage_3 uuid references pipeline_stages (id),
  source_id uuid references lead_sources (id) on delete set null,
  area_id uuid references areas (id) on delete set null,
  sub_area_id uuid references sub_areas (id) on delete set null,
  property_type_id uuid references property_types (id) on delete set null,
  purpose_id uuid references purposes (id) on delete set null,
  business_industry_id uuid references business_tag_industries (id) on delete set null,
  business_category_id uuid references business_tag_categories (id) on delete set null,
  business_type_id uuid references business_tag_types (id) on delete set null,
  race_id uuid references races (id) on delete set null,
  language_id uuid references languages (id) on delete set null,
  business_name text,
  firsttime_branch_id uuid references firsttime_branch_types (id) on delete set null,
  target_race_id uuid references target_races (id) on delete set null,
  target_type_id uuid references target_types (id) on delete set null,
  budget_min numeric,
  budget_max numeric,
  remark text,
  created_by uuid references profiles (id) on delete set null,
  created_by_team_id uuid references teams (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  type text not null check (type in ('CALL', 'VISIT', 'NOTE')),
  content text not null,
  follow_up text,
  created_at timestamptz not null default now()
);

-- changed_by_name is a permanent text snapshot of the author's name, taken
-- when the row is written (see logProfileFieldChange in lib/store.tsx) --
-- Change History must keep showing a real name even after changed_by goes
-- null (the author's account was later deleted). changed_by itself is kept
-- for whatever it's still useful for, but nothing should ever need it to
-- render a name again.
create table customer_change_log (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  changed_by uuid references profiles (id) on delete set null,
  changed_by_name text not null,
  field_key text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

create table deal_closures (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  user_id uuid references profiles (id) on delete set null,
  slot smallint not null check (slot in (1, 2, 3)),
  stage_id uuid not null references pipeline_stages (id),
  amount numeric not null,
  created_at timestamptz not null default now()
);

-- requested_by cascades: the request is that person's own ask, gone with
-- them. resolved_by only goes null -- cascading it would delete a
-- different customer's removal-request history just because the admin who
-- approved it later left.
create table removal_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  slot smallint not null check (slot in (1, 2, 3)),
  requested_by uuid not null references profiles (id) on delete cascade,
  reason_id uuid not null references removal_reasons (id),
  note text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  resolved_by uuid references profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index removal_requests_one_pending on removal_requests (customer_id, slot) where status = 'PENDING';

-- customer_delete_requests: a MANAGER requests a customer be deleted; an
-- ADMIN approves by opening the customer's profile and using the existing
-- (admin-only) Delete button -- see deleteCustomer in lib/store.tsx, which
-- resolves the matching PENDING row to APPROVED as part of that same
-- delete. customer_id is "on delete set null" (not cascade) so the request
-- survives as history once the customer it named is actually gone;
-- customer_name/business_name are snapshotted at request time for the same
-- reason (nothing left to join against afterwards).
create table customer_delete_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers (id) on delete set null,
  customer_name text not null,
  business_name text,
  requested_by uuid references profiles (id) on delete set null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  resolved_by uuid references profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index customer_delete_requests_one_pending on customer_delete_requests (customer_id) where status = 'PENDING';

create table sales_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  year_month text not null,
  amount numeric not null check (amount >= 0),
  set_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, year_month)
);

-- One row per successful assignment (manual or the auto-second-assign
-- sweep) — clearing a slot is not an assignment, so it's never logged
-- here (customer_change_log already covers removals). Feeds the "assigned
-- N customers this month" dashboard report; user_id is who received the
-- customer, not who performed the assignment.
create table assignment_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  slot smallint not null check (slot in (1, 2, 3)),
  created_at timestamptz not null default now()
);

-- Append-only log of every stage change on a slot, so dashboard reports
-- can measure duration between two stages (e.g. assign -> Appointment,
-- Appointment -> Closed Case) instead of only ever seeing the current
-- stage. Only forward-looking: a slot's stage history before this table
-- existed is not recoverable.
create table stage_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  slot smallint not null check (slot in (1, 2, 3)),
  stage_id uuid not null references pipeline_stages(id),
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  title text not null,
  due text,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  type text not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Helpers (security definer: bypass RLS to avoid recursive policy checks)
-- ============================================================

create function is_admin() returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'ADMIN');
$$ language sql security definer stable set search_path = public;

create function my_team_id() returns uuid as $$
  select team_id from profiles where id = auth.uid();
$$ language sql security definer stable set search_path = public;

-- true if the caller is one of a customer's (up to 3) assignees, or shares
-- a team with one of them
create function is_customer_assignee(a1 uuid, a2 uuid, a3 uuid) returns boolean as $$
  select auth.uid() = a1 or auth.uid() = a2 or auth.uid() = a3
    or a1 in (select id from profiles where team_id = my_team_id())
    or a2 in (select id from profiles where team_id = my_team_id())
    or a3 in (select id from profiles where team_id = my_team_id());
$$ language sql security definer stable set search_path = public;

-- ============================================================
-- New auth user -> profiles row
-- ============================================================

create function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, name, email, phone, ic, role, team_id, status, active_pool_limit, inactive_pool_limit)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.email),
    new.email,
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'ic', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'SALESPERSON'),
    nullif(new.raw_user_meta_data ->> 'team_id', '')::uuid,
    'ACTIVE',
    nullif(new.raw_user_meta_data ->> 'active_pool_limit', '')::int,
    nullif(new.raw_user_meta_data ->> 'inactive_pool_limit', '')::int
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- Column-level guards (RLS is row-level only; these stop privilege
-- escalation / out-of-scope edits within an otherwise-allowed row)
-- ============================================================

create function protect_profile_columns() returns trigger as $$
begin
  if not is_admin() and (
    new.role is distinct from old.role
    or new.team_id is distinct from old.team_id
    or new.status is distinct from old.status
    or new.active_pool_limit is distinct from old.active_pool_limit
    or new.inactive_pool_limit is distinct from old.inactive_pool_limit
  ) then
    raise exception 'only an admin can change role, team, status, or pool limits';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger profiles_protect_columns
  before update on profiles
  for each row execute function protect_profile_columns();

-- any of the 3 slots can be self-cleared by the assignee currently in that
-- slot (used by the 60-day inactive-pool sweep, and generally reasonable
-- as a "drop myself from this customer" action). A manager can also fill or
-- clear a slot as long as both the old and new occupant (when not null) are
-- on their own team — i.e. assigning a customer to one of their salespeople.
-- Otherwise only an admin can change who's assigned.
create or replace function protect_customer_assignment() returns trigger as $$
declare
  is_mgr boolean := exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER');
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' and not is_admin() and (
    (
      new.assigned_to is distinct from old.assigned_to
      and not (
        (new.assigned_to is null and old.assigned_to = auth.uid())
        or (
          is_mgr
          and (old.assigned_to is null or old.assigned_to in (select id from profiles where team_id = my_team_id()))
          and (new.assigned_to is null or new.assigned_to in (select id from profiles where team_id = my_team_id()))
        )
      )
    )
    or (
      new.assigned_to_2 is distinct from old.assigned_to_2
      and not (
        (new.assigned_to_2 is null and old.assigned_to_2 = auth.uid())
        or (
          is_mgr
          and (old.assigned_to_2 is null or old.assigned_to_2 in (select id from profiles where team_id = my_team_id()))
          and (new.assigned_to_2 is null or new.assigned_to_2 in (select id from profiles where team_id = my_team_id()))
        )
      )
    )
    or (
      new.assigned_to_3 is distinct from old.assigned_to_3
      and not (
        (new.assigned_to_3 is null and old.assigned_to_3 = auth.uid())
        or (
          is_mgr
          and (old.assigned_to_3 is null or old.assigned_to_3 in (select id from profiles where team_id = my_team_id()))
          and (new.assigned_to_3 is null or new.assigned_to_3 in (select id from profiles where team_id = my_team_id()))
        )
      )
    )
  ) then
    raise exception 'only an admin can reassign a customer';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger customers_protect_assignment
  before update on customers
  for each row execute function protect_customer_assignment();

-- a slot's pool status can only be changed by that slot's own assignee, or
-- an admin
create or replace function protect_pool_columns() returns trigger as $$
begin
  if (auth.jwt() ->> 'role') is distinct from 'service_role' and not is_admin()
    and new.pool_1 is distinct from old.pool_1
    and auth.uid() is distinct from old.assigned_to
    and not (
      exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
      and old.assigned_to in (select id from profiles where team_id = my_team_id())
    )
  then
    raise exception 'only the assignee or an admin can change this pool status';
  end if;
  if (auth.jwt() ->> 'role') is distinct from 'service_role' and not is_admin()
    and new.pool_2 is distinct from old.pool_2
    and auth.uid() is distinct from old.assigned_to_2
    and not (
      exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
      and old.assigned_to_2 in (select id from profiles where team_id = my_team_id())
    )
  then
    raise exception 'only the assignee or an admin can change this pool status';
  end if;
  if (auth.jwt() ->> 'role') is distinct from 'service_role' and not is_admin()
    and new.pool_3 is distinct from old.pool_3
    and auth.uid() is distinct from old.assigned_to_3
    and not (
      exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
      and old.assigned_to_3 in (select id from profiles where team_id = my_team_id())
    )
  then
    raise exception 'only the assignee or an admin can change this pool status';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger customers_protect_pool
  before update on customers
  for each row execute function protect_pool_columns();

create function protect_customer_remark_column() returns trigger as $$
begin
  if (
    new.remark is distinct from old.remark
    or new.phone is distinct from old.phone
  ) and not (
    is_admin() or exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
  ) then
    raise exception 'only an admin or manager can change the phone or remark';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger customers_protect_remark
  before update on customers
  for each row execute function protect_customer_remark_column();

create function touch_customer_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger customers_touch_updated_at
  before update on customers
  for each row execute function touch_customer_updated_at();

create function protect_task_columns() returns trigger as $$
begin
  if new.customer_id is distinct from old.customer_id
    or new.user_id is distinct from old.user_id
    or new.title is distinct from old.title
    or new.due is distinct from old.due then
    raise exception 'tasks can only be updated via the done flag';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger tasks_protect_columns
  before update on tasks
  for each row execute function protect_task_columns();

create function protect_activity_columns() returns trigger as $$
begin
  if new.customer_id is distinct from old.customer_id
    or new.user_id is distinct from old.user_id
    or new.type is distinct from old.type
    or new.follow_up is distinct from old.follow_up then
    raise exception 'activities can only be updated via content (and created_at, to re-date it)';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger activities_protect_columns
  before update on activities
  for each row execute function protect_activity_columns();

create function protect_notification_columns() returns trigger as $$
begin
  if new.user_id is distinct from old.user_id
    or new.type is distinct from old.type
    or new.message is distinct from old.message then
    raise exception 'notifications can only be updated via the read flag';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger notifications_protect_columns
  before update on notifications
  for each row execute function protect_notification_columns();

-- ============================================================
-- RLS
-- ============================================================

alter table teams enable row level security;
alter table profiles enable row level security;
alter table pipeline_stages enable row level security;
alter table areas enable row level security;
alter table sub_areas enable row level security;
alter table area_teams enable row level security;
alter table customers enable row level security;
alter table activities enable row level security;
alter table tasks enable row level security;
alter table customer_change_log enable row level security;
alter table deal_closures enable row level security;
alter table removal_reasons enable row level security;
alter table removal_requests enable row level security;
alter table customer_delete_requests enable row level security;
alter table sales_targets enable row level security;
alter table assignment_events enable row level security;
alter table stage_events enable row level security;
alter table notifications enable row level security;

-- profiles: self, admin (all), manager (own team)
create policy "profiles_select" on profiles for select using (
  id = auth.uid() or is_admin() or team_id = my_team_id()
);
create policy "profiles_insert_admin" on profiles for insert with check (is_admin());
create policy "profiles_update" on profiles for update using (
  id = auth.uid() or is_admin()
);
create policy "profiles_delete_admin" on profiles for delete using (is_admin());

-- teams: admin writes; every signed-in user can read team names (used to
-- label which team created a customer)
create policy "teams_select" on teams for select using (auth.uid() is not null);
create policy "teams_insert_admin" on teams for insert with check (is_admin());
create policy "teams_update_admin" on teams for update using (is_admin());
create policy "teams_delete_admin" on teams for delete using (is_admin());

-- pipeline_stages: any authenticated user reads, admin writes
create policy "pipeline_stages_select" on pipeline_stages for select using (auth.uid() is not null);
create policy "pipeline_stages_insert_admin" on pipeline_stages for insert with check (is_admin());
create policy "pipeline_stages_update_admin" on pipeline_stages for update using (is_admin());
create policy "pipeline_stages_delete_admin" on pipeline_stages for delete using (is_admin());

-- areas / sub_areas: any authenticated user reads, admin writes
create policy "areas_select" on areas for select using (auth.uid() is not null);
create policy "areas_insert_admin" on areas for insert with check (is_admin());
create policy "areas_update_admin" on areas for update using (is_admin());
create policy "areas_delete_admin" on areas for delete using (is_admin());

create policy "sub_areas_select" on sub_areas for select using (auth.uid() is not null);
create policy "sub_areas_insert_admin" on sub_areas for insert with check (is_admin());
create policy "sub_areas_update_admin" on sub_areas for update using (is_admin());
create policy "sub_areas_delete_admin" on sub_areas for delete using (is_admin());

-- area_teams: any authenticated user reads, admin writes (no update  -  rows are added/removed, never edited)
create policy "area_teams_select" on area_teams for select using (auth.uid() is not null);
create policy "area_teams_insert_admin" on area_teams for insert with check (is_admin());
create policy "area_teams_delete_admin" on area_teams for delete using (is_admin());

alter table business_tag_industries enable row level security;
alter table business_tag_categories enable row level security;
alter table business_tag_types enable row level security;

create policy "business_tag_industries_select" on business_tag_industries for select using (auth.uid() is not null);
create policy "business_tag_industries_insert_admin" on business_tag_industries for insert with check (is_admin());
create policy "business_tag_industries_update_admin" on business_tag_industries for update using (is_admin());
create policy "business_tag_industries_delete_admin" on business_tag_industries for delete using (is_admin());

create policy "business_tag_categories_select" on business_tag_categories for select using (auth.uid() is not null);
create policy "business_tag_categories_insert_admin" on business_tag_categories for insert with check (is_admin());
create policy "business_tag_categories_update_admin" on business_tag_categories for update using (is_admin());
create policy "business_tag_categories_delete_admin" on business_tag_categories for delete using (is_admin());

create policy "business_tag_types_select" on business_tag_types for select using (auth.uid() is not null);
create policy "business_tag_types_insert_admin" on business_tag_types for insert with check (is_admin());
create policy "business_tag_types_update_admin" on business_tag_types for update using (is_admin());
create policy "business_tag_types_delete_admin" on business_tag_types for delete using (is_admin());

alter table lead_sources enable row level security;
alter table property_types enable row level security;
alter table purposes enable row level security;
alter table languages enable row level security;
alter table firsttime_branch_types enable row level security;
alter table races enable row level security;
alter table target_races enable row level security;
alter table target_types enable row level security;

create policy "lead_sources_select" on lead_sources for select using (auth.uid() is not null);
create policy "lead_sources_insert_admin" on lead_sources for insert with check (is_admin());
create policy "lead_sources_update_admin" on lead_sources for update using (is_admin());
create policy "lead_sources_delete_admin" on lead_sources for delete using (is_admin());

create policy "property_types_select" on property_types for select using (auth.uid() is not null);
create policy "property_types_insert_admin" on property_types for insert with check (is_admin());
create policy "property_types_update_admin" on property_types for update using (is_admin());
create policy "property_types_delete_admin" on property_types for delete using (is_admin());

create policy "purposes_select" on purposes for select using (auth.uid() is not null);
create policy "purposes_insert_admin" on purposes for insert with check (is_admin());
create policy "purposes_update_admin" on purposes for update using (is_admin());
create policy "purposes_delete_admin" on purposes for delete using (is_admin());

create policy "languages_select" on languages for select using (auth.uid() is not null);
create policy "languages_insert_admin" on languages for insert with check (is_admin());
create policy "languages_update_admin" on languages for update using (is_admin());
create policy "languages_delete_admin" on languages for delete using (is_admin());

create policy "firsttime_branch_types_select" on firsttime_branch_types for select using (auth.uid() is not null);
create policy "firsttime_branch_types_insert_admin" on firsttime_branch_types for insert with check (is_admin());
create policy "firsttime_branch_types_update_admin" on firsttime_branch_types for update using (is_admin());
create policy "firsttime_branch_types_delete_admin" on firsttime_branch_types for delete using (is_admin());

create policy "races_select" on races for select using (auth.uid() is not null);
create policy "races_insert_admin" on races for insert with check (is_admin());
create policy "races_update_admin" on races for update using (is_admin());
create policy "races_delete_admin" on races for delete using (is_admin());

create policy "target_races_select" on target_races for select using (auth.uid() is not null);
create policy "target_races_insert_admin" on target_races for insert with check (is_admin());
create policy "target_races_update_admin" on target_races for update using (is_admin());
create policy "target_races_delete_admin" on target_races for delete using (is_admin());

create policy "target_types_select" on target_types for select using (auth.uid() is not null);
create policy "target_types_insert_admin" on target_types for insert with check (is_admin());
create policy "target_types_update_admin" on target_types for update using (is_admin());
create policy "target_types_delete_admin" on target_types for delete using (is_admin());

alter table mandatory_field_settings enable row level security;

create policy "mandatory_field_settings_select" on mandatory_field_settings for select using (auth.uid() is not null);
create policy "mandatory_field_settings_update_admin" on mandatory_field_settings for update using (is_admin());

create policy "removal_reasons_select" on removal_reasons for select using (auth.uid() is not null);
create policy "removal_reasons_insert_admin" on removal_reasons for insert with check (is_admin());
create policy "removal_reasons_update_admin" on removal_reasons for update using (is_admin());
create policy "removal_reasons_delete_admin" on removal_reasons for delete using (is_admin());

-- customers: admin all, manager own team, salesperson own assigned (any of up to 3 slots)
create policy "customers_select" on customers for select using (
  is_admin() or is_customer_assignee(assigned_to, assigned_to_2, assigned_to_3)
);
create policy "customers_insert" on customers for insert with check (
  is_admin() or exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
);
create policy "customers_update" on customers for update using (
  is_admin() or is_customer_assignee(assigned_to, assigned_to_2, assigned_to_3)
);
create policy "customers_delete_admin" on customers for delete using (is_admin());

-- activities: inherit customer visibility. The author can edit their own
-- entry's content (re-dating it to now, see updateActivity) but not
-- reassign/retype it — protect_activity_columns above locks that down.
-- Otherwise append-only; admin/manager can only clear a removed
-- assignee's log entirely (see activities_delete below).
create policy "activities_select" on activities for select using (
  is_admin()
  or exists (
    select 1 from customers c
    where c.id = activities.customer_id
      and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
  )
);
create policy "activities_insert" on activities for insert with check (
  is_admin()
  or exists (
    select 1 from customers c
    where c.id = activities.customer_id
      and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
  )
);
create policy "activities_update" on activities for update using (
  user_id = auth.uid()
);
-- admin (anywhere) or manager (own team) permanently deletes a removed
-- assignee's whole log for that customer — fired from the app right
-- before the slot itself is cleared
create policy "activities_delete" on activities for delete using (
  is_admin()
  or (
    exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
    and exists (
      select 1 from customers c
      where c.id = activities.customer_id
        and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
    )
  )
);

-- tasks: private per creator — everyone (including admin) only sees their
-- own tasks on a customer, never a teammate's; update limited to `done`
-- via trigger above
create policy "tasks_select" on tasks for select using (
  user_id = auth.uid()
);
create policy "tasks_insert" on tasks for insert with check (
  user_id = auth.uid()
  and (
    is_admin()
    or exists (
      select 1 from customers c
      where c.id = tasks.customer_id
        and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
    )
  )
);
create policy "tasks_update" on tasks for update using (
  user_id = auth.uid()
);

-- customer_change_log: append-only, inherits customer visibility for insert;
-- select limited to admin (all) / manager (own team) — salesperson can write
-- but not read this log.
create policy "customer_change_log_select" on customer_change_log for select using (
  is_admin()
  or (
    exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
    and exists (
      select 1 from customers c
      where c.id = customer_change_log.customer_id
        and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
    )
  )
);
create policy "customer_change_log_insert" on customer_change_log for insert with check (
  changed_by = auth.uid()
  and (
    is_admin()
    or exists (
      select 1 from customers c
      where c.id = customer_change_log.customer_id
        and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
    )
  )
);

-- deal_closures: append-only, inherits customer visibility (same shape as
-- activities) — visible to the closing assignee, their team, and admin.
create policy "deal_closures_select" on deal_closures for select using (
  is_admin()
  or exists (
    select 1 from customers c
    where c.id = deal_closures.customer_id
      and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
  )
);
create policy "deal_closures_insert" on deal_closures for insert with check (
  user_id = auth.uid()
  and (
    is_admin()
    or exists (
      select 1 from customers c
      where c.id = deal_closures.customer_id
        and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
    )
  )
);

-- removal_requests: select/insert mirror deal_closures (visible to the
-- requester, their team, and admin); update (approve/reject) is
-- ADMIN, or MANAGER scoped to their own team's customers only — a
-- salesperson can never resolve their own request.
create policy "removal_requests_select" on removal_requests for select using (
  is_admin()
  or exists (
    select 1 from customers c
    where c.id = removal_requests.customer_id
      and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
  )
);
drop policy if exists "removal_requests_insert" on removal_requests;
create policy "removal_requests_insert" on removal_requests for insert with check (
  requested_by = auth.uid()
  and exists (
    select 1 from customers c
    where c.id = removal_requests.customer_id
      and (
        (removal_requests.slot = 1 and c.assigned_to = auth.uid())
        or (removal_requests.slot = 2 and c.assigned_to_2 = auth.uid())
        or (removal_requests.slot = 3 and c.assigned_to_3 = auth.uid())
      )
  )
);
create policy "removal_requests_update" on removal_requests for update using (
  is_admin()
  or (
    exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
    and exists (
      select 1 from customers c
      where c.id = removal_requests.customer_id
        and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
    )
  )
);

-- customer_delete_requests: select is admin (all) or the requester (their
-- own submissions' status); insert is a MANAGER on a customer they're
-- already scoped to (is_customer_assignee already resolves to "assignee is
-- on my team"); update (reject, or the delete-side auto-resolve) is admin
-- only -- a manager can never approve their own request.
create policy "customer_delete_requests_select" on customer_delete_requests for select using (
  is_admin() or requested_by = auth.uid()
);
create policy "customer_delete_requests_insert" on customer_delete_requests for insert with check (
  requested_by = auth.uid()
  and exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
  and exists (
    select 1 from customers c
    where c.id = customer_delete_requests.customer_id
      and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
  )
);
create policy "customer_delete_requests_update_admin" on customer_delete_requests for update using (is_admin());

-- sales_targets: admin sets anyone's; manager sets own team's + own; everyone
-- in scope can read (self, own team, or admin sees all)
create policy "sales_targets_select" on sales_targets for select using (
  is_admin()
  or user_id = auth.uid()
  or (
    exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
    and user_id in (select id from profiles where team_id = my_team_id())
  )
);
create policy "sales_targets_insert" on sales_targets for insert with check (
  set_by = auth.uid()
  and (
    is_admin()
    or (
      exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
      and (user_id = auth.uid() or user_id in (select id from profiles where team_id = my_team_id()))
    )
  )
);
create policy "sales_targets_update" on sales_targets for update using (
  is_admin()
  or (
    exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
    and (user_id = auth.uid() or user_id in (select id from profiles where team_id = my_team_id()))
  )
);

-- assignment_events: append-only log of who got assigned what, when.
-- Visible the same way sales_targets is (self, own team, or admin sees
-- all); insertable by whoever can assign a customer in the first place
-- (admin, or manager — same as customers_insert).
create policy "assignment_events_select" on assignment_events for select using (
  is_admin()
  or user_id = auth.uid()
  or (
    exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
    and user_id in (select id from profiles where team_id = my_team_id())
  )
);
create policy "assignment_events_insert" on assignment_events for insert with check (
  is_admin() or exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
);

-- stage_events: logged by whoever moves a stage — the slot's own
-- assignee, same actor as activities_insert (not admin/manager, who
-- don't carry a slot). Visible the same way assignment_events is.
create policy "stage_events_select" on stage_events for select using (
  is_admin()
  or user_id = auth.uid()
  or (
    exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
    and user_id in (select id from profiles where team_id = my_team_id())
  )
);
create policy "stage_events_insert" on stage_events for insert with check (
  is_admin()
  or exists (
    select 1 from customers c
    where c.id = stage_events.customer_id
      and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
  )
);

-- notifications: recipient only; inserted by admin/manager on customer assignment
create policy "notifications_select" on notifications for select using (user_id = auth.uid());
create policy "notifications_insert" on notifications for insert with check (
  is_admin()
  or exists (select 1 from profiles p where p.id = notifications.user_id and p.team_id = my_team_id())
);
create policy "notifications_update" on notifications for update using (user_id = auth.uid());

-- ============================================================
-- Realtime (notifications bell)
-- ============================================================

alter publication supabase_realtime add table notifications;

-- ============================================================
-- Seed: default pipeline stages + teams
-- ============================================================

insert into pipeline_stages (name, "order", is_default) values
  ('New', 1, true),
  ('Contacted', 2, false),
  ('Qualified', 3, false),
  ('Won', 4, false),
  ('Lost', 5, false);

insert into teams (name) values
  ('North Team'),
  ('South Team');

insert into purposes (name) values ('Rent'), ('Buy'), ('Buy/Rent');
insert into firsttime_branch_types (name) values ('First Time'), ('Branch');

insert into mandatory_field_settings (field_key, required) values
  ('phone', true),
  ('assigned_to', true),
  ('source', true),
  ('area', true),
  ('sub_area', true),
  ('property_type', true),
  ('purpose', true),
  ('business_industry', true),
  ('business_category', true),
  ('business_type', true);

-- ============================================================
-- Bootstrap: promote an already-existing auth user to ADMIN.
-- handle_new_user only fires for auth.users rows created AFTER this
-- trigger exists, so a user made before running this file (e.g. the
-- first account you signed up by hand) needs a one-time manual profile.
-- Run this separately, once, per pre-existing account:
--
-- insert into public.profiles (id, name, email, role, team_id, status)
-- select id, 'Hello', email, 'ADMIN', null, 'ACTIVE'
-- from auth.users where email = 'hello@bizlocate.com.my'
-- on conflict (id) do update set role = 'ADMIN', status = 'ACTIVE';

-- ============================================================
-- Migration: Area / Sub-Area management (run once against an
-- already-provisioned database — everything below already exists
-- in the main schema above for fresh installs).
-- ============================================================
--
-- create table areas (
--   id uuid primary key default gen_random_uuid(),
--   name text not null unique
-- );
--
-- create table sub_areas (
--   id uuid primary key default gen_random_uuid(),
--   area_id uuid not null references areas (id) on delete cascade,
--   name text not null,
--   unique (area_id, name)
-- );
--
-- alter table areas enable row level security;
-- alter table sub_areas enable row level security;
--
-- create policy "areas_select" on areas for select using (auth.uid() is not null);
-- create policy "areas_insert_admin" on areas for insert with check (is_admin());
-- create policy "areas_update_admin" on areas for update using (is_admin());
-- create policy "areas_delete_admin" on areas for delete using (is_admin());
--
-- create policy "sub_areas_select" on sub_areas for select using (auth.uid() is not null);
-- create policy "sub_areas_insert_admin" on sub_areas for insert with check (is_admin());
-- create policy "sub_areas_update_admin" on sub_areas for update using (is_admin());
-- create policy "sub_areas_delete_admin" on sub_areas for delete using (is_admin());

-- ============================================================
-- Migration: Business Tag management (run once against an
-- already-provisioned database — everything below already exists
-- in the main schema above for fresh installs).
-- ============================================================
--
-- create table business_tag_industries (
--   id uuid primary key default gen_random_uuid(),
--   name text not null unique
-- );
--
-- create table business_tag_categories (
--   id uuid primary key default gen_random_uuid(),
--   industry_id uuid not null references business_tag_industries (id) on delete cascade,
--   name text not null,
--   unique (industry_id, name)
-- );
--
-- create table business_tag_types (
--   id uuid primary key default gen_random_uuid(),
--   category_id uuid not null references business_tag_categories (id) on delete cascade,
--   name text not null,
--   unique (category_id, name)
-- );
--
-- alter table business_tag_industries enable row level security;
-- alter table business_tag_categories enable row level security;
-- alter table business_tag_types enable row level security;
--
-- create policy "business_tag_industries_select" on business_tag_industries for select using (auth.uid() is not null);
-- create policy "business_tag_industries_insert_admin" on business_tag_industries for insert with check (is_admin());
-- create policy "business_tag_industries_update_admin" on business_tag_industries for update using (is_admin());
-- create policy "business_tag_industries_delete_admin" on business_tag_industries for delete using (is_admin());
--
-- create policy "business_tag_categories_select" on business_tag_categories for select using (auth.uid() is not null);
-- create policy "business_tag_categories_insert_admin" on business_tag_categories for insert with check (is_admin());
-- create policy "business_tag_categories_update_admin" on business_tag_categories for update using (is_admin());
-- create policy "business_tag_categories_delete_admin" on business_tag_categories for delete using (is_admin());
--
-- create policy "business_tag_types_select" on business_tag_types for select using (auth.uid() is not null);
-- create policy "business_tag_types_insert_admin" on business_tag_types for insert with check (is_admin());
-- create policy "business_tag_types_update_admin" on business_tag_types for update using (is_admin());
-- create policy "business_tag_types_delete_admin" on business_tag_types for delete using (is_admin());

-- ============================================================
-- Migration: widen activities.follow_up_date / tasks.due_date to
-- free text (the UI accepts loose text like "2 Aug 2026", not a
-- strict date) — run once against an already-provisioned database.
-- ============================================================
--
-- alter table activities rename column follow_up_date to follow_up;
-- alter table activities alter column follow_up type text;
-- alter table tasks rename column due_date to due;
-- alter table tasks alter column due type text;
-- create or replace function protect_task_columns() returns trigger as $$
-- begin
--   if new.customer_id is distinct from old.customer_id
--     or new.user_id is distinct from old.user_id
--     or new.title is distinct from old.title
--     or new.due is distinct from old.due then
--     raise exception 'tasks can only be updated via the done flag';
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;

-- ============================================================
-- Migration: Customer Business Profile — run once against an
-- already-provisioned database (everything below already exists
-- in the main schema above for fresh installs).
-- ============================================================
--
-- create table lead_sources (
--   id uuid primary key default gen_random_uuid(),
--   name text not null unique
-- );
--
-- create table property_types (
--   id uuid primary key default gen_random_uuid(),
--   name text not null unique
-- );
--
-- create table purposes (
--   id uuid primary key default gen_random_uuid(),
--   name text not null unique
-- );
--
-- create table languages (
--   id uuid primary key default gen_random_uuid(),
--   name text not null unique
-- );
--
-- create table firsttime_branch_types (
--   id uuid primary key default gen_random_uuid(),
--   name text not null unique
-- );
--
-- create table races (
--   id uuid primary key default gen_random_uuid(),
--   name text not null unique
-- );
--
-- create table target_races (
--   id uuid primary key default gen_random_uuid(),
--   name text not null unique
-- );
--
-- create table target_types (
--   id uuid primary key default gen_random_uuid(),
--   name text not null unique
-- );
--
-- alter table customers add column if not exists source_id uuid references lead_sources (id) on delete set null;
-- alter table customers add column if not exists area_id uuid references areas (id) on delete set null;
-- alter table customers add column if not exists sub_area_id uuid references sub_areas (id) on delete set null;
-- alter table customers add column if not exists property_type_id uuid references property_types (id) on delete set null;
-- alter table customers add column if not exists purpose_id uuid references purposes (id) on delete set null;
-- alter table customers add column if not exists business_industry_id uuid references business_tag_industries (id) on delete set null;
-- alter table customers add column if not exists business_category_id uuid references business_tag_categories (id) on delete set null;
-- alter table customers add column if not exists business_type_id uuid references business_tag_types (id) on delete set null;
-- alter table customers add column if not exists race_id uuid references races (id) on delete set null;
-- alter table customers add column if not exists language_id uuid references languages (id) on delete set null;
-- alter table customers add column if not exists business_name text;
-- alter table customers add column if not exists firsttime_branch_id uuid references firsttime_branch_types (id) on delete set null;
-- alter table customers add column if not exists target_race_id uuid references target_races (id) on delete set null;
-- alter table customers add column if not exists target_type_id uuid references target_types (id) on delete set null;
-- alter table customers add column if not exists remark text;
--
-- alter table lead_sources enable row level security;
-- alter table property_types enable row level security;
-- alter table purposes enable row level security;
-- alter table languages enable row level security;
-- alter table firsttime_branch_types enable row level security;
-- alter table races enable row level security;
-- alter table target_races enable row level security;
-- alter table target_types enable row level security;
--
-- create policy "lead_sources_select" on lead_sources for select using (auth.uid() is not null);
-- create policy "lead_sources_insert_admin" on lead_sources for insert with check (is_admin());
-- create policy "lead_sources_update_admin" on lead_sources for update using (is_admin());
-- create policy "lead_sources_delete_admin" on lead_sources for delete using (is_admin());
--
-- create policy "property_types_select" on property_types for select using (auth.uid() is not null);
-- create policy "property_types_insert_admin" on property_types for insert with check (is_admin());
-- create policy "property_types_update_admin" on property_types for update using (is_admin());
-- create policy "property_types_delete_admin" on property_types for delete using (is_admin());
--
-- create policy "purposes_select" on purposes for select using (auth.uid() is not null);
-- create policy "purposes_insert_admin" on purposes for insert with check (is_admin());
-- create policy "purposes_update_admin" on purposes for update using (is_admin());
-- create policy "purposes_delete_admin" on purposes for delete using (is_admin());
--
-- create policy "languages_select" on languages for select using (auth.uid() is not null);
-- create policy "languages_insert_admin" on languages for insert with check (is_admin());
-- create policy "languages_update_admin" on languages for update using (is_admin());
-- create policy "languages_delete_admin" on languages for delete using (is_admin());
--
-- create policy "firsttime_branch_types_select" on firsttime_branch_types for select using (auth.uid() is not null);
-- create policy "firsttime_branch_types_insert_admin" on firsttime_branch_types for insert with check (is_admin());
-- create policy "firsttime_branch_types_update_admin" on firsttime_branch_types for update using (is_admin());
-- create policy "firsttime_branch_types_delete_admin" on firsttime_branch_types for delete using (is_admin());
--
-- create policy "races_select" on races for select using (auth.uid() is not null);
-- create policy "races_insert_admin" on races for insert with check (is_admin());
-- create policy "races_update_admin" on races for update using (is_admin());
-- create policy "races_delete_admin" on races for delete using (is_admin());
--
-- create policy "target_races_select" on target_races for select using (auth.uid() is not null);
-- create policy "target_races_insert_admin" on target_races for insert with check (is_admin());
-- create policy "target_races_update_admin" on target_races for update using (is_admin());
-- create policy "target_races_delete_admin" on target_races for delete using (is_admin());
--
-- create policy "target_types_select" on target_types for select using (auth.uid() is not null);
-- create policy "target_types_insert_admin" on target_types for insert with check (is_admin());
-- create policy "target_types_update_admin" on target_types for update using (is_admin());
-- create policy "target_types_delete_admin" on target_types for delete using (is_admin());
--
-- create or replace function protect_customer_remark_column() returns trigger as $$
-- begin
--   if new.remark is distinct from old.remark and not (
--     is_admin() or exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--   ) then
--     raise exception 'only an admin or manager can change the remark';
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- create trigger customers_protect_remark
--   before update on customers
--   for each row execute function protect_customer_remark_column();
--
-- insert into purposes (name) values ('Rent'), ('Buy'), ('Buy/Rent');
-- insert into firsttime_branch_types (name) values ('First Time'), ('Branch');

-- ============================================================
-- Migration: Mandatory Field Settings — run once against an
-- already-provisioned database (everything below already exists
-- in the main schema above for fresh installs).
-- ============================================================
--
-- create table mandatory_field_settings (
--   field_key text primary key,
--   required boolean not null default true
-- );
--
-- alter table mandatory_field_settings enable row level security;
--
-- create policy "mandatory_field_settings_select" on mandatory_field_settings for select using (auth.uid() is not null);
-- create policy "mandatory_field_settings_update_admin" on mandatory_field_settings for update using (is_admin());
--
-- insert into mandatory_field_settings (field_key, required) values
--   ('phone', true),
--   ('assigned_to', true),
--   ('source', true),
--   ('area', true),
--   ('sub_area', true),
--   ('property_type', true),
--   ('purpose', true),
--   ('business_industry', true),
--   ('business_category', true),
--   ('business_type', true);

-- ============================================================
-- Migration: Budget field — dropdown replaced with a min/max amount
-- range. Run once against an already-provisioned database (everything
-- below already exists in the main schema above for fresh installs).
-- ============================================================
--
-- alter table customers drop column if exists budget_id;
-- drop table if exists budgets;
--
-- alter table customers add column if not exists budget_min numeric;
-- alter table customers add column if not exists budget_max numeric;

-- ============================================================
-- Migration: Multi-assign (up to 3 assignees per customer) — run once
-- against an already-provisioned database (everything below already
-- exists in the main schema above for fresh installs).
-- ============================================================
--
-- alter table customers add column if not exists assigned_to_2 uuid references profiles (id);
-- alter table customers add column if not exists assigned_to_3 uuid references profiles (id);
--
-- create or replace function is_customer_assignee(a1 uuid, a2 uuid, a3 uuid) returns boolean as $$
--   select auth.uid() = a1 or auth.uid() = a2 or auth.uid() = a3
--     or a1 in (select id from profiles where team_id = my_team_id())
--     or a2 in (select id from profiles where team_id = my_team_id())
--     or a3 in (select id from profiles where team_id = my_team_id());
-- $$ language sql security definer stable set search_path = public;
--
-- create or replace function protect_customer_assignment() returns trigger as $$
-- begin
--   if not is_admin() and (
--     new.assigned_to is distinct from old.assigned_to
--     or new.assigned_to_2 is distinct from old.assigned_to_2
--     or new.assigned_to_3 is distinct from old.assigned_to_3
--   ) then
--     raise exception 'only an admin can reassign a customer';
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- drop policy if exists "customers_select" on customers;
-- create policy "customers_select" on customers for select using (
--   is_admin() or is_customer_assignee(assigned_to, assigned_to_2, assigned_to_3)
-- );
-- drop policy if exists "customers_update" on customers;
-- create policy "customers_update" on customers for update using (
--   is_admin() or is_customer_assignee(assigned_to, assigned_to_2, assigned_to_3)
-- );
--
-- drop policy if exists "activities_select" on activities;
-- create policy "activities_select" on activities for select using (
--   is_admin()
--   or exists (
--     select 1 from customers c
--     where c.id = activities.customer_id
--       and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--   )
-- );
-- drop policy if exists "activities_insert" on activities;
-- create policy "activities_insert" on activities for insert with check (
--   is_admin()
--   or exists (
--     select 1 from customers c
--     where c.id = activities.customer_id
--       and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--   )
-- );
--
-- drop policy if exists "tasks_select" on tasks;
-- create policy "tasks_select" on tasks for select using (
--   is_admin()
--   or exists (
--     select 1 from customers c
--     where c.id = tasks.customer_id
--       and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--   )
-- );
-- drop policy if exists "tasks_insert" on tasks;
-- create policy "tasks_insert" on tasks for insert with check (
--   is_admin()
--   or exists (
--     select 1 from customers c
--     where c.id = tasks.customer_id
--       and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--   )
-- );
-- drop policy if exists "tasks_update" on tasks;
-- create policy "tasks_update" on tasks for update using (
--   is_admin()
--   or exists (
--     select 1 from customers c
--     where c.id = tasks.customer_id
--       and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--   )
-- );

-- ============================================================
-- Migration: Customer pool system — active/inactive per assignee slot,
-- dual pool limits, 60-day auto-removal. Run once against an
-- already-provisioned database (everything below already exists in the
-- main schema above for fresh installs).
-- ============================================================
--
-- alter table profiles rename column customer_limit to active_pool_limit;
-- alter table profiles add column if not exists inactive_pool_limit int check (inactive_pool_limit is null or inactive_pool_limit >= 0);
--
-- alter table customers add column if not exists pool_1 text not null default 'ACTIVE' check (pool_1 in ('ACTIVE', 'INACTIVE'));
-- alter table customers add column if not exists pool_2 text check (pool_2 in ('ACTIVE', 'INACTIVE'));
-- alter table customers add column if not exists pool_3 text check (pool_3 in ('ACTIVE', 'INACTIVE'));
-- alter table customers add column if not exists pool_1_since timestamptz;
-- alter table customers add column if not exists pool_2_since timestamptz;
-- alter table customers add column if not exists pool_3_since timestamptz;
-- -- existing rows: slot 2/3 pool stays null unless that slot already has an assignee
-- update customers set pool_2 = 'ACTIVE' where assigned_to_2 is not null and pool_2 is null;
-- update customers set pool_3 = 'ACTIVE' where assigned_to_3 is not null and pool_3 is null;
--
-- create or replace function handle_new_user() returns trigger as $$
-- begin
--   insert into public.profiles (id, name, email, phone, ic, role, team_id, status, active_pool_limit, inactive_pool_limit)
--   values (
--     new.id,
--     coalesce(new.raw_user_meta_data ->> 'name', new.email),
--     new.email,
--     nullif(new.raw_user_meta_data ->> 'phone', ''),
--     nullif(new.raw_user_meta_data ->> 'ic', ''),
--     coalesce(new.raw_user_meta_data ->> 'role', 'SALESPERSON'),
--     nullif(new.raw_user_meta_data ->> 'team_id', '')::uuid,
--     'ACTIVE',
--     nullif(new.raw_user_meta_data ->> 'active_pool_limit', '')::int,
--     nullif(new.raw_user_meta_data ->> 'inactive_pool_limit', '')::int
--   );
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- create or replace function protect_profile_columns() returns trigger as $$
-- begin
--   if not is_admin() and (
--     new.role is distinct from old.role
--     or new.team_id is distinct from old.team_id
--     or new.status is distinct from old.status
--     or new.active_pool_limit is distinct from old.active_pool_limit
--     or new.inactive_pool_limit is distinct from old.inactive_pool_limit
--   ) then
--     raise exception 'only an admin can change role, team, status, or pool limits';
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- create or replace function protect_customer_assignment() returns trigger as $$
-- begin
--   if not is_admin() and (
--     new.assigned_to is distinct from old.assigned_to
--     or (
--       new.assigned_to_2 is distinct from old.assigned_to_2
--       and not (new.assigned_to_2 is null and old.assigned_to_2 = auth.uid())
--     )
--     or (
--       new.assigned_to_3 is distinct from old.assigned_to_3
--       and not (new.assigned_to_3 is null and old.assigned_to_3 = auth.uid())
--     )
--   ) then
--     raise exception 'only an admin can reassign a customer';
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- create or replace function protect_pool_columns() returns trigger as $$
-- begin
--   if not is_admin() and new.pool_1 is distinct from old.pool_1 and auth.uid() is distinct from old.assigned_to then
--     raise exception 'only the assignee or an admin can change this pool status';
--   end if;
--   if not is_admin() and new.pool_2 is distinct from old.pool_2 and auth.uid() is distinct from old.assigned_to_2 then
--     raise exception 'only the assignee or an admin can change this pool status';
--   end if;
--   if not is_admin() and new.pool_3 is distinct from old.pool_3 and auth.uid() is distinct from old.assigned_to_3 then
--     raise exception 'only the assignee or an admin can change this pool status';
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- drop trigger if exists customers_protect_pool on customers;
-- create trigger customers_protect_pool
--   before update on customers
--   for each row execute function protect_pool_columns();

-- ============================================================
-- Migration: customers.updated_at (auto-touched on every update),
-- for Created Date / Last Updated columns in the customer list —
-- run once against an already-provisioned database (everything
-- below already exists in the main schema above for fresh installs).
-- ============================================================
--
-- alter table customers add column if not exists updated_at timestamptz not null default now();
--
-- create or replace function touch_customer_updated_at() returns trigger as $$
-- begin
--   new.updated_at = now();
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- drop trigger if exists customers_touch_updated_at on customers;
-- create trigger customers_touch_updated_at
--   before update on customers
--   for each row execute function touch_customer_updated_at();

-- ============================================================
-- Migration: Assigned 1 (slot 1) becomes optional — a customer can have
-- no assignee at all, same as slots 2/3. Run once against an
-- already-provisioned database (everything below already exists in the
-- main schema above for fresh installs).
-- ============================================================
--
-- alter table customers alter column assigned_to drop not null;
-- alter table customers alter column pool_1 drop not null;
-- alter table customers alter column pool_1 drop default;
--
-- create or replace function protect_customer_assignment() returns trigger as $$
-- begin
--   if not is_admin() and (
--     (
--       new.assigned_to is distinct from old.assigned_to
--       and not (new.assigned_to is null and old.assigned_to = auth.uid())
--     )
--     or (
--       new.assigned_to_2 is distinct from old.assigned_to_2
--       and not (new.assigned_to_2 is null and old.assigned_to_2 = auth.uid())
--     )
--     or (
--       new.assigned_to_3 is distinct from old.assigned_to_3
--       and not (new.assigned_to_3 is null and old.assigned_to_3 = auth.uid())
--     )
--   ) then
--     raise exception 'only an admin can reassign a customer';
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;

-- ============================================================
-- Migration: Customer identity edit lock + change log — run once
-- against an already-provisioned database (everything below already
-- exists in the main schema above for fresh installs).
-- ============================================================
--
-- create table customer_change_log (
--   id uuid primary key default gen_random_uuid(),
--   customer_id uuid not null references customers (id) on delete cascade,
--   changed_by uuid not null references profiles (id),
--   field_key text not null,
--   old_value text,
--   new_value text,
--   created_at timestamptz not null default now()
-- );
--
-- alter table customer_change_log enable row level security;
--
-- create policy "customer_change_log_select" on customer_change_log for select using (
--   is_admin()
--   or (
--     exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--     and exists (
--       select 1 from customers c
--       where c.id = customer_change_log.customer_id
--         and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--     )
--   )
-- );
-- create policy "customer_change_log_insert" on customer_change_log for insert with check (
--   changed_by = auth.uid()
--   and (
--     is_admin()
--     or exists (
--       select 1 from customers c
--       where c.id = customer_change_log.customer_id
--         and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--     )
--   )
-- );
--
-- create or replace function protect_customer_remark_column() returns trigger as $$
-- begin
--   if (
--     new.remark is distinct from old.remark
--     or new.name is distinct from old.name
--     or new.phone is distinct from old.phone
--   ) and not (
--     is_admin() or exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--   ) then
--     raise exception 'only an admin or manager can change the name, phone, or remark';
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;

-- ============================================================
-- Migration: Auto second-assignment — run once against an
-- already-provisioned database (everything below already exists in
-- the main schema above for fresh installs).
-- ============================================================
--
-- alter table areas add column if not exists team_id uuid references teams (id) on delete set null;
-- alter table teams add column if not exists last_auto_assigned_user_id uuid references profiles (id) on delete set null;

-- ============================================================
-- Migration: Pipeline stage rework (per-slot stage, requires_amount,
-- deal_closures) — run once against an already-provisioned database
-- (everything below already exists in the main schema above for fresh
-- installs).
-- ============================================================
--
-- alter table customers add column if not exists stage_1 uuid references pipeline_stages (id);
-- alter table customers add column if not exists stage_2 uuid references pipeline_stages (id);
-- alter table customers add column if not exists stage_3 uuid references pipeline_stages (id);
-- update customers set stage_1 = stage_id where assigned_to is not null and stage_1 is null;
-- update customers set stage_2 = stage_id where assigned_to_2 is not null and stage_2 is null;
-- update customers set stage_3 = stage_id where assigned_to_3 is not null and stage_3 is null;
-- alter table customers drop column if exists stage_id;
--
-- alter table pipeline_stages add column if not exists requires_amount boolean not null default false;
--
-- create table deal_closures (
--   id uuid primary key default gen_random_uuid(),
--   customer_id uuid not null references customers (id) on delete cascade,
--   user_id uuid not null references profiles (id),
--   slot smallint not null check (slot in (1, 2, 3)),
--   stage_id uuid not null references pipeline_stages (id),
--   amount numeric not null,
--   created_at timestamptz not null default now()
-- );
--
-- alter table deal_closures enable row level security;
--
-- create policy "deal_closures_select" on deal_closures for select using (
--   is_admin()
--   or exists (
--     select 1 from customers c
--     where c.id = deal_closures.customer_id
--       and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--   )
-- );
-- create policy "deal_closures_insert" on deal_closures for insert with check (
--   user_id = auth.uid()
--   and (
--     is_admin()
--     or exists (
--       select 1 from customers c
--       where c.id = deal_closures.customer_id
--         and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--     )
--   )
-- );

-- ============================================================
-- Migration: Remove client approval workflow — run once against an
-- already-provisioned database (everything below already exists in
-- the main schema above for fresh installs).
-- ============================================================
--
-- create table removal_reasons (
--   id uuid primary key default gen_random_uuid(),
--   name text not null unique
-- );
--
-- create table removal_requests (
--   id uuid primary key default gen_random_uuid(),
--   customer_id uuid not null references customers (id) on delete cascade,
--   slot smallint not null check (slot in (1, 2, 3)),
--   requested_by uuid not null references profiles (id),
--   reason_id uuid not null references removal_reasons (id),
--   status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
--   resolved_by uuid references profiles (id),
--   resolved_at timestamptz,
--   created_at timestamptz not null default now()
-- );
--
-- create unique index removal_requests_one_pending on removal_requests (customer_id, slot) where status = 'PENDING';
--
-- alter table removal_reasons enable row level security;
-- alter table removal_requests enable row level security;
--
-- create policy "removal_reasons_select" on removal_reasons for select using (auth.uid() is not null);
-- create policy "removal_reasons_insert_admin" on removal_reasons for insert with check (is_admin());
-- create policy "removal_reasons_update_admin" on removal_reasons for update using (is_admin());
-- create policy "removal_reasons_delete_admin" on removal_reasons for delete using (is_admin());
--
-- create policy "removal_requests_select" on removal_requests for select using (
--   is_admin()
--   or exists (
--     select 1 from customers c
--     where c.id = removal_requests.customer_id
--       and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--   )
-- );
-- create policy "removal_requests_insert" on removal_requests for insert with check (
--   requested_by = auth.uid()
--   and exists (
--     select 1 from customers c
--     where c.id = removal_requests.customer_id
--       and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--   )
-- );
-- create policy "removal_requests_update" on removal_requests for update using (
--   is_admin()
--   or (
--     exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--     and exists (
--       select 1 from customers c
--       where c.id = removal_requests.customer_id
--         and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--     )
--   )
-- );

-- ============================================================
-- Migration: Remove client approval workflow — manager team-clearing
-- fix. Run once against an already-provisioned database that already
-- ran the "Remove client approval workflow" migration above (this
-- block corrects a gap found after that one shipped: the pre-existing
-- protect_customer_assignment/protect_pool_columns triggers didn't
-- allow a MANAGER to clear a team member's slot, and
-- removal_requests_insert didn't check the specific slot).
-- ============================================================
--
-- create or replace function protect_customer_assignment() returns trigger as $$
-- begin
--   if not is_admin() and (
--     (
--       new.assigned_to is distinct from old.assigned_to
--       and not (
--         new.assigned_to is null
--         and (
--           old.assigned_to = auth.uid()
--           or (
--             exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--             and old.assigned_to in (select id from profiles where team_id = my_team_id())
--           )
--         )
--       )
--     )
--     or (
--       new.assigned_to_2 is distinct from old.assigned_to_2
--       and not (
--         new.assigned_to_2 is null
--         and (
--           old.assigned_to_2 = auth.uid()
--           or (
--             exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--             and old.assigned_to_2 in (select id from profiles where team_id = my_team_id())
--           )
--         )
--       )
--     )
--     or (
--       new.assigned_to_3 is distinct from old.assigned_to_3
--       and not (
--         new.assigned_to_3 is null
--         and (
--           old.assigned_to_3 = auth.uid()
--           or (
--             exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--             and old.assigned_to_3 in (select id from profiles where team_id = my_team_id())
--           )
--         )
--       )
--     )
--   ) then
--     raise exception 'only an admin can reassign a customer';
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- create or replace function protect_pool_columns() returns trigger as $$
-- begin
--   if not is_admin()
--     and new.pool_1 is distinct from old.pool_1
--     and auth.uid() is distinct from old.assigned_to
--     and not (
--       exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--       and old.assigned_to in (select id from profiles where team_id = my_team_id())
--     )
--   then
--     raise exception 'only the assignee or an admin can change this pool status';
--   end if;
--   if not is_admin()
--     and new.pool_2 is distinct from old.pool_2
--     and auth.uid() is distinct from old.assigned_to_2
--     and not (
--       exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--       and old.assigned_to_2 in (select id from profiles where team_id = my_team_id())
--     )
--   then
--     raise exception 'only the assignee or an admin can change this pool status';
--   end if;
--   if not is_admin()
--     and new.pool_3 is distinct from old.pool_3
--     and auth.uid() is distinct from old.assigned_to_3
--     and not (
--       exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--       and old.assigned_to_3 in (select id from profiles where team_id = my_team_id())
--     )
--   then
--     raise exception 'only the assignee or an admin can change this pool status';
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- drop policy if exists "removal_requests_insert" on removal_requests;
-- create policy "removal_requests_insert" on removal_requests for insert with check (
--   requested_by = auth.uid()
--   and exists (
--     select 1 from customers c
--     where c.id = removal_requests.customer_id
--       and (
--         (removal_requests.slot = 1 and c.assigned_to = auth.uid())
--         or (removal_requests.slot = 2 and c.assigned_to_2 = auth.uid())
--         or (removal_requests.slot = 3 and c.assigned_to_3 = auth.uid())
--       )
--   )
-- );

-- ============================================================
-- Migration: Manager can assign customers (not just clear their own
-- team's slots) — run once against an already-provisioned database
-- (everything below already exists in the main schema above for fresh
-- installs).
-- ============================================================
--
-- create or replace function protect_customer_assignment() returns trigger as $$
-- declare
--   is_mgr boolean := exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER');
-- begin
--   if not is_admin() and (
--     (
--       new.assigned_to is distinct from old.assigned_to
--       and not (
--         (new.assigned_to is null and old.assigned_to = auth.uid())
--         or (
--           is_mgr
--           and (old.assigned_to is null or old.assigned_to in (select id from profiles where team_id = my_team_id()))
--           and (new.assigned_to is null or new.assigned_to in (select id from profiles where team_id = my_team_id()))
--         )
--       )
--     )
--     or (
--       new.assigned_to_2 is distinct from old.assigned_to_2
--       and not (
--         (new.assigned_to_2 is null and old.assigned_to_2 = auth.uid())
--         or (
--           is_mgr
--           and (old.assigned_to_2 is null or old.assigned_to_2 in (select id from profiles where team_id = my_team_id()))
--           and (new.assigned_to_2 is null or new.assigned_to_2 in (select id from profiles where team_id = my_team_id()))
--         )
--       )
--     )
--     or (
--       new.assigned_to_3 is distinct from old.assigned_to_3
--       and not (
--         (new.assigned_to_3 is null and old.assigned_to_3 = auth.uid())
--         or (
--           is_mgr
--           and (old.assigned_to_3 is null or old.assigned_to_3 in (select id from profiles where team_id = my_team_id()))
--           and (new.assigned_to_3 is null or new.assigned_to_3 in (select id from profiles where team_id = my_team_id()))
--         )
--       )
--     )
--   ) then
--     raise exception 'only an admin can reassign a customer';
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;

-- ============================================================
-- Migration: activities_delete policy — admin/manager can permanently
-- delete a removed assignee's activity log for a customer. Run once
-- against an already-provisioned database (everything below already
-- exists in the main schema above for fresh installs).
-- ============================================================
--
-- create policy "activities_delete" on activities for delete using (
--   is_admin()
--   or (
--     exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--     and exists (
--       select 1 from customers c
--       where c.id = activities.customer_id
--         and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--     )
--   )
-- );

-- ============================================================
-- Migration: sales_targets table (monthly $ target per user) — run once
-- against an already-provisioned database (everything below already
-- exists in the main schema above for fresh installs).
-- ============================================================
--
-- create table sales_targets (
--   id uuid primary key default gen_random_uuid(),
--   user_id uuid not null references profiles(id) on delete cascade,
--   year_month text not null,
--   amount numeric not null check (amount >= 0),
--   set_by uuid not null references profiles(id),
--   created_at timestamptz not null default now(),
--   updated_at timestamptz not null default now(),
--   unique (user_id, year_month)
-- );
--
-- alter table sales_targets enable row level security;
--
-- create policy "sales_targets_select" on sales_targets for select using (
--   is_admin()
--   or user_id = auth.uid()
--   or (
--     exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--     and user_id in (select id from profiles where team_id = my_team_id())
--   )
-- );
-- create policy "sales_targets_insert" on sales_targets for insert with check (
--   set_by = auth.uid()
--   and (
--     is_admin()
--     or (
--       exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--       and (user_id = auth.uid() or user_id in (select id from profiles where team_id = my_team_id()))
--     )
--   )
-- );
-- create policy "sales_targets_update" on sales_targets for update using (
--   is_admin()
--   or (
--     exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--     and (user_id = auth.uid() or user_id in (select id from profiles where team_id = my_team_id()))
--   )
-- );

-- ============================================================
-- Migration: assignment_events table (per-assignment log for the
-- "assigned N customers this month" dashboard report) — run once against
-- an already-provisioned database (everything below already exists in
-- the main schema above for fresh installs).
-- ============================================================
--
-- create table assignment_events (
--   id uuid primary key default gen_random_uuid(),
--   customer_id uuid not null references customers(id) on delete cascade,
--   user_id uuid not null references profiles(id),
--   slot smallint not null check (slot in (1, 2, 3)),
--   created_at timestamptz not null default now()
-- );
--
-- alter table assignment_events enable row level security;
--
-- create policy "assignment_events_select" on assignment_events for select using (
--   is_admin()
--   or user_id = auth.uid()
--   or (
--     exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--     and user_id in (select id from profiles where team_id = my_team_id())
--   )
-- );
-- create policy "assignment_events_insert" on assignment_events for insert with check (
--   is_admin() or exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
-- );

-- ============================================================
-- Migration: stage_events table (per-stage-change log so dashboard
-- reports can measure duration between two stages, e.g. assign ->
-- Appointment). Run once against an already-provisioned database
-- (everything below already exists in the main schema above for fresh
-- installs). Only forward-looking — no historical backfill.
-- ============================================================
--
-- create table stage_events (
--   id uuid primary key default gen_random_uuid(),
--   customer_id uuid not null references customers(id) on delete cascade,
--   user_id uuid not null references profiles(id),
--   slot smallint not null check (slot in (1, 2, 3)),
--   stage_id uuid not null references pipeline_stages(id),
--   created_at timestamptz not null default now()
-- );
--
-- alter table stage_events enable row level security;
--
-- create policy "stage_events_select" on stage_events for select using (
--   is_admin()
--   or user_id = auth.uid()
--   or (
--     exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--     and user_id in (select id from profiles where team_id = my_team_id())
--   )
-- );
-- create policy "stage_events_insert" on stage_events for insert with check (
--   is_admin()
--   or exists (
--     select 1 from customers c
--     where c.id = stage_events.customer_id
--       and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--   )
-- );

-- ============================================================
-- Migration: editable activity log — the author can edit their own log
-- entry's content, which re-dates it to now. Run once against an
-- already-provisioned database (everything below already exists in the
-- main schema above for fresh installs).
-- ============================================================
--
-- create function protect_activity_columns() returns trigger as $$
-- begin
--   if new.customer_id is distinct from old.customer_id
--     or new.user_id is distinct from old.user_id
--     or new.type is distinct from old.type
--     or new.follow_up is distinct from old.follow_up then
--     raise exception 'activities can only be updated via content (and created_at, to re-date it)';
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- create trigger activities_protect_columns
--   before update on activities
--   for each row execute function protect_activity_columns();
--
-- create policy "activities_update" on activities for update using (
--   user_id = auth.uid()
-- );

-- ============================================================
-- Migration: private tasks — each user only sees their own tasks on a
-- customer (previously anyone who could see the customer saw everyone's
-- tasks). Run once against an already-provisioned database (everything
-- below already exists in the main schema above for fresh installs).
-- ============================================================
--
-- drop policy if exists "tasks_select" on tasks;
-- create policy "tasks_select" on tasks for select using (
--   user_id = auth.uid()
-- );
--
-- drop policy if exists "tasks_insert" on tasks;
-- create policy "tasks_insert" on tasks for insert with check (
--   user_id = auth.uid()
--   and (
--     is_admin()
--     or exists (
--       select 1 from customers c
--       where c.id = tasks.customer_id
--         and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--     )
--   )
-- );
--
-- drop policy if exists "tasks_update" on tasks;
-- create policy "tasks_update" on tasks for update using (
--   user_id = auth.uid()
-- );

-- ============================================================
-- Migration: optional phone — a second, non-mandatory phone number on
-- the business profile. Run once against an already-provisioned
-- database (everything below already exists in the main schema above
-- for fresh installs).
-- ============================================================
--
-- alter table customers add column if not exists optional_phone text;

-- ============================================================
-- Migration: Auto second-assignment refinements — area on/off switch,
-- stage-gated timing. Run once against an already-provisioned database
-- (everything below already exists in the main schema above for fresh
-- installs).
-- ============================================================
--
-- alter table areas add column if not exists auto_assign_enabled boolean not null default true;
-- alter table pipeline_stages add column if not exists exclude_from_auto_assign boolean not null default false;

-- ============================================================
-- Migration: Retargeting Blasting — manager requests a batch of old-
-- customer leads per team member by criteria, admin approves with a
-- quantity cap, salesperson gets a self-expiring phone/name list drip-fed
-- in batches of 50, then can request their manager assign responders back
-- to them. Run once against an already-provisioned database.
-- ============================================================
--
-- create table blast_requests (
--   id uuid primary key default gen_random_uuid(),
--   requested_by uuid not null references profiles (id) on delete cascade,
--   salesperson_id uuid references profiles (id) on delete set null,
--   business_name_keyword text,
--   area_id uuid references areas (id),
--   sub_area_id uuid references sub_areas (id),
--   business_industry_id uuid references business_tag_industries (id),
--   business_category_id uuid references business_tag_categories (id),
--   business_type_id uuid references business_tag_types (id),
--   created_from date,
--   created_to date,
--   status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
--   approved_total int check (approved_total is null or approved_total >= 0),
--   locked_expiry_days int check (locked_expiry_days is null or locked_expiry_days >= 0),
--   resolved_by uuid references profiles (id) on delete set null,
--   resolved_at timestamptz,
--   created_at timestamptz not null default now()
-- );
--
-- create table blast_items (
--   id uuid primary key default gen_random_uuid(),
--   blast_request_id uuid not null references blast_requests (id) on delete cascade,
--   customer_id uuid not null references customers (id) on delete cascade,
--   batch_index int not null check (batch_index >= 1),
--   unlocked_at timestamptz,
--   status text not null default 'PENDING' check (status in ('PENDING', 'DONE', 'EXPIRED')),
--   remark text,
--   done_at timestamptz,
--   created_at timestamptz not null default now(),
--   unique (blast_request_id, customer_id)
-- );
--
-- create table blast_claim_requests (
--   id uuid primary key default gen_random_uuid(),
--   requested_by uuid not null references profiles (id) on delete cascade,
--   customer_ids uuid[] not null,
--   status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
--   resolved_by uuid references profiles (id) on delete set null,
--   resolved_at timestamptz,
--   created_at timestamptz not null default now()
-- );
--
-- alter table blast_requests enable row level security;
-- alter table blast_items enable row level security;
-- alter table blast_claim_requests enable row level security;
--
-- -- blast_requests: admin approves/rejects everything; a manager sees and
-- -- submits only for their own team's salespeople; the salesperson can see
-- -- (but never write) their own requests.
-- create policy "blast_requests_select" on blast_requests for select using (
--   is_admin() or requested_by = auth.uid() or salesperson_id = auth.uid()
-- );
-- create policy "blast_requests_insert" on blast_requests for insert with check (
--   requested_by = auth.uid()
--   and exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--   and exists (select 1 from profiles sp where sp.id = blast_requests.salesperson_id and sp.team_id = my_team_id())
-- );
-- create policy "blast_requests_update_admin" on blast_requests for update using (is_admin());
--
-- -- blast_items: visible/writable by admin (approval draw + the sweep) or
-- -- the salesperson the parent request targets (their own remark/done
-- -- marking). A manager has no direct access -- they only ever see
-- -- aggregate status via blast_requests.
-- create policy "blast_items_select" on blast_items for select using (
--   is_admin()
--   or exists (
--     select 1 from blast_requests br
--     where br.id = blast_items.blast_request_id and br.salesperson_id = auth.uid()
--   )
-- );
-- create policy "blast_items_insert_admin" on blast_items for insert with check (is_admin());
-- create policy "blast_items_update" on blast_items for update using (
--   is_admin()
--   or exists (
--     select 1 from blast_requests br
--     where br.id = blast_items.blast_request_id and br.salesperson_id = auth.uid()
--   )
-- );
--
-- -- blast_claim_requests: the salesperson sees/submits their own; approval
-- -- is the requester's own manager only -- deliberately not is_admin(),
-- -- per the design spec ("admin does not see or act on claim requests").
-- create policy "blast_claim_requests_select" on blast_claim_requests for select using (
--   is_admin()
--   or requested_by = auth.uid()
--   or exists (
--     select 1 from profiles me
--     join profiles req on req.team_id = me.team_id
--     where me.id = auth.uid() and me.role = 'MANAGER' and req.id = blast_claim_requests.requested_by
--   )
-- );
-- create policy "blast_claim_requests_insert" on blast_claim_requests for insert with check (
--   requested_by = auth.uid()
-- );
-- create policy "blast_claim_requests_update" on blast_claim_requests for update using (
--   exists (
--     select 1 from profiles me
--     join profiles req on req.team_id = me.team_id
--     where me.id = auth.uid() and me.role = 'MANAGER' and req.id = blast_claim_requests.requested_by
--   )
-- );

-- ============================================================
-- Migration: Realtime sync — add every table the client keeps
-- live in lib/store.tsx to the Realtime publication (notifications
-- was already added; this covers the other 30 state-backed tables).
-- ============================================================
--
-- alter publication supabase_realtime add table
--   profiles, teams, areas, sub_areas,
--   business_tag_industries, business_tag_categories, business_tag_types,
--   lead_sources, property_types, purposes, languages, firsttime_branch_types,
--   races, target_races, target_types, removal_reasons,
--   mandatory_field_settings, pipeline_stages,
--   customers, activities, customer_change_log, deal_closures, sales_targets,
--   assignment_events, stage_events,
--   removal_requests, blast_requests, blast_items, blast_claim_requests,
--   tasks, customer_delete_requests;

-- ============================================================
-- Migration: Single session per login — profiles.session_token
-- lets a fresh login invalidate any other session already active
-- for that account (see docs/superpowers/specs/2026-09-07-single-session-login-design.md).
-- ============================================================
--
-- alter table profiles add column if not exists session_token uuid;

-- ============================================================
-- Migration: Blast request created-date range — manager can restrict
-- a blast request to customers created within [created_from, created_to]
-- (either end optional), on top of the existing criteria.
-- ============================================================
--
-- alter table blast_requests add column if not exists created_from date;
-- alter table blast_requests add column if not exists created_to date;

-- ============================================================
-- Migration: Customer delete requests — a MANAGER requests a customer be
-- deleted; an ADMIN approves by opening the customer's profile and using
-- the existing (admin-only) Delete button, which resolves the matching
-- PENDING row to APPROVED as part of the same delete. Run once against an
-- already-provisioned database.
-- ============================================================
--
-- create table customer_delete_requests (
--   id uuid primary key default gen_random_uuid(),
--   customer_id uuid references customers (id) on delete set null,
--   customer_name text not null,
--   business_name text,
--   requested_by uuid not null references profiles (id),
--   status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
--   resolved_by uuid references profiles (id),
--   resolved_at timestamptz,
--   created_at timestamptz not null default now()
-- );
--
-- create unique index customer_delete_requests_one_pending on customer_delete_requests (customer_id) where status = 'PENDING';
--
-- alter table customer_delete_requests enable row level security;
--
-- create policy "customer_delete_requests_select" on customer_delete_requests for select using (
--   is_admin() or requested_by = auth.uid()
-- );
-- create policy "customer_delete_requests_insert" on customer_delete_requests for insert with check (
--   requested_by = auth.uid()
--   and exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--   and exists (
--     select 1 from customers c
--     where c.id = customer_delete_requests.customer_id
--       and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--   )
-- );
-- create policy "customer_delete_requests_update_admin" on customer_delete_requests for update using (is_admin());
--
-- alter publication supabase_realtime add table customer_delete_requests;

-- ============================================================
-- Migration: Fix "admin can't delete a user" -- every FK below pointed at
-- profiles(id) with no ON DELETE action (Postgres default NO ACTION), so
-- deleting a user with any history at all (an assigned customer, a logged
-- activity, a closed deal...) was blocked by a foreign-key violation.
-- See docs/superpowers/specs/2026-09-09-user-delete-fk-cleanup-design.md
-- for which columns cascade vs go null vs (customer_change_log) keep a
-- permanent text snapshot, and why. Run once against an already-
-- provisioned database.
-- ============================================================
--
-- alter table customers drop constraint if exists customers_assigned_to_fkey;
-- alter table customers add constraint customers_assigned_to_fkey foreign key (assigned_to) references profiles (id) on delete set null;
-- alter table customers drop constraint if exists customers_assigned_to_2_fkey;
-- alter table customers add constraint customers_assigned_to_2_fkey foreign key (assigned_to_2) references profiles (id) on delete set null;
-- alter table customers drop constraint if exists customers_assigned_to_3_fkey;
-- alter table customers add constraint customers_assigned_to_3_fkey foreign key (assigned_to_3) references profiles (id) on delete set null;
-- alter table customers drop constraint if exists customers_created_by_fkey;
-- alter table customers add constraint customers_created_by_fkey foreign key (created_by) references profiles (id) on delete set null;
--
-- alter table activities drop constraint if exists activities_user_id_fkey;
-- alter table activities add constraint activities_user_id_fkey foreign key (user_id) references profiles (id) on delete cascade;
--
-- alter table tasks drop constraint if exists tasks_user_id_fkey;
-- alter table tasks add constraint tasks_user_id_fkey foreign key (user_id) references profiles (id) on delete cascade;
--
-- alter table deal_closures alter column user_id drop not null;
-- alter table deal_closures drop constraint if exists deal_closures_user_id_fkey;
-- alter table deal_closures add constraint deal_closures_user_id_fkey foreign key (user_id) references profiles (id) on delete set null;
--
-- alter table assignment_events alter column user_id drop not null;
-- alter table assignment_events drop constraint if exists assignment_events_user_id_fkey;
-- alter table assignment_events add constraint assignment_events_user_id_fkey foreign key (user_id) references profiles (id) on delete set null;
--
-- alter table stage_events alter column user_id drop not null;
-- alter table stage_events drop constraint if exists stage_events_user_id_fkey;
-- alter table stage_events add constraint stage_events_user_id_fkey foreign key (user_id) references profiles (id) on delete set null;
--
-- alter table sales_targets alter column set_by drop not null;
-- alter table sales_targets drop constraint if exists sales_targets_set_by_fkey;
-- alter table sales_targets add constraint sales_targets_set_by_fkey foreign key (set_by) references profiles (id) on delete set null;
--
-- alter table removal_requests drop constraint if exists removal_requests_requested_by_fkey;
-- alter table removal_requests add constraint removal_requests_requested_by_fkey foreign key (requested_by) references profiles (id) on delete cascade;
-- alter table removal_requests drop constraint if exists removal_requests_resolved_by_fkey;
-- alter table removal_requests add constraint removal_requests_resolved_by_fkey foreign key (resolved_by) references profiles (id) on delete set null;
--
-- alter table customer_delete_requests alter column requested_by drop not null;
-- alter table customer_delete_requests drop constraint if exists customer_delete_requests_requested_by_fkey;
-- alter table customer_delete_requests add constraint customer_delete_requests_requested_by_fkey foreign key (requested_by) references profiles (id) on delete set null;
-- alter table customer_delete_requests drop constraint if exists customer_delete_requests_resolved_by_fkey;
-- alter table customer_delete_requests add constraint customer_delete_requests_resolved_by_fkey foreign key (resolved_by) references profiles (id) on delete set null;
--
-- alter table blast_requests drop constraint if exists blast_requests_requested_by_fkey;
-- alter table blast_requests add constraint blast_requests_requested_by_fkey foreign key (requested_by) references profiles (id) on delete cascade;
-- alter table blast_requests alter column salesperson_id drop not null;
-- alter table blast_requests drop constraint if exists blast_requests_salesperson_id_fkey;
-- alter table blast_requests add constraint blast_requests_salesperson_id_fkey foreign key (salesperson_id) references profiles (id) on delete set null;
-- alter table blast_requests drop constraint if exists blast_requests_resolved_by_fkey;
-- alter table blast_requests add constraint blast_requests_resolved_by_fkey foreign key (resolved_by) references profiles (id) on delete set null;
--
-- alter table blast_claim_requests drop constraint if exists blast_claim_requests_requested_by_fkey;
-- alter table blast_claim_requests add constraint blast_claim_requests_requested_by_fkey foreign key (requested_by) references profiles (id) on delete cascade;
-- alter table blast_claim_requests drop constraint if exists blast_claim_requests_resolved_by_fkey;
-- alter table blast_claim_requests add constraint blast_claim_requests_resolved_by_fkey foreign key (resolved_by) references profiles (id) on delete set null;
--
-- -- customer_change_log: permanent text snapshot of the author's name, so
-- -- Change History keeps showing it after changed_by goes null.
-- alter table customer_change_log add column if not exists changed_by_name text;
-- update customer_change_log set changed_by_name = coalesce((select name from profiles where profiles.id = customer_change_log.changed_by), 'Unknown') where changed_by_name is null;
-- alter table customer_change_log alter column changed_by_name set not null;
-- alter table customer_change_log alter column changed_by drop not null;
-- alter table customer_change_log drop constraint if exists customer_change_log_changed_by_fkey;
-- alter table customer_change_log add constraint customer_change_log_changed_by_fkey foreign key (changed_by) references profiles (id) on delete set null;
--
-- -- If any "drop constraint" above errors with "constraint does not
-- -- exist", the auto-generated name guess was wrong for that column --
-- -- find the real one with:
-- -- select conname from pg_constraint where conrelid = '<table>'::regclass and contype = 'f';

-- ============================================================
-- Migration: Area <-> Team many-to-many  -  run once against an
-- already-provisioned database (everything below already exists in
-- the main schema above for fresh installs). Order matters: back-fill
-- area_teams from areas.team_id BEFORE dropping that column.
-- See docs/superpowers/specs/2026-09-14-area-team-many-to-many-design.md
-- ============================================================
--
-- create table area_teams (
--   area_id uuid not null references areas (id) on delete cascade,
--   team_id uuid not null references teams (id) on delete cascade,
--   primary key (area_id, team_id)
-- );
-- alter table area_teams enable row level security;
-- create policy "area_teams_select" on area_teams for select using (auth.uid() is not null);
-- create policy "area_teams_insert_admin" on area_teams for insert with check (is_admin());
-- create policy "area_teams_delete_admin" on area_teams for delete using (is_admin());
-- alter publication supabase_realtime add table area_teams;
--
-- insert into area_teams (area_id, team_id)
--   select id, team_id from areas where team_id is not null;
--
-- alter table areas add column if not exists last_auto_assigned_user_id uuid references profiles (id) on delete set null;
--
-- alter table areas drop column if exists team_id;
-- alter table teams drop column if exists last_auto_assigned_user_id;

-- ============================================================
-- Migration: Auto second-assign eligibility fix — legacy customers
-- (created_by IS NULL) are permanently excluded from auto 2nd-assign
-- (no schema change, customers.created_by already exists — this is a
-- code-only change), and areas gain auto_assign_resumed_at so a customer
-- whose 7/14-day window elapsed while the area's auto-assign was off is
-- never auto-caught-up once the area reopens. Run once against an
-- already-provisioned database (everything below already exists in the
-- main schema above for fresh installs).
-- See docs/superpowers/specs/2026-09-21-auto-second-assign-eligibility-fix-design.md
-- ============================================================
--
-- alter table areas add column if not exists auto_assign_resumed_at timestamptz not null default now();

-- ============================================================
-- Migration: let service-role connections (auth.uid() is null) past the
-- customer assignment/pool protection triggers, so the auto-second-assign
-- background sweep (netlify/functions/sweep-auto-assign.mts, using the
-- service-role client) can actually write assigned_to_2/pool_2. A real
-- browser session's auth.uid() is never null, so this does not change
-- behavior for any existing admin/manager/salesperson caller. Run once
-- against an already-provisioned database (everything below already
-- exists in the main schema above for fresh installs).
-- See docs/superpowers/specs/2026-09-21-auto-second-assign-background-sweep-design.md
-- ============================================================
--
-- create or replace function protect_customer_assignment() returns trigger as $$
-- declare
--   is_mgr boolean := exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER');
-- begin
--   if auth.uid() is not null and not is_admin() and (
--     (
--       new.assigned_to is distinct from old.assigned_to
--       and not (
--         (new.assigned_to is null and old.assigned_to = auth.uid())
--         or (
--           is_mgr
--           and (old.assigned_to is null or old.assigned_to in (select id from profiles where team_id = my_team_id()))
--           and (new.assigned_to is null or new.assigned_to in (select id from profiles where team_id = my_team_id()))
--         )
--       )
--     )
--     or (
--       new.assigned_to_2 is distinct from old.assigned_to_2
--       and not (
--         (new.assigned_to_2 is null and old.assigned_to_2 = auth.uid())
--         or (
--           is_mgr
--           and (old.assigned_to_2 is null or old.assigned_to_2 in (select id from profiles where team_id = my_team_id()))
--           and (new.assigned_to_2 is null or new.assigned_to_2 in (select id from profiles where team_id = my_team_id()))
--         )
--       )
--     )
--     or (
--       new.assigned_to_3 is distinct from old.assigned_to_3
--       and not (
--         (new.assigned_to_3 is null and old.assigned_to_3 = auth.uid())
--         or (
--           is_mgr
--           and (old.assigned_to_3 is null or old.assigned_to_3 in (select id from profiles where team_id = my_team_id()))
--           and (new.assigned_to_3 is null or new.assigned_to_3 in (select id from profiles where team_id = my_team_id()))
--         )
--       )
--     )
--   ) then
--     raise exception 'only an admin can reassign a customer';
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- create or replace function protect_pool_columns() returns trigger as $$
-- begin
--   if auth.uid() is not null and not is_admin()
--     and new.pool_1 is distinct from old.pool_1
--     and auth.uid() is distinct from old.assigned_to
--     and not (
--       exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--       and old.assigned_to in (select id from profiles where team_id = my_team_id())
--     )
--   then
--     raise exception 'only the assignee or an admin can change this pool status';
--   end if;
--   if auth.uid() is not null and not is_admin()
--     and new.pool_2 is distinct from old.pool_2
--     and auth.uid() is distinct from old.assigned_to_2
--     and not (
--       exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--       and old.assigned_to_2 in (select id from profiles where team_id = my_team_id())
--     )
--   then
--     raise exception 'only the assignee or an admin can change this pool status';
--   end if;
--   if auth.uid() is not null and not is_admin()
--     and new.pool_3 is distinct from old.pool_3
--     and auth.uid() is distinct from old.assigned_to_3
--     and not (
--       exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--       and old.assigned_to_3 in (select id from profiles where team_id = my_team_id())
--     )
--   then
--     raise exception 'only the assignee or an admin can change this pool status';
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;

-- ============================================================
-- Migration: harden the service-role bypass on the customer assignment/pool
-- protection triggers. The prior migration above let any connection with no
-- authenticated user (auth.uid() is null) past these triggers, meaning to
-- catch the auto-second-assign background sweep's service-role writes --
-- but auth.uid() is also null for an anonymous/unauthenticated connection,
-- which RLS on customers already blocks independently (is_admin() and
-- is_customer_assignee() both evaluate false with no auth.uid()), so there
-- was no live hole -- this just makes the trigger a real second layer of
-- defense instead of one that happens to agree with RLS. Checks the JWT's
-- role claim directly instead: auth.jwt() ->> 'role' = 'service_role' only
-- matches the service-role key, never an anon-key connection. Run once
-- against an already-provisioned database (everything below already exists
-- in the main schema above for fresh installs).
-- See docs/superpowers/specs/2026-09-21-auto-second-assign-background-sweep-design.md
-- ============================================================
--
-- create or replace function protect_customer_assignment() returns trigger as $$
-- declare
--   is_mgr boolean := exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER');
-- begin
--   if (auth.jwt() ->> 'role') is distinct from 'service_role' and not is_admin() and (
--     (
--       new.assigned_to is distinct from old.assigned_to
--       and not (
--         (new.assigned_to is null and old.assigned_to = auth.uid())
--         or (
--           is_mgr
--           and (old.assigned_to is null or old.assigned_to in (select id from profiles where team_id = my_team_id()))
--           and (new.assigned_to is null or new.assigned_to in (select id from profiles where team_id = my_team_id()))
--         )
--       )
--     )
--     or (
--       new.assigned_to_2 is distinct from old.assigned_to_2
--       and not (
--         (new.assigned_to_2 is null and old.assigned_to_2 = auth.uid())
--         or (
--           is_mgr
--           and (old.assigned_to_2 is null or old.assigned_to_2 in (select id from profiles where team_id = my_team_id()))
--           and (new.assigned_to_2 is null or new.assigned_to_2 in (select id from profiles where team_id = my_team_id()))
--         )
--       )
--     )
--     or (
--       new.assigned_to_3 is distinct from old.assigned_to_3
--       and not (
--         (new.assigned_to_3 is null and old.assigned_to_3 = auth.uid())
--         or (
--           is_mgr
--           and (old.assigned_to_3 is null or old.assigned_to_3 in (select id from profiles where team_id = my_team_id()))
--           and (new.assigned_to_3 is null or new.assigned_to_3 in (select id from profiles where team_id = my_team_id()))
--         )
--       )
--     )
--   ) then
--     raise exception 'only an admin can reassign a customer';
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- create or replace function protect_pool_columns() returns trigger as $$
-- begin
--   if (auth.jwt() ->> 'role') is distinct from 'service_role' and not is_admin()
--     and new.pool_1 is distinct from old.pool_1
--     and auth.uid() is distinct from old.assigned_to
--     and not (
--       exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--       and old.assigned_to in (select id from profiles where team_id = my_team_id())
--     )
--   then
--     raise exception 'only the assignee or an admin can change this pool status';
--   end if;
--   if (auth.jwt() ->> 'role') is distinct from 'service_role' and not is_admin()
--     and new.pool_2 is distinct from old.pool_2
--     and auth.uid() is distinct from old.assigned_to_2
--     and not (
--       exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--       and old.assigned_to_2 in (select id from profiles where team_id = my_team_id())
--     )
--   then
--     raise exception 'only the assignee or an admin can change this pool status';
--   end if;
--   if (auth.jwt() ->> 'role') is distinct from 'service_role' and not is_admin()
--     and new.pool_3 is distinct from old.pool_3
--     and auth.uid() is distinct from old.assigned_to_3
--     and not (
--       exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--       and old.assigned_to_3 in (select id from profiles where team_id = my_team_id())
--     )
--   then
--     raise exception 'only the assignee or an admin can change this pool status';
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;

-- ============================================================
-- Migration: Let assigned salespeople rename a customer (phone and
-- remark stay admin/manager-only) — run once against an
-- already-provisioned database (already reflected in the main schema
-- above for fresh installs). The rename is logged to
-- customer_change_log by the app, same as any other profile edit.
-- ============================================================
--
-- create or replace function protect_customer_remark_column() returns trigger as $$
-- begin
--   if (
--     new.remark is distinct from old.remark
--     or new.phone is distinct from old.phone
--   ) and not (
--     is_admin() or exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
--   ) then
--     raise exception 'only an admin or manager can change the phone or remark';
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;

-- ============================================================
-- Migration: Removal request note — run once against an
-- already-provisioned database (already reflected in the main schema
-- above for fresh installs). Nullable so pre-existing requests are
-- untouched; the app requires a note on every new request.
-- ============================================================
--
-- alter table removal_requests add column if not exists note text;

-- ============================================================
-- Migration: Blasting — a salesperson (or manager) with an unlocked,
-- unexpired blast item can read and update that customer's profile, but
-- not log activity or tasks (activities_insert / tasks_insert still
-- require a real assignee slot). Run once against an already-provisioned
-- database. Phone/remark stay admin/manager-only via the existing
-- protect_customer_remark_column trigger; assignment/pool triggers are
-- unchanged, so a blast-only user cannot reassign or flip pool either.
--
-- STEP 0 (read-only, run first): confirm the live policies match what is
-- recreated below, in case they were edited by hand in Supabase:
--   select policyname, cmd, qual, with_check from pg_policies
--   where tablename in ('customers', 'customer_change_log')
--     and policyname in ('customers_select', 'customers_update', 'customer_change_log_insert');
-- Expected: customers_select / customers_update qual =
--   is_admin() OR is_customer_assignee(assigned_to, assigned_to_2, assigned_to_3)
-- If they differ, merge the difference into the statements below first.
-- ============================================================
--
-- create or replace function has_open_blast_item(cid uuid) returns boolean as $$
--   select exists (
--     select 1
--     from blast_items bi
--     join blast_requests br on br.id = bi.blast_request_id
--     where bi.customer_id = cid
--       and br.salesperson_id = auth.uid()
--       and br.status = 'APPROVED'
--       and bi.unlocked_at is not null
--       and bi.status <> 'EXPIRED'
--   );
-- $$ language sql security definer stable set search_path = public;
--
-- drop policy if exists "customers_select" on customers;
-- create policy "customers_select" on customers for select using (
--   is_admin()
--   or is_customer_assignee(assigned_to, assigned_to_2, assigned_to_3)
--   or has_open_blast_item(id)
-- );
--
-- drop policy if exists "customers_update" on customers;
-- create policy "customers_update" on customers for update using (
--   is_admin()
--   or is_customer_assignee(assigned_to, assigned_to_2, assigned_to_3)
--   or has_open_blast_item(id)
-- );
--
-- -- change-log rows written when a blast-only user edits the profile
-- drop policy if exists "customer_change_log_insert" on customer_change_log;
-- create policy "customer_change_log_insert" on customer_change_log for insert with check (
--   changed_by = auth.uid()
--   and (
--     is_admin()
--     or has_open_blast_item(customer_id)
--     or exists (
--       select 1 from customers c
--       where c.id = customer_change_log.customer_id
--         and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--     )
--   )
-- );

-- ============================================================
-- Migration: Customer created-by-team — records which team created each
-- customer (drives the "Created by" list filter and the dashboard's
-- new-leads counts). Run once against an already-provisioned database,
-- BEFORE deploying the app version that writes this column.
--
-- STEP 0 (read-only, run first): confirm the SK team's exact name and the
-- current teams policy:
--   select id, name from teams order by name;
--   select policyname, qual from pg_policies where tablename = 'teams' and policyname = 'teams_select';
-- Expected: exactly one team whose name starts with 'SK Team' (in prod:
-- 'SK Team (SETAPAK/Jln Ipoh Sentul)'); teams_select qual =
--   is_admin() OR id = my_team_id()
-- If your team name differs, edit the 'SK Team%' pattern below first.
-- ============================================================
--
-- alter table customers add column if not exists created_by_team_id uuid references teams (id) on delete set null;
--
-- do $$
-- declare sk uuid; n int;
-- begin
--   select count(*) into n from teams where name like 'SK Team%';
--   if n <> 1 then
--     raise exception 'Expected exactly 1 team starting with "SK Team", found %', n;
--   end if;
--   select id into sk from teams where name like 'SK Team%';
--   update customers set created_by_team_id = sk where created_by_team_id is null;
-- end $$;
--
-- create index if not exists customers_created_by_team_idx on customers (created_by_team_id);
--
-- drop policy if exists "teams_select" on teams;
-- create policy "teams_select" on teams for select using (
--   is_admin() or id = my_team_id()
--   or exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
-- );

-- ============================================================
-- Migration: Team names readable by every signed-in user (salespeople
-- see which team created a customer on its detail page). Supersedes the
-- teams_select policy in the migration above. Run once.
-- ============================================================
--
-- drop policy if exists "teams_select" on teams;
-- create policy "teams_select" on teams for select using (auth.uid() is not null);

-- ============================================================
-- Migration: customer_assignments (Phase 3a) — one row per assigned seat
-- (customer, team, seat 1-3, user, pool, stage), mirrored automatically from
-- the old customers.assigned_to*/pool_*/stage_* columns by triggers. The app
-- only reads it for now; the old columns stay authoritative until the
-- Phase 3c cutover. Run once, in this order, against an already-provisioned
-- database. Safe to re-run.
--
-- STEP 0 (read-only, run first): list assignees that have no team — they get
-- no row (a team is required), so they will be missing from the mirror:
--   select p.id, p.name, count(*) as seats
--   from profiles p
--   join customers c on p.id in (c.assigned_to, c.assigned_to_2, c.assigned_to_3)
--   where p.team_id is null
--   group by p.id, p.name;
-- Expected: no rows (or only users you are fine losing from the mirror).
-- ============================================================
--
-- create table if not exists customer_assignments (
--   id uuid primary key default gen_random_uuid(),
--   customer_id uuid not null references customers (id) on delete cascade,
--   team_id uuid not null references teams (id) on delete cascade,
--   slot int not null check (slot in (1, 2, 3)),
--   user_id uuid not null references profiles (id) on delete cascade,
--   pool text check (pool in ('ACTIVE', 'INACTIVE')),
--   pool_since timestamptz,
--   stage_id uuid references pipeline_stages (id) on delete set null,
--   unique (customer_id, team_id, slot)
-- );
-- create index if not exists customer_assignments_customer_idx on customer_assignments (customer_id);
-- create index if not exists customer_assignments_user_idx on customer_assignments (user_id);
--
-- alter table customer_assignments enable row level security;
-- -- visible wherever the customer itself is visible (customers' own RLS
-- -- applies inside the subquery); no client write policies on purpose --
-- -- only the security-definer triggers below write this table.
-- drop policy if exists "customer_assignments_select" on customer_assignments;
-- create policy "customer_assignments_select" on customer_assignments for select using (
--   is_admin()
--   or exists (select 1 from customers c where c.id = customer_assignments.customer_id)
-- );
--
-- -- Rebuilds one customer's seat rows from its old slot columns: drops rows
-- -- that no longer match, upserts the rest (so unchanged seats keep their id
-- -- and don't churn Realtime).
-- create or replace function resync_customer_assignments(cid uuid) returns void as $$
-- declare
--   c customers%rowtype;
-- begin
--   select * into c from customers where id = cid;
--   if not found then
--     return;
--   end if;
--
--   delete from customer_assignments ca
--   where ca.customer_id = cid
--     and not exists (
--       select 1
--       from (values (1, c.assigned_to), (2, c.assigned_to_2), (3, c.assigned_to_3)) as s(slot, uid)
--       join profiles p on p.id = s.uid
--       where s.slot = ca.slot and s.uid = ca.user_id and p.team_id = ca.team_id
--     );
--
--   insert into customer_assignments (customer_id, team_id, slot, user_id, pool, pool_since, stage_id)
--   select cid, p.team_id, s.slot, s.uid, s.pool, s.since, s.stage
--   from (values
--     (1, c.assigned_to,   c.pool_1, c.pool_1_since, c.stage_1),
--     (2, c.assigned_to_2, c.pool_2, c.pool_2_since, c.stage_2),
--     (3, c.assigned_to_3, c.pool_3, c.pool_3_since, c.stage_3)
--   ) as s(slot, uid, pool, since, stage)
--   join profiles p on p.id = s.uid and p.team_id is not null
--   on conflict (customer_id, team_id, slot) do update
--     set user_id = excluded.user_id,
--         pool = excluded.pool,
--         pool_since = excluded.pool_since,
--         stage_id = excluded.stage_id
--     where (customer_assignments.user_id, customer_assignments.pool, customer_assignments.pool_since, customer_assignments.stage_id)
--       is distinct from (excluded.user_id, excluded.pool, excluded.pool_since, excluded.stage_id);
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- -- not meant to be called from the API; the trigger functions (owner-run) still work
-- revoke execute on function resync_customer_assignments(uuid) from public, anon, authenticated;
--
-- create or replace function trg_customers_resync_assignments() returns trigger as $$
-- begin
--   perform resync_customer_assignments(new.id);
--   return null;
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- drop trigger if exists customers_resync_assignments on customers;
-- create trigger customers_resync_assignments
--   after insert or update of
--     assigned_to, assigned_to_2, assigned_to_3,
--     pool_1, pool_2, pool_3,
--     pool_1_since, pool_2_since, pool_3_since,
--     stage_1, stage_2, stage_3
--   on customers
--   for each row execute function trg_customers_resync_assignments();
--
-- -- a user moving to another team takes their seats with them
-- create or replace function trg_profiles_resync_assignments() returns trigger as $$
-- declare
--   cid uuid;
-- begin
--   for cid in
--     select id from customers where new.id in (assigned_to, assigned_to_2, assigned_to_3)
--   loop
--     perform resync_customer_assignments(cid);
--   end loop;
--   return null;
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- drop trigger if exists profiles_resync_assignments on profiles;
-- create trigger profiles_resync_assignments
--   after update of team_id on profiles
--   for each row
--   when (old.team_id is distinct from new.team_id)
--   execute function trg_profiles_resync_assignments();
--
-- -- backfill every existing customer
-- do $$
-- declare
--   cid uuid;
-- begin
--   for cid in select id from customers loop
--     perform resync_customer_assignments(cid);
--   end loop;
-- end $$;
--
-- -- Realtime (skipped if the table is already in the publication)
-- do $$
-- begin
--   if not exists (
--     select 1 from pg_publication_tables
--     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'customer_assignments'
--   ) then
--     alter publication supabase_realtime add table customer_assignments;
--   end if;
-- end $$;
--
-- -- Rollback, if ever needed:
-- --   drop trigger if exists customers_resync_assignments on customers;
-- --   drop trigger if exists profiles_resync_assignments on profiles;
-- --   drop function if exists trg_customers_resync_assignments();
-- --   drop function if exists trg_profiles_resync_assignments();
-- --   drop function if exists resync_customer_assignments(uuid);
-- --   drop table if exists customer_assignments;

-- ============================================================
-- Migration: Phase 3c CUTOVER — customer_assignments becomes the source of
-- truth for who is assigned to a customer; leaders see all customers.
-- Run ONCE, together with deploying the Phase 3c app (the old app and this
-- schema are not compatible). Runbook: docs/superpowers/plans/2026-10-14-phase3c-cutover.md Task 7.
--
-- STEP 0 (read-only; save the output of all five before running anything):
--   select schemaname, tablename, policyname, cmd, qual, with_check from pg_policies order by tablename, policyname;
--   select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.prosrc ilike '%assigned_to%' order by 1;
--   select event_object_table, trigger_name from information_schema.triggers where trigger_schema = 'public' order by 1, 2;
--   select count(*) as seats from customer_assignments;   -- the Phase 3a mirror must be populated
--   select customer_id, user_id, count(*) from customer_assignments group by 1, 2 having count(*) > 1;   -- must return no rows
-- Send me the first three before running the block: any policy or function
-- that mentions assigned_to / is_customer_assignee and is NOT replaced below
-- would silently go stale.
-- ============================================================
--
-- begin;
-- set local lock_timeout = '10s';
--
-- -- 1. one last sync from the old columns, then stop mirroring
-- do $$
-- declare
--   cid uuid;
-- begin
--   for cid in select id from customers loop
--     perform resync_customer_assignments(cid);
--   end loop;
-- end $$;
-- drop trigger if exists customers_resync_assignments on customers;
-- drop trigger if exists profiles_resync_assignments on profiles;
-- drop function if exists trg_customers_resync_assignments();
-- drop function if exists trg_profiles_resync_assignments();
-- drop function if exists resync_customer_assignments(uuid);
--
-- -- 2. a person holds at most one seat per customer
-- do $$
-- begin
--   if not exists (select 1 from pg_constraint where conname = 'customer_assignments_customer_user_key') then
--     alter table customer_assignments add constraint customer_assignments_customer_user_key unique (customer_id, user_id);
--   end if;
-- end $$;
--
-- -- 3. helpers
-- create or replace function is_manager() returns boolean as $$
--   select exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER');
-- $$ language sql security definer stable set search_path = public;
--
-- -- the caller holds a seat on the customer, or someone on the caller's team does
-- create or replace function is_customer_member(cid uuid) returns boolean as $$
--   select exists (
--     select 1 from customer_assignments ca
--     where ca.customer_id = cid and (ca.user_id = auth.uid() or ca.team_id = my_team_id())
--   );
-- $$ language sql security definer stable set search_path = public;
--
-- -- 4. seat guard: a seat never moves between customers/teams/seat numbers
-- -- (except via the team-move trigger below, i.e. nested trigger depth), and
-- -- its occupant must belong to the seat's team.
-- create or replace function protect_seat_row() returns trigger as $$
-- declare
--   holder_team uuid;
-- begin
--   if pg_trigger_depth() > 1 then
--     return new;
--   end if;
--   if tg_op = 'UPDATE' and (
--     new.customer_id is distinct from old.customer_id
--     or new.team_id is distinct from old.team_id
--     or new.slot is distinct from old.slot
--   ) then
--     raise exception 'a seat cannot be moved to another customer, team or seat number';
--   end if;
--   if tg_op = 'INSERT' or new.user_id is distinct from old.user_id then
--     select team_id into holder_team from profiles where id = new.user_id;
--     if holder_team is distinct from new.team_id then
--       raise exception 'the assignee must belong to the seat''s team';
--     end if;
--     if tg_op = 'UPDATE'
--       and (auth.jwt() ->> 'role') is distinct from 'service_role'
--       and not is_admin() and not is_manager() then
--       raise exception 'only an admin or manager can reassign a seat';
--     end if;
--   end if;
--   return new;
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- drop trigger if exists customer_assignments_protect on customer_assignments;
-- create trigger customer_assignments_protect
--   before insert or update on customer_assignments
--   for each row execute function protect_seat_row();
--
-- -- keep customers.updated_at fresh when a seat changes (the customer list's
-- -- "Last Updated" used to move on every assign / stage / pool change)
-- create or replace function trg_seat_touch_customer() returns trigger as $$
-- begin
--   update customers set updated_at = now() where id = coalesce(new.customer_id, old.customer_id);
--   return null;
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- drop trigger if exists customer_assignments_touch_customer on customer_assignments;
-- create trigger customer_assignments_touch_customer
--   after insert or update or delete on customer_assignments
--   for each row execute function trg_seat_touch_customer();
--
-- -- 5. seat policies: admin all; a manager their own team's seats; a person
-- -- their own seat (pool/stage/clear). Nobody else writes.
-- drop policy if exists "customer_assignments_select" on customer_assignments;
-- create policy "customer_assignments_select" on customer_assignments for select using (
--   is_admin() or team_id = my_team_id() or user_id = auth.uid()
-- );
-- drop policy if exists "customer_assignments_insert" on customer_assignments;
-- create policy "customer_assignments_insert" on customer_assignments for insert with check (
--   is_admin() or (is_manager() and team_id = my_team_id())
-- );
-- drop policy if exists "customer_assignments_update" on customer_assignments;
-- create policy "customer_assignments_update" on customer_assignments for update
--   using (is_admin() or user_id = auth.uid() or (is_manager() and team_id = my_team_id()))
--   with check (is_admin() or user_id = auth.uid() or (is_manager() and team_id = my_team_id()));
-- drop policy if exists "customer_assignments_delete" on customer_assignments;
-- create policy "customer_assignments_delete" on customer_assignments for delete using (
--   is_admin() or user_id = auth.uid() or (is_manager() and team_id = my_team_id())
-- );
--
-- -- 6. customers: every manager sees and edits every customer; the old
-- -- flat-column guards are no longer relevant (nothing writes those columns)
-- drop policy if exists "customers_select" on customers;
-- create policy "customers_select" on customers for select using (
--   is_admin() or is_manager() or is_customer_member(id) or has_open_blast_item(id)
-- );
-- drop policy if exists "customers_update" on customers;
-- create policy "customers_update" on customers for update using (
--   is_admin() or is_manager() or is_customer_member(id) or has_open_blast_item(id)
-- );
-- drop trigger if exists customers_protect_assignment on customers;
-- drop trigger if exists customers_protect_pool on customers;
--
-- -- 7. policies that used is_customer_assignee(assigned_to…) now use seats
-- -- activities: you read logs written by your own team (and your own); a
-- -- manager of team B never reads team A's logs on a shared customer
-- drop policy if exists "activities_select" on activities;
-- create policy "activities_select" on activities for select using (
--   is_admin()
--   or activities.user_id = auth.uid()
--   or (
--     activities.user_id in (select id from profiles where team_id = my_team_id())
--     and exists (select 1 from customers c where c.id = activities.customer_id)
--   )
-- );
-- drop policy if exists "activities_insert" on activities;
-- create policy "activities_insert" on activities for insert with check (
--   activities.user_id = auth.uid()
--   and (is_admin() or is_customer_member(activities.customer_id))
-- );
-- drop policy if exists "activities_delete" on activities;
-- create policy "activities_delete" on activities for delete using (
--   is_admin()
--   or (is_manager() and activities.user_id in (select id from profiles where team_id = my_team_id()))
-- );
--
-- drop policy if exists "tasks_insert" on tasks;
-- create policy "tasks_insert" on tasks for insert with check (
--   user_id = auth.uid()
--   and (is_admin() or is_manager() or is_customer_member(tasks.customer_id))
-- );
--
-- -- change log: every manager reads every team's; anyone who may edit may append
-- drop policy if exists "customer_change_log_select" on customer_change_log;
-- create policy "customer_change_log_select" on customer_change_log for select using (
--   is_admin() or is_manager()
-- );
-- drop policy if exists "customer_change_log_insert" on customer_change_log;
-- create policy "customer_change_log_insert" on customer_change_log for insert with check (
--   changed_by = auth.uid()
--   and (
--     is_admin() or is_manager()
--     or has_open_blast_item(customer_change_log.customer_id)
--     or is_customer_member(customer_change_log.customer_id)
--   )
-- );
--
-- drop policy if exists "deal_closures_select" on deal_closures;
-- create policy "deal_closures_select" on deal_closures for select using (
--   is_admin() or is_customer_member(deal_closures.customer_id)
-- );
-- drop policy if exists "deal_closures_insert" on deal_closures;
-- create policy "deal_closures_insert" on deal_closures for insert with check (
--   user_id = auth.uid()
--   and (is_admin() or is_customer_member(deal_closures.customer_id))
-- );
--
-- drop policy if exists "removal_requests_select" on removal_requests;
-- create policy "removal_requests_select" on removal_requests for select using (
--   is_admin()
--   or requested_by = auth.uid()
--   or requested_by in (select id from profiles where team_id = my_team_id())
-- );
-- drop policy if exists "removal_requests_insert" on removal_requests;
-- create policy "removal_requests_insert" on removal_requests for insert with check (
--   requested_by = auth.uid()
--   and exists (
--     select 1 from customer_assignments ca
--     where ca.customer_id = removal_requests.customer_id
--       and ca.user_id = auth.uid()
--       and ca.slot = removal_requests.slot
--   )
-- );
-- drop policy if exists "removal_requests_update" on removal_requests;
-- create policy "removal_requests_update" on removal_requests for update using (
--   is_admin()
--   or (
--     is_manager()
--     and is_customer_member(removal_requests.customer_id)
--     and removal_requests.requested_by in (select id from profiles where team_id = my_team_id())
--   )
-- );
--
-- drop policy if exists "customer_delete_requests_insert" on customer_delete_requests;
-- create policy "customer_delete_requests_insert" on customer_delete_requests for insert with check (
--   requested_by = auth.uid()
--   and is_manager()
-- );
--
-- drop policy if exists "stage_events_insert" on stage_events;
-- create policy "stage_events_insert" on stage_events for insert with check (
--   stage_events.user_id = auth.uid()
--   and (is_admin() or is_customer_member(stage_events.customer_id))
-- );
--
-- -- 8. a person changing team takes their seats along; a seat number already
-- -- taken in the new team on that customer moves to the next free one, and a
-- -- seat with no free number (or a person left without a team) is removed.
-- create or replace function trg_profiles_move_seats() returns trigger as $$
-- declare
--   s record;
--   free_slot int;
-- begin
--   if new.team_id is null then
--     delete from customer_assignments where user_id = new.id;
--     return null;
--   end if;
--   for s in select id, customer_id from customer_assignments where user_id = new.id loop
--     select min(n) into free_slot
--     from generate_series(1, 3) as n
--     where not exists (
--       select 1 from customer_assignments x
--       where x.customer_id = s.customer_id and x.team_id = new.team_id and x.slot = n
--     );
--     if free_slot is null then
--       delete from customer_assignments where id = s.id;
--     else
--       update customer_assignments set team_id = new.team_id, slot = free_slot where id = s.id;
--     end if;
--   end loop;
--   return null;
-- end;
-- $$ language plpgsql security definer set search_path = public;
--
-- drop trigger if exists profiles_move_seats on profiles;
-- create trigger profiles_move_seats
--   after update of team_id on profiles
--   for each row
--   when (old.team_id is distinct from new.team_id)
--   execute function trg_profiles_move_seats();
--
-- -- 9. one pending removal request per person per customer (seat numbers are per team now)
-- drop index if exists removal_requests_one_pending;
-- create unique index removal_requests_one_pending on removal_requests (customer_id, requested_by) where status = 'PENDING';
--
-- commit;
--
-- -- Verify (seats = the STEP 0 count, or slightly more if people assigned in between; the other two = 0):
-- --   select count(*) as seats from customer_assignments;
-- --   select count(*) as policies_still_on_flat_columns from pg_policies
-- --     where qual ilike '%is_customer_assignee%' or with_check ilike '%is_customer_assignee%'
-- --        or qual ilike '%assigned_to%' or with_check ilike '%assigned_to%';
-- --   select count(*) as dup_seats from (select customer_id, user_id from customer_assignments group by 1,2 having count(*) > 1) d;
-- --   select tgname from pg_trigger where tgname in ('customers_protect_assignment','customers_protect_pool','customers_resync_assignments','profiles_resync_assignments');   -- 0 rows
--
-- -- Rollback (only if something is badly wrong; data written to seats after the
-- -- cutover is NOT copied back to the old columns):
-- --   re-create the Phase 3a mirror (the "customer_assignments (Phase 3a)" block above),
-- --   re-create the policies/triggers you saved in STEP 0 (they are also in the main schema above),
-- --   drop trigger customer_assignments_protect / customer_assignments_touch_customer / profiles_move_seats,
-- --   restore the flat columns from the backup you took before the cutover (seat changes made after the cutover are not copied back).

-- ============================================================
-- Migration: Phase 3c cleanup — run a few days AFTER the cutover, once the
-- team is happy. Empties the frozen flat slot columns on customers so a
-- stale value can never be read, and so the old foreign keys from stage_1..3
-- to pipeline_stages stop blocking the deletion of a stage. Not reversible
-- without a backup. customers.updated_at is deliberately not touched.
-- Run off-hours: it touches every customer row, so every open client gets one Realtime event per row.
-- ============================================================
--
-- begin;
-- do $$
-- begin
--   if exists (select 1 from pg_trigger where tgname = 'customers_resync_assignments') then
--     raise exception 'run the Phase 3c cutover first (the Phase 3a mirror trigger is still active)';
--   end if;
-- end $$;
-- alter table customers disable trigger customers_touch_updated_at;
-- update customers set
--   assigned_to = null, assigned_to_2 = null, assigned_to_3 = null,
--   pool_1 = null, pool_2 = null, pool_3 = null,
--   pool_1_since = null, pool_2_since = null, pool_3_since = null,
--   stage_1 = null, stage_2 = null, stage_3 = null;
-- alter table customers enable trigger customers_touch_updated_at;
-- commit;

-- ============================================================
-- Migration: Phase 3d — per-team rotation pointer for the daily auto
-- second-assign (it used to be per area; the second person now comes from the
-- team that created the customer, so fairness is tracked per team). Additive
-- and safe to run any time; run it BEFORE deploying Phase 3d. The old
-- areas.last_auto_assigned_user_id column is no longer used (dropped in Phase 4).
-- ============================================================
--
-- alter table teams add column if not exists last_auto_assigned_user_id uuid references profiles (id) on delete set null;

-- ============================================================
-- Migration: auto-assign switches move to teams — a per-team On/Off (default
-- On) and a resume cutoff (a customer whose due date fell before the team was
-- last switched back On is permanently skipped). The epoch default keeps every
-- currently-eligible customer eligible. Additive and safe; run BEFORE deploying
-- the matching app version. The old areas.auto_assign_* columns are no longer
-- used (dropped in Phase 4).
-- ============================================================
--
-- alter table teams add column if not exists auto_assign_enabled boolean not null default true;
-- alter table teams add column if not exists auto_assign_resumed_at timestamptz not null default '1970-01-01T00:00:00Z';

-- ============================================================
-- Migration: Phase 4 — drop the legacy flat slot columns and the pieces that
-- only existed for them. Run AFTER the Phase 4 app version is deployed and
-- the Phase 3c cleanup has run. NOT reversible without a backup. No CASCADE
-- on purpose: if anything still depends on an object, the whole transaction
-- fails and nothing changes.
-- ============================================================
--
-- begin;
-- alter table customers
--   drop column assigned_to, drop column assigned_to_2, drop column assigned_to_3,
--   drop column pool_1, drop column pool_2, drop column pool_3,
--   drop column pool_1_since, drop column pool_2_since, drop column pool_3_since,
--   drop column stage_1, drop column stage_2, drop column stage_3;
-- drop table area_teams;
-- alter table areas
--   drop column if exists last_auto_assigned_user_id,
--   drop column if exists auto_assign_enabled,
--   drop column if exists auto_assign_resumed_at;
-- drop function is_customer_assignee(uuid, uuid, uuid);
-- drop function protect_customer_assignment();
-- drop function protect_pool_columns();
-- commit;
