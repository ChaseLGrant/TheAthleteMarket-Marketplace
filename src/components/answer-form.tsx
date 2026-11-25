"use client";
import { useEffect, useMemo, useState } from "react";
import type { CampItem, EventItem } from "@/lib/types";
import { cx } from "@/lib/format";
import { grade, phrasesFor, toolsFor } from "@/lib/coach-take";

type Kind = "camp" | "event" | "film" | "level" | "update";
const ANSWERS: { k: Kind; icon: string; title: string; sub: string }[] = [
  { k: "camp", icon: "🏕️", title: "Come to our camp", sub: "Share camp dates + sign-up link" },
  { k: "event", icon: "📍", title: "We want to see you play more", sub: "A showcase or tournament we'll be at" },
  { k: "film", icon: "🎬", title: "What I need to see", sub: "More film before I can evaluate" },
  { k: "level", icon: "🎯", title: "Honest level fit", sub: "Where they fit best right now" },
  { k: "update", icon: "🤝", title: "Stay in touch", sub: "Keep me updated after the season" },
];
const LEVELS = ["D1", "D2", "D3", "NAIA", "JUCO"];
const SUMMARY: Record<Kind, string> = {
  camp: "Camp invitation", event: "Where we'll be", film: "Film request", level: "Honest level read", update: "Keep in touch",
};

export function AnswerForm(p: {
  token: string; first: string; amount: string | null; camps: CampItem[]; events: EventItem[]; initialKind?: string; canPass: boolean;
  payoutUrl?: string | null; sport: string; position: string; coachLast: string;
}) {
  const phrases = useMemo(() => phrasesFor(p.sport), [p.sport]);
  const tools = useMemo(() => toolsFor(p.sport, p.position), [p.sport, p.position]);
  const [kind, setKind] = useState<Kind | null>((ANSWERS.find((a) => a.k === p.initialKind)?.k) ?? null);
  const [pick, setPick] = useState(0); // index into saved camps/events; -1 = new
  const [item, setItem] = useState({ name: "", dates: "", location: "", url: "" });
  const [save, setSave] = useState(true);
  const [level, setLevel] = useState("");
  // Report card: tool key → 1–10, or null = "can't tell from film". Missing key = not answered yet.
  const [scores, setScores] = useState<Record<string, number | null>>({});
  const [liked, setLiked] = useState("");
  const [workOn, setWorkOn] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "passed">("idle");
  const [error, setError] = useState<string | null>(null);

  // Real browser open (not an email link-scanner): tell the family "Coach just opened your message".
  useEffect(() => {
    fetch(`/api/answer/${p.token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "opened" }) }).catch(() => {});
  }, [p.token]);

  const saved = kind === "camp" ? p.camps : kind === "event" ? p.events : [];
  const useNew = (kind === "camp" || kind === "event") && (pick === -1 || !saved.length);
  const detailOk = kind === "camp" || kind === "event" ? (useNew ? item.name.trim().length > 1 && item.dates.trim().length > 1 : true) : kind === "level" ? !!level : true;
  const answered = tools.filter((t) => t.key in scores).length;
  const rated = tools.filter((t) => typeof scores[t.key] === "number").length;
  const reportOk = answered === tools.length && rated * 2 >= tools.length;
  const ready = reportOk && !!kind && detailOk && liked.trim().length >= 3 && workOn.trim().length >= 3;
  const chosen = useNew ? item : saved[pick];

  const addPhrase = (cur: string, set: (v: string) => void, ph: string) => {
    if (cur.toLowerCase().includes(ph.toLowerCase())) return;
    set(cur.trim() ? `${cur.trim().replace(/[.]$/, "")}. ${ph}` : ph);
  };

  async function send(body: Record<string, unknown>) {
    setState("busy"); setError(null);
    const res = await fetch(`/api/answer/${p.token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = await res?.json().catch(() => ({}));
    if (res?.ok) return setState(body.action === "pass" ? "passed" : "done");
    setError(j?.error ?? "Something went wrong. Please try again."); setState("idle");
  }

  function submit() {
    if (!kind || !ready) return;
    const it = chosen ? { name: chosen.name, dates: chosen.dates, location: chosen.location || undefined, url: kind === "camp" ? (chosen as CampItem).url || undefined : undefined } : undefined;
    send({
      action: "answer", kind, note: note.trim() || undefined, level: kind === "level" ? level : undefined, save: useNew && save,
      camp: kind === "camp" ? it : undefined, event: kind === "event" ? it : undefined,
      liked: liked.trim(), workOn: workOn.trim(), scores,
    });
  }

  if (state === "done")
    return (
      <div className="rounded-2xl bg-success-50 p-6 text-center ring-1 ring-[#c3e8d2]">
        <p className="text-4xl">✓</p>
        <p className="mt-1 text-lg font-bold">Sent to {p.first}&apos;s family</p>
        <p className="mt-1 text-sm text-muted">They&apos;ll get your report card, your take and a game plan — signed by you.</p>
        {p.amount && (p.payoutUrl
          ? <>
              <p className="mt-3 text-sm text-muted">You earned <strong className="text-navy">{p.amount}</strong>. One quick step to get it:</p>
              <a href={p.payoutUrl} className="btn-primary mt-3 w-full">Set up payouts to get your {p.amount} (3 min)</a>
              <p className="mt-2 text-xs text-muted">Secure setup with Stripe. Your money is held safely until you finish — and every future answer pays you automatically.</p>
            </>
          : <p className="mt-2 text-sm text-muted">Your {p.amount} is on its way to your bank.</p>)}
        {(kind === "camp" || kind === "event") && save && useNew && <p className="mt-2 text-xs text-muted">Saved — next time it&apos;s one tap.</p>}
      </div>
    );
  if (state === "passed")
    return <div className="rounded-2xl bg-surface p-6 text-center"><p className="text-lg font-bold">Got it — thanks, Coach.</p><p className="text-sm text-muted">We&apos;ll route it to someone else on your staff.</p></div>;

  return (
    <div className="space-y-7">
      {/* Step 1 — report card (required: rate every tool, or "can't tell") */}
      <section className="space-y-3">
        <h3 className="text-base font-bold"><span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-blue text-xs text-white">1</span>{p.first}&apos;s report card</h3>
        <p className="hint -mt-1">Rate each from 1–10 against college players at this position. Can&apos;t tell from the film? Tap “?”.</p>
        {tools.map((t) => (
          <div key={t.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">{t.label}</span>
              <span className="text-xs text-muted">{typeof scores[t.key] === "number" ? `${scores[t.key]}/10 · ${grade(scores[t.key] as number)}` : scores[t.key] === null ? "Can't tell from film" : ""}</span>
            </div>
            <div className="grid grid-cols-11 gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <button key={n} type="button" aria-label={`${t.label} ${n} of 10`} onClick={() => setScores({ ...scores, [t.key]: n })}
                  className={cx("h-9 rounded-md border text-xs font-semibold", typeof scores[t.key] === "number" && (scores[t.key] as number) >= n ? "border-blue bg-blue text-white" : "border-line text-muted")}>{n}</button>
              ))}
              <button type="button" aria-label={`${t.label}: can't tell from film`} onClick={() => setScores({ ...scores, [t.key]: null })}
                className={cx("h-9 rounded-md border text-xs font-semibold", scores[t.key] === null ? "border-navy bg-navy text-white" : "border-line text-muted")}>?</button>
            </div>
          </div>
        ))}
      </section>

      {/* Step 2 — your take (required, fast with tap-to-add) */}
      <section className="space-y-4">
        <h3 className="text-base font-bold"><span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-blue text-xs text-white">2</span>Be specific: your take on {p.first}</h3>
        <Take label="👍 What stood out" value={liked} set={setLiked} chips={phrases.liked} onChip={(ph) => addPhrase(liked, setLiked, ph)} ph={`e.g. ${phrases.liked[0]} — liked the play at 0:42`} />
        <Take label="🎯 What to work on" value={workOn} set={setWorkOn} chips={phrases.work} onChip={(ph) => addPhrase(workOn, setWorkOn, ph)} ph={`e.g. ${phrases.work[0]}`} />
      </section>

      {/* Step 3 — the actionable next step */}
      <section className="space-y-3">
        <h3 className="text-base font-bold"><span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-blue text-xs text-white">3</span>What should {p.first} do next?</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ANSWERS.map((a) => (
            <button key={a.k} type="button" onClick={() => { setKind(a.k); setPick(0); setError(null); }} aria-pressed={kind === a.k}
              className={cx("flex items-center gap-3 rounded-2xl border p-3 text-left transition", kind === a.k ? "border-blue bg-blue-50 ring-2 ring-blue/20" : "border-line hover:bg-surface")}>
              <span aria-hidden className="text-2xl">{a.icon}</span>
              <span className="min-w-0"><span className="block font-semibold leading-tight text-navy">{a.title}</span><span className="block text-xs text-muted">{a.sub}</span></span>
            </button>
          ))}
        </div>
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
                <F label={kind === "camp" ? "Camp name" : "Event name"} v={item.name} on={(name) => setItem({ ...item, name })} ph={kind === "camp" ? "Elite Prospect Camp" : "Summer Showcase"} />
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
      </section>

      <div>
        <label htmlFor="note" className="label">Anything else for the family? <span className="font-normal text-muted">(optional)</span></label>
        <textarea id="note" rows={2} maxLength={1500} value={note} onChange={(e) => setNote(e.target.value)} className="field" placeholder="A sentence in your own words goes a long way." />
      </div>

      {/* Preview — exactly what the family gets */}
      {(kind || rated > 0 || liked) && (
        <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-subtle">What {p.first}&apos;s family receives</p>
          <p className="mt-2 font-semibold">{kind ? SUMMARY[kind] : "Next step: (pick one)"}{kind && kind === "level" && level ? `: better fit at ${level}` : (kind === "camp" || kind === "event") && chosen?.name ? `: ${chosen.name}${chosen.dates ? ` (${chosen.dates})` : ""}` : ""}</p>
          {liked && <p className="mt-1">👍 <strong>What stood out:</strong> {liked}</p>}
          {workOn && <p className="mt-1">🎯 <strong>What to work on:</strong> {workOn}</p>}
          {rated > 0 && (
            <p className="mt-1 text-muted">Report card: {tools.filter((t) => typeof scores[t.key] === "number").map((t) => `${t.label} ${scores[t.key]}/10`).join(" · ")}</p>
          )}
          <p className="mt-2 text-xs text-muted">Plus next steps and a season game plan — all signed “Coach {p.coachLast}”.</p>
        </div>
      )}

      {error && <p className="field-error" role="alert">{error}</p>}
      <button type="button" onClick={submit} disabled={!ready || state === "busy"} className="btn-primary w-full text-[17px] disabled:opacity-50">
        {state === "busy" ? "Sending…" : ready ? `Send to ${p.first}'s family${p.amount ? ` & get paid ${p.amount}` : ""}` : !reportOk ? `Finish the report card (${answered}/${tools.length})` : liked.trim().length < 3 || workOn.trim().length < 3 ? "Add what stood out + what to work on" : !kind ? "Pick the next step" : "Add the details above"}
      </button>
      <p className="text-center text-xs text-subtle">General guidance only — please don&apos;t make offers or promises here.</p>

      {p.canPass && (
        <button type="button" onClick={() => send({ action: "pass" })} disabled={state === "busy"} className="w-full text-center text-sm font-medium text-muted underline-offset-2 hover:underline">
          Not the right person? Pass it to someone else on staff
        </button>
      )}
    </div>
  );
}

function Take({ label, value, set, chips, onChip, ph }: { label: string; value: string; set: (v: string) => void; chips: string[]; onChip: (c: string) => void; ph: string }) {
  return (
    <div className="space-y-2">
      <p className="label">{label} <span className="font-normal text-muted">— tap to add, then edit</span></p>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button key={c} type="button" onClick={() => onChip(c)} className={cx("rounded-full border px-3 py-1.5 text-sm", value.toLowerCase().includes(c.toLowerCase()) ? "border-blue bg-blue-50 text-blue" : "border-line text-navy hover:bg-surface")}>+ {c}</button>
        ))}
      </div>
      <textarea rows={2} maxLength={500} value={value} onChange={(e) => set(e.target.value)} className="field" placeholder={ph} aria-label={label} />
    </div>
  );
}

function F({ label, v, on, ph }: { label: string; v: string; on: (v: string) => void; ph?: string }) {
  return <div className="min-w-0"><label className="label">{label}<input value={v} onChange={(e) => on(e.target.value)} placeholder={ph} className="field mt-1" /></label></div>;
}
