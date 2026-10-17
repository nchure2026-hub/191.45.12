import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, AlertTriangle, ArrowUpRight, CalendarClock, CheckCircle2, Clock3, Factory, LogOut, ShieldCheck, UserCog, UserPlus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

function localDate(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function zonedMidnight(date: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(guess));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const localAsUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
  return new Date(guess - (localAsUtc - guess));
}

function localDayBounds(date: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1));
  const next = `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, "0")}-${String(nextDate.getUTCDate()).padStart(2, "0")}`;
  return { start: zonedMidnight(date, timezone).toISOString(), end: zonedMidnight(next, timezone).toISOString() };
}

function formatTime(value: string | null, timezone: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(new Date(value));
}

function Metric({ label, value, detail, icon: Icon, tone = "blue" }: { label: string; value: string | number; detail: string; icon: typeof Users; tone?: "blue" | "green" | "amber" | "red" }) {
  const colors = { blue: "bg-blue-50 text-blue-700", green: "bg-green-50 text-green-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700" };
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-3 text-3xl font-bold tracking-tight text-slate-900">{value}</p></div><span className={`rounded-xl p-3 ${colors[tone]}`}><Icon size={20}/></span></div><p className="mt-3 text-xs text-slate-500">{detail}</p></div>;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("user_profiles").select("company_id, full_name, role, employee_id, active").eq("id", user.id).maybeSingle();
  if (!profile || !profile.active || !profile.company_id) {
    return <main className="min-h-screen bg-slate-50 p-8"><div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-8"><AlertTriangle className="text-amber-600"/><h1 className="mt-4 text-xl font-bold">Account setup required</h1><p className="mt-2 text-sm leading-6 text-slate-600">Your login succeeded, but an active IAMS user profile is not assigned. Ask your system administrator to link your account to a company and role.</p><form action="/auth/signout" method="post" className="mt-5"><button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Sign out</button></form></div></main>;
  }

  const { data: company } = await supabase.from("companies").select("name, timezone").eq("id", profile.company_id).maybeSingle();
  const timezone = company?.timezone || "Asia/Kolkata";
  const today = localDate(timezone);
  const dayBounds = localDayBounds(today, timezone);
  const isEmployee = profile.role === "employee";
  const [employeeCountResult, summaryResult, punchResult, leaveResult, correctionResult, shiftResult, plantResult] = await Promise.all([
    supabase.from("employees").select("id", { count: "exact", head: true }).eq("company_id", profile.company_id).eq("employment_status", "active"),
    supabase.from("daily_attendance_summaries").select("id, employee_id, work_date, first_check_in, last_check_out, worked_minutes, late_minutes, overtime_minutes, status").eq("company_id", profile.company_id).eq("work_date", today).order("first_check_in", { ascending: false }),
    supabase.from("attendance_punches").select("id, employee_id, punch_type, punched_at, source").eq("company_id", profile.company_id).gte("punched_at", dayBounds.start).lt("punched_at", dayBounds.end).order("punched_at", { ascending: false }).limit(8),
    supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("company_id", profile.company_id).eq("status", "pending"),
    supabase.from("attendance_correction_requests").select("id", { count: "exact", head: true }).eq("company_id", profile.company_id).eq("status", "pending"),
    supabase.from("shifts").select("id", { count: "exact", head: true }).eq("company_id", profile.company_id).eq("active", true),
    supabase.from("plants").select("id", { count: "exact", head: true }).eq("company_id", profile.company_id).eq("active", true),
  ]);

  const summaries = summaryResult.data ?? [];
  const employeeIds = [...new Set([...(summaries.map((row) => row.employee_id)), ...((punchResult.data ?? []).map((row) => row.employee_id))])];
  const employeeResult = employeeIds.length ? await supabase.from("employees").select("id, employee_code, full_name, department_id").in("id", employeeIds) : { data: [] };
  const employees = employeeResult.data ?? [];
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const present = summaries.filter((row) => ["present", "late", "half_day", "overtime"].includes((row.status || "").toLowerCase())).length;
  const late = summaries.filter((row) => (row.late_minutes ?? 0) > 0).length;
  const overtimeMinutes = summaries.reduce((total, row) => total + (row.overtime_minutes ?? 0), 0);
  const pending = (leaveResult.count ?? 0) + (correctionResult.count ?? 0);
  const displayName: string = profile.full_name || user.email || "IAMS User";
  const initials = displayName.split(/\s+/).map((part: string) => part[0]).slice(0, 2).join("").toUpperCase();
  const titleDate = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: timezone }).format(new Date());

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white p-5 lg:flex">
      <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-[#172B4D] text-sm font-black text-white">IA</div><div><p className="font-bold">IAMS</p><p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Industrial attendance</p></div></div>
      <div className="mt-8 rounded-xl border border-slate-200 p-3"><div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Factory size={15}/> Active workspace</div><p className="mt-2 truncate text-sm font-bold">{company?.name || "Company workspace"}</p><p className="mt-1 text-xs text-slate-500">{timezone}</p></div>
      <p className="mb-2 mt-8 px-2 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Workspace</p>
      <div className="flex items-center gap-3 rounded-xl bg-blue-50 px-3 py-3 text-sm font-semibold text-blue-700"><Activity size={18}/> Overview</div>
      <p className="mb-2 mt-7 px-2 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Workforce</p>
      <Link href="/employees" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-blue-700"><Users size={18}/> Employee directory</Link><Link href="/worker-accounts" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-blue-700"><UserPlus size={18}/> Worker accounts</Link><Link href="/employee-portal/login" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"><Activity size={18}/> Worker attendance portal</Link>{profile.role === "super_admin" && <Link href="/team-accounts" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-blue-700"><UserCog size={18}/> Team accounts / HR</Link>}
      <div className="mt-2 space-y-1 text-sm text-slate-400"><Link href="/shifts" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-blue-700"><CalendarClock size={18}/> Shift templates</Link><p className="rounded-lg px-3 py-2">Roster assignments · Phase 3</p><p className="rounded-lg px-3 py-2">Leave & overtime · Phase 3</p><p className="rounded-lg px-3 py-2">Reports & device imports · Phase 4</p></div>
      <div className="mt-auto rounded-xl bg-slate-50 p-3"><div className="flex items-center gap-2 text-xs font-semibold text-slate-600"><ShieldCheck size={15}/> Protected workspace</div><p className="mt-2 text-[11px] leading-5 text-slate-500">Company-scoped data access is enforced by Supabase RLS.</p></div>
    </aside>
    <div className="lg:pl-64">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-7"><div><p className="text-xs text-slate-500">Workspace <span className="px-1 text-slate-300">/</span> <span className="font-semibold text-slate-800">Overview</span></p><p className="mt-1 text-xs text-slate-500">{titleDate}</p></div><div className="flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-semibold">{displayName}</p><p className="text-[11px] capitalize text-slate-500">{profile.role.replaceAll("_", " ")}</p></div><div className="grid h-9 w-9 place-items-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-800">{initials}</div><form action="/auth/signout" method="post"><button aria-label="Sign out" title="Sign out" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><LogOut size={16}/></button></form></div></header>
      <div className="mx-auto max-w-7xl p-4 sm:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-blue-700">Attendance overview</p><h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Good day, {displayName.split(" ")[0]}</h1><p className="mt-2 text-sm text-slate-500">Live records from your authorized company workspace · {today}</p></div><div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600"><CalendarClock size={15}/> {timezone}</div></div>
        {isEmployee ? <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">Employee view: your dashboard data is restricted to records permitted for your account.</div> : null}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={isEmployee ? "My employee record" : "Employees in accessible scope"} value={employeeCountResult.count ?? 0} detail="Active employee records returned under current access policies" icon={Users}/>
          <Metric label="Present / worked today" value={present} detail="Calculated summaries for this workday" icon={CheckCircle2} tone="green"/>
          <Metric label="Late arrivals" value={late} detail="Summaries with late minutes greater than zero" icon={Clock3} tone="amber"/>
          <Metric label="Pending reviews" value={pending} detail="Leave and regularization requests awaiting review" icon={AlertTriangle} tone={pending ? "red" : "blue"}/>
        </div>
        <div className="mt-6 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold">Today&apos;s attendance</h2><p className="mt-1 text-xs text-slate-500">Calculated summaries · {summaries.length} records</p></div><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">Live data</span></div>
            {summaries.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-semibold">Employee</th><th className="px-4 py-3 font-semibold">First in</th><th className="px-4 py-3 font-semibold">Last out</th><th className="px-4 py-3 font-semibold">Worked</th><th className="px-4 py-3 font-semibold">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{summaries.map((row) => { const employee = employeeMap.get(row.employee_id); return <tr key={row.id}><td className="px-5 py-3"><p className="font-semibold">{employee?.full_name || "Restricted employee"}</p><p className="mt-1 text-xs text-slate-500">{employee?.employee_code || "—"}</p></td><td className="px-4 py-3">{formatTime(row.first_check_in, timezone)}</td><td className="px-4 py-3">{formatTime(row.last_check_out, timezone)}</td><td className="px-4 py-3">{Math.floor((row.worked_minutes ?? 0) / 60)}h {(row.worked_minutes ?? 0) % 60}m</td><td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">{row.status?.replaceAll("_", " ") || "pending"}</span></td></tr>; })}</tbody></table></div> : <div className="px-5 py-12 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500"><Users size={21}/></div><p className="mt-3 font-semibold">No attendance summaries yet</p><p className="mt-1 text-sm text-slate-500">Records will appear here when valid punches are processed.</p></div>}
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold">Workspace health</h2><p className="mt-1 text-xs text-slate-500">Current configuration overview</p></div><div className="space-y-4 p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="rounded-lg bg-blue-50 p-2 text-blue-700"><Factory size={17}/></span><div><p className="text-sm font-semibold">Active plants</p><p className="text-xs text-slate-500">Within your company</p></div></div><strong>{plantResult.count ?? 0}</strong></div><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="rounded-lg bg-indigo-50 p-2 text-indigo-700"><CalendarClock size={17}/></span><div><p className="text-sm font-semibold">Active shift templates</p><p className="text-xs text-slate-500">Configured shifts</p></div></div><strong>{shiftResult.count ?? 0}</strong></div><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="rounded-lg bg-amber-50 p-2 text-amber-700"><AlertTriangle size={17}/></span><div><p className="text-sm font-semibold">Pending corrections</p><p className="text-xs text-slate-500">Awaiting review</p></div></div><strong>{correctionResult.count ?? 0}</strong></div><div className="flex items-center justify-between"><div className="flex items-center gap-3"><span className="rounded-lg bg-green-50 p-2 text-green-700"><Activity size={17}/></span><div><p className="text-sm font-semibold">Overtime recorded</p><p className="text-xs text-slate-500">Derived overtime, not payroll-approved</p></div></div><strong>{Math.floor(overtimeMinutes / 60)}h {overtimeMinutes % 60}m</strong></div></div><div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500"><ArrowUpRight className="mr-1 inline" size={13}/> Counts are limited by the signed-in user&apos;s database permissions.</div></section>
        </div>
        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold">Recent punch activity</h2><p className="mt-1 text-xs text-slate-500">Raw source events · append-only records</p></div>{(punchResult.data ?? []).length ? <div className="divide-y divide-slate-100">{(punchResult.data ?? []).map((punch) => { const employee = employeeMap.get(punch.employee_id); return <div key={punch.id} className="flex items-center justify-between gap-4 px-5 py-3"><div className="flex min-w-0 items-center gap-3"><span className="rounded-lg bg-slate-100 p-2 text-slate-600"><Activity size={16}/></span><div className="min-w-0"><p className="truncate text-sm font-semibold">{employee?.full_name || "Restricted employee"}</p><p className="mt-1 text-xs text-slate-500">{punch.source || "unspecified source"} · {punch.punch_type.replaceAll("_", " ")}</p></div></div><time className="shrink-0 text-sm font-semibold">{formatTime(punch.punched_at, timezone)}</time></div>; })}</div> : <p className="px-5 py-8 text-sm text-slate-500">No punch events have been recorded for this date.</p>}</section>
        <footer className="mt-6 flex flex-col justify-between gap-2 border-t border-slate-200 pt-4 text-xs text-slate-500 sm:flex-row"><span>Industrial Attendance Management System</span><span>Database-backed view · Attendance calculations require approved policy configuration</span></footer>
      </div>
    </div>
  </main>;
}
