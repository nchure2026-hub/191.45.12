"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, LoaderCircle, QrCode, Search, ShieldCheck, UserRoundCheck, VideoOff } from "lucide-react";
import { parseEmployeeBadge } from "@/lib/attendance/employee-badge";
import { submitAttendanceCorrection } from "./actions";

type Employee = { id:string; employee_code:string; full_name:string; plant_id:string|null; plant_name:string|null; timezone:string };
type DetectorResult = { rawValue:string };
type DetectorLike = { detect(source:HTMLVideoElement):Promise<DetectorResult[]> };
type DetectorConstructor = new (options:{formats:string[]})=>DetectorLike;

function localToday(timezone:string) {
  return new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
}
function localDateTime(timezone:string,hour:string) { return localToday(timezone)+"T"+hour; }

export default function BadgeScanner({companyId,employees,today}:{companyId:string;employees:Employee[];today:string}) {
  const [manualCode,setManualCode] = useState("");
  const [selected,setSelected] = useState<Employee|null>(null);
  const [scanning,setScanning] = useState(false);
  const [starting,setStarting] = useState(false);
  const [scanError,setScanError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream|null>(null);
  const frameRef = useRef<number|null>(null);

  function stopScanner() {
    if(frameRef.current!==null) cancelAnimationFrame(frameRef.current);
    frameRef.current=null;
    streamRef.current?.getTracks().forEach(track=>track.stop());
    streamRef.current=null;
    if(videoRef.current) videoRef.current.srcObject=null;
    setScanning(false);
  }
  useEffect(()=>()=>streamRef.current?.getTracks().forEach(track=>track.stop()),[]);

  function selectFromQr(rawValue:string) {
    const badge=parseEmployeeBadge(rawValue);
    if(!badge) { setScanError("This QR is not a valid IAMS employee badge."); return; }
    if(badge.companyId!==companyId) { setScanError("This badge belongs to another company."); return; }
    const employee=employees.find(item=>item.id===badge.employeeId && item.employee_code===badge.employeeCode);
    if(!employee) { setScanError("Employee not found in your authorized plant/department. Ask HR to check access."); return; }
    setSelected(employee);
    setManualCode(employee.employee_code);
    setScanError("");
    stopScanner();
  }

  async function startScanner() {
    setStarting(true);
    setScanError("");
    stopScanner();
    try {
      if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error("QR scanning needs a secure HTTPS page and a working camera.");
      const Constructor=(window as unknown as {BarcodeDetector?:DetectorConstructor}).BarcodeDetector;
      if(!Constructor) throw new Error("This browser does not support QR scanning. Use the Employee ID field below instead.");
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
      streamRef.current=stream;
      const video=videoRef.current;
      if(!video) throw new Error("Scanner preview is not ready. Refresh and retry.");
      video.srcObject=stream;
      await video.play();
      const detector=new Constructor({formats:["qr_code"]});
      setScanning(true);
      const scan=async()=>{
        if(!streamRef.current||!videoRef.current) return;
        try {
          const results=await detector.detect(videoRef.current);
          if(results.length) { selectFromQr(results[0].rawValue); return; }
        } catch {
          setScanError("QR scan failed. Hold the badge steady and try again, or enter the Employee ID manually.");
        }
        frameRef.current=requestAnimationFrame(()=>{ void scan(); });
      };
      frameRef.current=requestAnimationFrame(()=>{ void scan(); });
    } catch(error) {
      stopScanner();
      setScanError(error instanceof Error?error.message:"Could not start the QR scanner.");
    } finally { setStarting(false); }
  }

  function findEmployee() {
    const code=manualCode.trim().toUpperCase();
    const match=employees.find(item=>item.employee_code.toUpperCase()===code);
    if(!match) { setSelected(null); setScanError("Employee ID not found in your authorized scope."); return; }
    setSelected(match);
    setScanError("");
  }

  const timezone=selected?.timezone||"Asia/Kolkata";
  const selectedToday=selected?localToday(timezone):today;
  const nextDay=selectedToday ? (()=>{const [y,m,d]=selectedToday.split("-").map(Number);const date=new Date(Date.UTC(y,m-1,d+1));return date.getUTCFullYear()+"-"+String(date.getUTCMonth()+1).padStart(2,"0")+"-"+String(date.getUTCDate()).padStart(2,"0");})() : today;

  return <div className="space-y-5">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="font-bold">Scan employee QR badge</h2><p className="mt-1 text-xs leading-5 text-slate-500">Use the kiosk camera to identify the employee. QR contains employee identity only; it is not a login token or a direct punch.</p></div><button type="button" onClick={scanning?stopScanner:startScanner} disabled={starting} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#172B4D] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{starting?<LoaderCircle size={16} className="animate-spin"/>:scanning?<VideoOff size={16}/>:<Camera size={16}/>} {starting?"Starting…":scanning?"Stop scanner":"Start QR scanner"}</button></div>
      {scanning&&<div className="mt-4 max-w-md overflow-hidden rounded-xl border border-slate-300 bg-black"><video ref={videoRef} muted playsInline autoPlay className="aspect-video w-full object-cover"/></div>}
      {scanError&&<p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><AlertTriangle size={16} className="mt-0.5 shrink-0"/>{scanError}</p>}
      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]"><label className="block text-xs font-semibold text-slate-600">Employee ID backup<input value={manualCode} onChange={event=>setManualCode(event.target.value.toUpperCase())} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();findEmployee();}}} maxLength={40} placeholder="Enter ID, e.g. EMP-001" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-500"/></label><button type="button" onClick={findEmployee} className="inline-flex items-center justify-center gap-2 self-end rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"><Search size={15}/> Find employee</button></div>
    </section>

    {selected&&<section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-emerald-100 bg-emerald-50 px-5 py-4"><span className="rounded-xl bg-white p-2 text-emerald-700"><UserRoundCheck size={20}/></span><div><p className="font-bold text-emerald-950">{selected.full_name}</p><p className="mt-1 text-xs text-emerald-800">ID {selected.employee_code} · {selected.plant_name||"Plant not assigned"} · {timezone}</p></div></div>
      <form action={submitAttendanceCorrection} className="grid gap-4 p-5 sm:grid-cols-2">
        <input type="hidden" name="employee_id" value={selected.id}/>
        <input type="hidden" name="employee_code" value={selected.employee_code}/>
        <label className="block text-xs font-semibold text-slate-600">Work date<input type="date" name="work_date" required max={selectedToday} defaultValue={selectedToday} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
        <div className="rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-900"><ShieldCheck size={15} className="mb-1"/> Camera unavailable fallback. This creates a <strong>pending correction request</strong>; it does not record attendance automatically.</div>
        <label className="block text-xs font-semibold text-slate-600">Proposed check-in (plant local time)<input type="datetime-local" name="proposed_check_in" required defaultValue={localDateTime(timezone,"08:00")} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
        <label className="block text-xs font-semibold text-slate-600">Proposed check-out (plant local time)<input type="datetime-local" name="proposed_check_out" required defaultValue={localDateTime(timezone,"17:00")} min={selectedToday+"T00:00"} max={nextDay+"T23:59"} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
        <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">Reason for camera/attendance fallback<textarea name="reason" required minLength={10} maxLength={500} rows={3} placeholder="Camera permission denied at gate 2; supervisor verified employee ID badge." className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></label>
        <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#172B4D] px-4 py-3 text-sm font-bold text-white hover:bg-[#213b66] sm:col-span-2"><CheckCircle2 size={16}/> Submit for HR review</button>
      </form>
    </section>}
    <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><QrCode size={15} className="mt-0.5 shrink-0"/> QR and Employee ID are identification aids, not biometric proof. Every fallback is recorded as pending and must be reviewed by HR/authorized staff before it affects official attendance.</p>
  </div>;
}
