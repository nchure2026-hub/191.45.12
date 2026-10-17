"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CheckCircle2, LoaderCircle, ShieldCheck, Video, VideoOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { recordEmployeePunch } from "./actions";

export type EmployeePunchType = "check_in" | "break_start" | "break_end" | "check_out";
export type PunchChoice = { type: EmployeePunchType; label: string; description: string };

type Props = {
  companyId: string;
  employeeId: string;
  actions: PunchChoice[];
};

export default function FacePunchCard({ companyId, employeeId, actions }: Props) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream]);

  function describeCameraError(error: unknown) {
    const name = error instanceof DOMException ? error.name : "";
    if (!window.isSecureContext) {
      return "Camera requires a secure HTTPS page. Open the official IAMS employee portal over HTTPS, then try again.";
    }
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return "Browser camera permission is blocked. In Edge/Chrome, click the lock/tune icon beside the address, open Site permissions, set Camera to Allow, then refresh this page. Also check Windows Settings → Privacy & security → Camera → Camera access and Let desktop apps access your camera.";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "No camera was found. Connect/enable a webcam, or open this portal on a phone with a front camera.";
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return "The camera is already being used or blocked by another app. Close Windows Camera, Teams, Zoom, WhatsApp and other tabs using the camera, then try again.";
    }
    if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
      return "The requested front camera is unavailable. Try another camera or use a phone with a front camera.";
    }
    if (name === "SecurityError") {
      return "Browser security settings blocked camera access. Use the HTTPS portal and allow Camera in site settings.";
    }
    if (name === "AbortError") {
      return "Camera startup was interrupted. Wait a moment and press Enable camera again.";
    }
    if (error instanceof Error && error.message) {
      return "Camera error: " + error.message + " Check the browser's camera permission and close any app currently using the camera.";
    }
    return "The camera could not start. Allow Camera for this site, check Windows camera privacy settings, and close other apps using the camera.";
  }

  async function startCamera() {
    setCameraError("");
    setFeedback(null);
    setCameraReady(false);
    let nextStream: MediaStream | null = null;
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera access needs HTTPS and a browser with camera support. Open the official IAMS employee portal in Edge or Chrome.");
        return;
      }
      stream?.getTracks().forEach((track) => track.stop());

      try {
        nextStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "user" }, width: { ideal: 720 }, height: { ideal: 960 } },
          audio: false,
        });
      } catch (firstError) {
        const name = firstError instanceof DOMException ? firstError.name : "";
        if (name === "OverconstrainedError" || name === "NotFoundError") {
          // Fallback for desktops/webcams without a front-facing camera.
          nextStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } else {
          throw firstError;
        }
      }

      const video = videoRef.current;
      if (!video || !nextStream) throw new Error("Camera opened but the preview could not be attached. Refresh the page and try again.");
      video.srcObject = nextStream;
      await new Promise<void>((resolve, reject) => {
        if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
          resolve();
          return;
        }
        const cleanup = () => {
          video.removeEventListener("loadedmetadata", onReady);
          video.removeEventListener("error", onError);
        };
        const onReady = () => { cleanup(); resolve(); };
        const onError = () => { cleanup(); reject(new Error("The camera stream did not load into the preview.")); };
        video.addEventListener("loadedmetadata", onReady, { once: true });
        video.addEventListener("error", onError, { once: true });
      });
      setStream(nextStream);
      await video.play();
      setCameraReady(true);
    } catch (error) {
      nextStream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setStream(null);
      setCameraReady(false);
      setCameraError(describeCameraError(error));
    }
  }

  async function punch(type: EmployeePunchType) {
    if (!videoRef.current || !cameraReady || !consent || busy) return;
    setBusy(true);
    setFeedback(null);
    setCameraError("");
    try {
      const video = videoRef.current;
      if (!video.videoWidth || !video.videoHeight) {
        setCameraError("Camera is still starting. Please wait a moment and try again.");
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(video.videoWidth, 720);
      canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare the photo. Please try again.");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not capture the photo.")), "image/jpeg", 0.82);
      });
      if (blob.size > 2 * 1024 * 1024) throw new Error("Photo is too large. Please try again with normal lighting.");

      const supabase = createClient();
      const dayFolder = new Date().toISOString().slice(0, 10);
      const path = companyId + "/" + employeeId + "/" + dayFolder + "/" + crypto.randomUUID() + ".jpg";
      const { error: uploadError } = await supabase.storage
        .from("attendance-face-captures")
        .upload(path, blob, { contentType: "image/jpeg", cacheControl: "3600", upsert: false });
      if (uploadError) throw new Error(uploadError.message || "Could not save the attendance photo.");

      const result = await recordEmployeePunch(type, path, consent);
      setFeedback(result);
      if (result.ok) {
        stream?.getTracks().forEach((track) => track.stop());
        setStream(null);
        setCameraReady(false);
        if (videoRef.current) videoRef.current.srcObject = null;
        router.refresh();
      }
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Attendance could not be recorded. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-emerald-50 px-5 py-4 sm:px-6">
        <div><h2 className="font-bold text-slate-900">Mark attendance</h2><p className="mt-1 text-xs text-slate-500">A fresh face photo is required for each punch.</p></div>
        <span className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><Camera size={21}/></span>
      </div>
      <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <div className="relative overflow-hidden rounded-2xl bg-slate-950">
            <video ref={videoRef} autoPlay playsInline muted className={"aspect-[4/3] w-full object-cover " + (cameraReady ? "block" : "hidden")} />
            {!cameraReady && <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 px-5 text-center text-white"><span className="rounded-2xl bg-white/10 p-4"><Video size={28}/></span><p className="text-sm font-semibold">Camera is off</p><p className="max-w-xs text-xs leading-5 text-slate-300">Enable your phone's front camera. Keep your face centered and use good lighting.</p></div>}
            {cameraReady && <span className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-xs font-semibold text-white"><span className="h-2 w-2 rounded-full bg-emerald-400"/> Live camera</span>}
          </div>
          <button type="button" onClick={startCamera} disabled={busy} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 px-4 py-3 text-sm font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50">
            {cameraReady ? <><VideoOff size={17}/> Restart camera</> : <><Video size={17}/> Enable camera</>}
          </button>
        </div>
        <div className="flex flex-col">
          <div className="rounded-2xl bg-emerald-50/70 p-4">
            <div className="flex items-start gap-3"><ShieldCheck size={20} className="mt-0.5 shrink-0 text-emerald-700"/><div><p className="text-sm font-bold text-slate-800">Photo privacy notice</p><p className="mt-1 text-xs leading-5 text-slate-600">Your selfie will be stored in a private bucket with this attendance event. Authorized company administrators may access it for attendance review. This is photo capture, not automated facial recognition.</p></div></div>
            <label className="mt-4 flex items-start gap-3 text-xs leading-5 text-slate-700"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-emerald-700"/><span>I consent to capture and store my face photo for this attendance record.</span></label>
          </div>
          <div className="mt-4 space-y-2">
            {actions.length === 0 ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-800">No punch action is currently available. If a previous shift was left open, ask your supervisor to correct it.</div> : actions.map((action) => (
              <button key={action.type} type="button" onClick={() => punch(action.type)} disabled={!cameraReady || !consent || busy} className={"flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-left text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40 " + (action.type === "check_out" ? "bg-slate-800 text-white hover:bg-slate-900" : "bg-[#067647] text-white hover:bg-[#05603a]")}>
                <span className="flex items-center gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15">{busy ? <LoaderCircle className="animate-spin" size={18}/> : <Camera size={17}/>}</span><span>{action.label}<small className="mt-0.5 block font-normal text-white/75">{action.description}</small></span></span>
                <span className="shrink-0">{busy ? "Saving…" : "Record"}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      {(cameraError || feedback) && <div className="px-5 pb-5 sm:px-6">{cameraError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700">{cameraError}</p>}{feedback && <p role="status" className={"flex items-start gap-2 rounded-xl border px-4 py-3 text-sm leading-5 " + (feedback.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700")}>{feedback.ok && <CheckCircle2 size={17} className="mt-0.5 shrink-0"/>}{feedback.message}</p>}</div>}
      <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-[11px] leading-5 text-slate-500 sm:px-6">Attendance time is generated by the server. Repeated or out-of-order punches are rejected.</div>
    </section>
  );
}
