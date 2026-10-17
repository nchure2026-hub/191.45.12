# IAMS — Industrial Attendance Management System

A Next.js App Router + TypeScript foundation for multi-plant industrial attendance operations.

## Implemented in Phase 1
- Supabase Auth password sign-in and sign-out using server-side cookie handling.
- Session refresh middleware.
- Authenticated dashboard that reads company, employee, shift, daily-summary, leave-review, correction-review and raw-punch data from Supabase.
- Company-scoped RLS policies and role-aware database policies.
- Additive schema for production units, attendance policies, holidays, contractors, contract workers, visitors, devices, import jobs and notifications.
- Pure attendance calculation module that reports missing/inconsistent punches instead of silently fabricating them.
- Environment-variable example without credentials.

## Not yet production-complete
- Employee/shift/leave/overtime CRUD screens and server mutations.
- Approved calculation-to-summary pipeline and transactional punch processing.
- CSV upload workflow and actual biometric/RFID device integration.
- Email notification delivery, PDF export, automated end-to-end tests, backup drills and full security review.
- Initial super-admin provisioning workflow.

Dashboard values are live queries, but a newly created project may show zeros until authorized users, company, plants, employees, shifts and attendance records are provisioned. Do not use this system for payroll or disciplinary decisions until the relevant workflows and calculation policies are validated by the organization.

## Requirements
- Node.js 20+
- npm
- Supabase project

## Local development
1. Clone the repository and install dependencies: `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` with the project URL and publishable/legacy anon key.
4. Run `npm run dev` and open `http://localhost:3000`.

## Database
Project ref: `nhchbztpqxtuxvmjwbsy` (Mumbai / `ap-south-1`).
Migration `phase_1_security_and_operations_schema` was applied to the connected project. The SQL migration should be kept in `supabase/migrations` and reviewed alongside future schema changes.

## Deployment
Import this repository into a compatible Next.js host. Configure the two public Supabase environment variables in the host. Never expose a service-role key in browser code or commit real secrets.
