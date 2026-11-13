import { notFound } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/ui";
import { DISCLAIMER } from "@/lib/constants";
import { dateOnly } from "@/lib/format";
import { videoAvailableUntil } from "@/lib/retention";
import { resolveDeliveryLink } from "@/lib/services/access";
import { secondOpinionUrl } from "@/lib/services/links";
import { RatingForm } from "@/components/rating-form";
import { getDeps, isBot } from "@/lib/server";
import { FORMAT_LABEL } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The family's private reply page (linked from the delivery email): written reply, voice note or video. */
export default async function ReplyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const deps = await getDeps();
  const found = await resolveDeliveryLink(deps, token);
  if (!found) notFound();
  const { req, coach } = found;
  const first = req.athlete_name.split(" ")[0];
  const coachFirst = coach.full_name.split(" ")[0]!;
  const isAudio = req.response_kind === "voice" || (req.video_mime ?? "").startsWith("audio/");
  const settings = await deps.store.getSettings();
  const until = videoAvailableUntil(req, settings);

  let src: string | null = null, downloadUrl: string | null = null;
  if (req.video_path) {
    const ext = (req.video_path.match(/\.([a-z0-9]+)$/i)?.[1] ?? (isAudio ? "m4a" : "mp4")).toLowerCase();
    const fileName = `${req.athlete_name}-${coach.full_name}-${isAudio ? "voice-note" : "evaluation"}.${ext}`.replace(/[^\w.-]+/g, "-");
    [src, downloadUrl] = await Promise.all([
      deps.storage.playbackUrl(req.video_path, 60 * 60 * 6),
      deps.storage.playbackUrl(req.video_path, 60 * 60 * 6, { downloadAs: fileName }),
    ]);
  }
  if (!(await isBot())) await deps.store.casRequest(req.id, {}, { video_view_count: req.video_view_count + 1 });

  return (
    <div className="space-y-5">
      <div className="card overflow-hidden">
        {src && !isAudio && <video src={src} controls playsInline preload="metadata" className="aspect-video w-full bg-black" />}
        <div className="flex items-center gap-3 p-5">
          <Avatar coach={coach} size={48} />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold">{coach.full_name} replied</h1>
            <p className="truncate text-sm text-muted">{FORMAT_LABEL[req.format]} on {req.athlete_name} · {[coach.title, coach.school].filter(Boolean).join(", ")} · {dateOnly(req.delivered_at)}</p>
          </div>
        </div>
        {src && isAudio && (
          <div className="px-5 pb-5">
            <p className="mb-2 text-sm font-semibold">🎙️ Voice note from {coachFirst}</p>
            <audio src={src} controls preload="metadata" className="w-full" />
          </div>
        )}
      </div>

      {req.level_read && (
        <div className="rounded-2xl bg-navy p-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8FB0FF]">Level {coachFirst} sees {first} at</p>
          <p className="mt-1 text-2xl font-bold">{req.level_read}</p>
        </div>
      )}

      {req.response_text ? (
        <div className="card p-5">
          <h2 className="font-semibold">{coachFirst}&apos;s reply</h2>
          <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed">{req.response_text}</p>
        </div>
      ) : (req.takeaway_strength || req.takeaway_improve || req.takeaway_next) && (
        <div className="card space-y-3 p-5">
          <h2 className="font-semibold">Coach&apos;s takeaways</h2>
          <dl className="space-y-2 text-[15px]">
            {req.takeaway_strength && <div><dt className="text-xs font-semibold uppercase tracking-wide text-success">Top strength</dt><dd>{req.takeaway_strength}</dd></div>}
            {req.takeaway_improve && <div><dt className="text-xs font-semibold uppercase tracking-wide text-warn">Work on</dt><dd>{req.takeaway_improve}</dd></div>}
            {req.takeaway_next && <div><dt className="text-xs font-semibold uppercase tracking-wide text-blue">Next step</dt><dd>{req.takeaway_next}</dd></div>}
          </dl>
        </div>
      )}

      {req.response_link && (
        <a href={req.response_link} target="_blank" rel="noopener noreferrer nofollow" className="btn-primary w-full">▶ Watch {coachFirst}&apos;s video</a>
      )}

      {downloadUrl && (
        <div className="card space-y-3 p-5">
          <a href={downloadUrl} className="btn-ghost w-full">⬇ Download the {isAudio ? "voice note" : "video"}</a>
          {until && <p className="text-center text-sm text-muted">Available here until <strong className="text-navy">{dateOnly(until.toISOString())}</strong>, then deleted for privacy.</p>}
        </div>
      )}
      {!src && req.video_deleted_at && (
        <p className="card p-5 text-sm text-muted">The {isAudio ? "voice note" : "video"} was deleted for privacy on {dateOnly(req.video_deleted_at)}. If you downloaded it, your copy is unaffected.</p>
      )}

      <div className="card p-5">
        <RatingForm token={token} coachFirstName={coachFirst} alreadyRated={req.rating} />
      </div>
      <div className="card p-5 text-center">
        <p className="font-semibold">Want a second opinion?</p>
        <p className="mt-1 text-sm text-muted">Ask another coach — {first}&apos;s details are already filled in.</p>
        <Link href={secondOpinionUrl(req).replace(/^https?:\/\/[^/]+/, "")} className="btn-primary mt-4 w-full">Ask another coach</Link>
      </div>
      <p className="text-xs leading-relaxed text-subtle">{DISCLAIMER}</p>
    </div>
  );
}
