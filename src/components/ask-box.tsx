"use client";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/format";

export interface Target { coachSlug?: string; school?: string; sport?: string; label: string; sub: string; address?: string }
interface Suggest { schools: { school: string; sport: string; staff: number; address: string }[]; coaches: { slug: string; name: string; title: string | null; school: string | null; sport: string; address: string }[] }

/** Typeahead: pick a school's staff (recommended) or a specific coach. */
export function AskBox({ onPick, placeholder = "Type a college or coach…", autoFocus, dark }: {
  onPick: (t: Target) => void; placeholder?: string; autoFocus?: boolean; dark?: boolean;
}) {
  const [q, setQ] = useState("");
  const [data, setData] = useState<Suggest>({ schools: [], coaches: [] });
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setData({ schools: [], coaches: [] }); return; }
    timer.current = setTimeout(async () => {
      const r = await fetch(`/api/line/suggest?q=${encodeURIComponent(q)}`).then((x) => x.json()).catch(() => null);
      if (r) { setData(r); setOpen(true); }
    }, 150);
  }, [q]);

  const pick = (t: Target) => { onPick(t); setQ(""); setOpen(false); };
  const empty = q.trim().length >= 2 && !data.schools.length && !data.coaches.length;

  return (
    <div className="relative">
      <label htmlFor="askbox" className="sr-only">College or coach</label>
      <input
        id="askbox" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setOpen(true)} autoFocus={autoFocus} autoComplete="off"
        placeholder={placeholder}
        className={cx("h-14 w-full rounded-xl px-4 text-[16px] outline-none", dark ? "bg-white text-navy placeholder:text-subtle" : "field")}
      />
      {open && (data.schools.length > 0 || data.coaches.length > 0 || empty) && (
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
          {empty && <p className="px-3 py-3 text-sm text-muted">No match yet. <a href="/coaches/add" className="font-semibold text-blue">Add any coach by email →</a></p>}
        </div>
      )}
    </div>
  );
}
