"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const employeeSchema = z.object({
  employee_code: z.string().trim().min(1).max(40).transform((value) => value.toUpperCase()),
  full_name: z.string().trim().min(2).max(120),
  designation: z.string().trim().max(120).optional(),
  employment_type: z.enum(["permanent", "temporary", "trainee", "contract"]),
  joining_date: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).optional(),
  plant_id: z.string().uuid(),
  department_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  work_email: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
  phone: z.string().trim().max(30).optional(),
});

async function getAuthorizedContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("user_profiles").select("company_id,role,active").eq("id", user.id).maybeSingle();
  if (!profile?.active || !profile.company_id) redirect("/login?error=profile");
  if (!["super_admin", "hr_manager", "plant_manager"].includes(profile.role)) redirect("/employees?error=forbidden");
  return { supabase, user, profile };
}

export async function createEmployee(formData: FormData) {
  const parsed = employeeSchema.safeParse({
    employee_code: formData.get("employee_code"),
    full_name: formData.get("full_name"),
    designation: formData.get("designation") || "",
    employment_type: formData.get("employment_type"),
    joining_date: formData.get("joining_date") || "",
    plant_id: formData.get("plant_id"),
    department_id: formData.get("department_id") || "",
    work_email: formData.get("work_email") || "",
    phone: formData.get("phone") || "",
  });
  if (!parsed.success) redirect("/employees?error=invalid");

  const { supabase, user, profile } = await getAuthorizedContext();
  const { data: plant } = await supabase.from("plants").select("id").eq("id", parsed.data.plant_id).eq("company_id", profile.company_id).maybeSingle();
  if (!plant) redirect("/employees?error=scope");

  const departmentId = parsed.data.department_id || null;
  if (departmentId) {
    const { data: department } = await supabase.from("departments").select("id,plant_id").eq("id", departmentId).eq("company_id", profile.company_id).maybeSingle();
    if (!department || department.plant_id !== parsed.data.plant_id) redirect("/employees?error=department");
  }

  const { error } = await supabase.from("employees").insert({
    company_id: profile.company_id,
    employee_code: parsed.data.employee_code,
    full_name: parsed.data.full_name,
    designation: parsed.data.designation || null,
    employment_type: parsed.data.employment_type,
    employment_status: "active",
    joining_date: parsed.data.joining_date || null,
    plant_id: parsed.data.plant_id,
    department_id: departmentId,
    work_email: parsed.data.work_email || null,
    phone: parsed.data.phone || null,
  });
  if (error) {
    if (error.code === "23505") redirect("/employees?error=duplicate");
    if (error.code === "42501") redirect("/employees?error=forbidden");
    redirect("/employees?error=save");
  }

  // Record the action through the protected audit path in a later workflow phase.
  void user;
  redirect("/employees?success=created");
}

export async function deactivateEmployee(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get("employee_id"));
  if (!id.success) redirect("/employees?error=invalid");

  const { supabase, profile } = await getAuthorizedContext();
  const { data, error } = await supabase.from("employees")
    .update({ employment_status: "inactive" })
    .eq("id", id.data)
    .eq("company_id", profile.company_id)
    .select("id");

  if (error) redirect(error.code === "42501" ? "/employees?error=forbidden" : "/employees?error=save");
  if (!data?.length) redirect("/employees?error=notfound");
  redirect("/employees?success=deactivated");
}
