import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const portal = new URL(request.url).searchParams.get("portal");
  return NextResponse.redirect(new URL(portal === "employee" ? "/employee-portal/login" : "/login", request.url), { status: 303 });
}
