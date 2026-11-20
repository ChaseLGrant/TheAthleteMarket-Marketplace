import type { Metadata } from "next";
import { AskForm } from "@/components/ask-form";
import { Notice } from "@/components/ui";
import { paymentsOff } from "@/lib/env";
import { getDeps } from "@/lib/server";
import { resolveAgainLink } from "@/lib/services/access";
import { askPrices } from "@/lib/services/line";
import { prefillFromRequest, targetsFromQuery } from "./prefill";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Message college coaches — Coach Line", description: "Ask any college staff about camps, events and fit. Answered or it's free." };

type P = { searchParams: Promise<Record<string, string | undefined>> };

export default async function AskPage({ searchParams }: P) {
  const sp = await searchParams;
  const deps = await getDeps();
  const settings = await deps.store.getSettings();
  const [targets, original] = await Promise.all([targetsFromQuery(deps, sp), sp.from ? resolveAgainLink(deps, sp.from) : null]);
  return (
    <div className="container-page max-w-3xl py-8 sm:py-12">
      <p className="text-sm font-bold uppercase tracking-wider text-blue">Coach Line</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Message college coaches. Get an answer.</h1>
      <p className="mt-2 text-muted">Camp dates, events they&apos;ll be at, what level you fit. {paymentsOff() ? "No account, no app." : <>Answered or it&apos;s free — no account, no app.</>}</p>
      {original && <div className="mt-4"><Notice tone="success" title="Welcome back">{original.athlete_name}&apos;s details are filled in. Just pick the next schools.</Notice></div>}
      {sp.cancelled && <div className="mt-4"><Notice tone="warn">Checkout was cancelled — nothing was sent and you weren&apos;t charged.</Notice></div>}
      <div className="card mt-8 min-w-0 p-5 sm:p-8">
        <AskForm prices={askPrices(settings)} free={paymentsOff()} escalateHours={settings.escalate_after_hours} deadlineDays={settings.deadline_days}
          initialTargets={targets} prefill={original ? prefillFromRequest(original) : undefined} />
      </div>
    </div>
  );
}
