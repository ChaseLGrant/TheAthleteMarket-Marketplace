"use client";
import { useActionState } from "react";
import { addCoachAndRequest, type FormState } from "@/app/actions";
import { SPORTS } from "@/lib/constants";

export function AddCoachForm() {
  const [s, action, pending] = useActionState<FormState, FormData>(addCoachAndRequest, {});
  const v = s.values ?? {};
  const e = s.fields ?? {};
  const F = ({ n, l, t = "text", ph, hint }: { n: string; l: string; t?: string; ph?: string; hint?: string }) => (
    <div>
      <label htmlFor={n} className="label">{l}</label>
      <input id={n} name={n} type={t} defaultValue={v[n]} placeholder={ph} className="field" autoComplete="off" />
      {e[n] ? <p className="field-error">{e[n]}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
  return (
    <form action={action} className="space-y-4">
      {s.error && <p role="alert" className="rounded-xl bg-danger-50 px-4 py-3 text-sm font-medium text-[#7a1717]">{s.error}</p>}
      <input name="company" className="hidden" tabIndex={-1} autoComplete="off" aria-hidden />
      <F n="coachName" l="Coach's full name" ph="e.g. Jordan Smith" />
      <F n="coachEmail" l="Coach's email" t="email" ph="coach@school.edu" hint="Usually listed on the school's athletics staff directory." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <F n="school" l="School or team" ph="e.g. State University" />
        <F n="title" l="Title (optional)" ph="e.g. Assistant Coach" />
      </div>
      <div>
        <label htmlFor="sport" className="label">Sport</label>
        <select id="sport" name="sport" className="field" defaultValue={v.sport ?? ""}>
          <option value="" disabled>Choose…</option>
          {SPORTS.map((x) => <option key={x}>{x}</option>)}
        </select>
        {e.sport && <p className="field-error">{e.sport}</p>}
      </div>
      <button className="btn-primary w-full" disabled={pending}>{pending ? "One moment…" : "Continue to your request"}</button>
      <p className="text-center text-xs text-muted">
        We&apos;ll email this coach your request and offer. They choose whether to respond — if they don&apos;t, you&apos;re never charged.
      </p>
    </form>
  );
}
