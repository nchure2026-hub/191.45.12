import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, FileCheck2, Factory, ShieldCheck, Timer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { assignEmployeeLeave, reviewEmployeeLeave, reviewOvertime } from "./actions";

type Props = { searchParams: Promise<{ error?: string; success?: string }> };
const errors: Record<string,string> = {
  hr_only: "Only HR Manager can assign or review employee leave in IAMS.",
  leave_invalid: "Check the employee, leave type, dates and reason. All fields are required.",
  date_range: "The leave end date cannot be earlier than its start date.",
  employee_scope: "Select an active employee in this company.",
  leave_save: "Leave could not be assigned. Confirm your role and database permissions.",
  review_invalid: "The leave review details are invalid.",
  review_save: "The leave request could not be reviewed.",
  request_not_pending: "This request is no longer pending or is outside your access scope. Refresh and try again.",
  overtime_invalid: "Enter a valid decision and approved overtime minutes.",
  overtime_minutes: "Approved overtime cannot exceed the requested duration or 24 hours.",
  overtime_save: "The overtime request could not be reviewed. Check your role and permissions.",
};
const leaveLabels: Record<string,string> = { casual:"Casual", sick:"Sick", earned:"Earned", unpaid:"Unpaid", compensatory:"Compensatory", maternity_paternity:"Maternity / Paternity", other:"Other" };
function dateLabel(value: string) { return new Intl.DateTimeFormat("en-IN",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(value+"T12:00:00Z")); }
function minutesLabel(value: number) { return Math.floor(value/60)+"h "+String(value%60).padStart(2,"0")+"m"; }

export default async function LeaveOvertimePage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("user_profiles").select("company_id,full_name,role,active").eq("id", user.id).maybeSingle();
  if (!profile?.active || !profile.company_id) redirect("/login?error=profile");
  if (profile.role !== "hr_manager") redirect("/dashboard?error=hr_only");

  const [{ data: employees }, { data: leaves, error: leaveError }, { data: overtime, error: overtimeError }] = await Promise.all([
    supabase.from("employees").select("id,employee_code,full_name,plant_id,department_id").eq("company_id",profile.company_id).eq("employment_status","active").order("full_name").limit(1000),
    supabase.from("leave_requests").select("id,employee_id,start_date,end_date,leave_type,partial_day,reason,status,reviewed_by,reviewed_at,reviewer_comment,created_at").eq("company_id",profile.company_id).order("created_at",{ascending:false}).limit(200),
    supabase.from("overtime_requests").select("id,employee_id,work_date,requested_minutes,approved_minutes,reason,status,reviewed_by,reviewed_at,reviewer_comment,created_at").eq("company_id",profile.company_id).order("created_at",{ascending:false}).limit(200),
  ]);
  const employeeRows = employees ?? [];
  const employeeMap = new Map(employeeRows.map((employee) => [employee.id, employee]));
  const leaveRows = leaves ?? [];
  const overtimeRows = overtime ?? [];
  const pendingLeaves = leaveRows.filter((item) => item.status === "pending");
  const approvedLeaves = leaveRows.filter((item) => item.status === "approved");
  const pendingOvertime = overtimeRows.filter((item) => item.status === "pending");
  const approvedOT = overtimeRows.filter((item) => item.status === "approved").reduce((total,item) => total + (item.approved_minutes ?? 0),0);
  const today = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());

  return <main className="min-h-screen bg-[#e8edf2] text-slate-900">
    <header className="border-b border-slate-700 bg-[#151b22] text-white"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-7"><div className="flex items-center gap-3"><span className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-amber-400"><CalendarDays size={21}/></span><div><p className="font-bold">IAMS <span className="font-normal text-slate-400">/ HR CONTROL</span></p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.2em] text-amber-400">Leave · overtime · people records</p></div></div><Link href="/dashboard" className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/5">← Admin overview</Link></div></header>
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-7">
      <section className="rounded-3xl bg-gradient-to-br from-[#283544] to-[#121820] p-6 text-white shadow-xl sm:p-8"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-xs font-bold uppercase tracking-[.22em] text-amber-400">Human resources only</p><h1 className="mt-3 text-3xl font-bold sm:text-4xl">Leave & overtime</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Assign leave directly to a worker, review requests and validate overtime minutes. HR is the only role permitted to assign or approve leave. Each decision records the reviewer and timestamp.</p></div><span className="inline-flex w-fit items-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm font-bold text-amber-300"><ShieldCheck size={18}/> HR Manager: {profile.full_name || user.email}</span></div></section>
      {params.error && <div role="alert" className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800"><AlertTriangle size={18} className="mt-0.5 shrink-0"/><p>{errors[params.error] || "The requested action failed. Refresh and try again."}</p></div>}
      {params.success === "leave_assigned" && <div role="status" className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 size={18}/> Leave successfully assigned to the employee and recorded as approved by HR.</div>}
      {params.success === "leave_reviewed" && <div role="status" className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 size={18}/> Employee leave request reviewed.</div>}
      {params.success === "overtime_reviewed" && <div role="status" className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 size={18}/> Overtime request reviewed and recorded.</div>}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {title:"Active employees",value:employeeRows.length,detail:"Available for HR assignment",icon:<Factory size={19}/>},
          {title:"Pending leave",value:pendingLeaves.length,detail:"Awaiting HR decision",icon:<CalendarDays size={19}/>},
          {title:"Approved leave records",value:approvedLeaves.length,detail:"Includes direct HR assignments",icon:<FileCheck2 size={19}/>},
          {title:"Pending overtime",value:pendingOvertime.length,detail:"Awaiting HR review · "+minutesLabel(approvedOT)+" already approved",icon:<Timer size={19}/>},
        ].map((item)=><div key={item.title} className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{item.title}</p><span className="rounded-xl bg-slate-100 p-2 text-slate-700">{item.icon}</span></div><p className="mt-3 text-3xl font-bold">{item.value}</p><p className="mt-1 text-xs text-slate-500">{item.detail}</p></div>)}
      </section>

      <section className="rounded-2xl border border-slate-300 bg-white shadow-sm"><div className="border-b border-slate-200 bg-[#f8fafc] px-5 py-4"><h2 className="font-bold">Assign leave to an employee</h2><p className="mt-1 text-xs text-slate-500">Only HR Manager can perform this action. Direct assignments are marked approved and identify the HR reviewer.</p></div>
        {!employeeRows.length && <p className="m-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No active employees found. Add employees and their plant details first.</p>}
        <form action={assignEmployeeLeave} className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <div><label htmlFor="leave-employee" className="mb-1.5 block text-xs font-semibold text-slate-600">Employee *</label><select id="leave-employee" name="employee_id" required disabled={!employeeRows.length} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"><option value="">Select employee</option>{employeeRows.map((item)=><option key={item.id} value={item.id}>{item.full_name} · {item.employee_code}</option>)}</select></div>
          <div><label htmlFor="leave-type" className="mb-1.5 block text-xs font-semibold text-slate-600">Leave type *</label><select id="leave-type" name="leave_type" required className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"><option value="casual">Casual leave</option><option value="sick">Sick leave</option><option value="earned">Earned leave</option><option value="unpaid">Unpaid leave</option><option value="compensatory">Compensatory off</option><option value="maternity_paternity">Maternity / Paternity</option><option value="other">Other</option></select></div>
          <div><label htmlFor="leave-start" className="mb-1.5 block text-xs font-semibold text-slate-600">Start date *</label><input id="leave-start" name="start_date" type="date" required defaultValue={today} className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"/></div>
          <div><label htmlFor="leave-end" className="mb-1.5 block text-xs font-semibold text-slate-600">End date *</label><input id="leave-end" name="end_date" type="date" required defaultValue={today} className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"/></div>
          <div><label htmlFor="leave-partial" className="mb-1.5 block text-xs font-semibold text-slate-600">Duration</label><select id="leave-partial" name="partial_day" defaultValue="no" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm"><option value="no">Full day(s)</option><option value="yes">Partial day</option></select></div>
          <div className="sm:col-span-2 xl:col-span-3"><label htmlFor="leave-reason" className="mb-1.5 block text-xs font-semibold text-slate-600">Reason / HR note *</label><input id="leave-reason" name="reason" required minLength={3} maxLength={500} placeholder="Enter the reason for this leave assignment" className="w-full rounded-xl border border-slate-300 px-3 py-3 text-sm"/></div>
          <div className="sm:col-span-2 xl:col-span-4"><button disabled={!employeeRows.length} className="rounded-xl bg-amber-400 px-5 py-3 text-sm font-extrabold text-[#171d25] hover:bg-amber-300 disabled:opacity-40">Assign and approve leave</button></div>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm"><div className="border-b border-slate-200 bg-[#f8fafc] px-5 py-4"><h2 className="font-bold">Employee leave requests</h2><p className="mt-1 text-xs text-slate-500">HR-only approval queue · {pendingLeaves.length} pending</p></div>
        {leaveError ? <p className="p-5 text-sm text-red-700">Leave requests could not be loaded. Check the active HR profile and database permissions.</p> : leaveRows.length ? <div className="divide-y divide-slate-100">{leaveRows.map((item)=>{const employee=employeeMap.get(item.employee_id);return <article key={item.id} className="p-5"><div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{employee?.full_name||"Employee record"}</p><span className="text-xs text-slate-500">{employee?.employee_code||"—"}</span><span className={"rounded-full px-2.5 py-1 text-xs font-bold "+(item.status==="approved"?"bg-emerald-50 text-emerald-800":item.status==="pending"?"bg-amber-50 text-amber-900":"bg-red-50 text-red-800")}>{item.status}</span></div><p className="mt-2 text-sm">{leaveLabels[item.leave_type]||item.leave_type} · {dateLabel(item.start_date)} — {dateLabel(item.end_date)} {item.partial_day?"· Partial day":""}</p><p className="mt-1 text-sm text-slate-600">{item.reason}</p>{item.reviewer_comment&&<p className="mt-1 text-xs text-slate-500">HR note: {item.reviewer_comment}</p>}</div>
        {item.status==="pending" ? <form action={reviewEmployeeLeave} className="grid min-w-[240px] gap-2 lg:w-[300px]"><input type="hidden" name="request_id" value={item.id}/><input name="reviewer_comment" maxLength={500} placeholder="HR review comment (optional)" className="rounded-lg border border-slate-300 px-3 py-2.5 text-xs"/><div className="flex gap-2"><button name="status" value="approved" className="flex-1 rounded-lg bg-emerald-700 px-3 py-2.5 text-xs font-bold text-white hover:bg-emerald-800">Approve</button><button name="status" value="rejected" className="flex-1 rounded-lg bg-red-50 px-3 py-2.5 text-xs font-bold text-red-700 hover:bg-red-100">Reject</button></div></form> : <div className="text-xs text-slate-500">{item.reviewed_at ? "Reviewed "+dateLabel(item.reviewed_at.slice(0,10)) : "No reviewer metadata"}</div>}</div></article>})}</div> : <div className="p-10 text-center"><CalendarDays size={28} className="mx-auto text-slate-300"/><p className="mt-3 font-bold">No leave records</p><p className="mt-1 text-sm text-slate-500">Assign leave above or wait for employee requests.</p></div>}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm"><div className="border-b border-slate-200 bg-[#f8fafc] px-5 py-4"><h2 className="font-bold">Overtime approval queue</h2><p className="mt-1 text-xs text-slate-500">Check requested duration and approve only the verified minutes.</p></div>
        {overtimeError ? <p className="p-5 text-sm text-red-700">Overtime requests could not be loaded. Check database permissions.</p> : overtimeRows.length ? <div className="divide-y divide-slate-100">{overtimeRows.map((item)=>{const employee=employeeMap.get(item.employee_id);return <article key={item.id} className="p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{employee?.full_name||"Employee record"}</p><span className="text-xs text-slate-500">{employee?.employee_code||"—"}</span><span className={"rounded-full px-2.5 py-1 text-xs font-bold "+(item.status==="approved"?"bg-emerald-50 text-emerald-800":item.status==="pending"?"bg-amber-50 text-amber-900":"bg-red-50 text-red-800")}>{item.status}</span></div><p className="mt-2 text-sm">{dateLabel(item.work_date)} · Requested: <strong>{minutesLabel(item.requested_minutes)}</strong>{item.status==="approved" ? " · Approved: "+minutesLabel(item.approved_minutes||0):""}</p><p className="mt-1 text-sm text-slate-600">{item.reason}</p>{item.reviewer_comment&&<p className="mt-1 text-xs text-slate-500">HR note: {item.reviewer_comment}</p>}</div>
        {item.status==="pending" ? <form action={reviewOvertime} className="grid min-w-[240px] gap-2 lg:w-[320px]"><input type="hidden" name="request_id" value={item.id}/><label className="text-xs font-semibold text-slate-600">Approved OT minutes (max {item.requested_minutes})<input name="approved_minutes" type="number" min="0" max={item.requested_minutes} defaultValue={item.requested_minutes} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"/></label><input name="reviewer_comment" maxLength={500} placeholder="HR review comment (optional)" className="rounded-lg border border-slate-300 px-3 py-2.5 text-xs"/><div className="flex gap-2"><button name="status" value="approved" className="flex-1 rounded-lg bg-emerald-700 px-3 py-2.5 text-xs font-bold text-white hover:bg-emerald-800">Approve OT</button><button name="status" value="rejected" className="flex-1 rounded-lg bg-red-50 px-3 py-2.5 text-xs font-bold text-red-700 hover:bg-red-100">Reject</button></div></form> : <div className="text-xs text-slate-500">{item.reviewed_at ? "Reviewed "+dateLabel(item.reviewed_at.slice(0,10)) : "No reviewer metadata"}</div>}</div></article>})}</div> : <div className="p-10 text-center"><Clock3 size={28} className="mx-auto text-slate-300"/><p className="mt-3 font-bold">No overtime requests</p><p className="mt-1 text-sm text-slate-500">Worker or supervisor overtime requests will appear here.</p></div>}
      </section>

      <footer className="flex items-center gap-2 border-t border-slate-300 pt-4 text-xs leading-5 text-slate-500"><ShieldCheck size={14}/> Leave assignment and approval are enforced for the HR Manager role in the UI and Supabase row-level policies.</footer>
    </div>
  </main>;
}
