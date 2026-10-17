drop policy if exists employees_manage_scoped on public.employees;
drop policy if exists employees_insert_scoped on public.employees;
drop policy if exists employees_update_scoped on public.employees;
create policy employees_insert_scoped on public.employees for insert to authenticated
with check (company_id=(select private.current_company_id()) and ((select private.current_role()) in ('super_admin','hr_manager') or ((select private.current_role())='plant_manager' and (select private.can_access_plant(plant_id)))));
create policy employees_update_scoped on public.employees for update to authenticated
using (company_id=(select private.current_company_id()) and ((select private.current_role()) in ('super_admin','hr_manager') or ((select private.current_role())='plant_manager' and (select private.can_access_plant(plant_id)))))
with check (company_id=(select private.current_company_id()) and ((select private.current_role()) in ('super_admin','hr_manager') or ((select private.current_role())='plant_manager' and (select private.can_access_plant(plant_id)))));

create or replace function private.write_audit_log() returns trigger language plpgsql security definer set search_path='' as $fn$
declare v_company_id uuid; v_entity_id text; v_reason text;
begin
 if tg_op='DELETE' then v_company_id:=old.company_id; v_entity_id:=old.id::text; v_reason:=to_jsonb(old)->>'reason';
 else v_company_id:=new.company_id; v_entity_id:=new.id::text; v_reason:=to_jsonb(new)->>'reason'; end if;
 insert into public.audit_logs(company_id,actor_id,action,entity_type,entity_id,reason,metadata)
 values(v_company_id,auth.uid(),lower(tg_op),tg_table_name,v_entity_id,v_reason,jsonb_build_object('audit_source','database_trigger'));
 if tg_op='DELETE' then return old; end if; return new;
end $fn$;
revoke all on function private.write_audit_log() from public,anon,authenticated;
drop trigger if exists audit_employees on public.employees;
create trigger audit_employees after insert or update or delete on public.employees for each row execute function private.write_audit_log();
drop trigger if exists audit_user_profiles on public.user_profiles;
create trigger audit_user_profiles after insert or update or delete on public.user_profiles for each row execute function private.write_audit_log();
drop trigger if exists audit_plants on public.plants;
create trigger audit_plants after insert or update or delete on public.plants for each row execute function private.write_audit_log();
drop trigger if exists audit_departments on public.departments;
create trigger audit_departments after insert or update or delete on public.departments for each row execute function private.write_audit_log();
drop trigger if exists audit_shifts on public.shifts;
create trigger audit_shifts after insert or update or delete on public.shifts for each row execute function private.write_audit_log();
drop trigger if exists audit_shift_assignments on public.shift_assignments;
create trigger audit_shift_assignments after insert or update or delete on public.shift_assignments for each row execute function private.write_audit_log();
drop trigger if exists audit_attendance_punches on public.attendance_punches;
create trigger audit_attendance_punches after insert or update or delete on public.attendance_punches for each row execute function private.write_audit_log();
drop trigger if exists audit_leave_requests on public.leave_requests;
create trigger audit_leave_requests after insert or update or delete on public.leave_requests for each row execute function private.write_audit_log();
drop trigger if exists audit_correction_requests on public.attendance_correction_requests;
create trigger audit_correction_requests after insert or update or delete on public.attendance_correction_requests for each row execute function private.write_audit_log();
drop trigger if exists audit_overtime_requests on public.overtime_requests;
create trigger audit_overtime_requests after insert or update or delete on public.overtime_requests for each row execute function private.write_audit_log();
drop trigger if exists audit_contractors on public.contractors;
create trigger audit_contractors after insert or update or delete on public.contractors for each row execute function private.write_audit_log();
drop trigger if exists audit_contract_workers on public.contract_workers;
create trigger audit_contract_workers after insert or update or delete on public.contract_workers for each row execute function private.write_audit_log();
drop trigger if exists audit_visitors on public.visitors;
create trigger audit_visitors after insert or update or delete on public.visitors for each row execute function private.write_audit_log();
drop trigger if exists audit_attendance_devices on public.attendance_devices;
create trigger audit_attendance_devices after insert or update or delete on public.attendance_devices for each row execute function private.write_audit_log();
drop trigger if exists audit_device_import_jobs on public.device_import_jobs;
create trigger audit_device_import_jobs after insert or update or delete on public.device_import_jobs for each row execute function private.write_audit_log();
