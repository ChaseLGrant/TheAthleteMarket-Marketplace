"use client";
import { useState } from "react";

const REASONS = ["Not enough time right now", "Outside my sport or position", "Not comfortable evaluating this athlete", "Other"];

export function DeclineForm({ token }: { token: string }) {
  const [reason, setReason] = useState(REASONS[0]!);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  if (state === "done") return <p className="mt-4 rounded-xl bg-success-50 p-4 text-sm font-medium text-[#0b4f2a]">Declined. The family won't be charged. Thanks for letting us know.</p>;
  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("busy");
        const res = await fetch(`/api/coach/${token}/decline`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) }).catch(() => null);
        if (res?.ok) setState("done");
        else { setMsg((await res?.json().catch(() => ({})))?.error ?? "Something went wrong. Please try again."); setState("error"); }
      }}
    >
      <fieldset className="space-y-2">
        <legend className="label">Reason (optional, private)</legend>
        {REASONS.map((r) => (
          <label key={r} className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm">
            <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="h-4 w-4 accent-blue" /> {r}
          </label>
        ))}
      </fieldset>
      {state === "error" && <p className="field-error">{msg}</p>}
      <button className="btn-danger w-full" disabled={state === "busy"}>{state === "busy" ? "Declining…" : "Decline this request"}</button>
    </form>
  );
}
