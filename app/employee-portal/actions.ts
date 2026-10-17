"use server";

import { createClient } from "@/lib/supabase/server";

export async function recordEmployeePunch(
  punchType: "check_in" | "break_start" | "break_end" | "check_out",
  faceCapturePath: string,
  consent: boolean,
) {
  const allowedTypes = ["check_in", "break_start", "break_end", "check_out"];
  if (!allowedTypes.includes(punchType) || !consent || typeof faceCapturePath !== "string" || faceCapturePath.length > 300) {
    return { ok: false, message: "Please take a face photo and accept the attendance photo notice first." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Your session expired. Sign in again." };

  const { data: profile } = await supabase.from("user_profiles")
    .select("company_id, employee_id, role, active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.active || profile.role !== "employee" || !profile.employee_id || !profile.company_id) {
    return { ok: false, message: "This login is not linked to an active employee account." };
  }
  if (!faceCapturePath.startsWith(profile.company_id + "/" + profile.employee_id + "/")) {
    return { ok: false, message: "The face photo path does not match your employee account. Please capture again." };
  }

  const { error } = await supabase.rpc("record_employee_punch", {
    p_punch_type: punchType,
    p_face_capture_path: faceCapturePath,
    p_face_capture_consent: consent,
  });
  if (error) return { ok: false, message: error.message || "Attendance could not be saved. Please try again." };

  return { ok: true, message: "Attendance recorded successfully." };
}
