import { notFound } from "next/navigation";
import { FixFilmForm } from "@/components/fix-film-form";
import { dateOnly } from "@/lib/format";
import { resolveFixLink } from "@/lib/services/access";
import { getDeps } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function FixFilmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await resolveFixLink(await getDeps(), token);
  if (!found) notFound();
  const { req, coach } = found;
  const open = ["paid", "coach_notified", "accepted"].includes(req.status);
  if (!open) {
    return (
      <div className="card p-6 text-center">
        <h1 className="text-xl font-bold">This request is closed</h1>
        <p className="mt-2 text-sm text-muted">{req.status === "completed" ? "Your evaluation was already delivered — check your email." : "You were not charged."}</p>
      </div>
    );
  }
  return (
    <div className="card space-y-4 p-6">
      <div>
        <h1 className="text-xl font-bold">Update {req.athlete_name}&apos;s film link</h1>
        <p className="mt-1 text-sm text-muted">
          {req.film_issue_at
            ? `${coach.full_name} couldn't open the current link${req.film_issue_note ? ` (“${req.film_issue_note}”)` : ""}.`
            : "Paste a new link below."}{" "}
          The coach is notified the moment you save. Respond by {dateOnly(req.expires_at)}.
        </p>
      </div>
      <p className="break-all rounded-xl bg-surface px-3 py-2 text-xs text-muted">Current: {req.film_url}</p>
      <FixFilmForm token={token} />
    </div>
  );
}
