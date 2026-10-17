"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const departmentSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().min(2).max(20).transform((value) => value.toUpperCase()).refine((value) => /^[A-Z0-9_-]+$/.test(value)),
  plant_id: z.string().uuid(),
});

const teamSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  job_title: z.string().trim().min(2).max(100),
  work_email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  initial_password: z.string().min(12).max(128),
  role: z.enum(["hr_manager", "plant_manager", "department_supervisor"]),
  plant_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  department_id: z.union([z.string().uuid(), z.literal("")]).optional(),
});

async function getSuperAdminContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("user_profiles")
    .select("company_id,role,active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.active || !profile.company_id || profile.role !== "super_admin") {
    redirect("/dashboard?error=forbidden");
  }
  return { supabase, profile };
}

export async function createDepartment(formData: FormData) {
  const parsed = departmentSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    plant_id: formData.get("plant_id"),
  });
  if (!parsed.success) redirect("/team-accounts?error=department_invalid");
  const { supabase, profile } = await getSuperAdminContext();
  const { data: plant } = await supabase.from("plants").select("id")
    .eq("id", parsed.data.plant_id)
    .eq("company_id", profile.company_id)
    .eq("active", true)
    .maybeSingle();
  if (!plant) redirect("/team-accounts?error=plant_scope");
  const { error } = await supabase.from("departments").insert({
    company_id: profile.company_id,
    plant_id: parsed.data.plant_id,
    name: parsed.data.name,
    code: parsed.data.code,
    active: true,
  });
  if (error) {
    if (error.code === "23505") redirect("/team-accounts?error=department_duplicate");
    redirect("/team-accounts?error=department_save");
  }
  redirect("/team-accounts?success=department");
}

export async function createTeamAccount(formData: FormData) {
  const parsed = teamSchema.safeParse({
    full_name: formData.get("full_name"),
    job_title: formData.get("job_title"),
    work_email: formData.get("work_email"),
    initial_password: formData.get("initial_password"),
    role: formData.get("role"),
    plant_id: formData.get("plant_id") || "",
    department_id: formData.get("department_id") || "",
  });
  if (!parsed.success) redirect("/team-accounts?error=invalid");

  const { supabase, profile } = await getSuperAdminContext();
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    redirect("/team-accounts?error=service_config");
  }

  const plantId = parsed.data.plant_id || null;
  const departmentId = parsed.data.department_id || null;
  if (parsed.data.role === "plant_manager" && !plantId) redirect("/team-accounts?error=plant_required");
  if (parsed.data.role === "department_supervisor" && !departmentId) redirect("/team-accounts?error=department_required");

  if (plantId) {
    const { data: plant } = await supabase.from("plants")
      .select("id")
      .eq("id", plantId)
      .eq("company_id", profile.company_id)
      .eq("active", true)
      .maybeSingle();
    if (!plant) redirect("/team-accounts?error=plant_scope");
  }

  if (departmentId) {
    const { data: department } = await supabase.from("departments")
      .select("id,plant_id")
      .eq("id", departmentId)
      .eq("company_id", profile.company_id)
      .eq("active", true)
      .maybeSingle();
    if (!department) redirect("/team-accounts?error=department_scope");
    if (plantId && department.plant_id !== plantId) redirect("/team-accounts?error=department_scope");
  }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.work_email,
    password: parsed.data.initial_password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name, job_title: parsed.data.job_title },
  });
  if (authError || !authData.user) {
    const message = authError?.message.toLowerCase() ?? "";
    if (message.includes("already") || message.includes("registered")) redirect("/team-accounts?error=email_exists");
    if (message.includes("password")) redirect("/team-accounts?error=password_policy");
    redirect("/team-accounts?error=auth_create");
  }

  const newUserId = authData.user.id;
  const { error: profileError } = await admin.from("user_profiles").insert({
    id: newUserId,
    company_id: profile.company_id,
    full_name: parsed.data.full_name,
    job_title: parsed.data.job_title,
    role: parsed.data.role,
    employee_id: null,
    active: true,
  });

  if (profileError) redirect("/team-accounts?error=profile_link");

  if (parsed.data.role === "plant_manager" && plantId) {
    const { error } = await admin.from("user_plant_assignments").insert({
      company_id: profile.company_id,
      user_id: newUserId,
      plant_id: plantId,
    });
    if (error) redirect("/team-accounts?error=assignment_create");
  } else if (parsed.data.role === "department_supervisor" && departmentId) {
    const { error } = await admin.from("user_department_assignments").insert({
      company_id: profile.company_id,
      user_id: newUserId,
      department_id: departmentId,
    });
    if (error) redirect("/team-accounts?error=assignment_create");
  }

  redirect("/team-accounts?success=created");
}
