import { notFound } from "next/navigation";
import { DeclineForm } from "@/components/decline-form";
import { resolveCoachLink } from "@/lib/services/access";
import { getDeps } from "@/lib/server";

export const dynamic = "force-dynamic";

/** GET only shows a confirmation — email link scanners must never be able to decline a request. */
export default async function DeclinePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await resolveCoachLink(await getDeps(), token);
  if (!found) notFound();
  const { req } = found;
  const open = ["paid", "coach_notified", "accepted"].includes(req.status);
  return (
    <div className="card p-6">
      {open ? (
        <>
          <h1 className="text-xl font-bold">Decline {req.athlete_name}&apos;s request?</h1>
          <p className="mt-2 text-sm text-muted">The family will be refunded in full automatically. Totally fine — participation is always optional.</p>
          <DeclineForm token={token} />
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold">This request is already closed</h1>
          <p className="mt-2 text-sm text-muted">No action needed.</p>
        </>
      )}
    </div>
  );
}
