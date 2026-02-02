with admin_user as (
  select id
  from profiles
  where role = 'admin'
  limit 1
),
branches_base as (
  select
    b.id as branch_id,
    b.name as branch_name,
    case b.name
      when '한우대가 순천점' then 12000000
      when '한우대가 광양점' then 10000000
      when '대가정육마트' then 8000000
      when '카페 일공구공' then 3500000
      else 5000000
    end as base_amount
  from branches b
),
dates as (
  select generate_series(current_date - interval '60 day', current_date, interval '1 day')::date as entry_date
)
insert into sales_entries (branch_id, entry_date, amount, created_by)
select
  b.branch_id,
  d.entry_date,
  (
    b.base_amount + (random() * 800000)
  )::bigint as amount,
  a.id as created_by
from branches_base b
cross join dates d
cross join admin_user a
on conflict do nothing;
