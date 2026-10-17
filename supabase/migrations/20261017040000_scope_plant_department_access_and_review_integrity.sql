-- Restrict plant/department data to explicit assignments and prevent request self-approval.
create table if not exists public.user_plant_assignments(id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,plant_id uuid not null references public.plants(id) on delete cascade,created_at timestamptz not null default now(),unique(user_id,plant_id),foreign key(plant_id,company_id) references public.plants(id,company_id) on delete cascade);
create table if not exists public.user_department_assignments(id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,department_id uuid not null references public.departments(id) on delete cascade,created_at timestamptz not null default now(),unique(user_id,department_id),foreign key(department_id,company_id) references public.departments(id,company_id) on delete cascade);
alter table public.user_plant_assignments enable row level security;
alter table public.user_department_assignments enable row level security;

create or replace function private.can_access_plant(target_plant uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.plants p where p.id=target_plant and p.company_id=(select private.current_company_id()) and (
  (select private.current_role()) in('super_admin','hr_manager')
  or ((select private.current_role())='plant_manager' and exists(select 1 from public.user_plant_assignments a where a.user_id=(select auth.uid()) and a.company_id=p.company_id and a.plant_id=p.id))
  or ((select private.current_role())='department_supervisor' and exists(select 1 from public.user_department_assignments a join public.departments d on d.id=a.department_id where a.user_id=(select auth.uid()) and a.company_id=p.company_id and d.plant_id=p.id))
  or ((select private.current_role())='employee' and exists(select 1 from public.employees e where e.id=(select private.current_employee_id()) and e.plant_id=p.id and e.company_id=p.company_id))
 ))
$$;
create or replace function private.can_access_department(target_department uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.departments d where d.id=target_department and d.company_id=(select private.current_company_id()) and (
  (select private.current_role()) in('super_admin','hr_manager')
  or ((select private.current_role())='plant_manager' and (select private.can_access_plant(d.plant_id)))
  or ((select private.current_role())='department_supervisor' and exists(select 1 from public.user_department_assignments a where a.user_id=(select auth.uid()) and a.company_id=d.company_id and a.department_id=d.id))
  or ((select private.current_role())='employee' and exists(select 1 from public.employees e where e.id=(select private.current_employee_id()) and e.department_id=d.id and e.company_id=d.company_id))
 ))
$$;
create or replace function private.can_access_employee(target_employee uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.employees e where e.id=target_employee and e.company_id=(select private.current_company_id()) and (
  (select private.current_role()) in('super_admin','hr_manager')
  or ((select private.current_role())='plant_manager' and (select private.can_access_plant(e.plant_id)))
  or ((select private.current_role())='department_supervisor' and (select private.can_access_department(e.department_id)))
  or e.id=(select private.current_employee_id())
 ))
$$;
revoke all on function private.can_access_plant(uuid) from public,anon;
revoke all on function private.can_access_department(uuid) from public,anon;
revoke all on function private.can_access_employee(uuid) from public,anon;
grant execute on function private.can_access_plant(uuid),private.can_access_department(uuid),private.can_access_employee(uuid) to authenticated;

create policy user_plant_assignments_read on public.user_plant_assignments for select to authenticated using(user_id=(select auth.uid()) or (company_id=(select private.current_company_id()) and (select private.current_role())='super_admin'));
create policy user_plant_assignments_admin on public.user_plant_assignments for all to authenticated using(company_id=(select private.current_company_id()) and (select private.current_role())='super_admin') with check(company_id=(select private.current_company_id()) and (select private.current_role())='super_admin');
create policy user_department_assignments_read on public.user_department_assignments for select to authenticated using(user_id=(select auth.uid()) or (company_id=(select private.current_company_id()) and (select private.current_role())='super_admin'));
create policy user_department_assignments_admin on public.user_department_assignments for all to authenticated using(company_id=(select private.current_company_id()) and (select private.current_role())='super_admin') with check(company_id=(select private.current_company_id()) and (select private.current_role())='super_admin');
grant select,insert,update,delete on public.user_plant_assignments,public.user_department_assignments to authenticated;

drop policy if exists profiles_manage_hr on public.user_profiles;
drop policy if exists profiles_manage_admin on public.user_profiles;
drop policy if exists profiles_read_scoped on public.user_profiles;
create policy profiles_read_scoped on public.user_profiles for select to authenticated using(id=(select auth.uid()) or (company_id=(select private.current_company_id()) and ((select private.current_role()) in('super_admin','hr_manager') or (employee_id is not null and (select private.can_access_employee(employee_id))))));
create policy profiles_manage_admin on public.user_profiles for all to authenticated using(company_id=(select private.current_company_id()) and (select private.current_role())='super_admin') with check(company_id=(select private.current_company_id()) and (select private.current_role())='super_admin');

drop policy if exists plants_read_tenant on public.plants;
drop policy if exists plants_read_scoped on public.plants;
drop policy if exists plants_manage_hr on public.plants;
create policy plants_read_scoped on public.plants for select to authenticated using(company_id=(select private.current_company_id()) and (select private.can_access_plant(id)));
create policy plants_manage_hr on public.plants for all to authenticated using(company_id=(select private.current_company_id()) and (select private.current_role()) in('super_admin','hr_manager')) with check(company_id=(select private.current_company_id()) and (select private.current_role()) in('super_admin','hr_manager'));

drop policy if exists departments_read_tenant on public.departments;
drop policy if exists departments_read_scoped on public.departments;
drop policy if exists departments_manage_hr on public.departments;
create policy departments_read_scoped on public.departments for select to authenticated using(company_id=(select private.current_company_id()) and (select private.can_access_department(id)));
create policy departments_manage_hr on public.departments for all to authenticated using(company_id=(select private.current_company_id()) and (select private.current_role()) in('super_admin','hr_manager')) with check(company_id=(select private.current_company_id()) and (select private.current_role()) in('super_admin','hr_manager'));

drop policy if exists employees_read_scoped on public.employees;
drop policy if exists employees_manage_hr on public.employees;
drop policy if exists employees_manage_scoped on public.employees;
create policy employees_read_scoped on public.employees for select to authenticated using(company_id=(select private.current_company_id()) and (select private.can_access_employee(id)));
create policy employees_manage_scoped on public.employees for all to authenticated using(company_id=(select private.current_company_id()) and ((select private.current_role()) in('super_admin','hr_manager') or ((select private.current_role())='plant_manager' and (select private.can_access_plant(plant_id))))) with check(company_id=(select private.current_company_id()) and ((select private.current_role()) in('super_admin','hr_manager') or ((select private.current_role())='plant_manager' and (select private.can_access_plant(plant_id)))));

drop policy if exists shifts_read_tenant on public.shifts;
drop policy if exists shifts_read_scoped on public.shifts;
drop policy if exists shifts_manage_hr on public.shifts;
drop policy if exists shifts_manage_scoped on public.shifts;
create policy shifts_read_scoped on public.shifts for select to authenticated using(company_id=(select private.current_company_id()) and (plant_id is null or (select private.can_access_plant(plant_id))));
create policy shifts_manage_scoped on public.shifts for all to authenticated using(company_id=(select private.current_company_id()) and ((select private.current_role()) in('super_admin','hr_manager') or ((select private.current_role())='plant_manager' and plant_id is not null and (select private.can_access_plant(plant_id))))) with check(company_id=(select private.current_company_id()) and ((select private.current_role()) in('super_admin','hr_manager') or ((select private.current_role())='plant_manager' and plant_id is not null and (select private.can_access_plant(plant_id)))));

drop policy if exists shift_assignments_read_scoped on public.shift_assignments;
drop policy if exists shift_assignments_manage_hr on public.shift_assignments;
drop policy if exists shift_assignments_manage_scoped on public.shift_assignments;
create policy shift_assignments_read_scoped on public.shift_assignments for select to authenticated using(company_id=(select private.current_company_id()) and (select private.can_access_employee(employee_id)));
create policy shift_assignments_manage_scoped on public.shift_assignments for all to authenticated using(company_id=(select private.current_company_id()) and ((select private.current_role()) in('super_admin','hr_manager') or ((select private.current_role())='plant_manager' and (select private.can_access_employee(employee_id))))) with check(company_id=(select private.current_company_id()) and ((select private.current_role()) in('super_admin','hr_manager') or ((select private.current_role())='plant_manager' and (select private.can_access_employee(employee_id)))));

drop policy if exists punches_read_scoped on public.attendance_punches;
drop policy if exists punches_insert_authorized on public.attendance_punches;
create policy punches_read_scoped on public.attendance_punches for select to authenticated using(company_id=(select private.current_company_id()) and (select private.can_access_employee(employee_id)));
create policy punches_insert_authorized on public.attendance_punches for insert to authenticated with check(company_id=(select private.current_company_id()) and created_by=(select auth.uid()) and (select private.can_access_employee(employee_id)));
drop policy if exists summaries_read_scoped on public.daily_attendance_summaries;
create policy summaries_read_scoped on public.daily_attendance_summaries for select to authenticated using(company_id=(select private.current_company_id()) and (select private.can_access_employee(employee_id)));

drop policy if exists leave_read_scoped on public.leave_requests;
drop policy if exists leave_insert_self on public.leave_requests;
drop policy if exists leave_review_hr on public.leave_requests;
drop policy if exists leave_review_scoped on public.leave_requests;
create policy leave_read_scoped on public.leave_requests for select to authenticated using(company_id=(select private.current_company_id()) and (select private.can_access_employee(employee_id)));
create policy leave_insert_self on public.leave_requests for insert to authenticated with check(company_id=(select private.current_company_id()) and employee_id=(select private.current_employee_id()) and status='pending' and reviewed_by is null and reviewed_at is null);
create policy leave_review_scoped on public.leave_requests for update to authenticated using(company_id=(select private.current_company_id()) and employee_id<>(select private.current_employee_id()) and (select private.can_access_employee(employee_id)) and (select private.current_role()) in('super_admin','hr_manager','plant_manager','department_supervisor') and status='pending') with check(company_id=(select private.current_company_id()) and employee_id<>(select private.current_employee_id()) and (select private.can_access_employee(employee_id)) and reviewed_by=(select auth.uid()) and status in('approved','rejected'));

drop policy if exists correction_read_scoped on public.attendance_correction_requests;
drop policy if exists correction_insert_self on public.attendance_correction_requests;
drop policy if exists correction_review_hr on public.attendance_correction_requests;
drop policy if exists correction_review_scoped on public.attendance_correction_requests;
create policy correction_read_scoped on public.attendance_correction_requests for select to authenticated using(company_id=(select private.current_company_id()) and (select private.can_access_employee(employee_id)));
create policy correction_insert_self on public.attendance_correction_requests for insert to authenticated with check(company_id=(select private.current_company_id()) and employee_id=(select private.current_employee_id()) and status='pending' and reviewed_by is null and reviewed_at is null);
create policy correction_review_scoped on public.attendance_correction_requests for update to authenticated using(company_id=(select private.current_company_id()) and employee_id<>(select private.current_employee_id()) and (select private.can_access_employee(employee_id)) and (select private.current_role()) in('super_admin','hr_manager','plant_manager','department_supervisor') and status='pending') with check(company_id=(select private.current_company_id()) and employee_id<>(select private.current_employee_id()) and (select private.can_access_employee(employee_id)) and reviewed_by=(select auth.uid()) and status in('approved','rejected'));

drop policy if exists overtime_read_scoped on public.overtime_requests;
drop policy if exists overtime_insert_self on public.overtime_requests;
drop policy if exists overtime_review_hr on public.overtime_requests;
drop policy if exists overtime_review_scoped on public.overtime_requests;
create policy overtime_read_scoped on public.overtime_requests for select to authenticated using(company_id=(select private.current_company_id()) and (select private.can_access_employee(employee_id)));
create policy overtime_insert_self on public.overtime_requests for insert to authenticated with check(company_id=(select private.current_company_id()) and employee_id=(select private.current_employee_id()) and status='pending' and reviewed_by is null and reviewed_at is null and approved_minutes=0);
create policy overtime_review_scoped on public.overtime_requests for update to authenticated using(company_id=(select private.current_company_id()) and employee_id<>(select private.current_employee_id()) and (select private.can_access_employee(employee_id)) and (select private.current_role()) in('super_admin','hr_manager','plant_manager','department_supervisor') and status='pending') with check(company_id=(select private.current_company_id()) and employee_id<>(select private.current_employee_id()) and (select private.can_access_employee(employee_id)) and reviewed_by=(select auth.uid()) and status in('approved','rejected'));

drop policy if exists production_units_read on public.production_units;
drop policy if exists production_units_manage on public.production_units;
create policy production_units_read on public.production_units for select to authenticated using(company_id=(select private.current_company_id()) and (select private.can_access_plant(plant_id)));
create policy production_units_manage on public.production_units for all to authenticated using(company_id=(select private.current_company_id()) and (select private.current_role()) in('super_admin','hr_manager')) with check(company_id=(select private.current_company_id()) and (select private.current_role()) in('super_admin','hr_manager'));
drop policy if exists holidays_read on public.holidays;
drop policy if exists holidays_manage on public.holidays;
create policy holidays_read on public.holidays for select to authenticated using(company_id=(select private.current_company_id()) and (plant_id is null or (select private.can_access_plant(plant_id))));
create policy holidays_manage on public.holidays for all to authenticated using(company_id=(select private.current_company_id()) and (select private.current_role()) in('super_admin','hr_manager')) with check(company_id=(select private.current_company_id()) and (select private.current_role()) in('super_admin','hr_manager'));
drop policy if exists contract_workers_read on public.contract_workers;
drop policy if exists contract_workers_manage on public.contract_workers;
create policy contract_workers_read on public.contract_workers for select to authenticated using(company_id=(select private.current_company_id()) and (plant_id is null or (select private.can_access_plant(plant_id))));
create policy contract_workers_manage on public.contract_workers for all to authenticated using(company_id=(select private.current_company_id()) and (select private.current_role()) in('super_admin','hr_manager','plant_manager') and (plant_id is null or (select private.can_access_plant(plant_id)))) with check(company_id=(select private.current_company_id()) and (select private.current_role()) in('super_admin','hr_manager','plant_manager') and (plant_id is null or (select private.can_access_plant(plant_id))));
drop policy if exists visitors_read on public.visitors;
drop policy if exists visitors_manage on public.visitors;
create policy visitors_read on public.visitors for select to authenticated using(company_id=(select private.current_company_id()) and (plant_id is null or (select private.can_access_plant(plant_id))));
create policy visitors_manage on public.visitors for all to authenticated using(company_id=(select private.current_company_id()) and (select private.current_role()) in('super_admin','hr_manager','plant_manager','department_supervisor') and (plant_id is null or (select private.can_access_plant(plant_id)))) with check(company_id=(select private.current_company_id()) and (select private.current_role()) in('super_admin','hr_manager','plant_manager','department_supervisor') and (plant_id is null or (select private.can_access_plant(plant_id))));
drop policy if exists devices_read on public.attendance_devices;
drop policy if exists devices_manage on public.attendance_devices;
create policy devices_read on public.attendance_devices for select to authenticated using(company_id=(select private.current_company_id()) and (plant_id is null or (select private.can_access_plant(plant_id))));
create policy devices_manage on public.attendance_devices for all to authenticated using(company_id=(select private.current_company_id()) and (select private.current_role()) in('super_admin','hr_manager') and (plant_id is null or (select private.can_access_plant(plant_id)))) with check(company_id=(select private.current_company_id()) and (select private.current_role()) in('super_admin','hr_manager') and (plant_id is null or (select private.can_access_plant(plant_id))));

create or replace function private.guard_review_request() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (to_jsonb(new)-array['status','reviewed_by','reviewed_at','reviewer_comment']) is distinct from (to_jsonb(old)-array['status','reviewed_by','reviewed_at','reviewer_comment']) then raise exception 'Submitted request details are immutable'; end if;
 if old.status<>'pending' then raise exception 'Only pending requests can be reviewed'; end if;
 if new.status not in('approved','rejected') then raise exception 'Review must approve or reject the request'; end if;
 if new.reviewed_by is distinct from auth.uid() then raise exception 'Reviewer must match signed-in user'; end if;
 if new.reviewed_at is null then raise exception 'Review timestamp is required'; end if;
 if new.status='rejected' and nullif(btrim(new.reviewer_comment),'') is null then raise exception 'A rejection comment is required'; end if;
 return new;
end $$;
revoke all on function private.guard_review_request() from public,anon,authenticated;
drop trigger if exists guard_leave_review on public.leave_requests;
create trigger guard_leave_review before update on public.leave_requests for each row execute function private.guard_review_request();
drop trigger if exists guard_correction_review on public.attendance_correction_requests;
create trigger guard_correction_review before update on public.attendance_correction_requests for each row execute function private.guard_review_request();
drop trigger if exists guard_overtime_review on public.overtime_requests;
create trigger guard_overtime_review before update on public.overtime_requests for each row execute function private.guard_review_request();
