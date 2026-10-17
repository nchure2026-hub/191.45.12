"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

export async function employeeSignIn(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/employee-portal/login?error=invalid");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) redirect("/employee-portal/login?error=invalid");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/employee-portal/login?error=invalid");

  const { data: profile } = await supabase.from("user_profiles")
    .select("role, employee_id, active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.active || profile.role !== "employee" || !profile.employee_id) {
    await supabase.auth.signOut();
    redirect("/employee-portal/login?error=not_employee");
  }

  redirect("/employee-portal");
}
