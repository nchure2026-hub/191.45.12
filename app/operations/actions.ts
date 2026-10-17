"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const dateValue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const codeValue = z.string().trim().min(2).max(32).transform(v => v.toUpperCase()).refine(v => /^[A-Z0-9_-]+$/.test(v));
const idValue = z.string().uuid();
type Role = "super_admin" | "hr_manager" | "plant_manager" | "department_supervisor" | "employee";

async function context(allowed: Role[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("user_profiles")
    .select("company_id, role, active").eq("id", user.id).maybeSingle();
  if (!profile?.active || !profile.company_id || !allowed.includes(profile.role as Role)) {
    redirect("/dashboard?error=forbidden");
  }
  return { supabase, user, profile };
}

function fail(key: string): never {
  redirect("/operations?error=" + encodeURIComponent(key));
}
function success(key: string): never {
  redirect("/operations?success=" + encodeURIComponent(key));
}

export async function createProductionUnit(formData: FormData) {
  const parsed = z.object({
    plant_id: idValue, department_id: z.union([idValue, z.literal("")]).optional(),
    name: z.string().trim().min(2).max(100), code: codeValue,
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail("unit_invalid");
  const { supabase, profile } = await context(["super_admin", "hr_manager"]);
  const { data: plant } = await supabase.from("plants").select("id").eq("id", parsed.data.plant_id).eq("company_id", profile.company_id).eq("active", true).maybeSingle();
  if (!plant) fail("plant_scope");
  if (parsed.data.department_id) {
    const { data: department } = await supabase.from("departments").select("id").eq("id", parsed.data.department_id).eq("company_id", profile.company_id).eq("plant_id", parsed.data.plant_id).eq("active", true).maybeSingle();
    if (!department) fail("department_scope");
  }
  const { error } = await supabase.from("production_units").insert({
    company_id: profile.company_id, plant_id: parsed.data.plant_id,
    department_id: parsed.data.department_id || null, name: parsed.data.name, code: parsed.data.code, active: true,
  });
  if (error) fail(error.code === "23505" ? "unit_duplicate" : "unit_save");
  success("unit");
}

export async function deactivateProductionUnit(formData: FormData) {
  const parsed = z.object({ id: idValue }).safeParse({ id: formData.get("id") });
  if (!parsed.success) fail("invalid");
  const { supabase, profile } = await context(["super_admin", "hr_manager"]);
  const { data, error } = await supabase.from("production_units").update({ active: false })
    .eq("id", parsed.data.id).eq("company_id", profile.company_id).eq("active", true).select("id").maybeSingle();
  if (error || !data) fail("unit_save");
  success("unit_deactivated");
}

export async function createContractor(formData: FormData) {
  const parsed = z.object({
    name: z.string().trim().min(2).max(120), code: codeValue,
    contact_name: z.string().trim().max(120).optional(), contact_phone: z.string().trim().max(40).optional(),
    valid_from: z.union([dateValue, z.literal("")]).optional(), valid_to: z.union([dateValue, z.literal("")]).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail("contractor_invalid");
  if (parsed.data.valid_from && parsed.data.valid_to && parsed.data.valid_to < parsed.data.valid_from) fail("date_range");
  const { supabase, profile } = await context(["super_admin", "hr_manager", "plant_manager"]);
  const { error } = await supabase.from("contractors").insert({
    company_id: profile.company_id, name: parsed.data.name, code: parsed.data.code,
    contact_name: parsed.data.contact_name || null, contact_phone: parsed.data.contact_phone || null,
    valid_from: parsed.data.valid_from || null, valid_to: parsed.data.valid_to || null, active: true,
  });
  if (error) fail(error.code === "23505" ? "contractor_duplicate" : "contractor_save");
  success("contractor");
}

export async function deactivateContractor(formData: FormData) {
  const parsed = z.object({ id: idValue }).safeParse({ id: formData.get("id") });
  if (!parsed.success) fail("invalid");
  const { supabase, profile } = await context(["super_admin", "hr_manager", "plant_manager"]);
  const { data, error } = await supabase.from("contractors").update({ active: false })
    .eq("id", parsed.data.id).eq("company_id", profile.company_id).eq("active", true).select("id").maybeSingle();
  if (error || !data) fail("contractor_save");
  success("contractor_deactivated");
}

export async function createContractWorker(formData: FormData) {
  const parsed = z.object({
    contractor_id: idValue, plant_id: idValue,
    department_id: z.union([idValue, z.literal("")]).optional(),
    worker_code: codeValue, full_name: z.string().trim().min(2).max(120),
    valid_from: dateValue, valid_to: z.union([dateValue, z.literal("")]).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail("contract_worker_invalid");
  if (parsed.data.valid_to && parsed.data.valid_to < parsed.data.valid_from) fail("date_range");
  const { supabase, profile } = await context(["super_admin", "hr_manager", "plant_manager"]);
  const { data: contractor } = await supabase.from("contractors").select("id").eq("id", parsed.data.contractor_id)
    .eq("company_id", profile.company_id).eq("active", true).maybeSingle();
  if (!contractor) fail("contractor_scope");
  const { data: plant } = await supabase.from("plants").select("id").eq("id", parsed.data.plant_id).eq("company_id", profile.company_id).eq("active", true).maybeSingle();
  if (!plant) fail("plant_scope");
  if (parsed.data.department_id) {
    const { data: department } = await supabase.from("departments").select("id").eq("id", parsed.data.department_id).eq("company_id", profile.company_id).eq("plant_id", parsed.data.plant_id).eq("active", true).maybeSingle();
    if (!department) fail("department_scope");
  }
  const { error } = await supabase.from("contract_workers").insert({
    company_id: profile.company_id, contractor_id: parsed.data.contractor_id, plant_id: parsed.data.plant_id,
    department_id: parsed.data.department_id || null, worker_code: parsed.data.worker_code,
    full_name: parsed.data.full_name, valid_from: parsed.data.valid_from, valid_to: parsed.data.valid_to || null, active: true,
  });
  if (error) fail(error.code === "23505" ? "contract_worker_duplicate" : "contract_worker_save");
  success("contract_worker");
}

export async function deactivateContractWorker(formData: FormData) {
  const parsed = z.object({ id: idValue }).safeParse({ id: formData.get("id") });
  if (!parsed.success) fail("invalid");
  const { supabase, profile } = await context(["super_admin", "hr_manager", "plant_manager"]);
  const { data, error } = await supabase.from("contract_workers").update({ active: false })
    .eq("id", parsed.data.id).eq("company_id", profile.company_id).eq("active", true).select("id").maybeSingle();
  if (error || !data) fail("contract_worker_save");
  success("contract_worker_deactivated");
}

export async function createVisitor(formData: FormData) {
  const parsed = z.object({
    visitor_name: z.string().trim().min(2).max(120), plant_id: z.union([idValue, z.literal("")]).optional(),
    organization: z.string().trim().max(120).optional(), purpose: z.string().trim().min(2).max(300),
    host_employee_id: z.union([idValue, z.literal("")]).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail("visitor_invalid");
  const { supabase, user, profile } = await context(["super_admin", "hr_manager", "plant_manager", "department_supervisor"]);
  if (parsed.data.plant_id) {
    const { data: plant } = await supabase.from("plants").select("id").eq("id", parsed.data.plant_id).eq("company_id", profile.company_id).eq("active", true).maybeSingle();
    if (!plant) fail("plant_scope");
  }
  if (parsed.data.host_employee_id) {
    const { data: host } = await supabase.from("employees").select("id,plant_id").eq("id", parsed.data.host_employee_id).eq("company_id", profile.company_id).eq("employment_status", "active").maybeSingle();
    if (!host || (parsed.data.plant_id && host.plant_id !== parsed.data.plant_id)) fail("host_scope");
  }
  const { error } = await supabase.from("visitors").insert({
    company_id: profile.company_id, visitor_name: parsed.data.visitor_name,
    plant_id: parsed.data.plant_id || null, organization: parsed.data.organization || null,
    purpose: parsed.data.purpose, host_employee_id: parsed.data.host_employee_id || null,
    authorization_status: "approved", created_by: user.id,
  });
  if (error) fail("visitor_save");
  success("visitor");
}

export async function recordVisitorExit(formData: FormData) {
  const parsed = z.object({ id: idValue }).safeParse({ id: formData.get("id") });
  if (!parsed.success) fail("invalid");
  const { supabase, profile } = await context(["super_admin", "hr_manager", "plant_manager", "department_supervisor"]);
  const { data, error } = await supabase.from("visitors").update({ exit_at: new Date().toISOString() })
    .eq("id", parsed.data.id).eq("company_id", profile.company_id).is("exit_at", null)
    .select("id").maybeSingle();
  if (error || !data) fail("visitor_exit");
  success("visitor_exit");
}

export async function createHoliday(formData: FormData) {
  const parsed = z.object({
    holiday_date: dateValue, name: z.string().trim().min(2).max(120),
    plant_id: z.union([idValue, z.literal("")]).optional(), paid: z.enum(["yes", "no"]),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail("holiday_invalid");
  const { supabase, profile } = await context(["super_admin", "hr_manager"]);
  if (parsed.data.plant_id) {
    const { data: plant } = await supabase.from("plants").select("id").eq("id", parsed.data.plant_id).eq("company_id", profile.company_id).eq("active", true).maybeSingle();
    if (!plant) fail("plant_scope");
  }
  const { error } = await supabase.from("holidays").insert({
    company_id: profile.company_id, holiday_date: parsed.data.holiday_date, name: parsed.data.name,
    plant_id: parsed.data.plant_id || null, paid: parsed.data.paid === "yes",
  });
  if (error) fail("holiday_save");
  success("holiday");
}

export async function createAttendanceDevice(formData: FormData) {
  const parsed = z.object({
    name: z.string().trim().min(2).max(120),
    plant_id: z.union([idValue, z.literal("")]).optional(),
    device_type: z.enum(["biometric", "rfid", "csv_import", "simulator", "other"]),
    external_device_id: z.string().trim().max(120).optional(),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) fail("device_invalid");
  const { supabase, profile } = await context(["super_admin", "hr_manager"]);
  if (parsed.data.plant_id) {
    const { data: plant } = await supabase.from("plants").select("id").eq("id", parsed.data.plant_id).eq("company_id", profile.company_id).eq("active", true).maybeSingle();
    if (!plant) fail("plant_scope");
  }
  const { error } = await supabase.from("attendance_devices").insert({
    company_id: profile.company_id, name: parsed.data.name, plant_id: parsed.data.plant_id || null,
    device_type: parsed.data.device_type, external_device_id: parsed.data.external_device_id || null,
    integration_status: "not_configured", active: true, config: {},
  });
  if (error) fail("device_save");
  success("device");
}

export async function deactivateAttendanceDevice(formData: FormData) {
  const parsed = z.object({ id: idValue }).safeParse({ id: formData.get("id") });
  if (!parsed.success) fail("invalid");
  const { supabase, profile } = await context(["super_admin", "hr_manager"]);
  const { data, error } = await supabase.from("attendance_devices").update({ active: false, integration_status: "disabled" })
    .eq("id", parsed.data.id).eq("company_id", profile.company_id).eq("active", true).select("id").maybeSingle();
  if (error || !data) fail("device_save");
  success("device_deactivated");
}
