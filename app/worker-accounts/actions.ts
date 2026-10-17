"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const plantSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().min(2).max(20).transform((value) => value.toUpperCase()).refine((value) => /^[A-Z0-9_-]+$/.test(value)),
});

const workerSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  employee_code: z.string().trim().min(1).max(40).transform((value) => value.toUpperCase()).refine((value) => /^[A-Z0-9_-]+$/.test(value)),
  designation: z.string().trim().max(120).optional(),
  employment_type: z.enum(["permanent", "temporary", "trainee", "contract"]),
  plant_id: z.string().uuid(),
  department_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  work_email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  initial_password: z.string().min(12).max(128),
});

async function getAdminContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("user_profiles")
    .select("company_id,role,active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.active || !profile.company_id || !["super_admin", "hr_manager"].includes(profile.role)) {
    redirect("/dashboard?error=forbidden");
  }
  return { supabase, user, profile };
}

export async function createPlant(formData: FormData) {
  const parsed = plantSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
  });
  if (!parsed.success) redirect("/worker-accounts?error=plant_invalid");

  const { supabase, profile } = await getAdminContext();
  const { error } = await supabase.from("plants").insert({
    company_id: profile.company_id,
    name: parsed.data.name,
    code: parsed.data.code,
    timezone: "Asia/Kolkata",
    active: true,
  });
  if (error) {
    if (error.code === "23505") redirect("/worker-accounts?error=plant_duplicate");
    redirect("/worker-accounts?error=plant_save");
  }
  redirect("/worker-accounts?success=plant");
}

export async function createWorkerAccount(formData: FormData) {
  const parsed = workerSchema.safeParse({
    full_name: formData.get("full_name"),
    employee_code: formData.get("employee_code"),
    designation: formData.get("designation") || "",
    employment_type: formData.get("employment_type"),
    plant_id: formData.get("plant_id"),
    department_id: formData.get("department_id") || "",
    work_email: formData.get("work_email"),
    initial_password: formData.get("initial_password"),
  });
  if (!parsed.success) redirect("/worker-accounts?error=worker_invalid");

  const { supabase, profile } = await getAdminContext();

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    redirect("/worker-accounts?error=service_config");
  }

  const { data: plant } = await supabase.from("plants")
    .select("id")
    .eq("id", parsed.data.plant_id)
    .eq("company_id", profile.company_id)
    .eq("active", true)
    .maybeSingle();
  if (!plant) redirect("/worker-accounts?error=plant_scope");

  const departmentId = parsed.data.department_id || null;
  if (departmentId) {
    const { data: department } = await supabase.from("departments")
      .select("id,plant_id")
      .eq("id", departmentId)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (!department || department.plant_id !== parsed.data.plant_id) redirect("/worker-accounts?error=department_scope");
  }

  const { data: duplicateEmployee } = await supabase.from("employees")
    .select("id")
    .eq("company_id", profile.company_id)
    .eq("employee_code", parsed.data.employee_code)
    .maybeSingle();
  if (duplicateEmployee) redirect("/worker-accounts?error=duplicate_code");

  const { data: authResult, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.work_email,
    password: parsed.data.initial_password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name },
  });
  if (authError || !authResult.user) {
    const message = authError?.message.toLowerCase() ?? "";
    if (message.includes("already") || message.includes("registered")) redirect("/worker-accounts?error=email_exists");
    if (message.includes("password")) redirect("/worker-accounts?error=password_policy");
    redirect("/worker-accounts?error=auth_create");
  }

  const { data: employee, error: employeeError } = await admin.from("employees")
    .insert({
      company_id: profile.company_id,
      plant_id: parsed.data.plant_id,
      department_id: departmentId,
      employee_code: parsed.data.employee_code,
      full_name: parsed.data.full_name,
      designation: parsed.data.designation || null,
      employment_type: parsed.data.employment_type,
      employment_status: "active",
      joining_date: new Date().toISOString().slice(0, 10),
      work_email: parsed.data.work_email,
    })
    .select("id")
    .single();

  if (employeeError || !employee) {
    await admin.auth.admin.deleteUser(authResult.user.id);
    if (employeeError?.code === "23505") redirect("/worker-accounts?error=duplicate_code");
    redirect("/worker-accounts?error=employee_create");
  }

  const { error: profileError } = await admin.from("user_profiles").insert({
    id: authResult.user.id,
    company_id: profile.company_id,
    full_name: parsed.data.full_name,
    role: "employee",
    employee_id: employee.id,
    active: true,
  });

  if (profileError) {
    await admin.from("employees").update({ employment_status: "inactive" }).eq("id", employee.id).eq("company_id", profile.company_id);
    await admin.auth.admin.deleteUser(authResult.user.id);
    redirect("/worker-accounts?error=profile_create");
  }

  redirect("/worker-accounts?success=worker");
}

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
  if (error) {
    return { ok: false, message: error.message || "Attendance could not be saved. Please try again." };
  }
  return { ok: true, message: "Attendance recorded successfully." };
}


export async function deactivateWorker(formData: FormData) {
  const parsed = z.object({ employee_id: z.string().uuid() }).safeParse({
    employee_id: formData.get("employee_id"),
  });
  if (!parsed.success) redirect("/worker-accounts?error=worker_invalid");

  const { profile } = await getAdminContext();

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    redirect("/worker-accounts?error=service_config");
  }

  const { data: employee, error: employeeReadError } = await admin.from("employees")
    .select("id,full_name,employment_status")
    .eq("id", parsed.data.employee_id)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (employeeReadError || !employee) redirect("/worker-accounts?error=worker_not_found");
  if (employee.employment_status !== "active") redirect("/worker-accounts?error=worker_already_inactive");

  const { data: linkedProfiles, error: profileReadError } = await admin.from("user_profiles")
    .select("id")
    .eq("company_id", profile.company_id)
    .eq("employee_id", employee.id)
    .eq("role", "employee");

  if (profileReadError) redirect("/worker-accounts?error=worker_profile_read");

  // Soft-delete: preserve attendance/leave/roster/audit history, but remove the
  // employee from active operations and disable every linked IAMS employee profile.
  const { data: updatedEmployee, error: employeeUpdateError } = await admin.from("employees")
    .update({ employment_status: "inactive" })
    .eq("id", employee.id)
    .eq("company_id", profile.company_id)
    .eq("employment_status", "active")
    .select("id")
    .maybeSingle();

  if (employeeUpdateError || !updatedEmployee) {
    redirect(employeeUpdateError?.code === "42501" ? "/worker-accounts?error=forbidden" : "/worker-accounts?error=worker_deactivate");
  }

  if (linkedProfiles?.length) {
    const { error: profileUpdateError } = await admin.from("user_profiles")
      .update({ active: false })
      .eq("company_id", profile.company_id)
      .eq("employee_id", employee.id)
      .eq("role", "employee");

    if (profileUpdateError) {
      // Best-effort rollback so employee status and portal access remain consistent.
      await admin.from("employees")
        .update({ employment_status: "active" })
        .eq("id", employee.id)
        .eq("company_id", profile.company_id);
      redirect("/worker-accounts?error=worker_access_disable");
    }
  }

  redirect("/worker-accounts?success=worker_deleted");
}
