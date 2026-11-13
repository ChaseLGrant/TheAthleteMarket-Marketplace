"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/format";

/**
 * In-browser recorder for coaches.
 *  - getUserMedia + MediaRecorder (MP4 preferred so it plays on iPhone; WebM fallback)
 *  - live preview, countdown ring, auto-stop at MAX, preview, retake
 *  - "upload a video instead" fallback (native camera app on phones)
 *  - direct-to-storage upload with progress, retries with backoff, idempotent submit
 */

const MIN = 10;

type Phase = "intro" | "starting" | "live" | "recording" | "review" | "uploading" | "done" | "error";

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const c = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return c.find((m) => MediaRecorder.isTypeSupported?.(m));
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RecorderProps {
  /** Endpoints: POST {mime,size} → {uploadUrl,path,contentType}; POST {path,durationSeconds,attest,...} */
  uploadUrlEndpoint: string;
  submitEndpoint: string;
  acceptEndpoint?: string;
  recordLabel?: string;
  submitLabel: string;
  /** Checkbox the user must tick before submitting. */
  attestation: ReactNode;
  /** Talking points shown on screen while recording. */
  prompts?: string[];
  target?: [number, number];
  /** Hard stop for the in-browser recorder (seconds). */
  maxSeconds?: number;
  /** Optional short written takeaways (coach evaluations). */
  withTakeaways?: boolean;
  done: ReactNode;
}

const TAKEAWAYS = [
  ["strength", "Top strength", "e.g. Elite first step off the dribble"],
  ["improve", "Biggest thing to work on", "e.g. Finishing with the left hand"],
  ["next", "One next step", "e.g. Add 3 catch-and-shoot clips to your reel"],
] as const;

export function Recorder(props: RecorderProps) {
  const { uploadUrlEndpoint, submitEndpoint, acceptEndpoint, submitLabel, attestation, prompts = [], withTakeaways, done } = props;
  const [TARGET_MIN, TARGET_MAX] = props.target ?? [30, 60];
  const MAX = props.maxSeconds ?? 90;
  const recordLabel = props.recordLabel ?? "● Record my evaluation";
  const [takeaways, setTakeaways] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>("intro");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [attest, setAttest] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [canRecord, setCanRecord] = useState(true);

  const liveRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCanRecord(typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined");
    return () => stopStream();
  }, []);

  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  const stopStream = () => {
    if (timer.current) clearInterval(timer.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const accept = useCallback(() => {
    if (acceptEndpoint) fetch(acceptEndpoint, { method: "POST" }).catch(() => {});
  }, [acceptEndpoint]);

  const openCamera = async (mode = facing) => {
    setError(null);
    setPhase("starting");
    accept();
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      setPhase("live");
      requestAnimationFrame(() => {
        if (liveRef.current) {
          liveRef.current.srcObject = stream;
          liveRef.current.play().catch(() => {});
        }
      });
    } catch (e) {
      const name = (e as DOMException)?.name;
      setError(
        name === "NotAllowedError"
          ? "Camera or microphone access was blocked. Allow access in your browser settings, or upload a video instead."
          : name === "NotFoundError"
            ? "We couldn't find a camera. You can upload a video instead."
            : "Your camera couldn't start. You can upload a video instead.",
      );
      setPhase("intro");
    }
  };

  const flip = async () => {
    const next = facing === "user" ? "environment" : "user";
    setFacing(next);
    await openCamera(next);
  };

  const start = () => {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = pickMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 });
    } catch {
      rec = new MediaRecorder(stream);
    }
    chunks.current = [];
    rec.ondataavailable = (e) => { if (e.data?.size) chunks.current.push(e.data); };
    rec.onstop = () => {
      const secs = (performance.now() - startedAt.current) / 1000;
      const type = (rec.mimeType || mimeType || "video/webm").split(";")[0]!;
      const b = new Blob(chunks.current, { type });
      stopStream();
      setDuration(Math.round(secs * 10) / 10);
      setBlob(b);
      setBlobUrl(URL.createObjectURL(b));
      setPhase("review");
    };
    recRef.current = rec;
    rec.start(1000);
    startedAt.current = performance.now();
    setElapsed(0);
    setPhase("recording");
    timer.current = setInterval(() => {
      const s = (performance.now() - startedAt.current) / 1000;
      setElapsed(s);
      if (s >= MAX) stop();
    }, 200);
  };

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    if (recRef.current?.state === "recording") recRef.current.stop();
  };

  const retake = async () => {
    setBlob(null);
    setBlobUrl(null);
    setDuration(null);
    setAttest(false);
    if (canRecord) await openCamera();
    else setPhase("intro");
  };

  const onFile = (f: File | undefined) => {
    if (!f) return;
    setError(null);
    if (!f.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm|3gp)$/i.test(f.name)) {
      setError("Please choose a video file.");
      return;
    }
    accept();
    stopStream();
    const url = URL.createObjectURL(f);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => setDuration(Number.isFinite(probe.duration) ? Math.round(probe.duration * 10) / 10 : null);
    probe.src = url;
    setBlob(f);
    setBlobUrl(url);
    setPhase("review");
  };

  const upload = async () => {
    if (!blob) return;
    setPhase("uploading");
    setProgress(0);
    setError(null);
    const mime = blob.type || "video/mp4";
    let path: string | null = null;
    try {
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          const t = await post(uploadUrlEndpoint, { mime, size: blob.size });
          await putWithProgress(t.uploadUrl, blob, t.contentType, setProgress);
          path = t.path;
          break;
        } catch (e) {
          if (e instanceof ApiError && e.status < 500 && e.status !== 408) throw e;
          if (attempt === 4) throw e;
          setProgress(0);
          await sleep(1000 * 2 ** attempt);
        }
      }
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          await post(submitEndpoint, {
            path, durationSeconds: duration, attest: true,
            ...(withTakeaways ? { takeaways: { strength: takeaways.strength ?? "", improve: takeaways.improve ?? "", next: takeaways.next ?? "" } } : {}),
          });
          break;
        } catch (e) {
          if (e instanceof ApiError && e.status < 500) throw e;
          if (attempt === 4) throw e;
          await sleep(1000 * 2 ** attempt);
        }
      }
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Please check your connection and try again.");
      setPhase("review");
    }
  };

  // --------------------------------------------------------------- render
  if (phase === "done") {
    return <>{done}</>;
  }

  const pct = Math.min(1, elapsed / TARGET_MAX);
  const inTarget = elapsed >= TARGET_MIN && elapsed <= TARGET_MAX;

  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-xl bg-danger-50 px-4 py-3 text-sm font-medium text-[#7a1717] ring-1 ring-[#f3c4c4]">{error}</p>}

      {(phase === "intro" || phase === "starting") && (
        <div className="space-y-3">
          {canRecord && (
            <button className="btn-primary w-full text-[17px]" onClick={() => openCamera()} disabled={phase === "starting"}>
              {phase === "starting" ? "Starting camera…" : recordLabel}
            </button>
          )}
          <button className={cx(canRecord ? "btn-ghost" : "btn-primary", "w-full")} onClick={() => fileRef.current?.click()}>
            {canRecord ? "Upload a video instead" : "Record or upload a video"}
          </button>
          <input ref={fileRef} type="file" accept="video/*" capture="user" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          <p className="text-center text-xs text-muted">Aim for {TARGET_MIN}–{TARGET_MAX} seconds. You can preview and retake before sending.</p>
        </div>
      )}

      {(phase === "live" || phase === "recording") && (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-2xl bg-black">
            <video ref={liveRef} playsInline muted autoPlay className={cx("aspect-[3/4] w-full object-cover sm:aspect-video", facing === "user" && "-scale-x-100")} />
            {phase === "recording" && (
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-sm font-semibold text-white">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" /> {fmt(elapsed)}
                <span className={cx("text-xs font-medium", inTarget ? "text-green-300" : "text-white/70")}>
                  {elapsed < TARGET_MIN ? `${Math.ceil(TARGET_MIN - elapsed)}s to go` : elapsed <= TARGET_MAX ? "Perfect length" : "Wrap up"}
                </span>
              </div>
            )}
            {phase === "live" && (
              <button onClick={flip} className="absolute right-3 top-3 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white" aria-label="Switch camera">
                ⟲ Flip
              </button>
            )}
            {prompts.length > 0 && (
              <ol className="pointer-events-none absolute inset-x-3 bottom-4 space-y-1 rounded-xl bg-black/55 px-3 py-2 text-[13px] font-medium leading-snug text-white backdrop-blur-sm">
                {prompts.map((t, i) => (
                  <li key={t} className={cx(phase === "recording" && elapsed >= (i * TARGET_MAX) / prompts.length && elapsed < ((i + 1) * TARGET_MAX) / prompts.length ? "text-white" : "text-white/60")}>
                    {i + 1}. {t}
                  </li>
                ))}
              </ol>
            )}
            {phase === "recording" && (
              <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/20">
                <div className={cx("h-full transition-[width]", inTarget ? "bg-green-400" : "bg-white")} style={{ width: `${pct * 100}%` }} />
              </div>
            )}
          </div>
          {phase === "live" ? (
            <button className="btn-primary w-full text-[17px]" onClick={start}>● Start recording</button>
          ) : (
            <button className="btn-navy w-full text-[17px]" onClick={stop} disabled={elapsed < 3}>■ Stop</button>
          )}
          {phase === "live" && (
            <button className="w-full text-sm font-medium text-muted" onClick={() => { stopStream(); setPhase("intro"); }}>Cancel</button>
          )}
        </div>
      )}

      {(phase === "review" || phase === "uploading") && blobUrl && (
        <div className="space-y-4">
          <video src={blobUrl} controls playsInline className="aspect-video w-full rounded-2xl bg-black" />
          <div className="flex items-center justify-between text-sm text-muted">
            <span>{duration ? `${fmt(duration)} long` : "Ready to send"}</span>
            <span>{blob ? `${(blob.size / 1_048_576).toFixed(1)} MB` : ""}</span>
          </div>
          {duration != null && duration < MIN && <p className="text-sm font-medium text-danger">That&apos;s a little short — please aim for at least {TARGET_MIN} seconds.</p>}
          {duration != null && duration > 180 && <p className="text-sm font-medium text-danger">Please keep it under 3 minutes.</p>}

          {withTakeaways && (
            <fieldset className="space-y-3 rounded-xl border border-line p-4">
              <legend className="px-1 text-sm font-semibold">Quick written takeaways <span className="font-normal text-muted">(optional, families love these)</span></legend>
              {TAKEAWAYS.map(([k, label, ph]) => (
                <div key={k}>
                  <label htmlFor={`tk-${k}`} className="label">{label}</label>
                  <input id={`tk-${k}`} className="field" maxLength={200} placeholder={ph} value={takeaways[k] ?? ""} disabled={phase === "uploading"}
                    onChange={(e) => setTakeaways((t) => ({ ...t, [k]: e.target.value }))} />
                </div>
              ))}
            </fieldset>
          )}

          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-surface p-4 text-sm leading-relaxed">
            <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-blue" disabled={phase === "uploading"} />
            <span>{attestation}</span>
          </label>

          {phase === "uploading" ? (
            <div className="space-y-2" aria-live="polite">
              <div className="h-3 overflow-hidden rounded-full bg-line">
                <div className="h-full rounded-full bg-blue transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="text-center text-sm font-medium text-navy">{progress < 1 ? `Uploading… ${Math.round(progress * 100)}%` : "Finishing up…"}</p>
              <p className="text-center text-xs text-muted">Keep this page open.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr]">
              <button className="btn-ghost" onClick={retake}>↺ Retake</button>
              <button className="btn-primary text-[17px]" onClick={upload} disabled={!attest || (duration != null && (duration < MIN || duration > 180))}>
                {submitLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function post(url: string, body: unknown) {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new ApiError("Network problem — retrying…", 503);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "Something went wrong.", res.status);
  return data;
}

function putWithProgress(url: string, blob: Blob, contentType: string, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("x-upsert", "true");
    xhr.setRequestHeader("cache-control", "max-age=3600");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new ApiError(`Upload failed (${xhr.status})`, xhr.status >= 400 && xhr.status < 500 ? 500 : xhr.status)));
    xhr.onerror = () => reject(new ApiError("Network problem during upload", 503));
    xhr.ontimeout = () => reject(new ApiError("Upload timed out", 408));
    xhr.timeout = 15 * 60 * 1000;
    xhr.send(blob);
  });
}
