"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X, LayoutDashboard, Users, Clock3, CalendarDays, FileSpreadsheet, ClipboardList, Factory, QrCode, UserRoundCog, ShieldCheck } from "lucide-react";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/shifts", label: "Shift templates", icon: Clock3 },
  { href: "/roster", label: "Shift roster", icon: CalendarDays },
  { href: "/reports", label: "Attendance reports", icon: FileSpreadsheet },
  { href: "/leave-overtime", label: "Leave & overtime", icon: ClipboardList },
  { href: "/operations", label: "Industrial operations", icon: Factory },
  { href: "/attendance-kiosk", label: "Attendance kiosk", icon: QrCode },
  { href: "/worker-accounts", label: "Worker accounts", icon: UserRoundCog },
  { href: "/team-accounts", label: "Team accounts", icon: ShieldCheck },
];

export default function MobileMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div className="relative shrink-0 md:hidden">
      <button
        type="button"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
        aria-controls="iams-mobile-navigation"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-blue-100"
      >
        {open ? <X size={22} strokeWidth={2.3} /> : <Menu size={23} strokeWidth={2.3} />}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100]">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/50"
          />
          <nav
            id="iams-mobile-navigation"
            aria-label="Main navigation"
            className="absolute inset-y-0 left-0 flex w-[min(86vw,320px)] flex-col overflow-y-auto border-r border-slate-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-1 pb-4 pt-2">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#172B4D] text-sm font-black text-amber-400">IA</span>
                <div>
                  <p className="font-bold text-slate-900">IAMS</p>
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[.15em] text-slate-500">Main menu</p>
                </div>
              </div>
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-blue-100">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-1 py-4">
              {items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={"flex min-h-11 items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition focus:outline-none focus:ring-4 focus:ring-blue-100 " + (active ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900")}
                  >
                    <Icon size={18} className={active ? "text-blue-700" : "text-slate-400"} />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
            <p className="mt-auto border-t border-slate-100 px-2 pt-4 text-[11px] leading-5 text-slate-500">Menu options are protected by your account permissions.</p>
          </nav>
        </div>
      )}
    </div>
  );
}
