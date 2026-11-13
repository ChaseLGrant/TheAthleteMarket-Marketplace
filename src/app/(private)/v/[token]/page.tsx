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

export const dynamic = "force-dynamic";

export default async function VideoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const deps = await getDeps();
  const found = await resolveDeliveryLink(deps, token);
  if (!found) notFound();
  const { req, coach } = found;
  const title = `${coach.full_name}'s evaluation of ${req.athlete_name}`;

  if (!req.video_path) {
    return (
      <div className="card p-6 text-center">
        <h1 className="text-xl font-bold">This video has been deleted</h1>
        <p className="mt-2 text-sm text-muted">
          For privacy, evaluation videos are removed automatically after delivery{req.video_deleted_at ? ` (this one on ${dateOnly(req.video_deleted_at)})` : ""}.
          If you downloaded it, your copy is unaffected.
        </p>
        <Link href="/coaches" className="btn-primary mt-6">Get another evaluation</Link>
      </div>
    );
  }

  const settings = await deps.store.getSettings();
  const until = videoAvailableUntil(req, settings);
  const fileName = `${req.athlete_name}-${coach.full_name}-evaluation.${req.video_mime === "video/webm" ? "webm" : req.video_mime === "video/quicktime" ? "mov" : "mp4"}`
    .replace(/[^\w.-]+/g, "-");
  // Short-lived signed URLs; the page itself is the private link.
  const [src, downloadUrl] = await Promise.all([
    deps.storage.playbackUrl(req.video_path, 60 * 60 * 6),
    deps.storage.playbackUrl(req.video_path, 60 * 60 * 6, { downloadAs: fileName }),
  ]);
  if (!(await isBot())) await deps.store.casRequest(req.id, {}, { video_view_count: req.video_view_count + 1 });

  return (
    <div className="space-y-5">
      <div className="card overflow-hidden">
        <video src={src} controls playsInline preload="metadata" className="aspect-video w-full bg-black" />
        <div className="flex items-center gap-3 p-5">
          <Avatar coach={coach} size={48} />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold">{title}</h1>
            <p className="truncate text-sm text-muted">{[coach.title, coach.school].filter(Boolean).join(" · ")} · Delivered {dateOnly(req.delivered_at)}</p>
          </div>
        </div>
      </div>
      {(req.takeaway_strength || req.takeaway_improve || req.takeaway_next) && (
        <div className="card space-y-3 p-5">
          <h2 className="font-semibold">Coach&apos;s takeaways</h2>
          <dl className="space-y-2 text-[15px]">
            {req.takeaway_strength && <div><dt className="text-xs font-semibold uppercase tracking-wide text-success">Top strength</dt><dd>{req.takeaway_strength}</dd></div>}
            {req.takeaway_improve && <div><dt className="text-xs font-semibold uppercase tracking-wide text-warn">Work on</dt><dd>{req.takeaway_improve}</dd></div>}
            {req.takeaway_next && <div><dt className="text-xs font-semibold uppercase tracking-wide text-blue">Next step</dt><dd>{req.takeaway_next}</dd></div>}
          </dl>
        </div>
      )}
      <div className="card space-y-3 p-5">
        <a href={downloadUrl} className="btn-primary w-full">⬇ Download video</a>
        {until && (
          <p className="text-center text-sm text-muted">
            Available here until <strong className="text-navy">{dateOnly(until.toISOString())}</strong>, then deleted for privacy. Download it to keep it.
          </p>
        )}
      </div>
      <div className="card p-5 text-sm leading-relaxed text-muted">
        <p className="font-semibold text-navy">This link is private.</p>
        <p className="mt-1">Anyone with this link can watch the video, so please don&apos;t post it publicly. Reply to your delivery email if you&apos;d like it revoked.</p>
      </div>
      <div className="card p-5">
        <RatingForm token={token} coachFirstName={coach.full_name.split(" ")[0]!} alreadyRated={req.rating} />
      </div>
      <div className="card p-5 text-center">
        <p className="font-semibold">Want a second opinion?</p>
        <p className="mt-1 text-sm text-muted">Another coach, same film — {req.athlete_name.split(" ")[0]}&apos;s details are already filled in.</p>
        <Link href={secondOpinionUrl(req).replace(/^https?:\/\/[^/]+/, "")} className="btn-primary mt-4 w-full">Get a second coach&apos;s take</Link>
      </div>
      <p className="text-xs leading-relaxed text-subtle">{DISCLAIMER}</p>
    </div>
  );
}
