import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowLeft, CalendarClock, Clock3, Factory } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createShift, deactivateShift } from "./actions";

type Props = { searchParams: Promise<{ error?: string; success?: string }> };
const errors: Record<string, string> = {
  invalid: "Check the shift fields and try again.",
  duration: "Start and end times must differ, and break duration must leave a positive scheduled work duration.",
  scope: "You do not have access to that plant.",
  duplicate: "That shift code already exists in this company.",
  forbidden: "Your role does not permit this action.",
  save: "The shift could not be saved. Check database permissions and required fields.",
};
const successes: Record<string, string> = { created: "Shift created. Its overnight flag and scheduled duration were calculated from the configured times.", deactivated: "Shift deactivated. Historical assignments remain preserved." };
function timeLabel(value: string) { return value.slice(0, 5); }
function duration(minutes: number) { return `${Math.floor(minutes / 60)}h ${minutes % 60}m`; }

export default async function ShiftsPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("user_profiles").select("company_id,role,active").eq("id", user.id).maybeSingle();
  if (!profile?.active || !profile.company_id) redirect("/login?error=profile");
  const canManage = ["super_admin", "hr_manager", "plant_manager"].includes(profile.role);
  const [{ data: shifts, error }, { data: plants }] = await Promise.all([
    supabase.from("shifts").select("id,name,code,plant_id,start_time,end_time,break_minutes,grace_minutes,scheduled_minutes,overnight,overtime_after_minutes,active").eq("company_id", profile.company_id).order("name"),
    supabase.from("plants").select("id,name,code").eq("company_id", profile.company_id).eq("active", true).order("name"),
  ]);
  const plantMap = new Map((plants || []).map((plant) => [plant.id, plant]));
  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-8"><Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-700"><ArrowLeft size={16}/> Dashboard</Link><div className="flex items-center gap-2 text-sm font-semibold"><CalendarClock size={18} className="text-blue-600"/> Shift management</div><form action="/auth/signout" method="post"><button className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">Sign out</button></form></header>
    <div className="mx-auto max-w-7xl p-4 sm:p-8">
      <div><p className="text-xs font-bold uppercase tracking-[.16em] text-blue-700">Shift planning</p><h1 className="mt-2 text-3xl font-bold tracking-tight">Shift templates</h1><p className="mt-2 text-sm text-slate-500">Configure shift times, break deductions, grace periods and overtime thresholds. Overnight shifts are detected automatically.</p></div>
      {params.error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errors[params.error] || "The requested operation failed."}</p>}
      {params.success && <p role="status" className="mt-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{successes[params.success] || "Completed."}</p>}
      {canManage && <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center gap-3"><span className="rounded-xl bg-blue-50 p-3 text-blue-700"><Clock3 size={19}/></span><div><h2 className="font-bold">Create shift template</h2><p className="mt-1 text-xs text-slate-500">Use local plant time. For an overnight shift, end time must be earlier than start time.</p></div></div>
        {!plants?.length && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No active plant is available in your access scope.</p>}
        <form action={createShift} className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div><label htmlFor="name" className="mb-1.5 block text-xs font-semibold text-slate-600">Shift name *</label><input id="name" name="name" required maxLength={100} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="Night Shift"/></div>
          <div><label htmlFor="code" className="mb-1.5 block text-xs font-semibold text-slate-600">Shift code *</label><input id="code" name="code" required maxLength={30} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" placeholder="NIGHT-A"/></div>
          <div><label htmlFor="plant_id" className="mb-1.5 block text-xs font-semibold text-slate-600">Plant *</label><select id="plant_id" name="plant_id" required disabled={!plants?.length} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">Select plant</option>{(plants || []).map((plant) => <option key={plant.id} value={plant.id}>{plant.name} · {plant.code}</option>)}</select></div>
          <div><label htmlFor="break_minutes" className="mb-1.5 block text-xs font-semibold text-slate-600">Unpaid break (minutes) *</label><input id="break_minutes" name="break_minutes" type="number" min="0" max="600" defaultValue="30" required className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"/></div>
          <div><label htmlFor="start_time" className="mb-1.5 block text-xs font-semibold text-slate-600">Start time *</label><input id="start_time" name="start_time" type="time" required defaultValue="08:00" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"/></div>
          <div><label htmlFor="end_time" className="mb-1.5 block text-xs font-semibold text-slate-600">End time *</label><input id="end_time" name="end_time" type="time" required defaultValue="17:00" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"/></div>
          <div><label htmlFor="grace_minutes" className="mb-1.5 block text-xs font-semibold text-slate-600">Grace period (minutes) *</label><input id="grace_minutes" name="grace_minutes" type="number" min="0" max="240" defaultValue="5" required className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"/></div>
          <div><label htmlFor="overtime_after_minutes" className="mb-1.5 block text-xs font-semibold text-slate-600">OT threshold (work minutes)</label><input id="overtime_after_minutes" name="overtime_after_minutes" type="number" min="0" max="1440" placeholder="Scheduled duration" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"/><p className="mt-1 text-[10px] text-slate-400">Blank uses calculated scheduled duration.</p></div>
          <div className="flex items-end xl:col-span-3"><button disabled={!plants?.length} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Save shift template</button></div>
        </form>
      </section>}
      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold">Configured shifts</h2><p className="mt-1 text-xs text-slate-500">Live records from Supabase</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{shifts?.length || 0} templates</span></div>
        {error ? <p className="p-5 text-sm text-red-700">Could not load shifts. Verify RLS and database access.</p> : shifts?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Shift</th><th className="px-4 py-3">Plant</th><th className="px-4 py-3">Scheduled time</th><th className="px-4 py-3">Break / grace</th><th className="px-4 py-3">Status</th>{canManage && <th className="px-4 py-3">Action</th>}</tr></thead><tbody className="divide-y divide-slate-100">{shifts.map((shift) => <tr key={shift.id}><td className="px-5 py-4"><p className="font-semibold">{shift.name}</p><p className="mt-1 text-xs text-slate-500">{shift.code}{shift.overnight ? " · Overnight" : ""}</p></td><td className="px-4 py-4">{plantMap.get(shift.plant_id || "")?.name || "All / unassigned"}</td><td className="px-4 py-4"><p>{timeLabel(shift.start_time)}–{timeLabel(shift.end_time)}</p><p className="mt-1 text-xs text-slate-500">{duration(shift.scheduled_minutes)} scheduled</p></td><td className="px-4 py-4"><p>{shift.break_minutes}m break</p><p className="mt-1 text-xs text-slate-500">{shift.grace_minutes}m grace · OT after {duration(shift.overtime_after_minutes)}</p></td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${shift.active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>{shift.active ? "Active" : "Inactive"}</span></td>{canManage && <td className="px-4 py-4">{shift.active ? <form action={deactivateShift}><input type="hidden" name="shift_id" value={shift.id}/><button className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50">Deactivate</button></form> : <span className="text-xs text-slate-400">—</span>}</td>}</tr>)}</tbody></table></div> : <div className="p-12 text-center"><Factory className="mx-auto text-slate-400" size={28}/><p className="mt-3 font-semibold">No shifts configured</p><p className="mt-1 text-sm text-slate-500">Create a shift template to begin planning employee schedules.</p></div>}
      </section>
      <p className="mt-5 text-xs text-slate-500">Shift assignment calendars, effective-dated rotations and split shifts are planned next. Changes to a shift template do not automatically rewrite past attendance summaries.</p>
    </div>
  </main>;
}
