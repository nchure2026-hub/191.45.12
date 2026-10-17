"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { calculateAttendance, type PunchType } from "@/lib/attendance/calculation";
import { buildShiftWindow } from "@/lib/attendance/shift-window";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function calculateDailySummaries(formData: FormData) {
  const parsed = dateSchema.safeParse(formData.get("work_date"));
  if (!parsed.success) redirect("/reports?error=invalid_date");
  const workDate = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("user_profiles")
    .select("company_id,role,active").eq("id",user.id).maybeSingle();
  if (!profile?.active || !profile.company_id || !["super_admin","hr_manager"].includes(profile.role)) {
    redirect("/dashboard?error=forbidden");
  }

  const [{data: company}, {data: employees, error: employeeError}, {data: assignments, error: assignmentError},
    {data: shifts, error: shiftError}, {data: plants}, {data: holidays, error: holidayError}, {data: leaves, error: leaveError}] = await Promise.all([
    supabase.from("companies").select("timezone").eq("id",profile.company_id).maybeSingle(),
    supabase.from("employees").select("id,plant_id,weekly_off_days").eq("company_id",profile.company_id).eq("employment_status","active").order("id").limit(2000),
    supabase.from("shift_assignments").select("employee_id,shift_id,effective_from,effective_to").eq("company_id",profile.company_id).lte("effective_from",workDate).or("effective_to.is.null,effective_to.gte."+workDate).limit(5000),
    supabase.from("shifts").select("id,plant_id,start_time,end_time,overnight,break_minutes,grace_minutes,scheduled_minutes,overtime_after_minutes,active").eq("company_id",profile.company_id).eq("active",true).limit(1000),
    supabase.from("plants").select("id,timezone").eq("company_id",profile.company_id).eq("active",true).limit(500),
    supabase.from("holidays").select("plant_id,holiday_date").eq("company_id",profile.company_id).eq("holiday_date",workDate),
    supabase.from("leave_requests").select("employee_id,partial_day").eq("company_id",profile.company_id).eq("status","approved").lte("start_date",workDate).gte("end_date",workDate).limit(5000),
  ]);
  if (employeeError || assignmentError || shiftError || holidayError || leaveError) redirect("/reports?error=read_failed");

  const employeeRows = employees ?? [];
  const assignmentRows = assignments ?? [];
  const shiftMap = new Map((shifts ?? []).map(shift => [shift.id,shift]));
  const plantTimezone = new Map((plants ?? []).map(plant => [plant.id,plant.timezone || company?.timezone || "Asia/Kolkata"]));
  const activeEmployeeMap = new Map(employeeRows.map(employee => [employee.id,employee]));
  const assignmentsByEmployee = new Map<string, typeof assignmentRows>();
  for (const assignment of assignmentRows) {
    if (!activeEmployeeMap.has(assignment.employee_id)) continue;
    const current = assignmentsByEmployee.get(assignment.employee_id) ?? [];
    current.push(assignment);
    assignmentsByEmployee.set(assignment.employee_id,current);
  }

  const dateParts = workDate.split("-").map(Number);
  const anchor = Date.UTC(dateParts[0],dateParts[1]-1,dateParts[2]);
  const broadStart = new Date(anchor - 24*60*60*1000).toISOString();
  const broadEnd = new Date(anchor + 48*60*60*1000).toISOString();
  const employeeIds = employeeRows.map(employee => employee.id);
  const punchesByEmployee = new Map<string,{type:PunchType;at:string}[]>();
  if (employeeIds.length) {
    for (let i=0;i<employeeIds.length;i+=300) {
      const ids = employeeIds.slice(i,i+300);
      const {data:punches,error:punchError} = await supabase.from("attendance_punches")
        .select("employee_id,punch_type,punched_at").eq("company_id",profile.company_id)
        .in("employee_id",ids).gte("punched_at",broadStart).lt("punched_at",broadEnd).order("punched_at").limit(10000);
      if (punchError) redirect("/reports?error=punch_read");
      for (const punch of punches ?? []) {
        if (!["check_in","check_out","break_start","break_end"].includes(punch.punch_type)) continue;
        const list = punchesByEmployee.get(punch.employee_id) ?? [];
        list.push({type:punch.punch_type as PunchType,at:punch.punched_at});
        punchesByEmployee.set(punch.employee_id,list);
      }
    }
  }

  const holidayRows = holidays ?? [];
  const fullDayLeaveEmployeeIds = new Set((leaves ?? []).filter(leave => !leave.partial_day).map(leave => leave.employee_id));
  const partialDayLeaveEmployeeIds = new Set((leaves ?? []).filter(leave => leave.partial_day).map(leave => leave.employee_id));
  const summaries = [];
  let conflicts = 0;
  let unassigned = 0;
  for (const employee of employeeRows) {
    const matches = assignmentsByEmployee.get(employee.id) ?? [];
    if (!matches.length) { unassigned++; continue; }
    if (matches.length > 1) { conflicts++; continue; }
    const assignment = matches[0];
    const shift = shiftMap.get(assignment.shift_id);
    if (!shift) { conflicts++; continue; }
    const timezone = plantTimezone.get(employee.plant_id) || company?.timezone || "Asia/Kolkata";
    let window: ReturnType<typeof buildShiftWindow>;
    try {
      window = buildShiftWindow(workDate,shift.start_time,shift.end_time,shift.overnight,timezone);
    } catch {
      conflicts++;
      continue;
    }
    const windowStart = window.start.getTime() - 3*60*60*1000;
    const windowEnd = window.end.getTime() + 6*60*60*1000;
    const employeePunches = (punchesByEmployee.get(employee.id) ?? [])
      .filter(punch => new Date(punch.at).getTime() >= windowStart && new Date(punch.at).getTime() <= windowEnd);
    const isHoliday = holidayRows.some(holiday => holiday.plant_id === null || holiday.plant_id === employee.plant_id);
    const onFullDayLeave = fullDayLeaveEmployeeIds.has(employee.id);
    const onPartialDayLeave = partialDayLeaveEmployeeIds.has(employee.id);
    const onLeave = onFullDayLeave || onPartialDayLeave;
    const isWeeklyOff = (employee.weekly_off_days ?? []).includes(new Date(workDate+"T12:00:00Z").getUTCDay());

    let status: string;
    let firstCheckIn: string | null = null;
    let lastCheckOut: string | null = null;
    let workedMinutes = 0, lateMinutes = 0, earlyDepartureMinutes = 0, overtimeMinutes = 0;
    if (employeePunches.length === 0 && isHoliday) status = "holiday";
    else if (employeePunches.length === 0 && onFullDayLeave) status = "on_leave";
    else if (employeePunches.length === 0 && onPartialDayLeave) status = "incomplete";
    else if (employeePunches.length === 0 && isWeeklyOff) status = "weekly_off";
    else {
      const result = calculateAttendance(employeePunches,{
        shiftStart:window.start, shiftEnd:window.end, graceMinutes:shift.grace_minutes,
        scheduledMinutes:shift.scheduled_minutes, unpaidBreakMinutes:shift.break_minutes,
        overtimeAfterMinutes:shift.overtime_after_minutes,
      });
      firstCheckIn = result.firstCheckIn?.toISOString() ?? null;
      lastCheckOut = result.lastCheckOut?.toISOString() ?? null;
      workedMinutes = result.workedMinutes;
      lateMinutes = result.lateMinutes;
      earlyDepartureMinutes = result.earlyDepartureMinutes;
      overtimeMinutes = result.overtimeMinutes;
      if ((isHoliday || onLeave || isWeeklyOff) && employeePunches.length) status = "incomplete";
      else if (result.status === "exception") status = "incomplete";
      else if (result.status === "overtime") status = "present";
      else status = result.status;
    }
    summaries.push({
      company_id:profile.company_id, employee_id:employee.id, work_date:workDate, shift_id:shift.id,
      first_check_in:firstCheckIn, last_check_out:lastCheckOut, worked_minutes:workedMinutes,
      late_minutes:lateMinutes, early_departure_minutes:earlyDepartureMinutes, overtime_minutes:overtimeMinutes,
      status, calculation_version:1, calculated_at:new Date().toISOString(),
    });
  }

  if (summaries.length) {
    const {error:saveError} = await supabase.from("daily_attendance_summaries").upsert(summaries,{onConflict:"company_id,employee_id,work_date"});
    if (saveError) redirect("/reports?error=summary_save");
  }
  redirect("/reports?date="+workDate+"&success=calculated&processed="+summaries.length+"&conflicts="+conflicts+"&unassigned="+unassigned);
}
