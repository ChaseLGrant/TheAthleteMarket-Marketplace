import { notFound } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/ui";
import { DISCLAIMER } from "@/lib/constants";
import { dateOnly } from "@/lib/format";
import { resolveDeliveryLink } from "@/lib/services/access";
import { getDeps, isBot } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function VideoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const deps = await getDeps();
  const found = await resolveDeliveryLink(deps, token);
  if (!found) notFound();
  const { req, coach } = found;
  // Short-lived signed URL; the page itself is the long-lived private link.
  const src = await deps.storage.playbackUrl(req.video_path!, 60 * 60 * 6);
  if (!(await isBot())) await deps.store.casRequest(req.id, {}, { video_view_count: req.video_view_count + 1 });

  return (
    <div className="space-y-5">
      <div className="card overflow-hidden">
        <video src={src} controls playsInline preload="metadata" className="aspect-video w-full bg-black" />
        <div className="flex items-center gap-3 p-5">
          <Avatar coach={coach} size={48} />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold">{coach.full_name}&apos;s evaluation of {req.athlete_name}</h1>
            <p className="truncate text-sm text-muted">{[coach.title, coach.school].filter(Boolean).join(" · ")} · Delivered {dateOnly(req.delivered_at)}</p>
          </div>
        </div>
      </div>
      <div className="card p-5 text-sm leading-relaxed text-muted">
        <p className="font-semibold text-navy">This link is private.</p>
        <p className="mt-1">Anyone with this link can watch the video, so please don&apos;t post it publicly. Reply to your delivery email if you&apos;d like it revoked.</p>
        <a href={src} download className="mt-3 inline-block font-semibold text-blue">Download video</a>
      </div>
      <p className="text-xs leading-relaxed text-subtle">{DISCLAIMER}</p>
      <div className="text-center">
        <Link href="/coaches" className="btn-primary">Get another coach&apos;s perspective</Link>
      </div>
    </div>
  );
}
