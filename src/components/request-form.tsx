"use client";
import { useActionState, useState } from "react";
import { submitRequest, type FormState } from "@/app/actions";
import { cx } from "@/lib/format";
import { FilmTip } from "./film-tip";

interface Props {
  coachSlug: string;
  coachFirstName: string;
  sport: string;
  priceLabel: string;
  deadlineDays: number;
  utmSource?: string;
  utmCampaign?: string;
  /** Second-opinion: signed token + the original request's details to pre-fill. */
  fromToken?: string;
  prefill?: Record<string, string>;
  /** When the coach hasn't set a price, the family picks an offer from these tiers. */
  offerTiers?: number[];
  /** Coach has joined (vs. we'll email them the request). */
  joined?: boolean;
  /** Price per reply format, in cents. */
  formatPrices: { written: number; voice: number; video: number };
  defaultFormat?: "written" | "voice" | "video";
}

const FORMATS = [
  { key: "written", icon: "✍️", title: "Written take", sub: "Level read + strengths, fixes, next step" },
  { key: "voice", icon: "🎙️", title: "Voice note", sub: "1–2 min, in the coach's own voice" },
  { key: "video", icon: "🎥", title: "Video breakdown", sub: "30–60 sec personal video" },
] as const;

const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: 9 }, (_, i) => thisYear + i - 1);

export function RequestForm(p: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitRequest, {});
  const v = state.values ?? p.prefill ?? {};
  const [film, setFilm] = useState(v.filmUrl ?? "");
  const tiers = p.offerTiers ?? [];
  const [format, setFormat] = useState<"written" | "voice" | "video">((v.format as "written") ?? p.defaultFormat ?? "written");
  const [phone, setPhone] = useState(v.purchaserPhone ?? "");
  const [offer, setOffer] = useState<number>(Number(v.offerCents) || tiers[Math.floor(tiers.length / 2)] || 0);
  const dollars = (c: number) => "$" + c / 100;
  const priceText = dollars(p.formatPrices[format]);
  const err = state.fields ?? {};
  const [minor, setMinor] = useState<"yes" | "no">((v.athleteIsMinor as "yes" | "no") ?? "yes");
  const [rel, setRel] = useState(v.relationship ?? "parent_guardian");
  const [more, setMore] = useState(!!(v.metrics || v.gpa || v.message));
  const effectiveRel = minor === "yes" ? "parent_guardian" : rel;

  return (
    <form action={action} className="space-y-8" noValidate>
      <input type="hidden" name="coachSlug" value={p.coachSlug} />
      <input type="hidden" name="relationship" value={effectiveRel} />
      <input type="hidden" name="utmSource" value={p.utmSource ?? ""} />
      <input type="hidden" name="utmCampaign" value={p.utmCampaign ?? ""} />
      <input type="hidden" name="fromToken" value={p.fromToken ?? ""} />
      <input type="hidden" name="format" value={format} />
      <div className="hidden" aria-hidden>
        <label>Company <input name="company" tabIndex={-1} autoComplete="off" /></label>
      </div>

      {state.error && (
        <div role="alert" className="rounded-xl bg-danger-50 px-4 py-3 text-sm font-medium text-[#7a1717] ring-1 ring-[#f3c4c4]">
          {state.error}
        </div>
      )}

      <fieldset className="space-y-3">
        <legend className="text-lg font-semibold">What would you like from Coach {p.coachFirstName}?</legend>
        <div className="grid grid-cols-1 gap-2">
          {FORMATS.map((f) => (
            <label key={f.key} className={cx("flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition", format === f.key ? "border-blue bg-blue-50 ring-2 ring-blue/20" : "border-line hover:bg-surface")}>
              <input type="radio" name="_format" checked={format === f.key} onChange={() => setFormat(f.key)} className="sr-only" />
              <span aria-hidden className="text-2xl">{f.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-navy">{f.title}</span>
                <span className="block text-sm text-muted">{f.sub}</span>
              </span>
              <span className="text-lg font-bold text-navy">{dollars(p.formatPrices[f.key])}</span>
            </label>
          ))}
        </div>
        <p className="hint">Every reply includes the coach&apos;s read on what level they see your athlete at.</p>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold">The athlete</legend>
        <Field label="Athlete's full name" name="athleteName" error={err.athleteName} defaultValue={v.athleteName} autoComplete="off" required />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Sport" name="sport" error={err.sport} defaultValue={v.sport ?? p.sport} required />
          <Field label="Position" name="position" error={err.position} defaultValue={v.position} placeholder="e.g. PG, WR, CB" required />
          <div>
            <label htmlFor="gradYear" className="label">Grad year</label>
            <select id="gradYear" name="gradYear" className="field" defaultValue={v.gradYear ?? String(thisYear + 2)}>
              {YEARS.map((y) => <option key={y}>{y}</option>)}
            </select>
            {err.gradYear && <p className="field-error">{err.gradYear}</p>}
          </div>
        </div>
        <div>
          <label htmlFor="filmUrl" className="label">Highlight film link</label>
          <input
            id="filmUrl" name="filmUrl" type="url" inputMode="url" required value={film} onChange={(e) => setFilm(e.target.value)}
            placeholder="https://www.hudl.com/… or https://youtu.be/…" aria-invalid={!!err.filmUrl}
            className={cx("field", err.filmUrl && "border-danger focus:border-danger focus:ring-danger/15")}
          />
          {err.filmUrl ? <p className="field-error">{err.filmUrl}</p> : <FilmTip url={film} />}
        </div>
        <div>
          <p className="label">Is the athlete under 18?</p>
          <div className="grid grid-cols-2 gap-2">
            {(["yes", "no"] as const).map((o) => (
              <label key={o} className={cx("flex min-h-12 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold transition", minor === o ? "border-blue bg-blue-50 text-blue" : "border-line text-navy hover:bg-surface")}>
                <input type="radio" name="athleteIsMinor" value={o} checked={minor === o} onChange={() => setMinor(o)} className="sr-only" />
                {o === "yes" ? "Yes, under 18" : "No, 18 or older"}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-lg font-semibold">{minor === "yes" ? "Parent or guardian" : "Your details"}</legend>
        {minor === "no" && (
          <div className="grid grid-cols-2 gap-2">
            {([["athlete_adult", "I'm the athlete"], ["parent_guardian", "I'm a parent/guardian"]] as const).map(([val, lbl]) => (
              <label key={val} className={cx("flex min-h-12 cursor-pointer items-center justify-center rounded-xl border text-sm font-semibold transition", rel === val ? "border-blue bg-blue-50 text-blue" : "border-line text-navy hover:bg-surface")}>
                <input type="radio" name="_rel" checked={rel === val} onChange={() => setRel(val)} className="sr-only" />
                {lbl}
              </label>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={effectiveRel === "athlete_adult" ? "Your name" : "Parent/guardian name"} name="purchaserName" error={err.purchaserName} defaultValue={v.purchaserName} autoComplete="name" required />
          <Field label="Email" name="purchaserEmail" type="email" inputMode="email" autoComplete="email" hint="We'll send the coach's reply here." error={err.purchaserEmail} defaultValue={v.purchaserEmail} required />
        </div>
        <div>
          <label htmlFor="purchaserPhone" className="label">Mobile (optional) — we&apos;ll text you when the coach replies</label>
          <input id="purchaserPhone" name="purchaserPhone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" className="field" />
          {phone.trim() && (
            <label className="mt-2 flex items-start gap-2 text-xs leading-relaxed text-muted">
              <input type="checkbox" name="parentSmsConsent" defaultChecked className="mt-0.5 h-4 w-4 shrink-0 accent-blue" />
              <span>Text me updates about this request. Msg &amp; data rates may apply. Reply STOP to opt out.</span>
            </label>
          )}
        </div>
        {effectiveRel === "parent_guardian" && (
          <Field label="Athlete's email (optional)" name="athleteEmail" type="email" inputMode="email" error={err.athleteEmail} defaultValue={v.athleteEmail} hint="Only used for this request. Never shared." />
        )}
      </fieldset>

      <div>
        {!more ? (
          <button type="button" onClick={() => setMore(true)} className="text-sm font-semibold text-blue hover:underline">
            + Add metrics, GPA or a note for the coach (optional)
          </button>
        ) : (
          <fieldset className="space-y-4">
            <legend className="text-lg font-semibold">Optional details</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_140px]">
              <Field label="Key metrics" name="metrics" placeholder="e.g. 6'2&quot;, 185 lb, 4.6 40-yd" defaultValue={v.metrics} error={err.metrics} />
              <Field label="GPA" name="gpa" placeholder="3.7" defaultValue={v.gpa} error={err.gpa} />
            </div>
            <div>
              <label htmlFor="message" className="label">Note for the coach</label>
              <textarea id="message" name="message" maxLength={500} rows={3} className="field" defaultValue={v.message} placeholder="Anything specific you'd like feedback on?" />
              <p className="hint">Up to 500 characters.</p>
            </div>
          </fieldset>
        )}
      </div>



      <fieldset className="space-y-3 rounded-2xl bg-surface p-4">
        {minor === "yes" && (
          <Check name="guardianConsent" error={err.guardianConsent}>
            I am the athlete&apos;s parent or legal guardian, and I consent to sharing the athlete&apos;s name, sport, position, graduation year,
            film link and any optional details above with this coach for the purpose of this evaluation.
          </Check>
        )}
        <Check name="acceptTerms" error={err.acceptTerms}>
          I agree to the <a href="/legal/terms" target="_blank" className="font-semibold text-blue underline">Terms</a> and{" "}
          <a href="/legal/privacy" target="_blank" className="font-semibold text-blue underline">Privacy Policy</a>. I understand an evaluation is
          one coach&apos;s feedback only — <strong>not</strong> a recruiting contact, offer, scholarship, admission or roster spot.
        </Check>
      </fieldset>

      <div className="space-y-3">
        <button className="btn-primary w-full text-[17px]" disabled={pending}>
          {pending ? "Opening secure checkout…" : `Continue to secure checkout · ${priceText}`}
        </button>
        <p className="text-center text-xs leading-relaxed text-muted">
          Secure checkout by Stripe. We place a hold on your card now and <strong>only charge it when the coach replies</strong>.
          {p.joined ? "" : ` We'll email Coach ${p.coachFirstName} your request right away.`} The reply comes straight to your inbox. No reply within {p.deadlineDays} days? The hold is released and you&apos;re never charged.
        </p>
      </div>
    </form>
  );
}

function Field(props: {
  label: string; name: string; error?: string; hint?: string; defaultValue?: string; type?: string; placeholder?: string;
  required?: boolean; autoComplete?: string; inputMode?: "url" | "email" | "text";
}) {
  const id = props.name;
  return (
    <div>
      <label htmlFor={id} className="label">{props.label}</label>
      <input
        id={id}
        name={props.name}
        type={props.type ?? "text"}
        defaultValue={props.defaultValue}
        placeholder={props.placeholder}
        required={props.required}
        autoComplete={props.autoComplete}
        inputMode={props.inputMode}
        aria-invalid={!!props.error}
        aria-describedby={props.error ? `${id}-err` : props.hint ? `${id}-hint` : undefined}
        className={cx("field", props.error && "border-danger focus:border-danger focus:ring-danger/15")}
      />
      {props.error ? <p id={`${id}-err`} className="field-error">{props.error}</p> : props.hint ? <p id={`${id}-hint`} className="hint">{props.hint}</p> : null}
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
