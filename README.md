# ForgeOps — Industrial Attendance Management

A Next.js + TypeScript starter for an industrial workforce attendance platform. The UI uses the Deep Navy / Industrial Blue palette and is designed for multi-plant operations.

## Current status

### Implemented in this repository
- Responsive dashboard starter and navigation shell
- Attendance activity visualization (illustrative demo data)
- Shift coverage summary (illustrative demo data)
- Searchable recent-attendance table
- Supabase browser client helper
- TypeScript, Tailwind CSS v4 and Next.js configuration

### Not implemented yet
- Login, account provisioning and role/plant authorization
- Live Supabase queries and mutations
- Employee, shift, leave, overtime, contractor and visitor CRUD screens
- CSV import/export, reporting and notifications
- Biometric/RFID hardware integrations and device testing
- Production security review and end-to-end tests

**Important:** Numbers and employee rows on the dashboard are demo-only. They are not real attendance records. Do not use this starter to make payroll or disciplinary decisions until the calculations, authorization and audit flows are implemented and tested.

## Stack
- Next.js App Router + TypeScript
- Tailwind CSS v4
- Supabase PostgreSQL and Auth (integration to be completed)
- Recharts dependency reserved for live charts in a later implementation

## Local development

1. Install Node.js 20 or newer.
2. Clone this repository.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Copy `.env.example` to `.env.local`.
5. In the Supabase dashboard, open **Project Settings → API Keys** and copy the publishable key (or legacy anon key) into `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The URL is already listed in the example file.
6. Run:
   ```bash
   npm run dev
   ```
7. Open http://localhost:3000.

Never place a Supabase service-role key in a `NEXT_PUBLIC_*` variable or commit it to Git.

## Supabase project

- Project: `industrial-attendance-management`
- Region: Mumbai (`ap-south-1`)
- Project ref: `nhchbztpqxtuxvmjwbsy`
- Dashboard: https://supabase.com/dashboard/project/nhchbztpqxtuxvmjwbsy

An initial schema was applied directly to this Supabase project for companies, profiles, plants, departments, employees, shifts, shift assignments, punches, daily summaries, leave, correction requests, overtime requests and audit logs. The schema still requires a reviewed, version-controlled migration and security testing before production use.

## Deployment

Import this repository into Vercel or Netlify and configure:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

No deployment is created by this repository setup alone. Verify build output and configure the environment variables before publishing.
