"use client";
import { useActionState } from "react";
import { submitApplication, type FormState } from "@/app/actions";
import { DIVISIONS, SPORTS } from "@/lib/constants";

export function ApplyForm() {
  const [s, action, pending] = useActionState<FormState, FormData>(submitApplication, {});
  const v = s.values ?? {};
  const e = s.fields ?? {};
  if (s.ok) {
    return (
      <div className="rounded-2xl bg-success-50 p-6 ring-1 ring-[#c3e8d2]">
        <p className="text-lg font-semibold">Almost done — check your email.</p>
        <p className="mt-1 text-sm text-muted">Check your inbox — tap the link in our email to confirm and your profile goes live. Then set up payouts so every evaluation pays you instantly.</p>
      </div>
    );
  }
  const F = ({ n, l, t = "text", req }: { n: string; l: string; t?: string; req?: boolean }) => (
    <div>
      <label htmlFor={n} className="label">{l}</label>
      <input id={n} name={n} type={t} defaultValue={v[n]} required={req} className="field" />
      {e[n] && <p className="field-error">{e[n]}</p>}
    </div>
  );
  return (
    <form action={action} className="space-y-4">
      {s.error && <p role="alert" className="rounded-xl bg-danger-50 px-4 py-3 text-sm font-medium text-[#7a1717]">{s.error}</p>}
      <input name="company" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <F n="fullName" l="Full name" req />
        <F n="email" l="Email" t="email" req />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sport" className="label">Sport</label>
          <select id="sport" name="sport" className="field" defaultValue={v.sport ?? ""}>
            <option value="" disabled>Choose…</option>
            {SPORTS.map((x) => <option key={x}>{x}</option>)}
          </select>
          {e.sport && <p className="field-error">{e.sport}</p>}
        </div>
        <div>
          <label htmlFor="coachKind" className="label">Current status</label>
          <select id="coachKind" name="coachKind" className="field" defaultValue={v.coachKind ?? "former_college"}>
            <option value="former_college">Former college coach (no current college role)</option>
            <option value="independent">Independent evaluator / trainer</option>
            <option value="active_college">Current college assistant / grad assistant / staff</option>
            <option value="pro_player">Professional or former pro player</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <F n="title" l="Most relevant title" />
        <F n="school" l="School or team" />
        <div>
          <label htmlFor="division" className="label">Division</label>
          <select id="division" name="division" className="field" defaultValue={v.division ?? ""}>
            <option value="">—</option>
            {DIVISIONS.map((x) => <option key={x}>{x}</option>)}
          </select>
        </div>
      </div>
      <F n="credentials" l="Credentials (one line)" />
      <div className="space-y-2">
        <F n="phone" l="Mobile number (optional — get requests by text)" t="tel" />
        <label className="flex items-start gap-3 text-xs leading-relaxed text-muted">
          <input type="checkbox" name="smsConsent" defaultChecked={v.smsConsent === "on"} className="mt-0.5 h-5 w-5 shrink-0 accent-blue" />
          <span>Text me about new evaluation requests and deadlines. Message frequency varies. Msg &amp; data rates may apply. Reply STOP to opt out, HELP for help. Consent isn&apos;t required to apply.</span>
        </label>
      </div>
      <div>
        <label htmlFor="message" className="label">Anything else? (LinkedIn, staff page, references)</label>
        <textarea id="message" name="message" rows={3} className="field" defaultValue={v.message} />
      </div>
      <label className="flex items-start gap-3 rounded-xl bg-surface p-4 text-sm leading-relaxed">
        <input type="checkbox" name="attest" className="mt-0.5 h-5 w-5 shrink-0 accent-blue" />
        <span>
          I agree to the <a href="/legal/terms" target="_blank" className="font-semibold text-blue underline">evaluator terms</a>: honest feedback,
          and never promising recruitment, a scholarship or a roster spot. I will never promise recruitment, a scholarship, admission or a roster spot.
        </span>
      </label>
      {e.attest && <p className="field-error">{e.attest}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Sending…" : "Create my coach profile"}</button>
    </form>
  );
}
