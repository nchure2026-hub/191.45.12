"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

export async function signIn(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) redirect("/login?error=invalid");

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch (error) {
    console.error(
      "IAMS sign-in configuration error:",
      error instanceof Error ? error.message : "Unknown Supabase configuration error",
    );
    redirect("/login?error=config");
  }

  let authError: string | null = null;
  try {
    const result = await supabase.auth.signInWithPassword(parsed.data);
    authError = result.error?.message ?? null;
  } catch (error) {
    console.error(
      "IAMS sign-in request failed:",
      error instanceof Error ? error.message : "Unknown authentication request error",
    );
    redirect("/login?error=service");
  }

  if (authError) redirect("/login?error=invalid");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=invalid");
  const { data: profile } = await supabase.from("user_profiles")
    .select("role,active,employee_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.active) redirect("/login?error=profile");
  if (profile.role === "employee" && profile.employee_id) redirect("/employee-portal");
  redirect("/dashboard");
}
