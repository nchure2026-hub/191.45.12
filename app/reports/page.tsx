import Link from "next/link";
import MobileMenu from "@/components/MobileMenu";
import { redirect } from "next/navigation";
import { Activity, AlertTriangle, ArrowDownToLine, ArrowLeft, CalendarDays, CheckCircle2, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { calculateDailySummaries } from "./actions";

type Props = { searchParams: Promise<{ date?: string; error?: string; success?: string; processed?: string; conflicts?: string; unassigned?: string }> };
const errors: Record<string,string> = {
  invalid_date:"Choose a valid work date.",
  read_failed:"Could not load employees, shifts, holidays or leave records. No summary was written.",
  punch_read:"Attendance punches could not be loaded. No summary was written.",
  summary_save:"Attendance summary could not be saved. Check HR permissions and retry.",
};
function localDate(timezone: string) {
  return new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
}
function timeLabel(value: string | null, timezone: string) {
  return value ? new Intl.DateTimeFormat("en-IN",{timeZone:timezone,hour:"2-digit",minute:"2-digit"}).format(new Date(value)) : "—";
}
function duration(minutes: number) {
  return Math.floor(minutes/60)+"h "+String(minutes%60).padStart(2,"0")+"m";
}
const statusStyle: Record<string,string> = {
  present:"bg-emerald-50 text-emerald-700", late:"bg-amber-50 text-amber-800",
  half_day:"bg-orange-50 text-orange-800", absent:"bg-red-50 text-red-700",
  on_leave:"bg-blue-50 text-blue-700", holiday:"bg-violet-50 text-violet-700",
  weekly_off:"bg-slate-100 text-slate-600", missing_punch:"bg-amber-100 text-amber-900",
  incomplete:"bg-rose-50 text-rose-700",
};
export default async function ReportsPage({searchParams}:Props) {
  const params = await searchParams;
  const requestedDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null;
  const supabase = await createClient();
  const {data:{user}} = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const {data:profile} = await supabase.from("user_profiles").select("company_id,full_name,role,active").eq("id",user.id).maybeSingle();
  if (!profile?.active || !profile.company_id) redirect("/login?error=profile");
  if (!["super_admin","hr_manager"].includes(profile.role)) redirect("/dashboard?error=forbidden");
  const {data:company} = await supabase.from("companies").select("name,timezone").eq("id",profile.company_id).maybeSingle();
  const timezone = company?.timezone || "Asia/Kolkata";
  const date = requestedDate || localDate(timezone);
  const {data:rows,error} = await supabase.from("daily_attendance_summaries")
    .select("id,employee_id,work_date,shift_id,first_check_in,last_check_out,worked_minutes,late_minutes,early_departure_minutes,overtime_minutes,status,calculated_at,calculation_version")
    .eq("company_id",profile.company_id).eq("work_date",date).order("first_check_in",{ascending:true,nullsFirst:false}).limit(5000);
  const summaries = rows ?? [];
  const employeeIds = [...new Set(summaries.map(row=>row.employee_id))];
  const shiftIds = [...new Set(summaries.map(row=>row.shift_id).filter((id):id is string=>Boolean(id)))];
  const [{data:employees},{data:shifts}] = await Promise.all([
    employeeIds.length ? supabase.from("employees").select("id,employee_code,full_name,plant_id,department_id").eq("company_id",profile.company_id).in("id",employeeIds) : Promise.resolve({data:[]}),
    shiftIds.length ? supabase.from("shifts").select("id,name,code").eq("company_id",profile.company_id).in("id",shiftIds) : Promise.resolve({data:[]}),
  ]);
  const employeeMap = new Map((employees??[]).map(row=>[row.id,row]));
  const shiftMap = new Map((shifts??[]).map(row=>[row.id,row]));
  const present = summaries.filter(row=>["present","late","half_day"].includes(row.status)).length;
  const absent = summaries.filter(row=>row.status==="absent").length;
  const exceptions = summaries.filter(row=>["incomplete","missing_punch"].includes(row.status)).length;
  const overtime = summaries.reduce((total,row)=>total+row.overtime_minutes,0);

  return <main className="min-h-screen bg-[#edf1f5] text-slate-900">
    <header className="bg-[#151b22] text-white"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-7"><div className="flex min-w-0 items-center gap-3"><MobileMenu/><span className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-amber-300"><FileSpreadsheet size={22}/></span><div><p className="font-bold">IAMS <span className="font-normal text-slate-400">/ ATTENDANCE REPORTS</span></p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.2em] text-amber-300">HR summary & export</p></div></div><Link href="/dashboard" className="hidden items-center gap-2 rounded-xl border border-slate-600 md:inline-flex px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/5"><ArrowLeft size={15}/> Dashboard</Link></div></header>
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-7">
      <section className="rounded-3xl bg-gradient-to-br from-[#263648] to-[#121820] p-6 text-white shadow-lg sm:p-8"><p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">Daily calculation engine</p><h1 className="mt-3 text-3xl font-bold sm:text-4xl">Attendance summaries</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Calculate a selected work date using active roster assignments, plant timezones, punches, approved full-day leave, holidays and weekly-off settings. Exceptions are retained for HR review rather than silently corrected.</p><div className="mt-5 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Timezone: {timezone}</span><span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Policy version: 1</span><span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-amber-200">Payroll requires HR validation</span></div></section>

      {params.error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{errors[params.error]??"The report operation failed. Check your access and retry."}</div>}
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Attendance summaries could not be loaded.</div>}
      {params.success==="calculated" && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><p className="flex items-center gap-2 font-bold"><CheckCircle2 size={18}/>Daily summaries recalculated for {date}.</p><p className="mt-1 text-xs leading-5">Saved: {params.processed??"0"} · Assignment conflicts skipped: {params.conflicts??"0"} · Active employees without a roster: {params.unassigned??"0"}. Review incomplete/missing-punch records before payroll.</p></div>}
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-end">
        <form action="/reports" className="flex flex-wrap items-end gap-3"><label className="block text-xs font-semibold text-slate-600">Work date<input className="mt-1 block rounded-xl border border-slate-300 px-3 py-2.5 text-sm" type="date" name="date" required defaultValue={date}/></label><button className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">View date</button></form>
        <div className="flex flex-wrap gap-2"><form action={calculateDailySummaries}><input type="hidden" name="work_date" value={date}/><button className="inline-flex items-center gap-2 rounded-xl bg-[#172B4D] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#213b66]"><Activity size={16}/> Calculate / refresh summaries</button></form><a href={"/reports/export?from="+date+"&to="+date} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"><ArrowDownToLine size={16}/> Export CSV</a></div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Scheduled summaries</p><p className="mt-2 text-3xl font-bold">{summaries.length}</p><p className="mt-2 text-xs text-slate-500">Employees with an effective roster assignment</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Present / late / half-day</p><p className="mt-2 text-3xl font-bold text-emerald-700">{present}</p><p className="mt-2 text-xs text-slate-500">Calculated attendance records</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Absent</p><p className="mt-2 text-3xl font-bold text-red-700">{absent}</p><p className="mt-2 text-xs text-slate-500">No punches on a scheduled non-holiday day</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Review exceptions</p><p className="mt-2 text-3xl font-bold text-amber-700">{exceptions}</p><p className="mt-2 text-xs text-slate-500">Missing or inconsistent punch sequence</p></div>
      </div>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col justify-between gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center"><div><h2 className="font-bold">Daily employee ledger</h2><p className="mt-1 text-xs text-slate-500">{date} · {summaries.length} summary records · overtime total {duration(overtime)}</p></div><span className="inline-flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={15}/> HR / Super Admin only</span></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Shift</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Check-in</th><th className="px-4 py-3">Check-out</th><th className="px-4 py-3">Worked</th><th className="px-4 py-3">Late</th><th className="px-4 py-3">Overtime</th></tr></thead><tbody>{summaries.map(row=>{const employee=employeeMap.get(row.employee_id);const shift=row.shift_id?shiftMap.get(row.shift_id):null;return <tr key={row.id} className="border-t border-slate-100"><td className="px-4 py-3"><p className="font-semibold">{employee?.full_name??"Employee"}</p><p className="text-xs text-slate-500">{employee?.employee_code??"—"}</p></td><td className="px-4 py-3">{shift?.name??"—"}</td><td className="px-4 py-3"><span className={"rounded-full px-2.5 py-1 text-xs font-bold "+(statusStyle[row.status]??"bg-slate-100 text-slate-600")}>{row.status.replaceAll("_"," ")}</span></td><td className="px-4 py-3">{timeLabel(row.first_check_in,timezone)}</td><td className="px-4 py-3">{timeLabel(row.last_check_out,timezone)}</td><td className="px-4 py-3 font-semibold">{duration(row.worked_minutes)}</td><td className="px-4 py-3">{duration(row.late_minutes)}</td><td className="px-4 py-3">{duration(row.overtime_minutes)}</td></tr>})}</tbody></table>{!summaries.length&&!error&&<div className="p-10 text-center"><CalendarDays size={28} className="mx-auto text-slate-300"/><p className="mt-3 font-semibold text-slate-700">No summaries for {date}</p><p className="mt-1 text-sm text-slate-500">Choose Calculate / refresh summaries after shifts and punches are available.</p></div>}</div>
      </section>
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertTriangle size={19} className="mt-0.5 shrink-0"/><p><strong>Important:</strong> calculation version 1 is a reviewable attendance summary, not a finalized payroll engine. Employees with conflicting roster assignments are skipped; holiday/leave/weekly-off days with punches are marked incomplete for review. Validate the company’s policy and sample results before using summaries for wages, deductions or disciplinary decisions.</p></div>
    </div>
  </main>;
}
