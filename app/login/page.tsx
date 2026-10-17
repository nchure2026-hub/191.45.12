import Link from "next/link";
import { signIn } from "./actions";

type LoginPageProps = { searchParams: Promise<{ error?: string }> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const hasError = params.error === "invalid" || params.error === "profile";
  const configurationMissing =
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const errorMessage =
    params.error === "config"
      ? "Supabase connection settings are missing. Ask the administrator to configure the Vercel environment variables and redeploy."
      : params.error === "service"
        ? "The sign-in service could not be reached. Please try again in a moment."
        : hasError
          ? "Sign-in failed. Check your credentials and make sure your account has an active IAMS user profile."
          : null;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto grid min-h-[80vh] max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl md:grid-cols-2">
        <section className="flex flex-col justify-between bg-[#172B4D] p-8 text-white md:p-12">
          <div>
            <div className="mb-10 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-600 font-black">IA</div>
              <div><p className="text-lg font-bold tracking-tight">IAMS</p><p className="text-xs uppercase tracking-[.2em] text-blue-200">Industrial attendance</p></div>
            </div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[.2em] text-blue-200">Workforce operations</p>
            <h1 className="max-w-sm text-3xl font-bold leading-tight md:text-4xl">Reliable attendance starts with trusted records.</h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-slate-300">Manage shifts, attendance exceptions and workforce operations from one secure workspace.</p>
          </div>
          <p className="mt-12 text-xs text-slate-400">Secure access · Role-based permissions · Auditable changes</p>
        </section>
        <section className="flex items-center p-8 md:p-12">
          <div className="w-full">
            <p className="text-sm font-semibold text-blue-700">Welcome back</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">Sign in to IAMS</h2>
            <p className="mt-2 text-sm text-slate-500">Use the email and password assigned to your account.</p>
            {configurationMissing && (
              <p role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-5 text-amber-800">
                Setup incomplete: Supabase environment variables are not configured for this deployment. An administrator must add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in Vercel, then redeploy.
              </p>
            )}
            {errorMessage && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>}
            <form action={signIn} className="mt-7 space-y-5">
              <div><label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">Work email</label><input id="email" name="email" type="email" autoComplete="username" required maxLength={254} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder="you@company.com" /></div>
              <div><label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-700">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder="Enter your password" /></div>
              <button type="submit" className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200">Sign in securely</button>
            </form>
            <p className="mt-6 text-xs leading-5 text-slate-500">Access is limited to authorized company users. Need an account? Contact your system administrator.</p>
            <Link href="/login" className="sr-only">IAMS sign in</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
