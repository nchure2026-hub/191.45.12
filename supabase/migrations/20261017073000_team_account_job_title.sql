alter table public.user_profiles
  add column if not exists job_title text;
