-- Prevent hard deletes of historical configuration and audit changes to operational setup.
drop policy if exists shifts_manage_scoped on public.shifts;
drop policy if exists shifts_insert_scoped on public.shifts;
drop policy if exists shifts_update_scoped on public.shifts;
create policy shifts_insert_scoped on public.shifts for insert to authenticated
with check (company_id=(select private.current_company_id()) and ((select private.current_role()) in ('super_admin','hr_manager') or ((select private.current_role())='plant_manager' and plant_id is not null and (select private.can_access_plant(plant_id)))));
create policy shifts_update_scoped on public.shifts for update to authenticated
using (company_id=(select private.current_company_id()) and ((select private.current_role()) in ('super_admin','hr_manager') or ((select private.current_role())='plant_manager' and plant_id is not null and (select private.can_access_plant(plant_id)))))
with check (company_id=(select private.current_company_id()) and ((select private.current_role()) in ('super_admin','hr_manager') or ((select private.current_role())='plant_manager' and plant_id is not null and (select private.can_access_plant(plant_id)))));

drop policy if exists shift_assignments_manage_scoped on public.shift_assignments;
drop policy if exists shift_assignments_insert_scoped on public.shift_assignments;
drop policy if exists shift_assignments_update_scoped on public.shift_assignments;
create policy shift_assignments_insert_scoped on public.shift_assignments for insert to authenticated
with check (company_id=(select private.current_company_id()) and ((select private.current_role()) in ('super_admin','hr_manager') or ((select private.current_role())='plant_manager' and (select private.can_access_employee(employee_id)))));
create policy shift_assignments_update_scoped on public.shift_assignments for update to authenticated
using (company_id=(select private.current_company_id()) and ((select private.current_role()) in ('super_admin','hr_manager') or ((select private.current_role())='plant_manager' and (select private.can_access_employee(employee_id)))))
with check (company_id=(select private.current_company_id()) and ((select private.current_role()) in ('super_admin','hr_manager') or ((select private.current_role())='plant_manager' and (select private.can_access_employee(employee_id)))));

drop policy if exists plants_manage_hr on public.plants;
drop policy if exists plants_insert_admin on public.plants;
drop policy if exists plants_update_admin on public.plants;
create policy plants_insert_admin on public.plants for insert to authenticated
with check(company_id=(select private.current_company_id()) and (select private.current_role()) in ('super_admin','hr_manager'));
create policy plants_update_admin on public.plants for update to authenticated
using(company_id=(select private.current_company_id()) and (select private.current_role()) in ('super_admin','hr_manager'))
with check(company_id=(select private.current_company_id()) and (select private.current_role()) in ('super_admin','hr_manager'));

drop policy if exists departments_manage_hr on public.departments;
drop policy if exists departments_insert_admin on public.departments;
drop policy if exists departments_update_admin on public.departments;
create policy departments_insert_admin on public.departments for insert to authenticated
with check(company_id=(select private.current_company_id()) and (select private.current_role()) in ('super_admin','hr_manager'));
create policy departments_update_admin on public.departments for update to authenticated
using(company_id=(select private.current_company_id()) and (select private.current_role()) in ('super_admin','hr_manager'))
with check(company_id=(select private.current_company_id()) and (select private.current_role()) in ('super_admin','hr_manager'));

drop policy if exists production_units_manage on public.production_units;
drop policy if exists production_units_insert on public.production_units;
drop policy if exists production_units_update on public.production_units;
create policy production_units_insert on public.production_units for insert to authenticated
with check(company_id=(select private.current_company_id()) and (select private.current_role()) in ('super_admin','hr_manager'));
create policy production_units_update on public.production_units for update to authenticated
using(company_id=(select private.current_company_id()) and (select private.current_role()) in ('super_admin','hr_manager'))
with check(company_id=(select private.current_company_id()) and (select private.current_role()) in ('super_admin','hr_manager'));

drop trigger if exists audit_user_plant_assignments on public.user_plant_assignments;
create trigger audit_user_plant_assignments after insert or update or delete on public.user_plant_assignments for each row execute function private.write_audit_log();
drop trigger if exists audit_user_department_assignments on public.user_department_assignments;
create trigger audit_user_department_assignments after insert or update or delete on public.user_department_assignments for each row execute function private.write_audit_log();
drop trigger if exists audit_production_units on public.production_units;
create trigger audit_production_units after insert or update or delete on public.production_units for each row execute function private.write_audit_log();
drop trigger if exists audit_attendance_policies on public.attendance_policies;
create trigger audit_attendance_policies after insert or update or delete on public.attendance_policies for each row execute function private.write_audit_log();
drop trigger if exists audit_holidays on public.holidays;
create trigger audit_holidays after insert or update or delete on public.holidays for each row execute function private.write_audit_log();
