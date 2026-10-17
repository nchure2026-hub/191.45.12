import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, CalendarDays, CheckCircle2, Clock3, Factory, LogOut, UserRound, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import FacePunchCard, { type EmployeePunchType, type PunchChoice } from "./FacePunchCard";

function localDateKey(value: Date | string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
function formatDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: timezone, day: "2-digit", month: "short", year: "numeric" }).format(new Date(value + "T12:00:00Z"));
}
function formatTime(value: string | null, timezone: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
function formatDuration(minutes: number) {
  return Math.floor(minutes / 60) + "h " + String(minutes % 60).padStart(2, "0") + "m";
}

export default async function EmployeePortalPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/employee-portal/login");

  const { data: profile } = await supabase.from("user_profiles")
    .select("company_id, full_name, role, employee_id, active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.active || profile.role !== "employee" || !profile.employee_id || !profile.company_id) {
    redirect("/employee-portal/login?error=not_employee");
  }

  const { data: employee } = await supabase.from("employees")
    .select("id, company_id, employee_code, full_name, designation, work_email, plant_id, department_id, employment_status")
    .eq("id", profile.employee_id)
    .eq("company_id", profile.company_id)
    .maybeSingle();
  if (!employee || employee.employment_status !== "active") redirect("/employee-portal/login?error=not_employee");

  const [{ data: company }, { data: plant }, { data: department }, { data: punches }] = await Promise.all([
    supabase.from("companies").select("name,timezone").eq("id", profile.company_id).maybeSingle(),
    employee.plant_id ? supabase.from("plants").select("name,timezone").eq("id", employee.plant_id).maybeSingle() : Promise.resolve({ data: null }),
    employee.department_id ? supabase.from("departments").select("name").eq("id", employee.department_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("attendance_punches")
      .select("id,punch_type,punched_at,face_capture_path")
      .eq("company_id", profile.company_id)
      .eq("employee_id", employee.id)
      .order("punched_at", { ascending: false })
      .limit(100),
  ]);

  const timezone = plant?.timezone || company?.timezone || "Asia/Kolkata";
  const today = localDateKey(new Date(), timezone);
  const allPunches = punches ?? [];
  const todayPunches = allPunches.filter((punch) => localDateKey(punch.punched_at, timezone) === today).sort((a,b) => new Date(a.punched_at).getTime() - new Date(b.punched_at).getTime());
  const latest = allPunches[0] ?? null;
  const staleOpenShift = Boolean(latest && latest.punch_type !== "check_out" && Date.now() - new Date(latest.punched_at).getTime() > 18 * 60 * 60 * 1000);

  let actions: PunchChoice[] = [];
  if (!staleOpenShift) {
    const lastType = latest?.punch_type as EmployeePunchType | undefined;
    if (!latest || lastType === "check_out") {
      actions = [{ type: "check_in", label: "Check in", description: "Start today's shift" }];
    } else if (lastType === "check_in") {
      actions = [
        { type: "break_start", label: "Start break", description: "Record the start of your break" },
        { type: "check_out", label: "Check out", description: "End your workday" },
      ];
    } else if (lastType === "break_start") {
      actions = [{ type: "break_end", label: "End break", description: "Return from your break" }];
    } else if (lastType === "break_end") {
      actions = [
        { type: "break_start", label: "Start another break", description: "Record another break" },
        { type: "check_out", label: "Check out", description: "End your workday" },
      ];
    }
  }

  const hasCheckedIn = todayPunches.some((punch) => punch.punch_type === "check_in");
  const todayStatus = !hasCheckedIn
    ? "Not checked in"
    : todayPunches.at(-1)?.punch_type === "check_out"
      ? "Present · Checked out"
      : todayPunches.at(-1)?.punch_type === "break_start"
        ? "Present · On break"
        : "Present · On duty";
  const todayCheckIn = todayPunches.find((punch) => punch.punch_type === "check_in")?.punched_at ?? null;
  const todayCheckOut = [...todayPunches].reverse().find((punch) => punch.punch_type === "check_out")?.punched_at ?? null;

  const byDate = new Map<string, typeof allPunches>();
  for (const punch of allPunches) {
    const day = localDateKey(punch.punched_at, timezone);
    if (!byDate.has(day)) byDate.set(day, []);
    byDate.get(day)!.push(punch);
  }
  const recentHistory = [...byDate.entries()]
    .filter(([day]) => day <= today)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 14)
    .map(([day, dayPunches]) => {
      const ordered = [...dayPunches].sort((a,b) => new Date(a.punched_at).getTime() - new Date(b.punched_at).getTime());
      return {
        day,
        checkIn: ordered.find((punch) => punch.punch_type === "check_in")?.punched_at ?? null,
        checkOut: [...ordered].reverse().find((punch) => punch.punch_type === "check_out")?.punched_at ?? null,
        count: ordered.length,
        present: ordered.some((punch) => punch.punch_type === "check_in"),
      };
    });
  const presentDaysThisMonth = new Set([...byDate.entries()].filter(([day, list]) => day.startsWith(today.slice(0, 7)) && list.some((item) => item.punch_type === "check_in")).map(([day]) => day)).size;
  const displayName = employee.full_name || profile.full_name || user.email || "Employee";
  const initials = displayName.split(/\\s+/).map((part) => part[0]).slice(0,2).join("").toUpperCase();
  const todayLabel = new Intl.DateTimeFormat("en-IN", { timeZone: timezone, weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date());

  return (
    <main className="min-h-screen bg-[#f3f7f3] text-slate-800">
      <header className="sticky top-0 z-20 border-b border-emerald-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#067647] font-black text-white">IA</div><div><p className="font-bold text-slate-900">IAMS Employee</p><p className="text-[10px] font-bold uppercase tracking-[.18em] text-emerald-700">Attendance portal</p></div></div>
          <div className="hidden text-right sm:block"><p className="text-sm font-bold">{displayName}</p><p className="text-xs text-slate-500">{employee.employee_code} · {company?.name || "Company"}</p></div>
          <form action="/auth/signout" method="post"><button className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"><LogOut size={15}/> Sign out</button></form>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        <section className="rounded-3xl bg-gradient-to-br from-[#087443] to-[#055a35] p-6 text-white shadow-sm sm:p-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div><p className="text-xs font-bold uppercase tracking-[.22em] text-emerald-100">Your workday</p><h1 className="mt-2 text-3xl font-bold sm:text-4xl">Hello, {displayName.split(" ")[0]}</h1><p className="mt-2 text-sm text-emerald-50">{todayLabel}</p></div>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold"><span className={"h-2.5 w-2.5 rounded-full " + (hasCheckedIn ? "bg-lime-300" : "bg-white/60")}/>{todayStatus}</div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Employee details</p><UserRound className="text-emerald-700" size={20}/></div><p className="mt-3 text-lg font-bold">{displayName}</p><p className="mt-1 text-sm text-slate-500">ID: {employee.employee_code}</p></div>
          <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Department</p><Factory className="text-emerald-700" size={20}/></div><p className="mt-3 text-lg font-bold">{department?.name || "Not assigned"}</p><p className="mt-1 text-sm text-slate-500">{plant?.name || "Plant not assigned"}</p></div>
          <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Today's check in</p><Clock3 className="text-emerald-700" size={20}/></div><p className="mt-3 text-2xl font-bold">{formatTime(todayCheckIn, timezone)}</p><p className="mt-1 text-sm text-slate-500">Check out: {formatTime(todayCheckOut, timezone)}</p></div>
          <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Present days this month</p><CalendarDays className="text-emerald-700" size={20}/></div><p className="mt-3 text-3xl font-bold">{presentDaysThisMonth}</p><p className="mt-1 text-sm text-slate-500">Based on recorded check-ins</p></div>
        </section>

        {staleOpenShift && <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><strong>Previous shift needs review.</strong> The most recent attendance session was not checked out within 18 hours. Please contact your supervisor to correct the record before punching again.</div>}

        <FacePunchCard companyId={profile.company_id} employeeId={employee.id} actions={actions}/>

        <section className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm">
          <div className="flex flex-col justify-between gap-3 border-b border-emerald-50 px-5 py-5 sm:flex-row sm:items-center sm:px-6"><div><h2 className="font-bold text-slate-900">Attendance history</h2><p className="mt-1 text-xs text-slate-500">Your most recent recorded workdays. Days without records are not labelled absent unless a schedule is configured.</p></div><span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800"><CheckCircle2 size={14}/> {recentHistory.filter((item) => item.present).length} recent present days</span></div>
          {recentHistory.length ? <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-semibold">Date</th><th className="px-4 py-3 font-semibold">First check in</th><th className="px-4 py-3 font-semibold">Last check out</th><th className="px-4 py-3 font-semibold">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{recentHistory.map((row) => <tr key={row.day}><td className="px-5 py-3 font-semibold">{formatDate(row.day, timezone)}</td><td className="px-4 py-3">{formatTime(row.checkIn, timezone)}</td><td className="px-4 py-3">{formatTime(row.checkOut, timezone)}</td><td className="px-4 py-3"><span className={"rounded-full px-2.5 py-1 text-xs font-bold " + (row.present ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500")}>{row.present ? "Present" : "No check-in"}</span></td></tr>)}</tbody></table></div> : <div className="px-6 py-12 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Activity size={22}/></div><p className="mt-3 font-bold">No attendance yet</p><p className="mt-1 text-sm text-slate-500">After your first successful check in, this page will show the recorded workday.</p></div>}
        </section>
        <footer className="flex flex-col justify-between gap-2 border-t border-emerald-100 py-4 text-xs text-slate-500 sm:flex-row"><span>Industrial Attendance Management System</span><span className="inline-flex items-center gap-1"><ShieldCheck size={13}/> Private employee view · {timezone}</span></footer>
      </div>
    </main>
  );
}
