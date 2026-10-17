"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { BadgeCheck, Printer, QrCode } from "lucide-react";

export type IamsEmployeeBadge = {
  v: 1;
  kind: "IAMS_EMPLOYEE";
  companyId: string;
  employeeId: string;
  employeeCode: string;
};

export default function EmployeeBadge({ companyId, employeeId, employeeCode, fullName }: {
  companyId: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
}) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [error, setError] = useState("");
  const badgePayload = useMemo<IamsEmployeeBadge>(() => ({
    v: 1, kind: "IAMS_EMPLOYEE", companyId, employeeId, employeeCode,
  }), [companyId, employeeId, employeeCode]);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(JSON.stringify(badgePayload), {
      errorCorrectionLevel: "M", margin: 2, width: 240, color: { dark: "#172B4D", light: "#FFFFFF" },
    }).then(value => { if (active) setQrDataUrl(value); })
      .catch(() => { if (active) setError("The QR badge could not be generated on this device."); });
    return () => { active = false; };
  }, [badgePayload]);

  return <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm print:break-inside-avoid">
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
      <div><p className="text-xs font-bold uppercase tracking-[.16em] text-amber-700">Backup identification</p><h2 className="mt-1 font-bold text-slate-900">Employee ID badge</h2></div>
      <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 print:hidden"><Printer size={15}/> Print badge</button>
    </div>
    <div className="grid gap-4 p-5 sm:grid-cols-[1fr_180px] sm:items-center">
      <div><p className="text-lg font-bold text-slate-900">{fullName}</p><p className="mt-1 text-sm text-slate-500">Employee ID</p><p className="mt-1 text-2xl font-black tracking-wide text-[#172B4D]">{employeeCode}</p><p className="mt-3 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800"><BadgeCheck size={14}/> Company-linked badge</p><p className="mt-3 text-xs leading-5 text-slate-500">Show this QR to an authorized supervisor if the attendance camera is unavailable. A scan identifies your employee record only; the fallback is a correction request that requires review, not an automatic attendance punch.</p></div>
      <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-slate-200 bg-white p-3">{qrDataUrl ? <img src={qrDataUrl} alt={"QR badge for employee "+employeeCode} width={160} height={160} className="h-40 w-40"/> : error ? <p className="text-center text-xs text-red-700">{error}</p> : <div className="text-center text-xs text-slate-500"><QrCode size={24} className="mx-auto mb-2"/>Generating QR…</div>}</div>
    </div>
  </section>;
}
