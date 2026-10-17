-- Employee self-service portal: private selfie evidence and server-validated punch transitions.
alter table public.attendance_punches
  add column if not exists face_capture_path text,
  add column if not exists face_capture_consent_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attendance-face-captures', 'attendance-face-captures', false, 2097152, array['image/jpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = 2097152,
    allowed_mime_types = array['image/jpeg'];

drop policy if exists employee_face_captures_insert on storage.objects;
create policy employee_face_captures_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'attendance-face-captures'
  and (storage.foldername(name))[1] = (select private.current_company_id())::text
  and (storage.foldername(name))[2] = (select private.current_employee_id())::text
  and (select private.current_role()) = 'employee'
  and exists (
    select 1
    from public.user_profiles p
    join public.employees e on e.id = p.employee_id and e.company_id = p.company_id
    where p.id = (select auth.uid())
      and p.company_id = (select private.current_company_id())
      and p.employee_id = (select private.current_employee_id())
      and p.role = 'employee'
      and p.active = true
      and e.employment_status = 'active'
  )
);

drop policy if exists employee_face_captures_read_scoped on storage.objects;
create policy employee_face_captures_read_scoped
on storage.objects for select to authenticated
using (
  bucket_id = 'attendance-face-captures'
  and (storage.foldername(name))[1] = (select private.current_company_id())::text
  and (
    (select private.current_role()) in ('super_admin', 'hr_manager')
    or (storage.foldername(name))[2] = (select private.current_employee_id())::text
  )
);

create or replace function public.record_employee_punch(
  p_punch_type text,
  p_face_capture_path text,
  p_face_capture_consent boolean
) returns public.attendance_punches
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_employee_id uuid;
  v_role text;
  v_employee_status public.employment_status;
  v_plant_id uuid;
  v_timezone text;
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

  if p_punch_type not in ('check_in', 'break_start', 'break_end', 'check_out') then
    raise exception 'Unsupported attendance action.' using errcode = '22023';
  end if;

  select p.company_id, p.employee_id, p.role::text
    into v_company_id, v_employee_id, v_role
  from public.user_profiles p
  where p.id = v_user_id and p.active = true;

  if v_company_id is null or v_employee_id is null or v_role <> 'employee' then
    raise exception 'This login is not linked to an active employee account.' using errcode = '42501';
  end if;

  -- Lock the employee row so simultaneous taps cannot create contradictory punches.
  select e.employment_status, e.plant_id
    into v_employee_status, v_plant_id
  from public.employees e
  where e.id = v_employee_id and e.company_id = v_company_id
  for update;

  if not found or v_employee_status <> 'active' then
    raise exception 'Your employee record is not active. Contact your supervisor.' using errcode = '42501';
  end if;

  select coalesce(pl.timezone, c.timezone, 'Asia/Kolkata')
    into v_timezone
  from public.companies c
  left join public.plants pl on pl.id = v_plant_id and pl.company_id = c.id
  where c.id = v_company_id;

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
