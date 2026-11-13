import { notFound } from "next/navigation";
import { AnswerForm } from "@/components/answer-form";
import { money } from "@/lib/format";
import { filmEmbedUrl, filmHost } from "@/lib/film";
import { getDeps } from "@/lib/server";
import { resolveAnswerLink } from "@/lib/services/line";

export const dynamic = "force-dynamic";
const KINDS = ["camp", "event", "film", "update", "level", "personal"] as const;

/** Coach Line: the coach answers in one tap. Opening this page never answers anything (link scanners are safe). */
export default async function AnswerPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ k?: string }> }) {
  const [{ token }, { k }] = await Promise.all([params, searchParams]);
  const deps = await getDeps();
  const found = await resolveAnswerLink(deps, token);
  if (!found) notFound();
  const { req, coach } = found;
  const open = ["paid", "coach_notified", "accepted"].includes(req.status) && !!req.expires_at && Date.parse(req.expires_at) > deps.now().getTime();
  const first = req.athlete_name.split(" ")[0]!;
  const amount = req.coach_payout_cents > 0 ? money(req.coach_payout_cents) : null;

  if (["submitted", "completed"].includes(req.status)) {
    const mine = req.coach_id === coach.id;
    return (
      <div className="card p-6 text-center">
        <p className="text-4xl">{mine ? "✓" : "👍"}</p>
        <h1 className="mt-2 text-2xl font-bold">{mine ? `Answered — thank you, Coach` : "Someone on your staff already answered"}</h1>
        <p className="mt-1 text-muted">{mine ? `${first}'s family has your answer.${amount ? ` Your ${amount} is on its way.` : ""}` : "Nothing more to do. Thanks!"}</p>
      </div>
    );
  }
  if (!open) {
    return <div className="card p-6 text-center"><h1 className="text-2xl font-bold">This message has closed</h1><p className="mt-1 text-muted">No action needed.</p></div>;
  }
  const embed = filmEmbedUrl(req.film_url);
  const hoursLeft = Math.max(1, Math.round((Date.parse(req.expires_at!) - deps.now().getTime()) / 3_600_000));
  const initialKind = KINDS.find((x) => x === k);

  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <div className="bg-navy px-5 py-4 text-white">
          <p className="text-xs font-bold uppercase tracking-wider text-white/60">Coach Line · {req.target_school ?? coach.school}</p>
          <h1 className="mt-1 text-xl font-bold">{req.athlete_name}</h1>
          <p className="text-sm text-white/80">{req.grad_year} · {req.position} · {req.sport}</p>
        </div>
        <div className="space-y-4 p-5">
          <blockquote className="whitespace-pre-line rounded-xl bg-surface p-4 text-[15px] leading-relaxed">{req.message}</blockquote>
          {embed ? (
            <div className="aspect-video overflow-hidden rounded-xl bg-black"><iframe src={embed} className="h-full w-full" allow="fullscreen" title="Film" /></div>
          ) : null}
          <a href={req.film_url} target="_blank" rel="noopener noreferrer" className="btn-ghost w-full">Open film on {filmHost(req.film_url)} ↗</a>
          <p className="text-center text-xs text-muted">
            {amount ? <><strong className="text-navy">{amount}</strong> for answering · </> : null}first answer from your staff wins · {hoursLeft}h left
          </p>
        </div>
      </div>
      <div className="card p-5">
        <h2 className="mb-3 text-lg font-bold">Answer in one tap</h2>
        <AnswerForm token={token} first={first} amount={amount} camps={coach.camps ?? []} events={coach.events ?? []} initialKind={initialKind}
          canPass={req.escalation_index < req.escalation_ids.length - 1} />
      </div>
    </div>
  );
}
