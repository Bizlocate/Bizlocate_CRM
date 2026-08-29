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
  customer_limit int check (customer_limit is null or customer_limit >= 0)
);

-- Run this alone against an already-provisioned database:
-- alter table profiles add column if not exists phone text;
-- alter table profiles add column if not exists customer_limit int check (customer_limit is null or customer_limit >= 0);
-- alter table profiles add column if not exists ic text;
-- create or replace function handle_new_user() returns trigger as $$
-- begin
--   insert into public.profiles (id, name, email, phone, ic, role, team_id, status, customer_limit)
--   values (
--     new.id,
--     coalesce(new.raw_user_meta_data ->> 'name', new.email),
--     new.email,
--     nullif(new.raw_user_meta_data ->> 'phone', ''),
--     nullif(new.raw_user_meta_data ->> 'ic', ''),
--     coalesce(new.raw_user_meta_data ->> 'role', 'SALESPERSON'),
--     nullif(new.raw_user_meta_data ->> 'team_id', '')::uuid,
--     'ACTIVE',
--     nullif(new.raw_user_meta_data ->> 'customer_limit', '')::int
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
  is_default boolean not null default false
);

create table areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table sub_areas (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas (id) on delete cascade,
  name text not null,
  unique (area_id, name)
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

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  assigned_to uuid not null references profiles (id),
  stage_id uuid not null references pipeline_stages (id),
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
  remark text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  user_id uuid not null references profiles (id),
  type text not null check (type in ('CALL', 'VISIT', 'NOTE')),
  content text not null,
  follow_up text,
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  user_id uuid not null references profiles (id),
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

-- ============================================================
-- New auth user -> profiles row
-- ============================================================

create function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, name, email, phone, ic, role, team_id, status, customer_limit)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.email),
    new.email,
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'ic', ''),
    coalesce(new.raw_user_meta_data ->> 'role', 'SALESPERSON'),
    nullif(new.raw_user_meta_data ->> 'team_id', '')::uuid,
    'ACTIVE',
    nullif(new.raw_user_meta_data ->> 'customer_limit', '')::int
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
    or new.customer_limit is distinct from old.customer_limit
  ) then
    raise exception 'only an admin can change role, team, status, or customer limit';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger profiles_protect_columns
  before update on profiles
  for each row execute function protect_profile_columns();

create function protect_customer_assignment() returns trigger as $$
begin
  if not is_admin() and new.assigned_to is distinct from old.assigned_to then
    raise exception 'only an admin can reassign a customer';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger customers_protect_assignment
  before update on customers
  for each row execute function protect_customer_assignment();

create function protect_customer_remark_column() returns trigger as $$
begin
  if new.remark is distinct from old.remark and not (
    is_admin() or exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
  ) then
    raise exception 'only an admin or manager can change the remark';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger customers_protect_remark
  before update on customers
  for each row execute function protect_customer_remark_column();

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
alter table customers enable row level security;
alter table activities enable row level security;
alter table tasks enable row level security;
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

-- teams: admin full, member can see own team
create policy "teams_select" on teams for select using (
  is_admin() or id = my_team_id()
);
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

-- customers: admin all, manager own team, salesperson own assigned
create policy "customers_select" on customers for select using (
  is_admin()
  or assigned_to = auth.uid()
  or assigned_to in (select id from profiles where team_id = my_team_id())
);
create policy "customers_insert" on customers for insert with check (
  is_admin() or exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
);
create policy "customers_update" on customers for update using (
  is_admin()
  or assigned_to = auth.uid()
  or assigned_to in (select id from profiles where team_id = my_team_id())
);
create policy "customers_delete_admin" on customers for delete using (is_admin());

-- activities: inherit customer visibility, append-only (no update/delete policy = nobody can)
create policy "activities_select" on activities for select using (
  is_admin()
  or exists (
    select 1 from customers c
    where c.id = activities.customer_id
      and (c.assigned_to = auth.uid() or c.assigned_to in (select id from profiles where team_id = my_team_id()))
  )
);
create policy "activities_insert" on activities for insert with check (
  is_admin()
  or exists (
    select 1 from customers c
    where c.id = activities.customer_id
      and (c.assigned_to = auth.uid() or c.assigned_to in (select id from profiles where team_id = my_team_id()))
  )
);

-- tasks: inherit customer visibility, update limited to `done` via trigger above
create policy "tasks_select" on tasks for select using (
  is_admin()
  or exists (
    select 1 from customers c
    where c.id = tasks.customer_id
      and (c.assigned_to = auth.uid() or c.assigned_to in (select id from profiles where team_id = my_team_id()))
  )
);
create policy "tasks_insert" on tasks for insert with check (
  is_admin()
  or exists (
    select 1 from customers c
    where c.id = tasks.customer_id
      and (c.assigned_to = auth.uid() or c.assigned_to in (select id from profiles where team_id = my_team_id()))
  )
);
create policy "tasks_update" on tasks for update using (
  is_admin()
  or exists (
    select 1 from customers c
    where c.id = tasks.customer_id
      and (c.assigned_to = auth.uid() or c.assigned_to in (select id from profiles where team_id = my_team_id()))
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
