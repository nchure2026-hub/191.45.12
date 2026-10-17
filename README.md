# IAMS — Industrial Attendance Management System

A Next.js App Router + TypeScript foundation for multi-plant industrial attendance operations.

## Implemented in Phase 1
- Supabase Auth password sign-in and sign-out using server-side cookie handling.
- Session refresh middleware.
- Authenticated dashboard that reads company, employee, shift, daily-summary, leave-review, correction-review and raw-punch data from Supabase.
- Employee directory with scoped search, validated employee creation and safe deactivation (no destructive employee deletion).
- Shift template creation/deactivation with validated shift times, break/grace policies and automatic overnight detection.
- Separate `/employee-portal/login` and `/employee-portal` worker portal, linked employee credentials provisioned by HR/admin, mobile front-camera selfie capture per punch, check-in/break/check-out flow, and personal attendance history.
- Private Supabase Storage bucket for face-photo evidence and a server-validated transactional attendance punch function with allowed-transition checks.
- Company-scoped RLS policies and role-aware database policies.
- Additive schema for production units, attendance policies, holidays, contractors, contract workers, visitors, devices, import jobs and notifications.
- Pure attendance calculation module that reports missing/inconsistent punches instead of silently fabricating them.
- Environment-variable example without credentials.

## Not yet production-complete
- Employee editing/transfers, shift editing/assignments, leave/overtime UI and server mutations.
- Approved calculation-to-summary pipeline and shift/overnight-aware payroll-grade calculations. Worker punches are transactionally validated, but daily summary payroll processing is still not completed.
- CSV upload workflow, actual biometric/RFID hardware integration, and automated facial identity matching. The worker portal currently captures a photo for attendance evidence; it does not claim to match a face against an enrolled biometric template.
- Email notification delivery, PDF export, automated end-to-end tests, backup drills and full security review.
- Custom email notification delivery, PDF export, automated end-to-end tests, backup drills and full security review.

Dashboard values are live queries, but a newly created project may show zeros until authorized users, company, plants, employees, shifts and attendance records are provisioned. Do not use this system for payroll or disciplinary decisions until the relevant workflows and calculation policies are validated by the organization.

## Requirements
- Node.js 22+ (required by the pinned Wrangler version)
- npm
- Supabase project

## Local development
1. Clone the repository and install dependencies: `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` with the project URL and publishable/legacy anon key.
4. Run `npm run dev` and open `http://localhost:3000`.

## Database
Project ref: `nhchbztpqxtuxvmjwbsy` (Mumbai / `ap-south-1`).
Migrations for the baseline schema, tenant RLS, operational tables, plant/department assignment boundaries, and request review integrity are tracked in `supabase/migrations`. They have been applied to the connected project. Supabase security advisors currently report no findings.

## Deployment
Import this repository into a compatible Next.js host. Configure the two public Supabase environment variables in the host. Never expose a service-role/secret key in browser code or commit real secrets. For the Worker Accounts admin screen, configure `SUPABASE_SECRET_KEY` as a server-only Secret environment variable on the deployment host. The server checks that the signed-in user is a Super Admin or HR Manager before calling Supabase Auth admin APIs. The employee portal stores face photos privately; set and disclose an appropriate retention policy before collecting real workers’ photos.
