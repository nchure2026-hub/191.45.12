import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Factory, KeyRound, Plus, ShieldCheck, UserPlus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createPlant, createWorkerAccount } from "./actions";
import DeleteEmployeeButton from "./DeleteEmployeeButton";

type Props = { searchParams: Promise<{ error?: string; success?: string }> };

const errors: Record<string, string> = {
  service_config: "Account creation needs a server-only Supabase secret key. Add SUPABASE_SECRET_KEY in Vercel as a Secret, then redeploy.",
  plant_invalid: "Enter a valid plant name and plant code (letters, numbers, dash or underscore).",
  plant_duplicate: "That plant code already exists in this company.",
  plant_save: "Plant could not be saved. Check your access and try again.",
  worker_invalid: "Check the worker details. Password must be at least 12 characters.",
  plant_scope: "Selected plant is inactive or does not belong to your company.",
  department_scope: "Selected department does not belong to this plant.",
  duplicate_code: "This employee code already exists in your company.",
  email_exists: "That email already has a Supabase Auth account. Use a different email or link the existing account.",
  password_policy: "The password did not pass Supabase's password policy. Use a longer, unique password.",
  auth_create: "Could not create the worker sign-in account. Check the email and password, then try again.",
  employee_create: "The Auth account was created but the employee record could not be created. Try again with a new email after checking the employee list.",
  profile_create: "The employee profile could not be linked. The employee was deactivated and the temporary Auth user was removed; check for the employee record before retrying.",
  worker_not_found: "That employee was not found in this company.",
  worker_already_inactive: "This employee is already inactive.",
  worker_profile_read: "Could not verify the linked worker portal account. No changes were made.",
  worker_deactivate: "Employee could not be removed from active operations. No history was deleted.",
  worker_access_disable: "The worker portal access update failed. The employee status was restored; please retry.",
};

export default async function WorkerAccountsPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("user_profiles")
    .select("company_id,role,active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.active || !profile.company_id || !["super_admin", "hr_manager"].includes(profile.role)) {
    redirect("/dashboard?error=forbidden");
  }

  const [{ data: plants }, { data: departments }, { data: employees }, { data: profiles }] = await Promise.all([
    supabase.from("plants").select("id,name,code").eq("company_id", profile.company_id).eq("active", true).order("name"),
    supabase.from("departments").select("id,name,plant_id").eq("company_id", profile.company_id).eq("active", true).order("name"),
    supabase.from("employees").select("id,employee_code,full_name,designation,employment_status,plant_id,department_id,work_email").eq("company_id", profile.company_id).eq("employment_status", "active").order("full_name").limit(200),
    supabase.from("user_profiles").select("employee_id,role,active").eq("company_id", profile.company_id),
  ]);

  const activePlants = plants ?? [];
  const activeDepartments = departments ?? [];
  const employeeRows = employees ?? [];
  const profileRows = profiles ?? [];
  const accountByEmployee = new Map(profileRows.filter((row) => row.employee_id && row.role === "employee").map((row) => [row.employee_id, row.active]));
  const hasSecretKey = Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-7 text-slate-900 sm:px-7">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><Link href="/dashboard" className="text-sm font-semibold text-blue-700 hover:underline">← Admin dashboard</Link><p className="mt-5 text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Workforce administration</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Worker accounts</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Create a worker record and login together. Workers use a separate portal to capture their face photo and record check-in, breaks and check-out.</p></div>
          <Link href="/employee-portal/login" className="inline-flex w-fit items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm font-bold text-emerald-800 hover:bg-emerald-50"><UserPlus size={17}/> Open worker portal</Link>
        </div>

        {params.error && <div role="alert" className="mt-6 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800"><AlertTriangle className="mt-0.5 shrink-0" size={18}/><p>{errors[params.error] || "Action failed. Check the entered details and try again."}</p></div>}
        {params.success && <div role="status" className="mt-6 flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-800"><CheckCircle2 className="mt-0.5 shrink-0" size={18}/><p>{params.success === "plant" ? "Plant created. You can now add a worker account." : params.success === "worker_deleted" ? "Employee removed from active operations. Worker portal access is disabled; attendance and audit history are preserved." : "Worker account and linked employee profile created. Share the sign-in details securely with the worker."}</p></div>}

        {!hasSecretKey && <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex gap-3"><KeyRound className="mt-0.5 shrink-0 text-amber-700" size={21}/><div><h2 className="font-bold text-amber-950">One-time server setup required for account creation</h2><p className="mt-2 text-sm leading-6 text-amber-900">Supabase Auth must be provisioned from the server, never from the browser. Add a Supabase secret key to Vercel with the exact key name <code className="rounded bg-white px-1.5 py-0.5">SUPABASE_SECRET_KEY</code>. Do not use a NEXT_PUBLIC_ prefix and never paste the secret into chat or GitHub.</p><ol className="mt-3 list-decimal space-y-1 pl-5 text-sm leading-6 text-amber-900"><li>Open <Link className="font-bold underline" href="https://supabase.com/dashboard/project/nhchbztpqxtuxvmjwbsy/settings/api-keys" target="_blank">Supabase → Project Settings → API Keys</Link> and copy the server-side <strong>Secret key</strong> (starts with <code>sb_secret_</code>).</li><li>In <Link className="font-bold underline" href="https://vercel.com/nchure2026-6200/191-45-12/settings/environment-variables" target="_blank">Vercel Environment Variables</Link>, add key <code>SUPABASE_SECRET_KEY</code>, choose <strong>Secret</strong>, paste the key, select Production, Preview and Development, then Save.</li><li>Redeploy the Vercel project. This key is used only by the server to create Auth users and must remain private.</li></ol><p className="mt-3 text-xs leading-5 text-amber-900">The existing Supabase publishable key must stay in the NEXT_PUBLIC_ variable. The secret key bypasses RLS and is only used after the server checks the signed-in admin's role.</p></div></div>
        </section>}

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-3 text-blue-700"><Plus size={20}/></span><div><h2 className="font-bold">Set up a plant</h2><p className="mt-1 text-xs text-slate-500">Required before creating worker records.</p></div></div>
            <form action={createPlant} className="mt-6 space-y-4">
              <div><label htmlFor="plant-name" className="mb-2 block text-sm font-semibold">Plant name</label><input id="plant-name" name="name" required minLength={2} maxLength={100} placeholder="e.g. Main Plant" className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"/></div>
              <div><label htmlFor="plant-code" className="mb-2 block text-sm font-semibold">Plant code</label><input id="plant-code" name="code" required minLength={2} maxLength={20} pattern="[A-Za-z0-9_-]+" placeholder="e.g. MAIN01" className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm uppercase outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"/><p className="mt-1 text-xs text-slate-500">Letters, numbers, underscore and dash only.</p></div>
              <button className="w-full rounded-xl border border-slate-200 bg-slate-900 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800">Create plant</button>
            </form>
            <div className="mt-5 rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Active plants</p>{activePlants.length ? <div className="mt-2 space-y-2">{activePlants.map((plant) => <div key={plant.id} className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold">{plant.name}</span><span className="rounded-lg bg-white px-2 py-1 font-mono text-xs text-slate-500">{plant.code}</span></div>)}</div> : <p className="mt-2 text-sm leading-5 text-slate-500">No plant exists yet. Create one here first.</p>}</div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center gap-3"><span className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><UserPlus size={20}/></span><div><h2 className="font-bold">Create worker login</h2><p className="mt-1 text-xs text-slate-500">Creates Auth credentials, employee record and employee portal profile.</p></div></div>
            {!activePlants.length ? <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center"><Factory size={26} className="mx-auto text-slate-400"/><p className="mt-3 font-semibold">Create a plant first</p><p className="mt-1 text-sm text-slate-500">After the plant is saved, this form will be available.</p></div> : <form action={createWorkerAccount} className="mt-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label htmlFor="worker-name" className="mb-2 block text-sm font-semibold">Worker full name</label><input id="worker-name" name="full_name" required minLength={2} maxLength={120} placeholder="Full name" className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"/></div>
                <div><label htmlFor="worker-code" className="mb-2 block text-sm font-semibold">Employee ID</label><input id="worker-code" name="employee_code" required minLength={1} maxLength={40} pattern="[A-Za-z0-9_-]+" placeholder="e.g. EMP001" className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm uppercase outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"/></div>
                <div><label htmlFor="worker-email" className="mb-2 block text-sm font-semibold">Work email / username</label><input id="worker-email" name="work_email" type="email" autoComplete="off" required maxLength={254} placeholder="worker@company.com" className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"/></div>
                <div><label htmlFor="worker-designation" className="mb-2 block text-sm font-semibold">Designation</label><input id="worker-designation" name="designation" maxLength={120} placeholder="e.g. Operator" className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"/></div>
                <div><label htmlFor="worker-plant" className="mb-2 block text-sm font-semibold">Plant</label><select id="worker-plant" name="plant_id" required className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100">{activePlants.map((plant) => <option key={plant.id} value={plant.id}>{plant.name} ({plant.code})</option>)}</select></div>
                <div><label htmlFor="worker-department" className="mb-2 block text-sm font-semibold">Department (optional)</label><select id="worker-department" name="department_id" defaultValue="" className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"><option value="">Not assigned</option>{activeDepartments.map((department) => <option key={department.id} value={department.id}>{department.name} — {activePlants.find((p) => p.id === department.plant_id)?.name || "Plant"}</option>)}</select></div>
                <div><label htmlFor="worker-type" className="mb-2 block text-sm font-semibold">Employment type</label><select id="worker-type" name="employment_type" defaultValue="permanent" className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"><option value="permanent">Permanent</option><option value="temporary">Temporary</option><option value="trainee">Trainee</option><option value="contract">Contract</option></select></div>
                <div><label htmlFor="worker-password" className="mb-2 block text-sm font-semibold">Initial password</label><input id="worker-password" name="initial_password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" placeholder="At least 12 characters" className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"/></div>
              </div>
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">Set a unique initial password and share it directly with the worker through a secure channel. Do not reuse your own admin password.</p>
              <button disabled={!hasSecretKey} title={!hasSecretKey ? "Add SUPABASE_SECRET_KEY in Vercel and redeploy first" : undefined} className="w-full rounded-xl bg-[#067647] px-4 py-3.5 text-sm font-bold text-white hover:bg-[#05603a] disabled:cursor-not-allowed disabled:opacity-40">Create worker and login</button>
            </form>}
          </section>
        </div>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold">Company employees</h2><p className="mt-1 text-xs text-slate-500">Delete removes an employee from the active list and disables portal access. Historical attendance and audit records are retained.</p></div><span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700"><Users size={14}/>{employeeRows.length} employees</span></div>
          {employeeRows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Employee</th><th className="px-4 py-3">Plant</th><th className="px-4 py-3">Work email</th><th className="px-4 py-3">Portal access</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{employeeRows.map((employee) => {const activeAccount = accountByEmployee.get(employee.id);return <tr key={employee.id}><td className="px-5 py-3"><p className="font-semibold">{employee.full_name}</p><p className="mt-1 text-xs text-slate-500">{employee.employee_code} · {employee.designation || "Worker"}</p></td><td className="px-4 py-3 text-slate-600">{activePlants.find((plant) => plant.id === employee.plant_id)?.name || "—"}</td><td className="px-4 py-3 text-slate-600">{employee.work_email || "—"}</td><td className="px-4 py-3"><span className={"rounded-full px-2.5 py-1 text-xs font-bold " + (activeAccount ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800")}>{activeAccount ? "Enabled" : "Not linked"}</span></td><td className="px-4 py-3"><DeleteEmployeeButton employeeId={employee.id} employeeName={employee.full_name} disabled={!hasSecretKey}/></td></tr>})}</tbody></table></div> : <div className="p-8 text-center"><Users className="mx-auto text-slate-300" size={28}/><p className="mt-3 font-bold">No workers added yet</p><p className="mt-1 text-sm text-slate-500">Create a plant, add the first worker above, then share the separate portal URL.</p></div>}
          <div className="border-t border-slate-100 px-5 py-3 text-xs leading-5 text-slate-500"><ShieldCheck className="mr-1 inline" size={13}/> Only Super Admin and HR Manager can create worker accounts. Employees can access only their own records.</div>
        </section>
      </div>
    </main>
  );
}
