import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Keep the application reachable while environment configuration is incomplete.
  if (!url || !key) return response;

  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });

    // Middleware must never hold the first response open waiting on Supabase.
    // Supabase connectivity is checked by the relevant page/action instead.
    const refresh = supabase.auth.getUser();
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Supabase session refresh timed out")), 3000),
    );

    try {
      const { error } = await Promise.race([refresh, timeout]);
      if (error) console.error("IAMS Supabase session refresh failed:", error.message);
    } catch (error) {
      console.error(
        "IAMS Supabase session refresh skipped:",
        error instanceof Error ? error.message : "Unknown middleware error",
      );
    }
  } catch (error) {
    console.error(
      "IAMS Supabase middleware exception:",
      error instanceof Error ? error.message : "Unknown middleware error",
    );
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
