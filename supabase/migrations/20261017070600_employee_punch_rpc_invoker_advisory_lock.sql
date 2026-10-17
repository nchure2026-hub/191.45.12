-- Recreate the employee punch RPC as SECURITY INVOKER and serialize by employee ID.
-- This keeps RLS active for employee/profile/punch/storage reads and writes while
-- avoiding SELECT FOR UPDATE (which would require employee UPDATE privileges).
create or replace function public.record_employee_punch(
  p_punch_type text,
  p_face_capture_path text,
  p_face_capture_consent boolean
) returns public.attendance_punches
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_employee_id uuid;
  v_role text;
  v_employee_status public.employment_status;
  v_plant_id uuid;
  v_latest public.attendance_punches%rowtype;
  v_saved public.attendance_punches%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Please sign in again before recording attendance.' using errcode = '28000';
  end if;

  if coalesce(p_face_capture_consent, false) is not true then
    raise exception 'Consent is required before a face photo can be saved.' using errcode = '42501';
  end if;

  if p_punch_type is null or p_punch_type not in ('check_in', 'break_start', 'break_end', 'check_out') then
    raise exception 'Unsupported attendance action.' using errcode = '22023';
  end if;

  select p.company_id, p.employee_id, p.role::text
    into v_company_id, v_employee_id, v_role
  from public.user_profiles p
  where p.id = v_user_id and p.active = true;

  if v_company_id is null or v_employee_id is null or v_role <> 'employee' then
    raise exception 'This login is not linked to an active employee account.' using errcode = '42501';
  end if;

  -- Serialize all punches for this employee without needing UPDATE privileges on employees.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_employee_id::text, 0));

  select e.employment_status, e.plant_id
    into v_employee_status, v_plant_id
  from public.employees e
  where e.id = v_employee_id and e.company_id = v_company_id;

  if not found or v_employee_status <> 'active' then
    raise exception 'Your employee record is not active. Contact your supervisor.' using errcode = '42501';
  end if;

  if p_face_capture_path is null
     or length(p_face_capture_path) > 300
     or p_face_capture_path not like v_company_id::text || '/' || v_employee_id::text || '/%'
     or not exists (
       select 1 from storage.objects o
       where o.bucket_id = 'attendance-face-captures' and o.name = p_face_capture_path
     ) then
    raise exception 'A valid attendance face photo is required. Please take the photo again.' using errcode = '22023';
  end if;

  select * into v_latest
  from public.attendance_punches ap
  where ap.company_id = v_company_id and ap.employee_id = v_employee_id
  order by ap.punched_at desc, ap.created_at desc
  limit 1;

  if v_latest.id is not null and v_latest.punch_type <> 'check_out'
     and v_latest.punched_at < v_now - interval '18 hours' then
    raise exception 'Your previous attendance session is still open. Contact your supervisor to correct it before punching again.' using errcode = '22023';
  end if;

  if v_latest.id is null or v_latest.punch_type = 'check_out' then
    if p_punch_type <> 'check_in' then
      raise exception 'Please check in first.' using errcode = '22023';
    end if;
  elsif v_latest.punch_type = 'check_in' then
    if p_punch_type not in ('break_start', 'check_out') then
      raise exception 'Next action must be Start break or Check out.' using errcode = '22023';
    end if;
  elsif v_latest.punch_type = 'break_start' then
    if p_punch_type <> 'break_end' then
      raise exception 'Please end your break before the next action.' using errcode = '22023';
    end if;
  elsif v_latest.punch_type = 'break_end' then
    if p_punch_type not in ('break_start', 'check_out') then
      raise exception 'Next action must be Start break or Check out.' using errcode = '22023';
    end if;
  else
    raise exception 'The previous attendance session needs supervisor review.' using errcode = '22023';
  end if;

  insert into public.attendance_punches (
    company_id, employee_id, punch_type, punched_at, source,
    device_reference, created_by, face_capture_path, face_capture_consent_at
  ) values (
    v_company_id, v_employee_id, p_punch_type::public.punch_type, v_now,
    'employee_face_capture', gen_random_uuid()::text, v_user_id,
    p_face_capture_path, v_now
  )
  returning * into v_saved;

  return v_saved;
end;
$function$;

revoke all on function public.record_employee_punch(text, text, boolean) from public, anon;
grant execute on function public.record_employee_punch(text, text, boolean) to authenticated;
