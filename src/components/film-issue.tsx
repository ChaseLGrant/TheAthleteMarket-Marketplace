"use client";
import { useState } from "react";

/** Coach can't open the film → ask the family for a working link instead of declining. */
export function FilmIssueButton({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  if (state === "done")
    return <p className="mt-3 rounded-xl bg-success-50 px-4 py-3 text-sm font-medium text-[#0b4f2a]">Thanks — we&apos;ve asked the family for a working link and will let you know when it arrives.</p>;
  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="mt-3 w-full text-center text-sm font-medium text-muted underline">
        Film won&apos;t open? Ask the family for a new link
      </button>
    );
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-line p-3">
      <label htmlFor="fi-note" className="label">What happened? (optional)</label>
      <input id="fi-note" className="field" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Hudl says the video is private" />
      {state === "error" && <p className="field-error">Something went wrong. Please try again.</p>}
      <button
        className="btn-navy w-full"
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          const res = await fetch(`/api/coach/${token}/film-issue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) }).catch(() => null);
          setState(res?.ok ? "done" : "error");
        }}
      >
        {state === "busy" ? "Sending…" : "Ask family for a new link"}
      </button>
    </div>
  );
}
