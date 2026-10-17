"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const teamSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  job_title: z.string().trim().min(2).max(120),
  work_email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  role: z.enum(["hr_manager", "plant_manager", "department_supervisor"]),
  plant_id: z.union([z.string().uuid(), z.literal("")]).optional(),
  department_id: z.union([z.string().uuid(), z.literal("")]).optional(),
});

async function getTeamAdminContext() {
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

export async function createTeamAccount(formData: FormData) {
  const parsed = teamSchema.safeParse({
    full_name: formData.get("full_name"),
    job_title: formData.get("job_title"),
    work_email: formData.get("work_email"),
    password: formData.get("password"),
    role: formData.get("role"),
    plant_id: formData.get("plant_id") || "",
    department_id: formData.get("department_id") || "",
  });
  if (!parsed.success) redirect("/team?error=invalid");

  const { supabase, profile, user } = await getTeamAdminContext();
  const role = parsed.data.role;
  // HR staff may create plant supervisors but cannot create or promote HR administrators.
  if (profile.role === "hr_manager" && role === "hr_manager") redirect("/team?error=role_forbidden");

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    redirect("/team?error=secret_missing");
  }

  let plantId: string | null = null;
  let departmentId: string | null = null;

  if (role === "plant_manager") {
    const candidate = parsed.data.plant_id;
    if (!candidate) redirect("/team?error=plant_required");
    const { data: plant } = await supabase.from("plants").select("id")
      .eq("id", candidate).eq("company_id", profile.company_id).eq("active", true).maybeSingle();
    if (!plant) redirect("/team?error=plant_scope");
    plantId = plant.id;
  }

  if (role === "department_supervisor") {
    const candidate = parsed.data.department_id;
    if (!candidate) redirect("/team?error=department_required");
    const { data: department } = await supabase.from("departments").select("id,plant_id")
      .eq("id", candidate).eq("company_id", profile.company_id).eq("active", true).maybeSingle();
    if (!department) redirect("/team?error=department_scope");
    departmentId = department.id;
    plantId = department.plant_id;
  }

  const { data: authResult, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.work_email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name, job_title: parsed.data.job_title },
  });
  if (authError || !authResult.user) {
    const message = authError?.message.toLowerCase() || "";
    if (message.includes("already") || message.includes("registered")) redirect("/team?error=email_exists");
    if (message.includes("password")) redirect("/team?error=password_policy");
    redirect("/team?error=auth_create");
  }

  const newUserId = authResult.user.id;
  const { error: profileError } = await admin.from("user_profiles").insert({
    id: newUserId,
    company_id: profile.company_id,
    full_name: parsed.data.full_name,
    job_title: parsed.data.job_title,
    role,
    employee_id: null,
    active: true,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(newUserId);
    redirect(profileError.code === "23505" ? "/team?error=email_exists" : "/team?error=profile_create");
  }

  if (role === "plant_manager" && plantId) {
    const { error } = await admin.from("user_plant_assignments").insert({
      company_id: profile.company_id, user_id: newUserId, plant_id: plantId,
    });
    if (error) {
      await admin.from("user_profiles").delete().eq("id", newUserId);
      await admin.auth.admin.deleteUser(newUserId);
      redirect("/team?error=assignment_create");
    }
  }

  if (role === "department_supervisor" && departmentId) {
    const { error } = await admin.from("user_department_assignments").insert({
      company_id: profile.company_id, user_id: newUserId, department_id: departmentId,
    });
    if (error) {
      await admin.from("user_profiles").delete().eq("id", newUserId);
      await admin.auth.admin.deleteUser(newUserId);
      redirect("/team?error=assignment_create");
    }
  }

  void user;
  redirect("/team?success=created");
}
