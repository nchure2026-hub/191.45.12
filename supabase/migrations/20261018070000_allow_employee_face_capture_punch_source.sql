-- Keep the employee self-service photo-capture source allowed by the punch RPC.
-- Photo capture is attendance evidence; it does not imply automated facial recognition.
alter table public.attendance_punches
  drop constraint if exists attendance_punches_source_check;

alter table public.attendance_punches
  add constraint attendance_punches_source_check
  check (
    source = any (
      array[
        'self_service'::text,
        'manual'::text,
        'biometric'::text,
        'rfid'::text,
        'csv_import'::text,
        'simulator'::text,
        'employee_face_capture'::text
      ]
    )
  );
