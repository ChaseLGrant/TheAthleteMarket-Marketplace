import Link from "next/link";
import type { ReactNode } from "react";
import { cx, initials, money } from "@/lib/format";
import type { Coach } from "@/lib/types";
import { deliveryBadge, ratingBadge } from "@/lib/services/coach-stats";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-bold tracking-tight text-navy", className)}>
      <svg aria-hidden viewBox="0 0 64 64" className="h-7 w-7">
        <rect width="64" height="64" rx="14" fill="#0B1B3F" />
        <path d="M18 22h28M32 22v24" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
        <circle cx="46" cy="44" r="5" fill="#1F5FFF" />
      </svg>
      <span className="text-[15px] leading-none">
        The Athlete Market
        <span className="ml-1.5 font-medium text-blue">Evaluations</span>
      </span>
    </span>
  );
}

const AVATAR_BG = ["#1F5FFF", "#0B1B3F", "#2F6F8F", "#5A43D6", "#0A7A3E", "#B04A2E"];

export function Avatar({ coach, size = 56 }: { coach: Pick<Coach, "full_name" | "photo_url" | "id">; size?: number }) {
  const bg = AVATAR_BG[(coach.id.charCodeAt(0) + coach.id.charCodeAt(1)) % AVATAR_BG.length];
  if (coach.photo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={coach.photo_url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.36 }}
    >
      {initials(coach.full_name)}
    </span>
  );
}

/** Coach has joined (confirmed email / set up payouts). */
export function JoinedBadge() {
  return (
    <span className="pill bg-blue-50 text-blue">
      <svg aria-hidden viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
        <path d="M10 1.5l2.2 1.6 2.7-.1.9 2.6 2.2 1.6-.8 2.6.8 2.6-2.2 1.6-.9 2.6-2.7-.1L10 18.5l-2.2-1.6-2.7.1-.9-2.6L2 12.8l.8-2.6L2 7.6l2.2-1.6.9-2.6 2.7.1L10 1.5zm-1.1 11.3l5-5-1.2-1.2-3.8 3.8-1.7-1.7L6 9.9l2.9 2.9z" />
      </svg>
      On The Athlete Market
    </span>
  );
}

/** Coach hasn't joined: we'll email them the request. */
export function InviteBadge() {
  return <span className="pill bg-surface text-muted ring-1 ring-line">✉︎ We&apos;ll email them your request</span>;
}

export type Availability = "joined" | "invite" | "unavailable";

export function PriceLabel({ coach, tiers }: { coach: Pick<Coach, "price_cents">; tiers: number[] }) {
  if (coach.price_cents && tiers.includes(coach.price_cents)) return <span className="text-[15px] font-bold text-navy">{money(coach.price_cents)}</span>;
  if (tiers.length === 1) return <span className="text-[15px] font-bold text-navy">{money(tiers[0])}</span>;
  return <span className="text-sm font-semibold text-navy">Offer {money(Math.min(...tiers))}–{money(Math.max(...tiers))}</span>;
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "success" | "danger"; title?: string; children: ReactNode }) {
  const tones = {
    info: "bg-blue-50 text-navy ring-blue-100",
    warn: "bg-warn-50 text-[#6b3d00] ring-[#f5dcb5]",
    success: "bg-success-50 text-[#0b4f2a] ring-[#c3e8d2]",
    danger: "bg-danger-50 text-[#7a1717] ring-[#f3c4c4]",
  };
  return (
    <div className={cx("rounded-xl px-4 py-3 text-sm ring-1", tones[tone])} role={tone === "danger" ? "alert" : undefined}>
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

export function Stars({ coach }: { coach: Pick<Coach, "rating_sum" | "rating_count"> }) {
  const r = ratingBadge(coach);
  if (!r) return null;
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold text-navy" aria-label={`Rated ${r.avg} out of 5 by ${r.count} families`}>
      <span className="text-[#F5A524]">★</span>{r.avg} <span className="font-normal text-muted">({r.count})</span>
    </span>
  );
}

export function CoachCard({ coach, availability, tiers, query = "" }: { coach: Coach; availability: Availability; tiers: number[]; query?: string }) {
  const speed = deliveryBadge(coach);
  return (
    <Link
      href={`/coaches/${coach.slug}${query}`}
      className="card group flex min-w-0 flex-col gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] focus-visible:outline-2 focus-visible:outline-blue"
    >
      <div className="flex items-start gap-3.5">
        <Avatar coach={coach} size={52} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold text-navy">{coach.full_name}</p>
          <p className="truncate text-sm text-muted">{[coach.title, coach.school].filter(Boolean).join(" · ")}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <Stars coach={coach} />
            {coach.intro_video_path && <span className="text-xs font-medium text-blue">▶ Intro video</span>}
          </div>
        </div>
      </div>
      {speed && <p className="-mt-1 text-xs font-medium text-success">⚡ {speed}</p>}
      <div className="flex flex-wrap gap-1.5 text-xs">
        <span className="pill bg-surface text-navy ring-1 ring-line">{coach.sport}</span>
        {coach.division && <span className="pill bg-surface text-navy ring-1 ring-line">{coach.division}</span>}
        {coach.state && <span className="pill bg-surface text-navy ring-1 ring-line">{coach.state}</span>}
      </div>
      <div className="mt-auto flex items-center justify-between border-t border-line pt-3.5">
        {availability === "unavailable" ? (
          <>
            <span className="pill bg-surface text-muted ring-1 ring-line">{coach.paused ? "Taking a short break" : "Not taking requests"}</span>
            <span />
          </>
        ) : (
          <>
            {availability === "joined" ? <JoinedBadge /> : <InviteBadge />}
            <PriceLabel coach={coach} tiers={tiers} />
          </>
        )}
      </div>
    </Link>
  );
}
