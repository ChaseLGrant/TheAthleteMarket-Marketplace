"use client";
import { useEffect, useState } from "react";
import type { CampItem, EventItem } from "@/lib/types";
import { cx } from "@/lib/format";

type Kind = "camp" | "event" | "film" | "update" | "level" | "personal";
const TILES: { k: Kind; icon: string; title: string; sub: string }[] = [
  { k: "camp", icon: "⛺", title: "Invite to camp", sub: "Send your camp dates" },
  { k: "event", icon: "📍", title: "I'll be at an event", sub: "Where they can be seen" },
  { k: "film", icon: "🎬", title: "Send more film", sub: "Want to see more" },
  { k: "update", icon: "📈", title: "Keep me updated", sub: "Stay in touch" },
  { k: "level", icon: "🎯", title: "Better fit elsewhere", sub: "Point them to a level" },
  { k: "personal", icon: "✍️", title: "Write a reply", sub: "Your own words" },
];
const LEVELS = ["D1", "D2", "D3", "NAIA", "JUCO"];

export function AnswerForm(p: { token: string; first: string; amount: string | null; camps: CampItem[]; events: EventItem[]; initialKind?: Kind; canPass: boolean }) {
  const [kind, setKind] = useState<Kind | null>(p.initialKind ?? null);
  const [pick, setPick] = useState(0); // index into saved camps/events; -1 = new
  const [item, setItem] = useState<{ name: string; dates: string; location: string; url: string }>({ name: "", dates: "", location: "", url: "" });
  const [save, setSave] = useState(true);
  const [level, setLevel] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "passed">("idle");
  const [error, setError] = useState<string | null>(null);
  // Real browser open (not an email link-scanner): tell the family "Coach just opened your message".
  useEffect(() => {
    fetch(`/api/answer/${p.token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "opened" }) }).catch(() => {});
  }, [p.token]);
  const saved = kind === "camp" ? p.camps : kind === "event" ? p.events : [];
  const useNew = (kind === "camp" || kind === "event") && (pick === -1 || !saved.length);

  async function send(body: Record<string, unknown>) {
    setState("busy"); setError(null);
    const res = await fetch(`/api/answer/${p.token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    if (res?.ok) return setState(body.action === "pass" ? "passed" : "done");
    setError(j?.error ?? "Something went wrong. Please try again."); setState("idle");
  }

  if (state === "done")
    return (
      <div className="rounded-2xl bg-success-50 p-6 text-center ring-1 ring-[#c3e8d2]">
        <p className="text-4xl">✓</p>
        <p className="mt-1 text-lg font-bold">Sent to {p.first}&apos;s family</p>
        {p.amount && <p className="text-sm text-muted">Your {p.amount} is on its way.</p>}
        {(kind === "camp" || kind === "event") && save && useNew && <p className="mt-2 text-xs text-muted">Saved — next time it&apos;s one tap.</p>}
      </div>
    );
  if (state === "passed")
    return <div className="rounded-2xl bg-surface p-6 text-center"><p className="text-lg font-bold">Got it — thanks, Coach.</p><p className="text-sm text-muted">We&apos;ll route it to someone else on your staff.</p></div>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {TILES.map((t) => (
          <button key={t.k} type="button" onClick={() => { setKind(t.k); setPick(0); setError(null); }} aria-pressed={kind === t.k}
            className={cx("flex min-h-24 flex-col items-start rounded-2xl border p-3 text-left transition", kind === t.k ? "border-blue bg-blue-50 ring-2 ring-blue/20" : "border-line hover:bg-surface")}>
            <span aria-hidden className="text-2xl">{t.icon}</span>
            <span className="mt-1 text-sm font-semibold leading-tight text-navy">{t.title}</span>
            <span className="text-xs text-muted">{t.sub}</span>
          </button>
        ))}
      </div>

      {kind && (
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          const chosen = useNew ? { name: item.name, dates: item.dates, location: item.location || undefined, url: kind === "camp" ? item.url || undefined : undefined } : saved[pick];
          send({ action: "answer", kind, note: note || undefined, level: kind === "level" ? level : undefined, save: useNew && save,
            camp: kind === "camp" ? chosen : undefined, event: kind === "event" ? chosen : undefined });
        }}>
          {(kind === "camp" || kind === "event") && (
            <div className="space-y-2">
              {saved.map((c, i) => (
                <label key={i} className={cx("flex cursor-pointer items-center gap-3 rounded-xl border p-3", pick === i ? "border-blue bg-blue-50" : "border-line")}>
                  <input type="radio" checked={pick === i} onChange={() => setPick(i)} className="accent-blue" />
                  <span className="min-w-0"><span className="block font-semibold">{c.name}</span><span className="block text-xs text-muted">{[c.dates, c.location].filter(Boolean).join(" · ")}</span></span>
                </label>
              ))}
              {saved.length > 0 && (
                <label className={cx("flex cursor-pointer items-center gap-3 rounded-xl border p-3", pick === -1 ? "border-blue bg-blue-50" : "border-line")}>
                  <input type="radio" checked={pick === -1} onChange={() => setPick(-1)} className="accent-blue" /><span className="font-semibold">+ A different {kind}</span>
                </label>
              )}
              {useNew && (
                <div className="grid grid-cols-1 gap-3 rounded-2xl bg-surface p-4 sm:grid-cols-2">
                  <F label={kind === "camp" ? "Camp name" : "Event name"} v={item.name} on={(name) => setItem({ ...item, name })} ph={kind === "camp" ? "Elite Prospect Camp" : "Nike EYBL Session 2"} />
                  <F label="Dates" v={item.dates} on={(dates) => setItem({ ...item, dates })} ph="June 14–15" />
                  <F label="Location (optional)" v={item.location} on={(location) => setItem({ ...item, location })} ph="On campus" />
                  {kind === "camp" && <F label="Sign-up link (optional)" v={item.url} on={(url) => setItem({ ...item, url })} ph="https://…" />}
                  <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="h-4 w-4 accent-blue" />Save it so next time it&apos;s one tap</label>
                </div>
              )}
            </div>
          )}
          {kind === "level" && (
            <div className="flex flex-wrap gap-2">
              {LEVELS.map((l) => (
                <button key={l} type="button" onClick={() => setLevel(l)} className={cx("min-h-11 min-w-16 rounded-full border px-4 font-semibold", level === l ? "border-blue bg-blue text-white" : "border-line")}>{l}</button>
              ))}
            </div>
          )}
          <div>
            <label htmlFor="note" className="label">{kind === "personal" ? "Your reply" : "Add a note (optional)"}</label>
            <textarea id="note" rows={kind === "personal" ? 5 : 2} maxLength={3000} value={note} onChange={(e) => setNote(e.target.value)} className="field"
              placeholder={kind === "personal" ? `Hi — thanks for reaching out about ${p.first}…` : "e.g. Liked the footwork at 0:42."} />
          </div>
          {error && <p className="field-error" role="alert">{error}</p>}
          <button className="btn-primary w-full text-[17px]" disabled={state === "busy"}>{state === "busy" ? "Sending…" : p.amount ? `Send answer & earn ${p.amount}` : "Send answer"}</button>
        </form>
      )}

      {p.canPass && (
        <button type="button" onClick={() => send({ action: "pass" })} disabled={state === "busy"} className="w-full text-center text-sm font-medium text-muted underline-offset-2 hover:underline">
          Not the right person? Pass it to someone else on staff
        </button>
      )}
    </div>
  );
}

function F({ label, v, on, ph }: { label: string; v: string; on: (v: string) => void; ph?: string }) {
  return <div className="min-w-0"><label className="label">{label}<input value={v} onChange={(e) => on(e.target.value)} placeholder={ph} className="field mt-1" /></label></div>;
}
