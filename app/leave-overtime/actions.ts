"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(value + "T00:00:00Z")));
const leaveSchema = z.object({
  employee_id: z.string().uuid(),
  start_date: date,
  end_date: date,
  leave_type: z.enum(["casual", "sick", "earned", "unpaid", "compensatory", "maternity_paternity", "other"]),
  partial_day: z.enum(["yes", "no"]),
  reason: z.string().trim().min(3).max(500),
});
const reviewSchema = z.object({
  request_id: z.string().uuid(),
  status: z.enum(["approved", "rejected"]),
  reviewer_comment: z.string().trim().max(500).optional(),
});
const overtimeReviewSchema = z.object({
  request_id: z.string().uuid(),
  status: z.enum(["approved", "rejected"]),
  approved_minutes: z.union([z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(1440)), z.literal("")]).optional(),
  reviewer_comment: z.string().trim().max(500).optional(),
});

async function getHRContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("user_profiles")
    .select("company_id, role, active")
    .eq("id", user.id).maybeSingle();
  if (!profile?.active || !profile.company_id) redirect("/login?error=profile");
  // This page and all leave assignment/review actions are strictly HR-only.
  if (profile.role !== "hr_manager") redirect("/dashboard?error=hr_only");
  return { supabase, user, profile };
}

export async function assignEmployeeLeave(formData: FormData) {
  const parsed = leaveSchema.safeParse({
    employee_id: formData.get("employee_id"),
    start_date: formData.get("start_date"),
    end_date: formData.get("end_date"),
    leave_type: formData.get("leave_type"),
    partial_day: formData.get("partial_day") || "no",
    reason: formData.get("reason"),
  });
  if (!parsed.success) redirect("/leave-overtime?error=leave_invalid");
  if (parsed.data.end_date < parsed.data.start_date) redirect("/leave-overtime?error=date_range");

  const { supabase, user, profile } = await getHRContext();
  const { data: employee } = await supabase.from("employees")
    .select("id")
    .eq("id", parsed.data.employee_id)
    .eq("company_id", profile.company_id)
    .eq("employment_status", "active")
    .maybeSingle();
  if (!employee) redirect("/leave-overtime?error=employee_scope");

  const { error } = await supabase.from("leave_requests").insert({
    company_id: profile.company_id,
    employee_id: employee.id,
    start_date: parsed.data.start_date,
    end_date: parsed.data.end_date,
    leave_type: parsed.data.leave_type,
    partial_day: parsed.data.partial_day === "yes",
    reason: parsed.data.reason,
    status: "approved",
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    reviewer_comment: "Leave assigned directly by HR",
  });
  if (error) redirect(error.code === "42501" ? "/leave-overtime?error=hr_only" : "/leave-overtime?error=leave_save");
  redirect("/leave-overtime?success=leave_assigned");
}

export async function reviewEmployeeLeave(formData: FormData) {
  const parsed = reviewSchema.safeParse({
    request_id: formData.get("request_id"),
    status: formData.get("status"),
    reviewer_comment: formData.get("reviewer_comment") || "",
  });
  if (!parsed.success) redirect("/leave-overtime?error=review_invalid");

  const { supabase, user, profile } = await getHRContext();
  const { data, error } = await supabase.from("leave_requests").update({
    status: parsed.data.status,
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    reviewer_comment: parsed.data.reviewer_comment || null,
  }).eq("id", parsed.data.request_id)
    .eq("company_id", profile.company_id)
    .eq("status", "pending")
    .select("id").maybeSingle();

  if (error) redirect(error.code === "42501" ? "/leave-overtime?error=hr_only" : "/leave-overtime?error=review_save");
  if (!data) redirect("/leave-overtime?error=request_not_pending");
  redirect("/leave-overtime?success=leave_reviewed");
}

export async function reviewOvertime(formData: FormData) {
  const parsed = overtimeReviewSchema.safeParse({
    request_id: formData.get("request_id"),
    status: formData.get("status"),
    approved_minutes: formData.get("approved_minutes") || "",
    reviewer_comment: formData.get("reviewer_comment") || "",
  });
  if (!parsed.success) redirect("/leave-overtime?error=overtime_invalid");

  const { supabase, user, profile } = await getHRContext();
  const { data: request } = await supabase.from("overtime_requests")
    .select("id,requested_minutes")
    .eq("id", parsed.data.request_id)
    .eq("company_id", profile.company_id)
    .eq("status", "pending")
    .maybeSingle();
  if (!request) redirect("/leave-overtime?error=request_not_pending");

  const approvedMinutes = parsed.data.status === "approved"
    ? (parsed.data.approved_minutes === "" || parsed.data.approved_minutes === undefined ? request.requested_minutes : parsed.data.approved_minutes)
    : 0;
  if (approvedMinutes > request.requested_minutes || approvedMinutes > 1440) redirect("/leave-overtime?error=overtime_minutes");

  const { data, error } = await supabase.from("overtime_requests").update({
    status: parsed.data.status,
    approved_minutes: approvedMinutes,
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    reviewer_comment: parsed.data.reviewer_comment || null,
  }).eq("id", request.id)
    .eq("company_id", profile.company_id)
    .eq("status", "pending")
    .select("id").maybeSingle();

  if (error) redirect(error.code === "42501" ? "/leave-overtime?error=hr_only" : "/leave-overtime?error=overtime_save");
  if (!data) redirect("/leave-overtime?error=request_not_pending");
  redirect("/leave-overtime?success=overtime_reviewed");
}
