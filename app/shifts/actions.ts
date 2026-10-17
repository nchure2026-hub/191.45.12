"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const shiftSchema = z.object({
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().min(1).max(30).transform((value) => value.toUpperCase()).pipe(z.string().regex(/^[A-Z0-9_-]+$/)),
  plant_id: z.string().uuid(),
  start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  break_minutes: z.coerce.number().int().min(0).max(600),
  grace_minutes: z.coerce.number().int().min(0).max(240),
  overtime_after_minutes: z.union([z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(1440)), z.literal("")]).optional(),
});

async function getContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("user_profiles").select("company_id,role,active").eq("id", user.id).maybeSingle();
  if (!profile?.active || !profile.company_id) redirect("/login?error=profile");
  if (!["super_admin", "hr_manager", "plant_manager"].includes(profile.role)) redirect("/shifts?error=forbidden");
  return { supabase, profile };
}

export async function createShift(formData: FormData) {
  const parsed = shiftSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    plant_id: formData.get("plant_id"),
    start_time: formData.get("start_time"),
    end_time: formData.get("end_time"),
    break_minutes: formData.get("break_minutes"),
    grace_minutes: formData.get("grace_minutes"),
  overtime_after_minutes: z.union([z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(1440)), z.literal("")]).optional(),
  });
  if (!parsed.success) redirect("/shifts?error=invalid");

  const start = Number(parsed.data.start_time.slice(0, 2)) * 60 + Number(parsed.data.start_time.slice(3, 5));
  const end = Number(parsed.data.end_time.slice(0, 2)) * 60 + Number(parsed.data.end_time.slice(3, 5));
  if (start === end) redirect("/shifts?error=duration");
  const overnight = end < start;
  const elapsed = end - start + (overnight ? 1440 : 0);
  const scheduled = elapsed - parsed.data.break_minutes;
  if (scheduled <= 0 || scheduled > 1440) redirect("/shifts?error=duration");

  const { supabase, profile } = await getContext();
  const { data: plant } = await supabase.from("plants").select("id").eq("id", parsed.data.plant_id).eq("company_id", profile.company_id).maybeSingle();
  if (!plant) redirect("/shifts?error=scope");

  const overtimeAfter = parsed.data.overtime_after_minutes === "" || parsed.data.overtime_after_minutes === undefined
    ? scheduled : parsed.data.overtime_after_minutes;
  const { error } = await supabase.from("shifts").insert({
    company_id: profile.company_id,
    plant_id: parsed.data.plant_id,
    name: parsed.data.name,
    code: parsed.data.code,
    start_time: parsed.data.start_time,
    end_time: parsed.data.end_time,
    break_minutes: parsed.data.break_minutes,
    grace_minutes: parsed.data.grace_minutes,
    scheduled_minutes: scheduled,
    overnight,
  overtime_after_minutes: z.union([z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(1440)), z.literal("")]).optional(),
    active: true,
  });
  if (error) {
    if (error.code === "23505") redirect("/shifts?error=duplicate");
    if (error.code === "42501") redirect("/shifts?error=forbidden");
    redirect("/shifts?error=save");
  }
  redirect("/shifts?success=created");
}

export async function deactivateShift(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get("shift_id"));
  if (!id.success) redirect("/shifts?error=invalid");
  const { supabase, profile } = await getContext();
  const { data, error } = await supabase.from("shifts").update({ active: false }).eq("id", id.data).eq("company_id", profile.company_id).select("id");
  if (error) redirect(error.code === "42501" ? "/shifts?error=forbidden" : "/shifts?error=save");
  if (!data?.length) redirect("/shifts?error=notfound");
  redirect("/shifts?success=deactivated");
}
