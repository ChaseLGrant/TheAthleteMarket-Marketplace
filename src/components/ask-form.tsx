"use client";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { submitAsk, type FormState } from "@/app/actions";
import { askPricing } from "@/lib/ask-pricing";
import { cx } from "@/lib/format";
import { AskBox, type Target } from "./ask-box";
import { FilmTip } from "./film-tip";

const TOPICS = [
  { key: "camp", label: "Camp dates", line: "Do you have any camps coming up where you could see me in person?" },
  { key: "event", label: "Events you'll attend", line: "Which showcases or tournaments will your staff be at this season?" },
  { key: "level", label: "What level I fit", line: "Based on my film, what level do you think I fit best?" },
  { key: "film", label: "Is my film enough?", line: "Is there anything else you'd want to see on film?" },
] as const;

const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: 9 }, (_, i) => thisYear + i - 1);
const dollars = (c: number) => "$" + (c % 100 ? (c / 100).toFixed(2) : c / 100);

export function AskForm(p: {
  prices: Record<string, number>; escalateHours: number; deadlineDays: number;
  initialTargets?: Target[]; prefill?: Record<string, string>; draftToken?: string; free?: boolean; sms?: boolean; inbound?: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitAsk, {});
  const v = state.values ?? p.prefill ?? {};
  const [targets, setTargets] = useState<Target[]>(() => {
    try { return v.targets ? (JSON.parse(v.targets) as Target[]) : p.initialTargets ?? []; } catch { return p.initialTargets ?? []; }
  });
  const [topics, setTopics] = useState<string[]>(v.message ? [] : ["camp"]);
  const [athlete, setAthlete] = useState(v.athleteName ?? "");
  const [grad, setGrad] = useState(v.gradYear ?? String(thisYear + 2));
  const [position, setPosition] = useState(v.position ?? "");
  const [sport, setSport] = useState(v.sport ?? targets[0]?.sport ?? "");
  const [film, setFilm] = useState(v.filmUrl ?? "");
  const [phone, setPhone] = useState(v.purchaserPhone ?? "");
  const [minor, setMinor] = useState<"yes" | "no">((v.athleteIsMinor as "yes" | "no") ?? "yes");
  const [edited, setEdited] = useState<string | null>(v.message ?? null);
  const err = state.fields ?? {};
  const formRef = useRef<HTMLFormElement>(null);
  // After a failed Send, jump to the first problem so it never looks like "nothing happened".
  useEffect(() => {
    if (!state.error) return;
    const f = formRef.current;
    const first = f?.querySelector<HTMLElement>('[aria-invalid="true"], .field-error') ?? f?.querySelector<HTMLElement>('[role="status"]');
    first?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (first instanceof HTMLInputElement || first instanceof HTMLTextAreaElement) first.focus({ preventScroll: true });
  }, [state]);

  const auto = useMemo(() => {
    const who = athlete.trim() || "[athlete]";
    const lines = TOPICS.filter((t) => topics.includes(t.key)).map((t) => t.line);
    return `Hi Coach — I'm reaching out about ${who}, a ${grad} ${position.trim() || "[position]"}${sport ? ` (${sport.replace(/\s*\([MW]\)$/i, "").toLowerCase()})` : ""}. My film is linked below. ${lines.join(" ") || "I'd love your honest take."} Thank you for your time!`;
  }, [athlete, grad, position, sport, topics]);
  const message = edited ?? auto;
  const n = targets.length;
  const price = askPricing(p.prices, Math.max(1, n));
  const single = askPricing(p.prices, 1).total;

  const add = (t: Target) => {
    if (targets.length >= 5) return;
    if (targets.some((x) => (x.coachSlug && x.coachSlug === t.coachSlug) || (!x.coachSlug && !t.coachSlug && x.label === t.label && x.sport === t.sport))) return;
    setTargets([...targets, t]);
    if (!sport && t.sport) setSport(t.sport);
  };

  return (
    <form ref={formRef} action={action} className="space-y-8" noValidate>
      <input type="hidden" name="targets" value={JSON.stringify(targets.map(({ coachSlug, school, sport }) => ({ coachSlug, school, sport })))} />
      <input type="hidden" name="message" value={message} />
      <input type="hidden" name="draftToken" value={p.draftToken ?? ""} />
      <div className="hidden" aria-hidden><label>Company <input name="company" tabIndex={-1} autoComplete="off" /></label></div>

      {state.error && <div role="alert" className="rounded-xl bg-danger-50 px-4 py-3 text-sm font-medium text-[#7a1717] ring-1 ring-[#f3c4c4]">{state.error}</div>}

      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold">1. Which colleges?</legend>
        {targets.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {targets.map((t, i) => (
              <li key={i} className="flex max-w-full items-center gap-2 rounded-full bg-navy py-1.5 pl-4 pr-1.5 text-sm text-white">
                <span className="min-w-0 truncate"><strong>{t.label}</strong>{t.sub ? <span className="text-white/70"> · {t.sub}</span> : null}</span>
                <button type="button" onClick={() => setTargets(targets.filter((_, j) => j !== i))} aria-label={`Remove ${t.label}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/15 hover:bg-white/25">×</button>
              </li>
            ))}
          </ul>
        )}
        {n < 5 ? <AskBox onPick={add} placeholder={n ? "Add another college (up to 5)" : undefined} autoFocus={!n} /> : <p className="hint">That&apos;s the max — 5 schools per message.</p>}
        {err.targets && <p className="field-error">{err.targets}</p>}
        <p className="hint">Pick a school and we route your message to the right person on that staff. If they don&apos;t answer within {p.escalateHours} hours, it goes to the next coach.</p>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold">2. About the athlete</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <In label="Athlete's full name" name="athleteName" value={athlete} onChange={setAthlete} error={err.athleteName} autoComplete="off" />
          <In label="Sport" name="sport" value={sport} onChange={setSport} error={err.sport} placeholder="e.g. Basketball" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <In label="Position" name="position" value={position} onChange={setPosition} error={err.position} placeholder="e.g. PG, WR, RHP" />
          <div>
            <label htmlFor="gradYear" className="label">Grad year</label>
            <select id="gradYear" name="gradYear" className="field" value={grad} onChange={(e) => setGrad(e.target.value)}>{YEARS.map((y) => <option key={y}>{y}</option>)}</select>
          </div>
        </div>
        <div>
          <label htmlFor="filmUrl" className="label">Film link</label>
          <input id="filmUrl" name="filmUrl" type="url" inputMode="url" value={film} onChange={(e) => setFilm(e.target.value)} placeholder="https://www.hudl.com/… or https://youtu.be/…"
            className={cx("field", err.filmUrl && "border-danger")} aria-invalid={!!err.filmUrl} />
          {err.filmUrl ? <p className="field-error">{err.filmUrl}</p> : <FilmTip url={film} />}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold">3. What do you want to know?</legend>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((t) => {
            const on = topics.includes(t.key);
            return (
              <button key={t.key} type="button" aria-pressed={on} onClick={() => { setEdited(null); setTopics(on ? topics.filter((x) => x !== t.key) : [...topics, t.key]); }}
                className={cx("min-h-11 rounded-full border px-4 text-sm font-semibold transition", on ? "border-blue bg-blue text-white" : "border-line text-navy hover:bg-surface")}>
                {on ? "✓ " : "+ "}{t.label}
              </button>
            );
          })}
        </div>
        <label htmlFor="msg" className="label">Your message <span className="font-normal text-muted">(we wrote it for you — edit anything)</span></label>
        <textarea id="msg" rows={5} maxLength={1500} value={message} onChange={(e) => setEdited(e.target.value)} className={cx("field", err.message && "border-danger")} />
        {err.message && <p className="field-error">{err.message}</p>}
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold">4. Where should the answer go?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["yes", "no"] as const).map((o) => (
            <label key={o} className={cx("flex min-h-12 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold", minor === o ? "border-blue bg-blue-50 text-blue" : "border-line text-navy hover:bg-surface")}>
              <input type="radio" name="athleteIsMinor" value={o} checked={minor === o} onChange={() => setMinor(o)} className="sr-only" />
              {o === "yes" ? "Athlete is under 18" : "Athlete is 18+"}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <In label={minor === "yes" ? "Parent/guardian name" : "Your name"} name="purchaserName" defaultValue={v.purchaserName} error={err.purchaserName} autoComplete="name" />
          <In label="Email" name="purchaserEmail" type="email" defaultValue={v.purchaserEmail} error={err.purchaserEmail} autoComplete="email" hint={p.inbound ? "Answers land here. Reply to keep the conversation going." : "Answers land here."} />
        </div>
        {p.sms !== false && <div>
          <label htmlFor="purchaserPhone" className="label">Mobile — get a text the second a coach answers</label>
          <input id="purchaserPhone" name="purchaserPhone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" className="field" />
          {phone.trim() && (
            <label className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-muted">
              <input type="checkbox" name="parentSmsConsent" defaultChecked className="mt-0.5 h-4 w-4 shrink-0 accent-blue" />
              <span>Text me when coaches open and answer. You can text back to reply to the coach. Msg &amp; data rates may apply. Reply STOP to opt out.</span>
            </label>
          )}
        </div>}
      </fieldset>

      <fieldset className="space-y-3 rounded-2xl bg-surface p-4">
        {minor === "yes" && (
          <Check name="guardianConsent" error={err.guardianConsent}>I&apos;m the athlete&apos;s parent or legal guardian and I consent to sharing these details with the coaches I picked.</Check>
        )}
        <Check name="acceptTerms" error={err.acceptTerms}>
          I agree to the <a href="/legal/terms" target="_blank" className="font-semibold text-blue underline">Terms</a> and <a href="/legal/privacy" target="_blank" className="font-semibold text-blue underline">Privacy Policy</a>. An answer is a coach&apos;s reply — not an offer or roster spot.
        </Check>
      </fieldset>

      <div className="space-y-3">
        {state.error && (
          <div role="status" className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-[#7a1717] ring-1 ring-[#f3c4c4]">
            <p className="font-semibold">{state.error}</p>
            {Object.keys(err).length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {Object.entries(err).map(([k, m]) => <li key={k}>{m}</li>)}
              </ul>
            )}
          </div>
        )}
        {!p.free && <div className="flex items-baseline justify-between rounded-2xl border border-line px-4 py-3">
          <span className="text-sm text-muted">{n || 1} school{n === 1 || !n ? "" : "s"}{n >= 3 ? <span className="ml-2 rounded-full bg-success-50 px-2 py-0.5 text-xs font-semibold text-success">save {dollars(single * n - price.total)}</span> : null}</span>
          <span className="text-xl font-bold">{dollars(price.total)}</span>
        </div>}
        <button className="btn-primary w-full text-[17px]" disabled={pending || !n}>
          {pending ? (p.free ? "Sending…" : "Opening secure checkout…") : n ? `Send to ${n} school${n === 1 ? "" : "s"}${p.free ? "" : ` · ${dollars(price.total)}`}` : "Pick a school to continue"}
        </button>
        {p.free ? (
          <p className="text-center text-xs leading-relaxed text-muted">We&apos;ll email{phone.trim() ? " and text" : ""} you the moment a coach opens it and the moment they answer.</p>
        ) : <p className="text-center text-xs leading-relaxed text-muted">
          <strong>Answered or it&apos;s free.</strong> We save your card and only charge each school when a coach there answers. No answer in {p.deadlineDays} days = $0 for that school.
        </p>}
      </div>
    </form>
  );
}

function In(p: { label: string; name: string; value?: string; defaultValue?: string; onChange?: (v: string) => void; error?: string; hint?: string; type?: string; placeholder?: string; autoComplete?: string }) {
  return (
    <div className="min-w-0">
      <label htmlFor={p.name} className="label">{p.label}</label>
      <input id={p.name} name={p.name} type={p.type ?? "text"} placeholder={p.placeholder} autoComplete={p.autoComplete} aria-invalid={!!p.error}
        {...(p.onChange ? { value: p.value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => p.onChange!(e.target.value) } : { defaultValue: p.defaultValue })}
        className={cx("field", p.error && "border-danger")} />
      {p.error ? <p className="field-error">{p.error}</p> : p.hint ? <p className="hint">{p.hint}</p> : null}
    </div>
  );
}

function Check({ name, error, children }: { name: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-navy">
        <input type="checkbox" name={name} className="mt-1 h-5 w-5 shrink-0 accent-blue" aria-invalid={!!error} />
        <span>{children}</span>
      </label>
      {error && <p className="field-error ml-8">{error}</p>}
    </div>
  );
}
