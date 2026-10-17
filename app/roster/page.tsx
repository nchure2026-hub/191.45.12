import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarClock, CheckCircle2, ClipboardList, Factory, Users, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createRosterAssignment, endRosterAssignment } from "./actions";

type Props = { searchParams: Promise<{ error?: string; success?: string }> };
const errors: Record<string,string> = {
  forbidden: "Your role does not have permission to manage roster assignments.",
  invalid: "Check the employee, shift and dates, then try again.",
  date_range: "The roster end date cannot be earlier than its start date.",
  employee_scope: "Select an active employee in your authorized company or plant.",
  shift_scope: "Choose an active shift that belongs to the employee's plant.",
  overlap_check: "The existing roster could not be checked. No change was saved; retry.",
  overlap: "This employee already has an overlapping shift assignment for that date range.",
  save: "Roster assignment could not be saved. Check permissions and required fields.",
  notfound: "This assignment is no longer available in your access scope.",
};
function dayLabel(value: string | null) {
  if (!value) return "Open-ended";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value + "T12:00:00Z"));
}

export default async function RosterPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("user_profiles").select("company_id,role,active").eq("id", user.id).maybeSingle();
  if (!profile?.active || !profile.company_id) redirect("/login?error=profile");
  if (!["super_admin", "hr_manager", "plant_manager"].includes(profile.role)) redirect("/dashboard?error=forbidden");

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [{ data: employees }, { data: shifts }, { data: assignments, error }] = await Promise.all([
    supabase.from("employees").select("id,employee_code,full_name,plant_id,department_id").eq("company_id", profile.company_id).eq("employment_status", "active").order("full_name").limit(500),
    supabase.from("shifts").select("id,name,code,plant_id,start_time,end_time,overnight,active").eq("company_id", profile.company_id).eq("active", true).order("name"),
    supabase.from("shift_assignments").select("id,employee_id,shift_id,effective_from,effective_to,created_at").eq("company_id", profile.company_id).order("effective_from", { ascending: false }).limit(500),
  ]);

  const employeeRows = employees ?? [];
  const shiftRows = shifts ?? [];
  const assignmentRows = assignments ?? [];
  const employeeMap = new Map(employeeRows.map((item) => [item.id, item]));
  const shiftMap = new Map(shiftRows.map((item) => [item.id, item]));
  const currentAssignments = assignmentRows.filter((item) => item.effective_from <= today && (!item.effective_to || item.effective_to >= today));
  const canCreate = employeeRows.length > 0 && shiftRows.length > 0;

  return <main className="min-h-screen bg-[#e8edf2] text-slate-900">
    <header className="border-b border-slate-700 bg-[#151b22] text-white"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-7"><div className="flex items-center gap-3"><span className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-amber-400"><CalendarClock size={21}/></span><div><p className="font-bold">IAMS <span className="font-normal text-slate-400">/ ROSTER CONTROL</span></p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.2em] text-amber-400">Production shift planning</p></div></div><Link href="/dashboard" className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/5"><ArrowLeft size={15}/> Admin overview</Link></div></header>
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-7">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#283544] to-[#121820] p-6 text-white shadow-xl sm:p-8"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-xs font-bold uppercase tracking-[.22em] text-amber-400">Workforce scheduling</p><h1 className="mt-3 text-3xl font-bold sm:text-4xl">Roster assignments</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Assign day, evening and night shifts to metal-factory employees with an effective date range. Existing history remains preserved when assignments are ended.</p></div><div className="flex gap-3"><span className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"><span className="block text-xs text-slate-400">Active today</span><span className="mt-1 block text-2xl font-bold">{currentAssignments.length}</span></span><span className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"><span className="block text-xs text-slate-400">Total records</span><span className="mt-1 block text-2xl font-bold">{assignmentRows.length}</span></span></div></div></section>
      {params.error && <div role="alert" className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800"><AlertTriangle size={18} className="mt-0.5 shrink-0"/><p>{errors[params.error] || "The requested roster action failed."}</p></div>}
      {params.success === "assigned" && <div role="status" className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 size={18}/> Shift roster successfully assigned.</div>}
      {params.success === "ended" && <div role="status" className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 size={18}/> Assignment end date saved. Historical roster remains preserved.</div>}

      <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-slate-100 p-3 text-slate-700"><ClipboardList size={20}/></span><div><h2 className="font-bold">Assign shift to an employee</h2><p className="mt-1 text-xs text-slate-500">A person cannot have two overlapping shift assignments.</p></div></div>
        {!canCreate && <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">{!employeeRows.length ? "No active employees are in your scope. Add employees first." : "No active shift templates are available. Create a shift template first."}</p>}
        <form action={createRosterAssignment} className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div><label htmlFor="roster-employee" className="mb-1.5 block text-xs font-semibold text-slate-600">Employee *</label><select id="roster-employee" name="employee_id" required disabled={!canCreate} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"><option value="">Select employee</option>{employeeRows.map((item) => <option key={item.id} value={item.id}>{item.full_name} · {item.employee_code}</option>)}</select></div>
          <div><label htmlFor="roster-shift" className="mb-1.5 block text-xs font-semibold text-slate-600">Shift template *</label><select id="roster-shift" name="shift_id" required disabled={!canCreate} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"><option value="">Select shift</option>{shiftRows.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.start_time.slice(0,5)}–{item.end_time.slice(0,5)}{item.overnight ? " (overnight)" : ""}</option>)}</select></div>
          <div><label htmlFor="roster-from" className="mb-1.5 block text-xs font-semibold text-slate-600">Effective from *</label><input id="roster-from" name="effective_from" type="date" required defaultValue={today} disabled={!canCreate} className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"/></div>
          <div><label htmlFor="roster-to" className="mb-1.5 block text-xs font-semibold text-slate-600">Effective to (optional)</label><input id="roster-to" name="effective_to" type="date" disabled={!canCreate} className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"/><p className="mt-1 text-[10px] text-slate-400">Blank means no planned end date.</p></div>
          <div className="sm:col-span-2 xl:col-span-4"><button disabled={!canCreate} className="rounded-xl bg-amber-400 px-5 py-3 text-sm font-extrabold text-[#171d25] hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40">Assign roster</button></div>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-slate-200 bg-[#f8fafc] px-5 py-4 sm:flex-row sm:items-center"><div><h2 className="font-bold">Roster directory</h2><p className="mt-1 text-xs text-slate-500">Database-backed assignments · latest records first</p></div><span className="rounded-full bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700">{assignmentRows.length} assignments</span></div>
        {error ? <p className="p-5 text-sm text-red-700">Roster could not be loaded. Your role may have limited scope or the database request failed.</p> : assignmentRows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Employee</th><th className="px-4 py-3">Shift</th><th className="px-4 py-3">Effective period</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{assignmentRows.map((item) => {const employee = employeeMap.get(item.employee_id);const shift = shiftMap.get(item.shift_id);const active = item.effective_from <= today && (!item.effective_to || item.effective_to >= today);const future = item.effective_from > today;return <tr key={item.id} className="align-top hover:bg-slate-50"><td className="px-5 py-4"><p className="font-bold">{employee?.full_name || "Restricted employee"}</p><p className="mt-1 text-xs text-slate-500">{employee?.employee_code || "—"}</p></td><td className="px-4 py-4"><p className="font-semibold">{shift?.name || "Shift template unavailable"}</p><p className="mt-1 text-xs text-slate-500">{shift ? shift.start_time.slice(0,5) + "–" + shift.end_time.slice(0,5) + (shift.overnight ? " · Overnight" : "") : "—"}</p></td><td className="px-4 py-4"><p>{dayLabel(item.effective_from)} — {dayLabel(item.effective_to)}</p></td><td className="px-4 py-4"><span className={"rounded-full px-2.5 py-1 text-xs font-bold " + (active ? "bg-emerald-50 text-emerald-800" : future ? "bg-blue-50 text-blue-800" : "bg-slate-100 text-slate-500")}>{active ? "Active" : future ? "Scheduled" : "Ended"}</span></td><td className="px-4 py-4">{(!item.effective_to || item.effective_to >= today) ? <form action={endRosterAssignment} className="flex items-center gap-2"><input type="hidden" name="assignment_id" value={item.id}/><input aria-label="Assignment end date" name="effective_to" type="date" required min={item.effective_from} defaultValue={item.effective_from > today ? item.effective_from : today} className="w-36 rounded-lg border border-slate-300 px-2 py-2 text-xs"/><button className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">Set end</button></form> : <span className="text-xs text-slate-400">History retained</span>}</td></tr>})}</tbody></table></div> : <div className="p-12 text-center"><CalendarClock size={30} className="mx-auto text-slate-300"/><p className="mt-3 font-bold">No roster assignments yet</p><p className="mt-1 text-sm text-slate-500">Create shift templates, then assign a shift to each active employee.</p></div>}
      </section>
      <p className="text-xs leading-5 text-slate-500">Access policy: Super Admin, HR Manager and authorized Plant Managers can assign shifts within their permitted scope. Department supervisors and workers cannot create roster assignments.</p>
    </div>
  </main>;
}
