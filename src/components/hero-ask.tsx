"use client";
import { useState } from "react";
import { AskBox, type Target } from "./ask-box";

/** Homepage ask box: pick a school, then write on our page — or email the staff straight from Gmail. */
export function HeroAsk() {
  const [t, setT] = useState<Target | null>(null);
  const href = t ? (t.coachSlug ? `/ask?coach=${encodeURIComponent(t.coachSlug)}` : `/ask?school=${encodeURIComponent(t.school ?? "")}&sport=${encodeURIComponent(t.sport ?? "")}`) : "/ask";
  const subject = "Recruiting question — camps & film";
  const gmail = t?.address ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(t.address)}&su=${encodeURIComponent(subject)}` : null;
  const mailto = t?.address ? `mailto:${t.address}?subject=${encodeURIComponent(subject)}` : null;

  return (
    <div className="max-w-2xl rounded-2xl bg-white p-2 text-navy shadow-[0_20px_60px_-20px_rgba(0,0,0,.5)]">
      {!t ? (
        <AskBox onPick={setT} dark />
      ) : (
        <div className="p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-lg font-bold">{t.label}</p>
              <p className="text-sm text-muted">{t.sub}</p>
            </div>
            <button type="button" onClick={() => setT(null)} className="shrink-0 text-sm font-semibold text-blue">Change</button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <a href={href} className="btn-primary">Write my message →</a>
            {gmail && <a href={gmail} target="_blank" rel="noopener noreferrer" className="btn-ghost">Email from Gmail</a>}
          </div>
          {t.address && (
            <p className="mt-3 break-all text-xs text-muted">
              Or email <a href={mailto!} className="font-semibold text-navy underline">{t.address}</a> from any inbox — we&apos;ll route it to the right coach.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
