"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, LoaderCircle, ShieldCheck, Video, VideoOff, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { recordEmployeePunch } from "./actions";

export type EmployeePunchType = "check_in" | "break_start" | "break_end" | "check_out";
export type PunchChoice = { type: EmployeePunchType; label: string; description: string };

type Props = { companyId: string; employeeId: string; actions: PunchChoice[] };

function cameraHelp(error: unknown) {
  const name = error instanceof DOMException ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return {
      title: "Camera permission is blocked",
      detail: "In Edge/Chrome, click the lock or tune icon beside the website address → Site permissions → Camera → Allow. Then reload this page and press Enable camera again. On Windows, also open Settings → Privacy & security → Camera and allow desktop apps to use the camera.",
      code: name,
    };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return {
      title: "No camera was found",
      detail: "Use a phone or computer with a working front camera. On a computer, connect a webcam. Then reload the page and try again.",
      code: name || "NotFoundError",
    };
  }
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
    return {
      title: "The camera could not start",
      detail: "Close Camera, Teams, Zoom, WhatsApp and other apps that may be using the camera. Check the physical camera privacy switch, then press Enable camera again.",
      code: name,
    };
  }
  if (name === "OverconstrainedError") {
    return {
      title: "The selected camera mode is not supported",
      detail: "Try the basic camera mode again. If this repeats, reload the portal or choose another camera in your browser/device settings.",
      code: name,
    };
  }
  if (name === "SecurityError" || !window.isSecureContext) {
    return {
      title: "Secure camera access is unavailable",
      detail: "Open the portal using its HTTPS address (https://191-45-12.vercel.app/employee-portal). Do not open it inside an embedded frame or as a local file.",
      code: name || "InsecureContext",
    };
  }
  return {
    title: "The browser could not open the camera",
    detail: message || "Check the browser's camera permission, confirm the camera is connected and not in use by another app, then reload and try again.",
    code: name || "Unknown camera error",
  };
}

export default function FacePunchCard({ companyId, employeeId, actions }: Props) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);
  const [cameraError, setCameraError] = useState<{ title: string; detail: string; code: string } | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  }

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  async function startCamera() {
    setStartingCamera(true);
    setCameraError(null);
    setFeedback(null);
    stopCamera();

    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new DOMException("Camera access requires a secure HTTPS page and a supported browser.", "SecurityError");
      }

      let nextStream: MediaStream;
      try {
        nextStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "user" }, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
      } catch (firstError) {
        const firstName = firstError instanceof DOMException ? firstError.name : "";
        // Retry only unsupported camera constraints, never a user permission denial.
        if (firstName !== "OverconstrainedError" && firstName !== "ConstraintNotSatisfiedError") throw firstError;
        nextStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      streamRef.current = nextStream;
      const video = videoRef.current;
      if (!video) throw new DOMException("Camera preview is not ready. Refresh the page and try again.", "AbortError");
      video.srcObject = nextStream;
      await video.play();
      setCameraReady(true);
    } catch (error) {
      stopCamera();
      setCameraError(cameraHelp(error));
    } finally {
      setStartingCamera(false);
    }
  }

  async function punch(type: EmployeePunchType) {
    if (!videoRef.current || !cameraReady || !consent || busy) return;
    setBusy(true);
    setFeedback(null);
    setCameraError(null);
    try {
      const video = videoRef.current;
      if (!video.videoWidth || !video.videoHeight) throw new Error("Camera preview is still loading. Wait a moment and try again.");
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(video.videoWidth, 720);
      canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare the selfie. Please try again.");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not capture the selfie.")), "image/jpeg", 0.8);
      });
      if (blob.size > 2 * 1024 * 1024) throw new Error("The photo is too large. Please try again in normal lighting.");

      const supabase = createClient();
      const dayFolder = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const path = companyId + "/" + employeeId + "/" + dayFolder + "/" + crypto.randomUUID() + ".jpg";
      const { error: uploadError } = await supabase.storage.from("attendance-face-captures").upload(path, blob, {
        contentType: "image/jpeg", cacheControl: "3600", upsert: false,
      });
      if (uploadError) throw new Error(uploadError.message || "Could not save the attendance photo.");

      const result = await recordEmployeePunch(type, path, consent);
      setFeedback(result);
      if (result.ok) {
        stopCamera();
        router.refresh();
      }
    } catch (error) {
      setCameraError({
        title: "Attendance could not be recorded",
        detail: error instanceof Error ? error.message : "Check your internet connection and retry.",
        code: "Attendance",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-700 bg-[#171d25] text-slate-100 shadow-xl">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
        <div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-amber-400">Shop floor · Face photo verification</p><h2 className="mt-1 font-bold text-white">Punch station</h2><p className="mt-1 text-xs text-slate-400">Capture a fresh photo before each attendance action.</p></div>
        <span className="rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-amber-400"><Camera size={21}/></span>
      </div>

      <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div>
          <div className="relative overflow-hidden rounded-2xl border border-slate-700 bg-black">
            <video ref={videoRef} autoPlay playsInline muted className="block aspect-[4/3] w-full object-cover" />
            {!cameraReady && <div className="absolute inset-0 flex aspect-[4/3] flex-col items-center justify-center gap-3 bg-[#0d1117] px-5 text-center text-white">
              <span className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4 text-amber-400"><Video size={28}/></span>
              <p className="text-sm font-semibold">Camera ready when you are</p>
              <p className="max-w-xs text-xs leading-5 text-slate-400">Use the front camera. Center your face and stand in good light.</p>
            </div>}
            {cameraReady && <span className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white"><span className="h-2 w-2 rounded-full bg-lime-400"/> Camera live</span>}
          </div>
          <button type="button" onClick={startCamera} disabled={busy || startingCamera} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400 px-4 py-3 text-sm font-bold text-[#151a21] hover:bg-amber-300 disabled:opacity-50">
            {startingCamera ? <><LoaderCircle size={17} className="animate-spin"/> Starting camera…</> : cameraReady ? <><VideoOff size={17}/> Restart camera</> : <><Video size={17}/> Enable camera</>}
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-slate-700 bg-[#202731] p-4">
            <div className="flex items-start gap-3"><ShieldCheck size={20} className="mt-0.5 shrink-0 text-amber-400"/><div><p className="text-sm font-bold text-white">Face photo privacy</p><p className="mt-1 text-xs leading-5 text-slate-400">The selfie is kept in private attendance storage with the punch record. Authorized HR/admin users may review it. This is photo capture, not automated face recognition.</p></div></div>
            <label className="mt-4 flex items-start gap-3 text-xs leading-5 text-slate-300"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-amber-400"/><span>I consent to capture and store a selfie for this attendance record.</span></label>
          </div>

          <div className="space-y-2">
            {actions.length === 0 ? <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm leading-5 text-amber-100">No punch is available. If a previous shift was left open, contact your supervisor.</div> : actions.map((action) => (
              <button key={action.type} type="button" onClick={() => punch(action.type)} disabled={!cameraReady || !consent || busy || startingCamera} className={"flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-left text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-35 " + (action.type === "check_out" ? "border border-slate-500 bg-slate-700 text-white hover:bg-slate-600" : "bg-amber-400 text-[#171d25] hover:bg-amber-300")}>
                <span className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-black/10">{busy ? <LoaderCircle className="animate-spin" size={18}/> : <Camera size={17}/>}</span><span>{action.label}<small className={"mt-0.5 block font-normal " + (action.type === "check_out" ? "text-slate-300" : "text-slate-700")}>{action.description}</small></span></span>
                <span className="shrink-0">{busy ? "Saving…" : "Record"}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {cameraError && <div className="px-5 pb-5 sm:px-6"><div role="alert" className="rounded-xl border border-red-400/30 bg-red-950/40 p-4 text-sm text-red-100"><div className="flex items-start gap-2"><Wrench size={17} className="mt-0.5 shrink-0 text-amber-400"/><div><p className="font-bold">{cameraError.title}</p><p className="mt-1 leading-6 text-red-100/90">{cameraError.detail}</p><p className="mt-2 font-mono text-[10px] uppercase tracking-wide text-red-200/60">Technical code: {cameraError.code}</p></div></div></div></div>}
      {feedback && <div className="px-5 pb-5 sm:px-6"><p role="status" className={"flex items-start gap-2 rounded-xl border p-4 text-sm leading-5 " + (feedback.ok ? "border-lime-400/30 bg-lime-400/10 text-lime-100" : "border-red-400/30 bg-red-950/40 text-red-100")}>{feedback.ok && <CheckCircle2 size={17} className="mt-0.5 shrink-0"/>}{feedback.message}</p></div>}
      <div className="border-t border-white/10 bg-black/10 px-5 py-3 text-[11px] leading-5 text-slate-400 sm:px-6">Attendance time is generated on the server. Repeated or out-of-order punches are rejected.</div>
    </section>
  );
}
