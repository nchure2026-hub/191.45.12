"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { zonedLocalTimeToUtc } from "@/lib/attendance/shift-window";

const dateSchema = z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/);
const localDateTimeSchema = z.string().regex(/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/);

export async function submitAttendanceCorrection(formData: FormData) {
  const parsed = z.object({
    employee_id: z.string().uuid(),
    employee_code: z.string().trim().min(1).max(40).transform(v=>v.toUpperCase()),
    work_date: dateSchema,
    proposed_check_in: localDateTimeSchema,
    proposed_check_out: localDateTimeSchema,
    reason: z.string().trim().min(10).max(500),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/attendance-kiosk?error=invalid");

  const supabase = await createClient();
  const {data:{user}} = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const {data:profile} = await supabase.from("user_profiles").select("company_id,role,active").eq("id",user.id).maybeSingle();
  const allowedRoles = ["super_admin","hr_manager","plant_manager","department_supervisor"];
  if (!profile?.active || !profile.company_id || !allowedRoles.includes(profile.role)) redirect("/dashboard?error=forbidden");

  const {data:employee} = await supabase.from("employees")
    .select("id,company_id,employee_code,full_name,plant_id,employment_status")
    .eq("id",parsed.data.employee_id).eq("company_id",profile.company_id).maybeSingle();
  if (!employee || employee.employment_status !== "active" || employee.employee_code !== parsed.data.employee_code) {
    redirect("/attendance-kiosk?error=employee_mismatch");
  }

  const [{data:company},{data:plant}] = await Promise.all([
    supabase.from("companies").select("timezone").eq("id",profile.company_id).maybeSingle(),
    employee.plant_id ? supabase.from("plants").select("timezone").eq("id",employee.plant_id).eq("company_id",profile.company_id).maybeSingle() : Promise.resolve({data:null}),
  ]);
  const timezone = plant?.timezone || company?.timezone || "Asia/Kolkata";
  const workDate = parsed.data.work_date;
  const today = new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  if (workDate > today) redirect("/attendance-kiosk?error=future_date");
  const [y,m,d] = workDate.split("-").map(Number);
  const [ty,tm,td] = today.split("-").map(Number);
  const ageDays = (Date.UTC(ty,tm-1,td)-Date.UTC(y,m-1,d))/86400000;
  if (ageDays > 31) redirect("/attendance-kiosk?error=too_old");

  const checkInParts = parsed.data.proposed_check_in.split("T");
  const checkOutParts = parsed.data.proposed_check_out.split("T");
  if (checkInParts[0] !== workDate || (checkOutParts[0] !== workDate && checkOutParts[0] !== (() => {
    const next = new Date(Date.UTC(y,m-1,d+1));
    return next.getUTCFullYear()+"-"+String(next.getUTCMonth()+1).padStart(2,"0")+"-"+String(next.getUTCDate()).padStart(2,"0");
  })())) redirect("/attendance-kiosk?error=date_mismatch");

  let checkIn: Date, checkOut: Date;
  try {
    checkIn = zonedLocalTimeToUtc(checkInParts[0],checkInParts[1],timezone);
    checkOut = zonedLocalTimeToUtc(checkOutParts[0],checkOutParts[1],timezone);
  } catch {
    redirect("/attendance-kiosk?error=invalid");
  }
  if (checkOut <= checkIn || checkOut.getTime()-checkIn.getTime() > 18*60*60*1000 || checkOut.getTime() > Date.now()) {
    redirect("/attendance-kiosk?error=time_range");
  }

  const {error} = await supabase.from("attendance_correction_requests").insert({
    company_id:profile.company_id,
    employee_id:employee.id,
    work_date:workDate,
    proposed_check_in:checkIn.toISOString(),
    proposed_check_out:checkOut.toISOString(),
    reason:"QR / employee ID fallback: "+parsed.data.reason,
    status:"pending",
    reviewed_by:null,
    reviewed_at:null,
  });
  if (error) redirect("/attendance-kiosk?error=save_failed");
  redirect("/attendance-kiosk?success=requested&employee="+encodeURIComponent(employee.employee_code));
}
