"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const date = z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).refine((value) => !Number.isNaN(Date.parse(value + "T00:00:00Z")));
const assignmentSchema = z.object({
  employee_id: z.string().uuid(),
  shift_id: z.string().uuid(),
  effective_from: date,
  effective_to: z.union([date, z.literal("")]).optional(),
});
const closeSchema = z.object({ assignment_id: z.string().uuid(), effective_to: date });

async function getRosterContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("user_profiles")
    .select("company_id, role, active")
    .eq("id", user.id).maybeSingle();
  if (!profile?.active || !profile.company_id) redirect("/login?error=profile");
  if (!["super_admin", "hr_manager", "plant_manager"].includes(profile.role)) redirect("/roster?error=forbidden");
  return { supabase, user, profile };
}

export async function createRosterAssignment(formData: FormData) {
  const parsed = assignmentSchema.safeParse({
    employee_id: formData.get("employee_id"),
    shift_id: formData.get("shift_id"),
    effective_from: formData.get("effective_from"),
    effective_to: formData.get("effective_to") || "",
  });
  if (!parsed.success) redirect("/roster?error=invalid");
  if (parsed.data.effective_to && parsed.data.effective_to < parsed.data.effective_from) redirect("/roster?error=date_range");

  const { supabase, profile } = await getRosterContext();
  const { data: employee } = await supabase.from("employees")
    .select("id, plant_id, full_name")
    .eq("id", parsed.data.employee_id)
    .eq("company_id", profile.company_id)
    .eq("employment_status", "active").maybeSingle();
  if (!employee) redirect("/roster?error=employee_scope");

  const { data: shift } = await supabase.from("shifts")
    .select("id, plant_id, name")
    .eq("id", parsed.data.shift_id)
    .eq("company_id", profile.company_id)
    .eq("active", true).maybeSingle();
  if (!shift || (shift.plant_id && shift.plant_id !== employee.plant_id)) redirect("/roster?error=shift_scope");

  const overlapEnd = parsed.data.effective_to || "9999-12-31";
  const { data: overlaps, error: overlapError } = await supabase.from("shift_assignments")
    .select("id")
    .eq("company_id", profile.company_id)
    .eq("employee_id", employee.id)
    .lte("effective_from", overlapEnd)
    .or("effective_to.is.null,effective_to.gte." + parsed.data.effective_from)
    .limit(1);
  if (overlapError) redirect("/roster?error=overlap_check");
  if (overlaps?.length) redirect("/roster?error=overlap");

  const { error } = await supabase.from("shift_assignments").insert({
    company_id: profile.company_id,
    employee_id: employee.id,
    shift_id: shift.id,
    effective_from: parsed.data.effective_from,
    effective_to: parsed.data.effective_to || null,
  });
  if (error) {
    if (error.code === "42501") redirect("/roster?error=forbidden");
    redirect("/roster?error=save");
  }
  redirect("/roster?success=assigned");
}

export async function endRosterAssignment(formData: FormData) {
  const parsed = closeSchema.safeParse({
    assignment_id: formData.get("assignment_id"),
    effective_to: formData.get("effective_to"),
  });
  if (!parsed.success) redirect("/roster?error=invalid");
  const { supabase, profile } = await getRosterContext();
  const { data: existing } = await supabase.from("shift_assignments")
    .select("id,effective_from")
    .eq("id", parsed.data.assignment_id)
    .eq("company_id", profile.company_id).maybeSingle();
  if (!existing) redirect("/roster?error=notfound");
  if (parsed.data.effective_to < existing.effective_from) redirect("/roster?error=date_range");

  const { data, error } = await supabase.from("shift_assignments")
    .update({ effective_to: parsed.data.effective_to })
    .eq("id", existing.id).eq("company_id", profile.company_id)
    .select("id");
  if (error) redirect(error.code === "42501" ? "/roster?error=forbidden" : "/roster?error=save");
  if (!data?.length) redirect("/roster?error=notfound");
  redirect("/roster?success=ended");
}
