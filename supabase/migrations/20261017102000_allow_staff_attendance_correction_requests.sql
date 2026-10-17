-- Allow authorized plant staff to submit a pending attendance correction on behalf of an active worker.
-- This is a review request only; it does not create an attendance punch or approve the correction.
drop policy if exists correction_insert_staff_pending on public.attendance_correction_requests;
create policy correction_insert_staff_pending
on public.attendance_correction_requests
for insert
to authenticated
with check (
  company_id = (select private.current_company_id())
  and (
    (select private.current_employee_id()) is null
    or employee_id <> (select private.current_employee_id())
  )
  and (select private.can_access_employee(employee_id))
  and (select private."current_role"()) = any(array['super_admin','hr_manager','plant_manager','department_supervisor'])
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and exists (
    select 1
    from public.employees e
    where e.id = attendance_correction_requests.employee_id
      and e.company_id = attendance_correction_requests.company_id
      and e.employment_status = 'active'
  )
);
