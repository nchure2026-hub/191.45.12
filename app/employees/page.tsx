import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, Building2, Search, UserPlus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createEmployee, deactivateEmployee } from "./actions";

type EmployeesPageProps = { searchParams: Promise<{ q?: string; error?: string; success?: string }> };

const errorMessages: Record<string, string> = {
  invalid: "Please review the form values and try again.",
  scope: "You do not have access to the selected plant.",
  department: "Choose a department that belongs to the selected plant.",
  duplicate: "That employee code already exists in this company.",
  forbidden: "Your role does not permit this action.",
  save: "The record could not be saved. Check permissions and required fields.",
  notfound: "The employee was not found or is outside your access scope.",
};
const successMessages: Record<string, string> = { created: "Employee created successfully.", deactivated: "Employee marked inactive. Historical attendance is preserved." };

export default async function EmployeesPage({ searchParams }: EmployeesPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("user_profiles").select("company_id,full_name,role,active").eq("id", user.id).maybeSingle();
  if (!profile?.active || !profile.company_id) redirect("/login?error=profile");

  const canManage = ["super_admin", "hr_manager", "plant_manager"].includes(profile.role);
  const [{ data: employees, error }, { data: plants }, { data: departments }] = await Promise.all([
    supabase.from("employees").select("id,employee_code,full_name,designation,employment_type,employment_status,joining_date,plant_id,department_id,work_email,phone").eq("company_id", profile.company_id).order("full_name"),
    supabase.from("plants").select("id,name,code").eq("company_id", profile.company_id).eq("active", true).order("name"),
    supabase.from("departments").select("id,name,plant_id").eq("company_id", profile.company_id).eq("active", true).order("name"),
  ]);
  if (error) {
    return <main className="min-h-screen bg-slate-50 p-8"><div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-white p-6"><AlertTriangle className="text-red-600"/><h1 className="mt-3 text-xl font-bold">Employee records unavailable</h1><p className="mt-2 text-sm text-slate-600">The database query failed. Check Supabase permissions and RLS policies before retrying.</p><Link className="mt-4 inline-block text-sm font-semibold text-blue-700" href="/dashboard">Return to dashboard</Link></div></main>;
  }

  const query = (params.q || "").trim().toLowerCase();
  const filtered = (employees || []).filter((employee) => !query || [employee.employee_code, employee.full_name, employee.designation || "", employee.work_email || ""].some((value) => value.toLowerCase().includes(query)));
  const plantMap = new Map((plants || []).map((plant) => [plant.id, plant]));
  const departmentMap = new Map((departments || []).map((department) => [department.id, department]));
  const errorMessage = params.error ? errorMessages[params.error] : undefined;
  const successMessage = params.success ? successMessages[params.success] : undefined;

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-8"><Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-700"><ArrowLeft size={16}/> Dashboard</Link><div className="flex items-center gap-2 text-sm font-semibold"><Users size={18} className="text-blue-600"/> Employee directory</div><form action="/auth/signout" method="post"><button className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Sign out</button></form></header>
    <div className="mx-auto max-w-7xl p-4 sm:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-blue-700">Workforce</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Employee directory</h1><p className="mt-2 text-sm text-slate-500">Search employee records within your authorized company, plant and department scope.</p></div><div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm"><span className="text-slate-500">Records in scope</span><strong className="ml-3 text-lg">{filtered.length}</strong></div></div>
      {errorMessage && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>}
      {successMessage && <p role="status" className="mt-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{successMessage}</p>}
      <form method="get" className="mt-6 flex gap-2"><label className="relative block max-w-lg flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input name="q" defaultValue={params.q || ""} placeholder="Search name, employee code, designation or email" className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"/></label><button className="rounded-xl bg-[#172B4D] px-4 py-3 text-sm font-semibold text-white">Search</button></form>

      {canManage && <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-3 text-blue-700"><UserPlus size={19}/></span><div><h2 className="font-bold">Add employee</h2><p className="mt-1 text-xs text-slate-500">Employee codes are unique within the company. Records are deactivated, not deleted.</p></div></div>
        {!plants?.length && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No active plants are available in your access scope. Ask an administrator to configure a plant before adding employees.</p>}
        <form action={createEmployee} className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div><label htmlFor="employee_code" className="mb-1.5 block text-xs font-semibold text-slate-600">Employee code *</label><input id="employee_code" name="employee_code" required maxLength={40} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="EMP-1001"/></div>
          <div><label htmlFor="full_name" className="mb-1.5 block text-xs font-semibold text-slate-600">Full name *</label><input id="full_name" name="full_name" required minLength={2} maxLength={120} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="Employee full name"/></div>
          <div><label htmlFor="designation" className="mb-1.5 block text-xs font-semibold text-slate-600">Designation</label><input id="designation" name="designation" maxLength={120} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="Machine operator"/></div>
          <div><label htmlFor="employment_type" className="mb-1.5 block text-xs font-semibold text-slate-600">Employment type *</label><select id="employment_type" name="employment_type" required className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="permanent">Permanent</option><option value="temporary">Temporary</option><option value="trainee">Trainee</option><option value="contract">Contract</option></select></div>
          <div><label htmlFor="plant_id" className="mb-1.5 block text-xs font-semibold text-slate-600">Plant *</label><select id="plant_id" name="plant_id" required disabled={!plants?.length} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">Select plant</option>{(plants || []).map((plant) => <option key={plant.id} value={plant.id}>{plant.name} · {plant.code}</option>)}</select></div>
          <div><label htmlFor="department_id" className="mb-1.5 block text-xs font-semibold text-slate-600">Department</label><select id="department_id" name="department_id" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">No department assigned</option>{(departments || []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select><p className="mt-1 text-[10px] text-slate-400">Department must belong to selected plant.</p></div>
          <div><label htmlFor="joining_date" className="mb-1.5 block text-xs font-semibold text-slate-600">Joining date</label><input id="joining_date" name="joining_date" type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"/></div>
          <div><label htmlFor="work_email" className="mb-1.5 block text-xs font-semibold text-slate-600">Work email</label><input id="work_email" name="work_email" type="email" maxLength={254} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="employee@company.com"/></div>
          <div><label htmlFor="phone" className="mb-1.5 block text-xs font-semibold text-slate-600">Phone</label><input id="phone" name="phone" type="tel" maxLength={30} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="Optional"/></div>
          <div className="flex items-end xl:col-span-3"><button disabled={!plants?.length} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Create employee</button></div>
        </form>
      </section>}

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold">Employee records</h2><p className="mt-1 text-xs text-slate-500">Live Supabase data · access restricted by database policies</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{filtered.length} records</span></div>
        {filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[880px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Employee</th><th className="px-4 py-3">Plant / department</th><th className="px-4 py-3">Employment</th><th className="px-4 py-3">Joining date</th><th className="px-4 py-3">Status</th>{canManage && <th className="px-4 py-3">Actions</th>}</tr></thead><tbody className="divide-y divide-slate-100">{filtered.map((employee) => <tr key={employee.id}><td className="px-5 py-4"><p className="font-semibold">{employee.full_name}</p><p className="mt-1 text-xs text-slate-500">{employee.employee_code} · {employee.designation || "No designation"}</p>{employee.work_email && <p className="mt-1 text-xs text-slate-500">{employee.work_email}</p>}</td><td className="px-4 py-4"><p>{plantMap.get(employee.plant_id || "")?.name || "Unassigned plant"}</p><p className="mt-1 text-xs text-slate-500">{departmentMap.get(employee.department_id || "")?.name || "No department"}</p></td><td className="px-4 py-4 capitalize">{employee.employment_type}</td><td className="px-4 py-4">{employee.joining_date || "—"}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${employee.employment_status === "active" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-600"}`}>{employee.employment_status}</span></td>{canManage && <td className="px-4 py-4">{employee.employment_status === "active" ? <form action={deactivateEmployee}><input type="hidden" name="employee_id" value={employee.id}/><button className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50">Deactivate</button></form> : <span className="text-xs text-slate-400">No action</span>}</td>}</tr>)}</tbody></table></div> : <div className="px-5 py-14 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500"><Building2 size={20}/></span><h3 className="mt-3 font-semibold">No employee records found</h3><p className="mt-1 text-sm text-slate-500">{query ? "Try a different search term." : "Create an employee after a plant has been configured."}</p></div>}
      </section>
      <p className="mt-5 text-xs leading-5 text-slate-500">Employee deactivation preserves attendance history. Bulk import, full edit workflow, employee transfers and detailed employee profiles are planned for the next implementation phase.</p>
    </div>
  </main>;
}
