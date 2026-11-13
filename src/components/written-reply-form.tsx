"use client";
import { useState } from "react";

const FIELDS = [
  ["level", "Level I see them at", "e.g. Strong D2, fringe D1"],
  ["strength", "Top strength", "e.g. Elite first step, plays downhill"],
  ["improve", "What to work on", "e.g. Left-hand finishing"],
  ["next", "Next step", "e.g. Add 6 catch-and-shoot clips to the reel"],
] as const;

/** Fallback for coaches on desktop webmail where "Reply" links don't open an email app. */
export function WrittenReplyForm({ token, amount, first }: { token: string; amount: string; first: string }) {
  const [v, setV] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  if (state === "done")
    return (
      <div className="rounded-2xl bg-success-50 p-5 text-center ring-1 ring-[#c3e8d2]">
        <p className="text-3xl">✓</p>
        <p className="mt-1 font-bold">Sent to {first}&apos;s family</p>
        <p className="text-sm text-muted">Your {amount} is on its way via Stripe.</p>
      </div>
    );
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("busy");
        setError(null);
        const res = await fetch(`/api/coach/${token}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) }).catch(() => null);
        if (res?.ok) return setState("done");
        setError((await res?.json().catch(() => ({})))?.error ?? "Something went wrong. Please try again.");
        setState("idle");
      }}
    >
      {FIELDS.map(([k, label, ph]) => (
        <div key={k}>
          <label htmlFor={`wr-${k}`} className="label">{label}</label>
          <input id={`wr-${k}`} className="field" maxLength={300} placeholder={ph} value={v[k] ?? ""} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} />
        </div>
      ))}
      <div>
        <label htmlFor="wr-extra" className="label">Anything else (optional)</label>
        <textarea id="wr-extra" className="field" rows={3} maxLength={3000} value={v.extra ?? ""} onChange={(e) => setV((x) => ({ ...x, extra: e.target.value }))} />
      </div>
      {error && <p className="field-error">{error}</p>}
      <button className="btn-primary w-full" disabled={state === "busy"}>{state === "busy" ? "Sending…" : `Send & claim ${amount}`}</button>
    </form>
  );
}
