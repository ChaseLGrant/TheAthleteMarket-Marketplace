"use client";
import { useActionState } from "react";
import { joinWaitlist, type FormState } from "@/app/actions";

export function WaitlistForm({ coachId, name }: { coachId: string; name: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(joinWaitlist, {});
  if (state.ok) return <p className="text-sm font-medium text-success">Thanks — we&apos;ll email you if {name} joins.</p>;
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row">
      <input type="hidden" name="coachId" value={coachId} />
      <input type="text" name="company" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <label htmlFor="wl-email" className="sr-only">Email</label>
      <input id="wl-email" name="email" type="email" required placeholder="you@email.com" className="field flex-1" autoComplete="email" />
      <button className="btn-navy" disabled={pending}>{pending ? "Saving…" : "Notify me"}</button>
      {state.error && <p className="field-error">{state.error}</p>}
    </form>
  );
}
