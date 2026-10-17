-- IAMS baseline schema. Supabase Auth owns authentication credentials; this schema stores app profiles only.
do $$ begin create type public.app_role as enum ('super_admin','hr_manager','plant_manager','department_supervisor','employee'); exception when duplicate_object then null; end $$;
do $$ begin create type public.employment_type as enum ('permanent','temporary','trainee','contract'); exception when duplicate_object then null; end $$;
do $$ begin create type public.employment_status as enum ('active','inactive','resigned','terminated'); exception when duplicate_object then null; end $$;
do $$ begin create type public.punch_type as enum ('check_in','check_out','break_start','break_end','manual'); exception when duplicate_object then null; end $$;

create table if not exists public.companies (
 id uuid primary key default gen_random_uuid(), name text not null,
 timezone text not null default 'Asia/Kolkata',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.plants (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 name text not null, code text not null, address text, timezone text not null default 'Asia/Kolkata',
 active boolean not null default true, created_at timestamptz not null default now(),
 unique(company_id, code), unique(id, company_id)
);
create table if not exists public.departments (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 plant_id uuid references public.plants(id) on delete restrict, name text not null, code text not null,
 active boolean not null default true, created_at timestamptz not null default now(),
 unique(company_id, code), unique(id, company_id),
 foreign key (plant_id, company_id) references public.plants(id, company_id) on delete restrict
);
create table if not exists public.employees (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 plant_id uuid, department_id uuid, employee_code text not null, full_name text not null,
 designation text, employment_type public.employment_type not null default 'permanent',
 employment_status public.employment_status not null default 'active', joining_date date,
 phone text, work_email text, supervisor_employee_id uuid,
 weekly_off_days integer[] not null default array[0]::integer[],
 biometric_identifier text, rfid_identifier text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id, employee_code), unique(id, company_id),
 foreign key (plant_id, company_id) references public.plants(id, company_id) on delete restrict,
 foreign key (department_id, company_id) references public.departments(id, company_id) on delete set null
);
create table if not exists public.user_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 company_id uuid not null references public.companies(id) on delete restrict,
 full_name text not null, role public.app_role not null default 'employee',
 employee_id uuid, active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key (employee_id, company_id) references public.employees(id, company_id) on delete set null
);
do $$ begin
 if not exists (select 1 from pg_constraint where conname='employees_supervisor_company_fk') then
  alter table public.employees add constraint employees_supervisor_company_fk
  foreign key (supervisor_employee_id, company_id) references public.employees(id, company_id) on delete set null;
 end if;
end $$;
create table if not exists public.shifts (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 plant_id uuid, name text not null, code text not null, start_time time not null, end_time time not null,
 break_minutes integer not null default 0 check (break_minutes between 0 and 600),
 grace_minutes integer not null default 0 check (grace_minutes between 0 and 240),
 scheduled_minutes integer not null default 480 check (scheduled_minutes between 1 and 1440),
 overnight boolean not null default false, overtime_after_minutes integer not null default 480,
 active boolean not null default true, created_at timestamptz not null default now(),
 unique(company_id, code), unique(id, company_id),
 foreign key (plant_id, company_id) references public.plants(id, company_id) on delete restrict
);
create table if not exists public.shift_assignments (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 employee_id uuid not null, shift_id uuid not null, effective_from date not null,
 effective_to date, created_at timestamptz not null default now(),
 check (effective_to is null or effective_to >= effective_from),
 foreign key (employee_id, company_id) references public.employees(id, company_id) on delete restrict,
 foreign key (shift_id, company_id) references public.shifts(id, company_id) on delete restrict
);
create table if not exists public.attendance_punches (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 employee_id uuid not null, punch_type public.punch_type not null, punched_at timestamptz not null,
 source text not null default 'manual', device_reference text, reason text, created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 foreign key (employee_id, company_id) references public.employees(id, company_id) on delete restrict
);
create unique index if not exists attendance_punches_device_reference_uq on public.attendance_punches(company_id, device_reference) where device_reference is not null;
create table if not exists public.daily_attendance_summaries (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 employee_id uuid not null, work_date date not null, shift_id uuid, first_check_in timestamptz, last_check_out timestamptz,
 worked_minutes integer not null default 0, late_minutes integer not null default 0,
 early_departure_minutes integer not null default 0, overtime_minutes integer not null default 0,
 status text not null default 'missing_punch', calculation_version integer not null default 1,
 calculated_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key (employee_id, company_id) references public.employees(id, company_id) on delete restrict,
 foreign key (shift_id, company_id) references public.shifts(id, company_id) on delete restrict,
 unique(company_id, employee_id, work_date, shift_id)
);
create table if not exists public.leave_requests (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 employee_id uuid not null, start_date date not null, end_date date not null, leave_type text not null,
 partial_day boolean not null default false, reason text not null, status text not null default 'pending',
 reviewed_by uuid references auth.users(id) on delete set null, reviewed_at timestamptz, reviewer_comment text,
 created_at timestamptz not null default now(), check (end_date >= start_date),
 foreign key (employee_id, company_id) references public.employees(id, company_id) on delete restrict
);
create table if not exists public.attendance_correction_requests (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 employee_id uuid not null, work_date date not null, proposed_check_in timestamptz, proposed_check_out timestamptz,
 reason text not null, status text not null default 'pending', reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz, reviewer_comment text, created_at timestamptz not null default now(),
 foreign key (employee_id, company_id) references public.employees(id, company_id) on delete restrict,
 check (proposed_check_out is null or proposed_check_in is null or proposed_check_out >= proposed_check_in)
);
create table if not exists public.overtime_requests (
 id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
 employee_id uuid not null, work_date date not null, requested_minutes integer not null check (requested_minutes > 0),
 approved_minutes integer not null default 0 check (approved_minutes >= 0), reason text not null,
 status text not null default 'pending', reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz, reviewer_comment text, created_at timestamptz not null default now(),
 foreign key (employee_id, company_id) references public.employees(id, company_id) on delete restrict
);
create table if not exists public.audit_logs (
 id bigint generated always as identity primary key, company_id uuid not null references public.companies(id) on delete restrict,
 actor_id uuid references auth.users(id) on delete set null, action text not null, entity_type text not null,
 entity_id text, reason text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table public.companies enable row level security;
alter table public.plants enable row level security;
alter table public.departments enable row level security;
alter table public.employees enable row level security;
alter table public.user_profiles enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_assignments enable row level security;
alter table public.attendance_punches enable row level security;
alter table public.daily_attendance_summaries enable row level security;
alter table public.leave_requests enable row level security;
alter table public.attendance_correction_requests enable row level security;
alter table public.overtime_requests enable row level security;
alter table public.audit_logs enable row level security;
