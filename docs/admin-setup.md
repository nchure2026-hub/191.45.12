# IAMS initial administrator setup

The app intentionally has no public self-registration. Create the first administrator through the trusted Supabase dashboard, then sign in through the app.

## 1. Create the Auth user
1. Open the Supabase project dashboard: https://supabase.com/dashboard/project/nhchbztpqxtuxvmjwbsy
2. Go to **Authentication → Users** and create/invite the intended administrator using their real work email.
3. Copy the new Auth user's UUID. Do not share the user's password or service-role secret.

## 2. Create the company and profile
Open **SQL Editor** and run the following after replacing the two placeholders. The company is created first; use its returned UUID in the profile insert.

```sql
insert into public.companies (name, timezone)
values ('Your Company Name', 'Asia/Kolkata')
returning id;
```

Copy the returned company UUID, then run:

```sql
insert into public.user_profiles (id, company_id, full_name, role, active)
values (
  'REPLACE_WITH_AUTH_USER_UUID',
  'REPLACE_WITH_COMPANY_UUID',
  'System Administrator',
  'super_admin',
  true
);
```

Only trusted project administrators should execute these setup statements. Never grant the first super-admin role through public signup or editable user metadata.

## 3. Configure plants and departments
After signing in, plant and department management UI will be added in the next phase. Until then, create initial records in SQL Editor using the company UUID:

```sql
insert into public.plants (company_id, name, code, timezone, active)
values ('REPLACE_WITH_COMPANY_UUID', 'Main Plant', 'MAIN', 'Asia/Kolkata', true)
returning id;
```

Then add departments using the returned plant UUID:

```sql
insert into public.departments (company_id, plant_id, name, code, active)
values ('REPLACE_WITH_COMPANY_UUID', 'REPLACE_WITH_PLANT_UUID', 'Production', 'PROD', true);
```

For a plant manager or department supervisor, a Super Admin must create the appropriate row in `user_plant_assignments` or `user_department_assignments`. Without an explicit assignment, the manager has no access to that plant/department.

## 4. Local environment
Copy `.env.example` to `.env.local`, set the Supabase project URL and publishable/anon key, then run `npm install` and `npm run dev`.

## Safety notes
- Never put the service-role key in a `NEXT_PUBLIC_*` variable.
- The dashboard starts empty until company and attendance records are provisioned.
- The current phase includes employee creation/deactivation and a calculation module, but not the full punch processing/summary pipeline, so it is not yet a payroll source of truth.
