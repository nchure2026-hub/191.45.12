-- Plant and department assignment helpers for scoped access control.
create table if not exists public.user_plant_assignments (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 plant_id uuid not null references public.plants(id) on delete cascade,
 created_at timestamptz not null default now(),
 unique(user_id, plant_id),
 foreign key (plant_id, company_id) references public.plants(id, company_id) on delete cascade
);
create table if not exists public.user_department_assignments (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 department_id uuid not null references public.departments(id) on delete cascade,
 created_at timestamptz not null default now(),
 unique(user_id, department_id),
 foreign key (department_id, company_id) references public.departments(id, company_id) on delete cascade
);
alter table public.user_plant_assignments enable row level security;
alter table public.user_department_assignments enable row level security;

create or replace function private.can_access_plant(target_plant uuid)
returns boolean language sql stable security definer set search_path=''
as $fn$
 select exists (
  select 1 from public.plants p
  where p.id=target_plant and p.company_id=(select private.current_company_id())
  and (
   (select private.current_role()) in ('super_admin','hr_manager')
   or ((select private.current_role())='plant_manager' and exists (
    select 1 from public.user_plant_assignments a where a.user_id=(select auth.uid()) and a.company_id=p.company_id and a.plant_id=p.id
   ))
   or ((select private.current_role())='department_supervisor' and exists (
    select 1 from public.user_department_assignments a join public.departments d on d.id=a.department_id
    where a.user_id=(select auth.uid()) and a.company_id=p.company_id and d.plant_id=p.id
   ))
   or ((select private.current_role())='employee' and exists (
    select 1 from public.employees e where e.id=(select private.current_employee_id()) and e.plant_id=p.id and e.company_id=p.company_id
   ))
  )
 )
$fn$;
create or replace function private.can_access_department(target_department uuid)
returns boolean language sql stable security definer set search_path=''
as $fn$
 select exists (
  select 1 from public.departments d
  where d.id=target_department and d.company_id=(select private.current_company_id())
  and (
   (select private.current_role()) in ('super_admin','hr_manager')
   or ((select private.current_role())='plant_manager' and (select private.can_access_plant(d.plant_id)))
   or ((select private.current_role())='department_supervisor' and exists (
    select 1 from public.user_department_assignments a where a.user_id=(select auth.uid()) and a.company_id=d.company_id and a.department_id=d.id
   ))
   or ((select private.current_role())='employee' and exists (
    select 1 from public.employees e where e.id=(select private.current_employee_id()) and e.department_id=d.id and e.company_id=d.company_id
   ))
  )
 )
$fn$;
create or replace function private.can_access_employee(target_employee uuid)
returns boolean language sql stable security definer set search_path=''
as $fn$
 select exists (
  select 1 from public.employees e
  where e.id=target_employee and e.company_id=(select private.current_company_id())
  and (
   (select private.current_role()) in ('super_admin','hr_manager')
   or ((select private.current_role())='plant_manager' and (select private.can_access_plant(e.plant_id)))
   or ((select private.current_role())='department_supervisor' and (select private.can_access_department(e.department_id)))
   or e.id=(select private.current_employee_id())
  )
 )
$fn$;
revoke all on function private.can_access_plant(uuid) from public, anon;
revoke all on function private.can_access_department(uuid) from public, anon;
revoke all on function private.can_access_employee(uuid) from public, anon;
grant execute on function private.can_access_plant(uuid) to authenticated;
grant execute on function private.can_access_department(uuid) to authenticated;
grant execute on function private.can_access_employee(uuid) to authenticated;
