import Link from "next/link";
import { employeeSignIn } from "./actions";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function EmployeeLoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const message =
    params.error === "invalid"
      ? "Email or password is incorrect. Check with your administrator if you do not have an account yet."
      : params.error === "not_employee"
        ? "This account is not linked to an active employee profile. Please use the admin portal or contact HR."
        : null;

  return (
    <main className="min-h-screen bg-[#e8edf2] px-4 py-8 text-slate-800 sm:px-6 sm:py-12">
      <div className="mx-auto grid min-h-[78vh] max-w-5xl overflow-hidden rounded-[28px] border border-slate-300 bg-white shadow-xl md:grid-cols-[0.9fr_1.1fr]">
        <section className="flex flex-col justify-between bg-gradient-to-br from-[#283544] to-[#121820] p-8 text-white sm:p-12">
          <div>
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-amber-400/30 bg-amber-400 text-lg font-black text-[#171d25]">IA</div>
              <div><p className="text-xl font-bold">IAMS</p><p className="text-[10px] font-bold uppercase tracking-[.22em] text-amber-300">Employee attendance</p></div>
            </div>
            <p className="mt-14 text-xs font-bold uppercase tracking-[.23em] text-amber-300">Employee self-service</p>
            <h1 className="mt-4 max-w-md text-3xl font-bold leading-tight sm:text-4xl">Your workday. Your attendance. One simple place.</h1>
            <p className="mt-5 max-w-md text-sm leading-7 text-slate-300">Check in, record breaks, check out and review your own attendance from your phone.</p>
          </div>
          <div className="mt-12 rounded-2xl border border-white/20 bg-white/10 p-4 text-sm leading-6 text-slate-300">Camera access is required when recording attendance. Your captured face photo is stored privately with the attendance event.</div>
        </section>
        <section className="flex items-center p-7 sm:p-12">
          <div className="mx-auto w-full max-w-md">
            <p className="text-sm font-bold text-amber-700">Welcome to your portal</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Worker sign in</h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">Sign in using the work email and password provided by your administrator.</p>
            {message && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{message}</p>}
            <form action={employeeSignIn} className="mt-8 space-y-5">
              <div><label htmlFor="employee-email" className="mb-2 block text-sm font-semibold">Work email</label><input id="employee-email" name="email" type="email" autoComplete="username" required maxLength={254} placeholder="you@company.com" className="w-full rounded-xl border border-slate-300 px-4 py-3.5 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" /></div>
              <div><label htmlFor="employee-password" className="mb-2 block text-sm font-semibold">Password</label><input id="employee-password" name="password" type="password" autoComplete="current-password" required maxLength={128} placeholder="Enter your password" className="w-full rounded-xl border border-slate-300 px-4 py-3.5 text-sm outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-100" /></div>
              <button className="w-full rounded-xl bg-[#222c37] px-4 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-[#151b22] focus:outline-none focus:ring-4 focus:ring-amber-200">Sign in to attendance</button>
            </form>
            <p className="mt-6 text-xs leading-5 text-slate-500">This is the worker portal. Employee accounts must be created by your company administrator.</p>
            <Link href="/login" className="mt-4 inline-flex text-sm font-semibold text-amber-700 hover:underline">Administrator portal →</Link>
          </div>
        </section>
      </div>
    </main>
  );
}
