import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Factory, KeyRound, ShieldCheck, UserCog, UserPlus, Users, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDepartment, createTeamAccount } from "./actions";

type Props = { searchParams: Promise<{ error?: string; success?: string }> };

const errorMessages: Record<string, string> = {
  service_config: "Add SUPABASE_SECRET_KEY as a server-side Secret in Vercel and redeploy before creating team logins.",
  invalid: "Check the form fields and try again. Passwords must be at least 12 characters.",
  plant_required: "Choose a plant for a Plant Manager account.",
  department_required: "Choose a department for a Department Supervisor account.",
  plant_scope: "The selected plant is not active in this company.",
  department_scope: "The selected department is not active in this company.",
  department_invalid: "Enter a valid department name, code and plant.",
  department_duplicate: "That department code already exists in this company.",
  department_save: "Department could not be saved. Check the values and try again.",
  email_exists: "This email already has a login account. Use a different email or ask an administrator to review the existing account.",
  password_policy: "Password did not meet the project's password policy. Use a longer, unique password.",
  auth_create: "Could not create the Supabase login. Check the email and password and try again.",
  profile_link: "The login was created but its company role could not be linked. Check Supabase Authentication → Users before retrying with that email.",
  assignment_create: "The team account was created but its plant/department assignment did not save. Check Team Accounts before creating it again.",
};

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  hr_manager: "HR Manager",
  plant_manager: "Plant Manager",
  department_supervisor: "Department Supervisor",
  employee: "Worker",
};

export default async function TeamAccountsPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("user_profiles")
    .select("company_id,role,active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.active || !profile.company_id || profile.role !== "super_admin") {
    redirect("/dashboard?error=forbidden");
  }

  const [{ data: staffProfiles }, { data: plants }, { data: departments }] = await Promise.all([
    supabase.from("user_profiles")
      .select("id,full_name,job_title,role,active,created_at")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false })
      .limit(250),
    supabase.from("plants").select("id,name,code").eq("company_id", profile.company_id).eq("active", true).order("name"),
    supabase.from("departments").select("id,name,code,plant_id").eq("company_id", profile.company_id).eq("active", true).order("name"),
  ]);

  const plantRows = plants ?? [];
  const departmentRows = departments ?? [];
  const staffRows = staffProfiles ?? [];
  const hasSecretKey = Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  let emailById = new Map<string, string>();
  if (hasSecretKey) {
    try {
      const admin = createAdminClient();
      const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
      emailById = new Map((data?.users ?? []).map((authUser) => [authUser.id, authUser.email || "Email unavailable"]));
    } catch {
      emailById = new Map();
    }
  }

  const teamRows = staffRows.filter((row) => row.role !== "employee");
  const showError = params.error ? (errorMessages[params.error] || "Something went wrong. Check the details and try again.") : null;
  const showSuccess = params.success === "created"
    ? "Team login created and its company role has been assigned."
    : params.success === "department"
      ? "Department created. You can now assign a Department Supervisor to it."
      : null;

  return (
    <main className="min-h-screen bg-[#f4f6f8] px-4 py-7 text-slate-900 sm:px-7">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <Link href="/dashboard" className="text-sm font-semibold text-blue-700 hover:underline">← Admin dashboard</Link>
            <p className="mt-5 text-xs font-bold uppercase tracking-[.2em] text-slate-500">Metal manufacturing · Workforce administration</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Team Accounts</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Create individual logins for HR staff, plant managers and production, quality, maintenance, stores or dispatch supervisors. Each person gets their own username and assigned access scope.</p>
          </div>
          <Link href="/worker-accounts" className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"><Users size={17}/> Worker accounts</Link>
        </div>

        {showError && <div role="alert" className="mt-6 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800"><AlertTriangle size={18} className="mt-0.5 shrink-0"/><p>{showError}</p></div>}
        {showSuccess && <div role="status" className="mt-6 flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800"><CheckCircle2 size={18} className="mt-0.5 shrink-0"/><p>{showSuccess}</p></div>}

        {!hasSecretKey && <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex gap-3"><KeyRound className="mt-0.5 shrink-0 text-amber-700" size={22}/><div>
            <h2 className="font-bold text-amber-950">One-time secure setup required</h2>
            <p className="mt-2 text-sm leading-6 text-amber-900">To create login accounts securely, IAMS needs a Supabase server-side Secret key. It is only used on the server and is never placed in browser code.</p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-6 text-amber-900">
              <li>Open <Link className="font-bold underline" href="https://supabase.com/dashboard/project/nhchbztpqxtuxvmjwbsy/settings/api-keys" target="_blank">Supabase → Project Settings → API Keys</Link> and copy the Secret key starting with <code>sb_secret_</code>.</li>
              <li>Open <Link className="font-bold underline" href="https://vercel.com/nchure2026-6200/191-45-12/settings/environment-variables" target="_blank">Vercel → Environment Variables</Link> and add key <code>SUPABASE_SECRET_KEY</code>, type <strong>Secret</strong>, paste the key, select Production, Preview and Development, and Save.</li>
              <li>Redeploy the project. Never use a <code>NEXT_PUBLIC_</code> prefix for this secret and never share it in chat or GitHub.</li>
            </ol>
          </div></div>
        </section>}

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
          <section className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-3"><span className="rounded-xl bg-slate-100 p-3 text-slate-700"><UserPlus size={20}/></span><div><h2 className="font-bold">Create a team login</h2><p className="mt-1 text-xs text-slate-500">Username is each person's work email.</p></div></div>
              <form action={createTeamAccount} className="mt-6 space-y-4">
                <div><label htmlFor="team-name" className="mb-2 block text-sm font-semibold">Full name</label><input id="team-name" name="full_name" required minLength={2} maxLength={120} placeholder="e.g. Arjun Kumar" className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-slate-600 focus:ring-4 focus:ring-slate-100"/></div>
                <div><label htmlFor="team-title" className="mb-2 block text-sm font-semibold">Job title / department responsibility</label><input id="team-title" name="job_title" required minLength={2} maxLength={100} placeholder="e.g. HR Executive, Quality Supervisor, Maintenance Lead" className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-slate-600 focus:ring-4 focus:ring-slate-100"/><p className="mt-1 text-xs text-slate-500">Use an industrial title like Production Supervisor, Quality Inspector or Stores In-charge.</p></div>
                <div><label htmlFor="team-email" className="mb-2 block text-sm font-semibold">Username / work email</label><input id="team-email" name="work_email" type="email" required maxLength={254} autoComplete="off" placeholder="person@company.com" className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-slate-600 focus:ring-4 focus:ring-slate-100"/></div>
                <div><label htmlFor="team-role" className="mb-2 block text-sm font-semibold">Access role</label><select id="team-role" name="role" defaultValue="hr_manager" required className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-slate-600 focus:ring-4 focus:ring-slate-100"><option value="hr_manager">HR Manager — company-wide HR access</option><option value="plant_manager">Plant Manager — assigned plant</option><option value="department_supervisor">Department Supervisor — assigned department</option></select></div>
                <div><label htmlFor="team-plant" className="mb-2 block text-sm font-semibold">Plant (required for Plant Manager)</label><select id="team-plant" name="plant_id" defaultValue="" className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-slate-600 focus:ring-4 focus:ring-slate-100"><option value="">Select plant if required</option>{plantRows.map((plant) => <option key={plant.id} value={plant.id}>{plant.name} ({plant.code})</option>)}</select></div>
                <div><label htmlFor="team-department" className="mb-2 block text-sm font-semibold">Department (required for Department Supervisor)</label><select id="team-department" name="department_id" defaultValue="" className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-slate-600 focus:ring-4 focus:ring-slate-100"><option value="">Select department if required</option>{departmentRows.map((department) => <option key={department.id} value={department.id}>{department.name} — {plantRows.find((plant) => plant.id === department.plant_id)?.name || "Plant"}</option>)}</select></div>
                <div><label htmlFor="team-password" className="mb-2 block text-sm font-semibold">Initial password</label><input id="team-password" name="initial_password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" placeholder="At least 12 characters" className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-slate-600 focus:ring-4 focus:ring-slate-100"/></div>
                <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Share the initial password privately with the staff member. Do not reuse the Founder password. The person can use the same admin sign-in URL; their assigned role limits their access.</div>
                <button disabled={!hasSecretKey} className="w-full rounded-xl bg-[#172b4d] px-4 py-3.5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">Create team login</button>
              </form>
            </div>
          </section>

          <section className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-3"><span className="rounded-xl bg-amber-50 p-3 text-amber-700"><Factory size={20}/></span><div><h2 className="font-bold">Industrial structure</h2><p className="mt-1 text-xs text-slate-500">Set up plants and departments before assigning supervisors.</p></div></div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Plants</p>{plantRows.length ? <div className="mt-3 space-y-2">{plantRows.map((plant) => <div key={plant.id} className="flex items-center justify-between gap-2 text-sm"><span className="font-semibold">{plant.name}</span><code className="rounded bg-slate-100 px-2 py-1 text-xs">{plant.code}</code></div>)}</div> : <p className="mt-2 text-sm leading-5 text-slate-500">No plant created yet. <Link href="/worker-accounts" className="font-semibold text-blue-700 underline">Create the first plant</Link>.</p>}</div>
                <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Departments</p>{departmentRows.length ? <div className="mt-3 space-y-2">{departmentRows.map((department) => <div key={department.id} className="flex items-center justify-between gap-2 text-sm"><span className="font-semibold">{department.name}</span><code className="rounded bg-slate-100 px-2 py-1 text-xs">{department.code}</code></div>)}</div> : <p className="mt-2 text-sm leading-5 text-slate-500">Examples: Production, Quality, Maintenance, Stores, Dispatch, EHS.</p>}</div>
              </div>
              {plantRows.length > 0 && <form action={createDepartment} className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
                <p className="sm:col-span-2 text-sm font-bold">Add department</p>
                <div><label htmlFor="department-name" className="mb-1.5 block text-xs font-semibold">Department name</label><input id="department-name" name="name" required minLength={2} maxLength={100} placeholder="e.g. Production" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"/></div>
                <div><label htmlFor="department-code" className="mb-1.5 block text-xs font-semibold">Department code</label><input id="department-code" name="code" required minLength={2} maxLength={20} pattern="[A-Za-z0-9_-]+" placeholder="PROD" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"/></div>
                <div className="sm:col-span-2"><label htmlFor="department-plant" className="mb-1.5 block text-xs font-semibold">Plant</label><select id="department-plant" name="plant_id" required className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm">{plantRows.map((plant) => <option key={plant.id} value={plant.id}>{plant.name}</option>)}</select></div>
                <button className="sm:col-span-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-700">Add department</button>
              </form>}
            </div>

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold">Team directory</h2><p className="mt-1 text-xs text-slate-500">Company team logins and access roles</p></div><span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700"><Users size={14}/>{teamRows.length} accounts</span></div>
              {teamRows.length ? <div className="divide-y divide-slate-100">{teamRows.map((row) => <div key={row.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700"><UserCog size={19}/></span><div className="min-w-0"><p className="truncate text-sm font-bold">{row.full_name}</p><p className="mt-1 truncate text-xs text-slate-500">{emailById.get(row.id) || "Email hidden until server key is configured"}</p><p className="mt-1 text-xs text-slate-500">{row.job_title || "Team member"}</p></div></div>
                <div className="flex items-center gap-2 sm:shrink-0"><span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800">{roleLabels[row.role] || row.role}</span><span className={"rounded-full px-3 py-1.5 text-xs font-bold " + (row.active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500")}>{row.active ? "Active" : "Disabled"}</span></div>
              </div>)}</div> : <div className="p-8 text-center"><Users size={28} className="mx-auto text-slate-300"/><p className="mt-3 font-bold">No team accounts yet</p><p className="mt-1 text-sm text-slate-500">Create the first HR Manager or plant/dept supervisor above.</p></div>}
              <div className="border-t border-slate-100 px-5 py-3 text-xs leading-5 text-slate-500"><ShieldCheck className="mr-1 inline" size={13}/> Only the Super Admin can create administrative team accounts. Employees only see their own attendance in the worker portal.</div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
