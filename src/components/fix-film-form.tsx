"use client";
import { useState } from "react";
import { FilmTip } from "./film-tip";

export function FixFilmForm({ token }: { token: string }) {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  if (state === "done")
    return <p className="rounded-xl bg-success-50 p-4 text-sm font-medium text-[#0b4f2a]">Saved! We&apos;ve sent the new link to the coach. You still haven&apos;t been charged.</p>;
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("busy");
        setError(null);
        const res = await fetch(`/api/fix/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filmUrl: url }) }).catch(() => null);
        if (res?.ok) return setState("done");
        setError((await res?.json().catch(() => ({})))?.error ?? "Something went wrong. Please try again.");
        setState("idle");
      }}
    >
      <label htmlFor="film" className="label">New film link</label>
      <input id="film" type="url" inputMode="url" required className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      <FilmTip url={url} />
      {error && <p className="field-error">{error}</p>}
      <button className="btn-primary w-full" disabled={state === "busy"}>{state === "busy" ? "Checking link…" : "Save new link"}</button>
    </form>
  );
}
