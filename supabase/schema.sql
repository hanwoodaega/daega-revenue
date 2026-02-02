create extension if not exists "pgcrypto";

create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('admin', 'manager')),
  branch_id uuid references branches,
  phone text,
  active boolean not null default true,
  must_change_password boolean not null default true
);

alter table profiles
  add constraint manager_must_have_branch
  check (role <> 'manager' or branch_id is not null);

alter table profiles
  add column if not exists phone text,
  add column if not exists active boolean not null default true,
  add column if not exists must_change_password boolean not null default true;

create table if not exists sales_entries (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches,
  entry_date date not null,
  amount bigint not null check (amount >= 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users not null default auth.uid()
);

create unique index if not exists sales_entries_unique
  on sales_entries (branch_id, entry_date);

alter table branches enable row level security;
alter table profiles enable row level security;
alter table sales_entries enable row level security;

create policy "branches are readable by authenticated users"
  on branches for select
  to authenticated
  using (true);

create policy "profiles are readable by owner"
  on profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "profiles are readable by admin" on profiles;

create or replace function is_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from profiles
    where id = auth.uid()
      and role = 'admin'
  );
end;
$$;

grant execute on function is_admin() to authenticated;

create policy "profiles are readable by admin"
  on profiles for select
  to authenticated
  using (is_admin());

drop policy if exists "profiles are insertable by owner" on profiles;

create policy "profiles insertable by admin"
  on profiles for insert
  to authenticated
  with check (is_admin());

create policy "profiles updatable by admin"
  on profiles for update
  to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "profiles updatable by owner (safe fields)" on profiles;

create or replace function set_must_change_password(value boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles
  set must_change_password = value
  where id = auth.uid();
end;
$$;

grant execute on function set_must_change_password(boolean) to authenticated;

create or replace function set_profile_active(value boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles
  set active = value
  where id = auth.uid();
end;
$$;

grant execute on function set_profile_active(boolean) to authenticated;

create policy "sales readable by admin or branch manager"
  on sales_entries for select
  to authenticated
  using (
    exists (
      select 1
      from profiles
      where id = auth.uid()
      and (
        role = 'admin' or branch_id = sales_entries.branch_id
      )
    )
  );

create policy "sales insertable by admin or branch manager"
  on sales_entries for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from profiles
      where id = auth.uid()
      and (
        role = 'admin' or branch_id = sales_entries.branch_id
      )
    )
  );

drop policy if exists "sales updatable by owner or admin" on sales_entries;
drop policy if exists "sales deletable by owner or admin" on sales_entries;

drop policy if exists "sales updatable by admin or branch manager" on sales_entries;

create policy "sales updatable by admin or branch manager"
  on sales_entries for update
  to authenticated
  using (
    exists (
      select 1
      from profiles p
      where p.id = auth.uid()
        and (
          p.role = 'admin'
          or (
            p.role = 'manager'
            and p.branch_id = sales_entries.branch_id
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from profiles p
      where p.id = auth.uid()
        and (
          p.role = 'admin'
          or (
            p.role = 'manager'
            and p.branch_id = sales_entries.branch_id
          )
        )
    )
  );

drop policy if exists "sales deletable by admin or branch manager" on sales_entries;

create policy "sales deletable by admin or branch manager"
  on sales_entries for delete
  to authenticated
  using (
    exists (
      select 1
      from profiles p
      where p.id = auth.uid()
        and (
          p.role = 'admin'
          or (
            p.role = 'manager'
            and p.branch_id = sales_entries.branch_id
          )
        )
    )
  );

create or replace function get_home_rollup(target_date date)
returns table (
  today_total bigint,
  missing_branches text[],
  compare_percent numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  branch_count int;
  reported_branch_ids uuid[];
  last_week_branch_count int;
  compare_today_sum bigint;
  compare_last_week_sum bigint;
begin
  select count(*) into branch_count from branches;

  select
    coalesce(sum(se.amount), 0),
    array_agg(b.name order by b.name) filter (where se.id is null)
  into today_total, missing_branches
  from branches b
  left join sales_entries se
    on se.branch_id = b.id
    and se.entry_date = target_date;

  select array_agg(distinct se.branch_id)
  into reported_branch_ids
  from sales_entries se
  where se.entry_date = target_date;

  select count(distinct se.branch_id)
  into last_week_branch_count
  from sales_entries se
  where se.entry_date = target_date - interval '7 days';

  if last_week_branch_count = branch_count and reported_branch_ids is not null then
    select coalesce(sum(amount), 0)
    into compare_today_sum
    from sales_entries
    where entry_date = target_date
      and branch_id = any(reported_branch_ids);

    select coalesce(sum(amount), 0)
    into compare_last_week_sum
    from sales_entries
    where entry_date = target_date - interval '7 days'
      and branch_id = any(reported_branch_ids);

    if compare_last_week_sum > 0 then
      compare_percent :=
        ((compare_today_sum - compare_last_week_sum)::numeric / compare_last_week_sum) * 100;
    else
      compare_percent := null;
    end if;
  else
    compare_percent := null;
  end if;

  return next;
end;
$$;

grant execute on function get_home_rollup(date) to authenticated;

insert into branches (name)
values
  ('한우대가 순천점'),
  ('한우대가 광양점'),
  ('대가정육마트'),
  ('카페 일공구공')
on conflict do nothing;
