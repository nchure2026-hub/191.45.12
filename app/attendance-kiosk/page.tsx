import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, QrCode, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import BadgeScanner from "./BadgeScanner";

type Props = { searchParams: Promise<{error?:string;success?:string;employee?:string}> };
const errors:Record<string,string> = {
  invalid:"Enter a valid date, check-in/out time and a reason of at least 10 characters.",
  employee_mismatch:"Employee ID and QR data did not match an active employee in this company.",
  future_date:"Attendance corrections cannot be requested for a future work date.",
  too_old:"The fallback request window is limited to the previous 31 days.",
  date_mismatch:"Check-in must match the selected work date; check-out may be on the same or next day.",
  time_range:"Check-out must be after check-in, within 18 hours, and not in the future.",
  save_failed:"The correction request could not be saved. Check plant access and try again.",
};
function localDate(timezone:string) {
  return new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
}
export default async function AttendanceKioskPage({searchParams}:Props) {
  const params=await searchParams;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const {data:profile}=await supabase.from("user_profiles").select("company_id,role,active").eq("id",user.id).maybeSingle();
  const roles=["super_admin","hr_manager","plant_manager","department_supervisor"];
  if(!profile?.active||!profile.company_id||!roles.includes(profile.role)) redirect("/dashboard?error=forbidden");
  const [{data:company},{data:plants},{data:employees}]=await Promise.all([
    supabase.from("companies").select("name,timezone").eq("id",profile.company_id).maybeSingle(),
    supabase.from("plants").select("id,name,timezone").eq("company_id",profile.company_id).eq("active",true),
    supabase.from("employees").select("id,employee_code,full_name,plant_id").eq("company_id",profile.company_id).eq("employment_status","active").order("full_name").limit(2000),
  ]);
  const plantMap=new Map((plants??[]).map(p=>[p.id,p]));
  const employeeRows=(employees??[]).map(e=>({
    id:e.id,employee_code:e.employee_code,full_name:e.full_name,plant_id:e.plant_id,
    plant_name:plantMap.get(e.plant_id)?.name??null,
    timezone:plantMap.get(e.plant_id)?.timezone||company?.timezone||"Asia/Kolkata",
  }));
  const today=localDate(company?.timezone||"Asia/Kolkata");
  return <main className="min-h-screen bg-[#edf1f5] text-slate-900">
    <header className="bg-[#151b22] text-white"><div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:px-7"><div className="flex items-center gap-3"><span className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-amber-300"><QrCode size={22}/></span><div><p className="font-bold">IAMS <span className="font-normal text-slate-400">/ ATTENDANCE KIOSK</span></p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.2em] text-amber-300">QR / employee ID backup</p></div></div><Link href="/dashboard" className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-white/5"><ArrowLeft size={15}/> Dashboard</Link></div></header>
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-7 sm:px-7">
      <section className="rounded-3xl bg-gradient-to-br from-[#263648] to-[#121820] p-6 text-white shadow-lg sm:p-8"><p className="text-xs font-bold uppercase tracking-[.22em] text-amber-300">Authorized staff only</p><h1 className="mt-3 text-3xl font-bold">Camera-unavailable attendance fallback</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Scan the employee's printed QR badge or enter their Employee ID. Enter the proposed check-in/out times and reason; this creates a pending correction request for review, never an automatic punch.</p><div className="mt-4 flex items-center gap-2 text-xs text-slate-300"><ShieldCheck size={15}/> Company: {company?.name||"Company workspace"} · {profile.role.replaceAll("_"," ")}</div></section>
      {params.error&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{errors[params.error]??"The fallback request failed."}</div>}
      {params.success==="requested"&&<div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 size={18} className="mt-0.5"/><div><p className="font-bold">Correction request submitted for review.</p><p className="mt-1 text-xs">Employee {params.employee||"ID"} · HR/authorized staff must approve it before it affects attendance.</p></div></div>}
      {!employeeRows.length?<div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No active employees are available in your access scope. Ask HR to check the plant/department assignments.</div>:<BadgeScanner companyId={profile.company_id} employees={employeeRows} today={today}/>}
      <p className="text-xs leading-5 text-slate-500">Security: QR data is only an identifier, not a secret or authentication factor. The server checks the signed-in staff role, company, employee code, active employee status, time range and Supabase RLS. A request stays pending for HR review.</p>
    </div>
  </main>;
}
