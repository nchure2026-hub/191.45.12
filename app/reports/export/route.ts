import { createClient } from "@/lib/supabase/server";

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return '"' + text.replaceAll('"','""') + '"';
}
function validDate(value: string | null) {
  return Boolean(value && /^\\d{4}-\\d{2}-\\d{2}$/.test(value));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!validDate(from) || !validDate(to) || from! > to!) {
    return new Response("Provide a valid date range.",{status:400});
  }
  const startMs = Date.parse(from!+"T00:00:00Z");
  const endMs = Date.parse(to!+"T00:00:00Z");
  if ((endMs-startMs)/86400000 > 30) return new Response("Export is limited to 31 days at a time.",{status:400});

  const supabase = await createClient();
  const {data:{user}} = await supabase.auth.getUser();
  if (!user) return new Response("Authentication required.",{status:401});
  const {data:profile} = await supabase.from("user_profiles").select("company_id,role,active").eq("id",user.id).maybeSingle();
  if (!profile?.active || !profile.company_id || !["super_admin","hr_manager"].includes(profile.role)) {
    return new Response("Forbidden.",{status:403});
  }

  const {data:rows,error} = await supabase.from("daily_attendance_summaries")
    .select("employee_id,work_date,shift_id,first_check_in,last_check_out,worked_minutes,late_minutes,early_departure_minutes,overtime_minutes,status")
    .eq("company_id",profile.company_id).gte("work_date",from!).lte("work_date",to!).order("work_date").limit(20000);
  if (error) return new Response("Attendance report could not be loaded.",{status:500});
  const summaries = rows ?? [];
  const employeeIds = [...new Set(summaries.map(row=>row.employee_id))];
  const shiftIds = [...new Set(summaries.map(row=>row.shift_id).filter((id): id is string => Boolean(id)))];
  const [{data:employees},{data:shifts}] = await Promise.all([
    employeeIds.length ? supabase.from("employees").select("id,employee_code,full_name").eq("company_id",profile.company_id).in("id",employeeIds) : Promise.resolve({data:[]}),
    shiftIds.length ? supabase.from("shifts").select("id,name,code").eq("company_id",profile.company_id).in("id",shiftIds) : Promise.resolve({data:[]}),
  ]);
  const employeeMap = new Map((employees??[]).map(row=>[row.id,row]));
  const shiftMap = new Map((shifts??[]).map(row=>[row.id,row]));
  const headers = ["Work date","Employee code","Employee name","Shift","Status","Check in (UTC)","Check out (UTC)","Worked minutes","Late minutes","Early departure minutes","Overtime minutes"];
  const lines = [headers.map(csvCell).join(",")];
  for (const row of summaries) {
    const employee = employeeMap.get(row.employee_id);
    const shift = row.shift_id ? shiftMap.get(row.shift_id) : null;
    lines.push([
      row.work_date, employee?.employee_code, employee?.full_name, shift?.name ?? shift?.code,
      row.status, row.first_check_in, row.last_check_out, row.worked_minutes,
      row.late_minutes, row.early_departure_minutes, row.overtime_minutes,
    ].map(csvCell).join(","));
  }
  return new Response("\\uFEFF"+lines.join("\\r\\n"),{
    status:200,
    headers:{
      "content-type":"text/csv; charset=utf-8",
      "content-disposition":`attachment; filename="iams-attendance-${from}-to-${to}.csv"`,
      "cache-control":"private, no-store",
      "x-content-type-options":"nosniff",
    },
  });
}
