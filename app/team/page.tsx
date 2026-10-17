import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Factory, KeyRound, ShieldCheck, Users, UserPlus, HardHat, Building2, ClipboardCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createTeamAccount } from "./actions";

type Props = { searchParams: Promise<{ error?: string; success?: string }> };

const errorMessages: Record<string, string> = {
  invalid: "Please check each field. Password must be at least 12 characters.",
  role_forbidden: "Only a Super Admin can create another HR Manager account.",
  secret_missing: "The server-side Supabase Secret key is missing. Add SUPABASE_SECRET_KEY in Vercel as a Secret, then redeploy.",
  plant_required: "Choose a plant for this Plant Manager.",
  plant_scope: "The selected plant is inactive or does not belong to this company.",
  department_required: "Choose a department for this Supervisor.",
  department_scope: "The selected department is inactive or does not belong to this company.",
  email_exists: "This email already has a login account. Use a different work email.",
  password_policy: "Choose a stronger password that meets the Supabase password policy.",
  auth_create: "Could not create the login. Check the email and password and try again.",
  profile_create: "The login was rolled back because the team profile could not be created.",
  assignment_create: "The team account was rolled back because its plant/department assignment failed.",
};

function roleLabel(role: string) {
  return ({ super_admin: "Super Admin", hr_manager: "HR Manager", plant_manager: "Plant Manager", department_supervisor: "Department Supervisor", employee: "Worker" } as Record<string,string>)[role] || role.replaceAll("_", " ");
}

export default async function TeamPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: currentProfile } = await supabase.from("user_profiles")
    .select("company_id, full_name, role, active")
    .eq("id", user.id)
    .maybeSingle();
  if (!currentProfile?.active || !currentProfile.company_id || !["super_admin", "hr_manager"].includes(currentProfile.role)) {
    redirect("/dashboard?error=forbidden");
  }

  const [{ data: profiles }, { data: plants }, { data: departments }, { data: company }] = await Promise.all([
    supabase.from("user_profiles").select("id,full_name,job_title,role,active,created_at").eq("company_id", currentProfile.company_id).in("role", ["super_admin", "hr_manager", "plant_manager", "department_supervisor"]).order("created_at", { ascending: true }).limit(300),
    supabase.from("plants").select("id,name,code").eq("company_id", currentProfile.company_id).eq("active", true).order("name"),
    supabase.from("departments").select("id,name,code,plant_id").eq("company_id", currentProfile.company_id).eq("active", true).order("name"),
    supabase.from("companies").select("name").eq("id", currentProfile.company_id).maybeSingle(),
  ]);

  const profilesRows = profiles ?? [];
  const plantsRows = plants ?? [];
  const departmentRows = departments ?? [];
  const hasSecretKey = Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY);
  let keyStatusError = false;
  let emailByUser = new Map<string,string>();
  let plantByUser = new Map<string,string>();
  let departmentByUser = new Map<string,string>();

  if (hasSecretKey) {
    try {
      const admin = createAdminClient();
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) keyStatusError = true;
      else emailByUser = new Map<string, string>((data?.users ?? []).map((item): [string, string] => [item.id, item.email || ""]));
      const [{ data: plantAssignments }, { data: departmentAssignments }] = await Promise.all([
        admin.from("user_plant_assignments").select("user_id,plant_id").eq("company_id", currentProfile.company_id),
        admin.from("user_department_assignments").select("user_id,department_id").eq("company_id", currentProfile.company_id),
      ]);
      plantByUser = new Map<string, string>((plantAssignments ?? []).map((item): [string, string] => [item.user_id, plantsRows.find((plant) => plant.id === item.plant_id)?.name || "Assigned plant"]));
      departmentByUser = new Map<string, string>((departmentAssignments ?? []).map((item): [string, string] => [item.user_id, departmentRows.find((department) => department.id === item.department_id)?.name || "Assigned department"]));
    } catch {
      keyStatusError = true;
    }
  }

  const availableRoles = currentProfile.role === "super_admin"
    ? [{ value: "hr_manager", label: "HR Manager" }, { value: "plant_manager", label: "Plant Manager" }, { value: "department_supervisor", label: "Department Supervisor" }]
    : [{ value: "plant_manager", label: "Plant Manager" }, { value: "department_supervisor", label: "Department Supervisor" }];
  const counts = {
    hr: profilesRows.filter((profile) => profile.role === "hr_manager" && profile.active).length,
    plants: profilesRows.filter((profile) => profile.role === "plant_manager" && profile.active).length,
    supervisors: profilesRows.filter((profile) => profile.role === "department_supervisor" && profile.active).length,
  };

  return (
    <main className="min-h-screen bg-[#e8edf2] text-slate-900">
      <header className="border-b border-slate-700 bg-[#151b22] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-7">
          <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl border border-amber-400/25 bg-amber-400/10 text-amber-400"><Factory size={22}/></div><div><p className="font-bold tracking-wide">IAMS <span className="font-normal text-slate-400">/ TEAM CONTROL</span></p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.2em] text-amber-400">Metal manufacturing workforce</p></div></div>
          <Link href="/dashboard" className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/5">← Admin overview</Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-7 sm:py-9">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#222c37] via-[#151b22] to-[#0b0f14] p-6 text-white shadow-xl sm:p-8">
          <div className="absolute -right-10 -top-16 h-64 w-64 rounded-full border-[34px] border-white/[.035]"/>
          <div className="relative flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div><p className="text-xs font-bold uppercase tracking-[.24em] text-amber-400">People · Access · Plant assignment</p><h1 className="mt-3 text-3xl font-bold sm:text-4xl">Team & HR access</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Create logins for your HR team, plant managers and department supervisors. Every account receives a role and only the assigned plant or department access.</p><p className="mt-3 text-xs text-slate-400">Company: {company?.name || "Company workspace"} · {currentProfile.role === "super_admin" ? "Super Admin access" : "HR Manager access"}</p></div>
            <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-300"><ShieldCheck size={18}/> Role-based access control</div>
          </div>
        </section>

        {params.error && <div role="alert" className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800"><AlertTriangle className="mt-0.5 shrink-0" size={18}/><p>{errorMessages[params.error] || "The request could not be completed. Check the selected role and account details."}</p></div>}
        {params.success === "created" && <div role="status" className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900"><CheckCircle2 className="mt-0.5 shrink-0" size={18}/><p>Team login created and access assigned. Share the work email and initial password securely with that person.</p></div>}

        {!hasSecretKey || keyStatusError ? <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
          <div className="flex items-start gap-3"><KeyRound size={22} className="mt-0.5 shrink-0 text-amber-700"/><div><h2 className="font-bold">Server-side account provisioning setup</h2><p className="mt-2 text-sm leading-6">This page must create login accounts using the private Supabase Auth Admin API. In Vercel, configure <code className="rounded bg-white px-1.5 py-0.5">SUPABASE_SECRET_KEY</code> as a <strong>Secret</strong> (server-side only) with the real Supabase Secret API key. Select Production, Preview and Development, save, then redeploy.</p><p className="mt-2 text-sm">Do not put this key in a <code>NEXT_PUBLIC_</code> variable, source code, or chat.</p><div className="mt-3 flex flex-wrap gap-3 text-sm font-bold"><Link target="_blank" href="https://supabase.com/dashboard/project/nhchbztpqxtuxvmjwbsy/settings/api-keys" className="underline">Open Supabase API keys ↗</Link><Link target="_blank" href="https://vercel.com/nchure2026-6200/191-45-12/settings/environment-variables" className="underline">Open Vercel variables ↗</Link></div></div></div>
        </section> : null}

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            { title: "HR managers", count: counts.hr, icon: <Users size={19}/>, note: currentProfile.role === "super_admin" ? "Can manage daily HR operations" : "HR access in this company" },
            { title: "Plant managers", count: counts.plants, icon: <Factory size={19}/>, note: "Scoped to assigned production plant" },
            { title: "Department supervisors", count: counts.supervisors, icon: <ClipboardCheck size={19}/>, note: "Scoped to assigned department" },
          ].map((card) => <div key={card.title} className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{card.title}</p><span className="rounded-xl bg-slate-100 p-2 text-slate-600">{card.icon}</span></div><p className="mt-3 text-3xl font-bold">{card.count}</p><p className="mt-1 text-xs text-slate-500">{card.note}</p></div>)}
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(320px,.82fr)_minmax(0,1.18fr)]">
          <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-[#f8fafc] px-5 py-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-[#202a35] p-3 text-amber-400"><UserPlus size={20}/></span><div><h2 className="font-bold">Create team login</h2><p className="mt-1 text-xs text-slate-500">Account + work email + role + permissions</p></div></div></div>
            <form action={createTeamAccount} className="space-y-4 p-5">
              <div><label htmlFor="team-name" className="mb-1.5 block text-sm font-semibold">Full name</label><input id="team-name" name="full_name" required minLength={2} maxLength={120} placeholder="e.g. Priya Kumar" className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"/></div>
              <div><label htmlFor="team-job" className="mb-1.5 block text-sm font-semibold">Job title</label><input id="team-job" name="job_title" required minLength={2} maxLength={120} placeholder="e.g. HR Executive / Production Supervisor" className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"/></div>
              <div><label htmlFor="team-email" className="mb-1.5 block text-sm font-semibold">Work email / username</label><input id="team-email" name="work_email" type="email" autoComplete="off" required maxLength={254} placeholder="name@company.com" className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"/><p className="mt-1 text-xs text-slate-500">The login username is this work email.</p></div>
              <div><label htmlFor="team-password" className="mb-1.5 block text-sm font-semibold">Initial password</label><input id="team-password" name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required placeholder="At least 12 characters" className="w-full rounded-xl border border-slate-300 px-3.5 py-3 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"/></div>
              <div><label htmlFor="team-role" className="mb-1.5 block text-sm font-semibold">Access role</label><select id="team-role" name="role" required defaultValue={availableRoles[0]?.value} className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100">{availableRoles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></div>
              <div><label htmlFor="team-plant" className="mb-1.5 block text-sm font-semibold">Plant (for Plant Manager)</label><select id="team-plant" name="plant_id" defaultValue="" className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"><option value="">Select plant</option>{plantsRows.map((plant) => <option key={plant.id} value={plant.id}>{plant.name} · {plant.code}</option>)}</select>{!plantsRows.length && <p className="mt-1 text-xs text-amber-700">Create the first plant in Worker Accounts before adding plant managers.</p>}</div>
              <div><label htmlFor="team-department" className="mb-1.5 block text-sm font-semibold">Department (for Supervisor)</label><select id="team-department" name="department_id" defaultValue="" className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100"><option value="">Select department</option>{departmentRows.map((department) => <option key={department.id} value={department.id}>{department.name} · {plantsRows.find((plant) => plant.id === department.plant_id)?.name || "Plant"}</option>)}</select>{!departmentRows.length && <p className="mt-1 text-xs text-amber-700">Create active departments in Supabase or the forthcoming factory setup page.</p>}</div>
              <button disabled={!hasSecretKey || keyStatusError} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3.5 text-sm font-extrabold text-[#171d25] hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"><UserPlus size={17}/> Create team account</button>
              <p className="text-xs leading-5 text-slate-500">Only Super Admin can create HR Manager accounts. Each plant manager or supervisor is automatically assigned to the selected plant/department.</p>
            </form>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-[#f8fafc] px-5 py-4"><div><h2 className="font-bold">Team directory</h2><p className="mt-1 text-xs text-slate-500">Active and inactive administration accounts in this company.</p></div><span className="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700">{profilesRows.length} accounts</span></div>
            {profilesRows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[610px] text-left text-sm"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 font-bold">Team member</th><th className="px-4 py-3 font-bold">Username</th><th className="px-4 py-3 font-bold">Role / assignment</th><th className="px-4 py-3 font-bold">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{profilesRows.map((item) => <tr key={item.id} className="align-top hover:bg-slate-50"><td className="px-4 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#222c37] text-xs font-black text-amber-400">{(item.full_name || "T").split(/\s+/).map((value: string) => value[0]).slice(0,2).join("").toUpperCase()}</span><div><p className="font-bold">{item.full_name}</p><p className="mt-1 text-xs text-slate-500">{item.job_title || "Administration"}</p></div></div></td><td className="px-4 py-4 text-xs text-slate-600">{emailByUser.get(item.id) || "Email hidden — check Supabase Secret key"}</td><td className="px-4 py-4"><span className="inline-flex rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-900">{roleLabel(item.role)}</span><p className="mt-2 text-xs text-slate-500">{item.role === "plant_manager" ? plantByUser.get(item.id) || "No plant assignment" : item.role === "department_supervisor" ? departmentByUser.get(item.id) || "No department assignment" : item.role === "super_admin" ? "Full company access" : "Company-wide HR access"}</p></td><td className="px-4 py-4"><span className={"rounded-full px-2.5 py-1 text-xs font-bold " + (item.active ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500")}>{item.active ? "Active" : "Disabled"}</span></td></tr>)}</tbody></table></div> : <div className="px-6 py-14 text-center"><HardHat size={28} className="mx-auto text-slate-400"/><p className="mt-3 font-bold">No team members yet</p><p className="mt-1 text-sm text-slate-500">Create HR, plant manager or supervisor accounts using the form.</p></div>}
            <div className="flex items-start gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 text-xs leading-5 text-slate-500"><Building2 size={15} className="mt-0.5 shrink-0"/> Worker accounts stay in the separate Worker Attendance Portal. HR and plant-team accounts sign in through the Admin Portal.</div>
          </section>
        </div>
        <div className="flex flex-wrap gap-3 text-sm"><Link href="/worker-accounts" className="font-semibold text-slate-700 underline">Worker accounts / plant setup</Link><Link href="/employee-portal/login" className="font-semibold text-amber-700 underline">Open worker attendance portal</Link></div>
      </div>
    </main>
  );
}
