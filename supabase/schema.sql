-- BizLocate CRM schema — run once in Supabase SQL editor (Dashboard > SQL Editor > New query)
-- Mirrors docs/architecture.md and docs/modules/*.md

-- ============================================================
-- Tables
-- ============================================================

create table teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  manager_id uuid, -- fk added after profiles exists (circular ref)
  last_auto_assigned_user_id uuid -- fk added after profiles exists, same as manager_id
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
  inactive_pool_limit int check (inactive_pool_limit is null or inactive_pool_limit >= 0)
);

-- Run this alone against an already-provisioned database:
-- alter table profiles add column if not exists phone text;
-- alter table profiles add column if not exists ic text;
-- alter table profiles rename column customer_limit to active_pool_limit;
-- alter table profiles add column if not exists inactive_pool_limit int check (inactive_pool_limit is null or inactive_pool_limit >= 0);
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
  add constraint teams_manager_id_fkey foreign key (manager_id) references profiles (id) on delete set null,
  add constraint teams_last_auto_assigned_user_id_fkey foreign key (last_auto_assigned_user_id) references profiles (id) on delete set null;

create table pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  "order" int not null,
  is_default boolean not null default false,
  requires_amount boolean not null default false
);

create table areas (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  team_id uuid references teams (id) on delete set null
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

create table mandatory_field_settings (
  field_key text primary key,
  required boolean not null default true
);

create table budgets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
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
  assigned_to uuid references profiles (id),
  assigned_to_2 uuid references profiles (id),
  assigned_to_3 uuid references profiles (id),
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
  budget_id uuid references budgets (id) on delete set null,
  remark text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

create table customer_change_log (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  changed_by uuid not null references profiles (id),
  field_key text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

create table deal_closures (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  user_id uuid not null references profiles (id),
  slot smallint not null check (slot in (1, 2, 3)),
  stage_id uuid not null references pipeline_stages (id),
  amount numeric not null,
  created_at timestamptz not null default now()
);

create table removal_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  slot smallint not null check (slot in (1, 2, 3)),
  requested_by uuid not null references profiles (id),
  reason_id uuid not null references removal_reasons (id),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  resolved_by uuid references profiles (id),
  resolved_at timestamptz,
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
-- as a "drop myself from this customer" action) — otherwise only an admin
-- can change who's assigned
create or replace function protect_customer_assignment() returns trigger as $$
begin
  if not is_admin() and (
    (
      new.assigned_to is distinct from old.assigned_to
      and not (
        new.assigned_to is null
        and (
          old.assigned_to = auth.uid()
          or (
            exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
            and old.assigned_to in (select id from profiles where team_id = my_team_id())
          )
        )
      )
    )
    or (
      new.assigned_to_2 is distinct from old.assigned_to_2
      and not (
        new.assigned_to_2 is null
        and (
          old.assigned_to_2 = auth.uid()
          or (
            exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
            and old.assigned_to_2 in (select id from profiles where team_id = my_team_id())
          )
        )
      )
    )
    or (
      new.assigned_to_3 is distinct from old.assigned_to_3
      and not (
        new.assigned_to_3 is null
        and (
          old.assigned_to_3 = auth.uid()
          or (
            exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
            and old.assigned_to_3 in (select id from profiles where team_id = my_team_id())
          )
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
  if not is_admin()
    and new.pool_1 is distinct from old.pool_1
    and auth.uid() is distinct from old.assigned_to
    and not (
      exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
      and old.assigned_to in (select id from profiles where team_id = my_team_id())
    )
  then
    raise exception 'only the assignee or an admin can change this pool status';
  end if;
  if not is_admin()
    and new.pool_2 is distinct from old.pool_2
    and auth.uid() is distinct from old.assigned_to_2
    and not (
      exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
      and old.assigned_to_2 in (select id from profiles where team_id = my_team_id())
    )
  then
    raise exception 'only the assignee or an admin can change this pool status';
  end if;
  if not is_admin()
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
    or new.name is distinct from old.name
    or new.phone is distinct from old.phone
  ) and not (
    is_admin() or exists (select 1 from profiles where id = auth.uid() and role = 'MANAGER')
  ) then
    raise exception 'only an admin or manager can change the name, phone, or remark';
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
alter table customer_change_log enable row level security;
alter table deal_closures enable row level security;
alter table removal_reasons enable row level security;
alter table removal_requests enable row level security;
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

alter table mandatory_field_settings enable row level security;

create policy "mandatory_field_settings_select" on mandatory_field_settings for select using (auth.uid() is not null);
create policy "mandatory_field_settings_update_admin" on mandatory_field_settings for update using (is_admin());

alter table budgets enable row level security;

create policy "budgets_select" on budgets for select using (auth.uid() is not null);
create policy "budgets_insert_admin" on budgets for insert with check (is_admin());
create policy "budgets_update_admin" on budgets for update using (is_admin());
create policy "budgets_delete_admin" on budgets for delete using (is_admin());

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

-- activities: inherit customer visibility, append-only (no update/delete policy = nobody can)
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

-- tasks: inherit customer visibility, update limited to `done` via trigger above
create policy "tasks_select" on tasks for select using (
  is_admin()
  or exists (
    select 1 from customers c
    where c.id = tasks.customer_id
      and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
  )
);
create policy "tasks_insert" on tasks for insert with check (
  is_admin()
  or exists (
    select 1 from customers c
    where c.id = tasks.customer_id
      and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
  )
);
create policy "tasks_update" on tasks for update using (
  is_admin()
  or exists (
    select 1 from customers c
    where c.id = tasks.customer_id
      and is_customer_assignee(c.assigned_to, c.assigned_to_2, c.assigned_to_3)
  )
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
-- Migration: Budget field — run once against an already-provisioned
-- database (everything below already exists in the main schema
-- above for fresh installs).
-- ============================================================
--
-- create table budgets (
--   id uuid primary key default gen_random_uuid(),
--   name text not null unique
-- );
--
-- alter table customers add column if not exists budget_id uuid references budgets (id) on delete set null;
--
-- alter table budgets enable row level security;
--
-- create policy "budgets_select" on budgets for select using (auth.uid() is not null);
-- create policy "budgets_insert_admin" on budgets for insert with check (is_admin());
-- create policy "budgets_update_admin" on budgets for update using (is_admin());
-- create policy "budgets_delete_admin" on budgets for delete using (is_admin());

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
