"use client";
import { useEffect, useRef, useState } from "react";
import { SPORTS } from "@/lib/constants";
import { cx } from "@/lib/format";

export interface Target { coachSlug?: string; school?: string; sport?: string; label: string; sub: string; address?: string }
interface Suggest { schools: { school: string; sport: string; staff: number; address: string }[]; coaches: { slug: string; name: string; title: string | null; school: string | null; sport: string; address: string }[] }

/** Typeahead: pick a school's staff (recommended) or a specific coach. */
export function AskBox({ onPick, placeholder = "College name or coach’s email", autoFocus, dark }: {
  onPick: (t: Target) => void; placeholder?: string; autoFocus?: boolean; dark?: boolean;
}) {
  const [q, setQ] = useState("");
  const [data, setData] = useState<Suggest>({ schools: [], coaches: [] });
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2 || q.includes("@")) { setData({ schools: [], coaches: [] }); return; }
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/line/suggest?q=${encodeURIComponent(q)}`).then((x) => x.json()).catch(() => null);
      if (r) { setData(r); setOpen(true); }
    }, 150);
  }, [q]);

  const [adding, setAdding] = useState(false);
  const pick = (t: Target) => { onPick(t); setQ(""); setOpen(false); setAdding(false); };
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.trim());
  const empty = q.trim().length >= 2 && !isEmail && !data.schools.length && !data.coaches.length;

  return (
    <div className="relative">
      <label htmlFor="askbox" className="sr-only">College or coach</label>
      <input
        id="askbox" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} autoFocus={autoFocus} autoComplete="off"
        placeholder={placeholder}
        className={cx("h-14 w-full rounded-xl px-4 text-[16px] outline-none", dark ? "bg-white text-navy placeholder:text-subtle" : "field")}
      />
      {isEmail && !adding && (
        <button type="button" onClick={() => setAdding(true)}
          className="mt-2 flex w-full items-center justify-between gap-3 rounded-2xl border border-blue bg-blue-50 px-4 py-3 text-left text-navy">
          <span className="min-w-0"><span className="block font-semibold">✉️ Message this coach</span><span className="block truncate text-sm text-muted">{q.trim()}</span></span>
          <span className="shrink-0 text-sm font-semibold text-blue">Next →</span>
        </button>
      )}
      {open && !adding && (data.schools.length > 0 || data.coaches.length > 0 || empty) && (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-[60vh] overflow-auto rounded-2xl border border-line bg-white p-2 text-left text-navy shadow-[var(--shadow-lift)]">
          {data.schools.map((s) => (
            <button key={s.school + s.sport} type="button" onClick={() => pick({ school: s.school, sport: s.sport, address: s.address, label: s.school, sub: `${s.sport} staff · ${s.staff} coach${s.staff === 1 ? "" : "es"}` })}
              className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left hover:bg-surface">
              <span className="min-w-0"><span className="block truncate font-semibold">{s.school}</span><span className="block text-xs text-muted">{s.sport} · message the staff</span></span>
              <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue">{s.staff} coach{s.staff === 1 ? "" : "es"}</span>
            </button>
          ))}
          {data.coaches.length > 0 && <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-subtle">Specific coach</p>}
          {data.coaches.map((c) => (
            <button key={c.slug} type="button" onClick={() => pick({ coachSlug: c.slug, school: c.school ?? undefined, sport: c.sport, address: c.address, label: c.name, sub: [c.title, c.school].filter(Boolean).join(" · ") })}
              className="flex w-full flex-col rounded-xl px-3 py-2.5 text-left hover:bg-surface">
              <span className="font-semibold">{c.name}</span><span className="text-xs text-muted">{[c.title, c.school, c.sport].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
          {empty && (
            <p className="px-3 py-3 text-sm text-muted">
              Not in our list yet — no problem.{" "}
              <button type="button" onClick={() => { setAdding(true); setOpen(false); }} className="font-semibold text-blue">Add any coach by email →</button>
            </p>
          )}
        </div>
      )}
      {!adding && !isEmail ? (
        <button type="button" onClick={() => { setAdding(true); setOpen(false); }}
          className={cx("mt-2 text-sm font-semibold", dark ? "px-2 pb-1 text-blue" : "text-blue")}>
          + Message any college coach by email
        </button>
      ) : adding && (
        <AddCoach initialSchool={isEmail ? "" : q.trim()} initialEmail={isEmail ? q.trim() : ""} onAdded={pick} onCancel={() => setAdding(false)} />
      )}
    </div>
  );
}

/** Any college coach, by email — no directory needed. Kept private to this family. */
function AddCoach({ initialSchool, initialEmail, onAdded, onCancel }: { initialSchool: string; initialEmail: string; onAdded: (t: Target) => void; onCancel: () => void }) {
  const [v, setV] = useState({ coachEmail: initialEmail, coachName: "", school: initialSchool, sport: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value });
  async function add() {
    setBusy(true); setError(null);
    const r = await fetch("/api/line/add-coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setBusy(false);
    if (r?.ok && j?.target) return onAdded(j.target as Target);
    setError(j?.error ?? "Couldn't add that coach. Check the email and try again.");
  }
  return (
    <div className="mt-2 space-y-3 rounded-2xl border border-line bg-white p-4 text-left text-navy">
      <div>
        <p className="font-semibold">Message any college coach</p>
        <p className="text-xs text-muted">Coach emails are on every school&apos;s athletics staff page. We deliver your message and their answer — your email stays private.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="label min-w-0 sm:col-span-2">Coach&apos;s email<input className="field mt-1" type="email" inputMode="email" value={v.coachEmail} onChange={set("coachEmail")} placeholder="jsmith@stateu.edu" autoComplete="off" /></label>
        <label className="label min-w-0">Coach&apos;s name<input className="field mt-1" value={v.coachName} onChange={set("coachName")} placeholder="Coach Jordan Smith" autoComplete="off" autoFocus={!!initialEmail} /></label>
        <label className="label min-w-0">School <span className="font-normal text-muted">(optional)</span><input className="field mt-1" value={v.school} onChange={set("school")} placeholder="State University" autoComplete="off" /></label>
        <label className="label min-w-0 sm:col-span-2">Sport <span className="font-normal text-muted">(optional)</span>
          <select className="field mt-1" value={v.sport} onChange={set("sport")}>
            <option value="">—</option>
            {SPORTS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={add} disabled={busy} className="btn-primary btn-sm">{busy ? "Adding…" : "Add coach"}</button>
        <button type="button" onClick={onCancel} className="btn-ghost btn-sm">Cancel</button>
      </div>
    </div>
  );
}
