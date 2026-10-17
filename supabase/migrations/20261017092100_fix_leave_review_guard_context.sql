-- Preserve trusted database maintenance operations while requiring HR for end-user reviews.
create or replace function public.guard_leave_request_review()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if coalesce(current_setting('role', true), '') <> 'authenticated' then
    return new;
  end if;

  if (select private.current_role()) <> 'hr_manager' then
    raise exception 'Leave requests can only be reviewed by an authorized HR Manager.';
  end if;

  if old.status <> 'pending' or new.status not in ('approved', 'rejected') then
    raise exception 'Only pending leave requests can be approved or rejected.';
  end if;

  if new.company_id is distinct from old.company_id
     or new.employee_id is distinct from old.employee_id
     or new.start_date is distinct from old.start_date
     or new.end_date is distinct from old.end_date
     or new.leave_type is distinct from old.leave_type
     or new.partial_day is distinct from old.partial_day
     or new.reason is distinct from old.reason
     or new.created_at is distinct from old.created_at then
    raise exception 'Submitted leave details cannot be changed during review. Reject the request and ask the employee to submit a corrected request.';
  end if;

  if new.reviewed_by is distinct from (select auth.uid()) or new.reviewed_at is null then
    raise exception 'The reviewing HR user and review timestamp are required.';
  end if;
  return new;
end;
$function$;
