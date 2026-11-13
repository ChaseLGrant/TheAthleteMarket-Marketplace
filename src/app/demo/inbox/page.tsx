import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getDemo } from "@/lib/deps";
import { isDemoMode } from "@/lib/env";
import { runCron } from "@/lib/services/cron";

export const dynamic = "force-dynamic";

export default async function DemoInbox() {
  if (!isDemoMode()) notFound();
  const demo = await getDemo();

  async function advance(fd: FormData) {
    "use server";
    const d = await getDemo();
    d.clockOffsetMs += Number(fd.get("hours") ?? 0) * 3_600_000;
    await runCron(d);
    redirect("/demo/inbox");
  }

  return (
    <main className="container-page py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Demo inbox ({demo.mailer.sent.length})</h1>
        <div className="flex flex-wrap gap-2">
          <form action={advance}><input type="hidden" name="hours" value="0" /><button className="btn-ghost btn-sm">Run cron now</button></form>
          <form action={advance}><input type="hidden" name="hours" value="60" /><button className="btn-ghost btn-sm">+60h & cron (reminder)</button></form>
          <form action={advance}><input type="hidden" name="hours" value="146" /><button className="btn-ghost btn-sm">+6 days & cron (expire/release hold)</button></form>
          <Link href="/" className="btn-primary btn-sm">Site</Link>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted">Simulated clock offset: {Math.round(demo.clockOffsetMs / 3_600_000)}h. Links in emails point at this local app.</p>
      {demo.sms.sent.length > 0 && (
        <div className="card mt-6 p-4">
          <h2 className="font-semibold">📱 Text messages ({demo.sms.sent.length})</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {demo.sms.sent.map((m) => (
              <li key={m.id} className="rounded-xl bg-surface p-3"><span className="font-mono text-xs text-muted">{m.to}</span><br />{m.body.replaceAll(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000", "")}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-6 space-y-6">
        {demo.mailer.sent.map((m) => (
          <details key={m.id} className="card overflow-hidden" open={m === demo.mailer.sent[0]}>
            <summary className="cursor-pointer p-4">
              <span className="font-semibold">{m.subject}</span>
              <span className="ml-2 text-sm text-muted">→ {m.to}</span>
            </summary>
            <iframe title={m.subject} srcDoc={`<base target="_top">` + m.html.replaceAll(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000", "")} className="h-[640px] w-full border-t border-line" sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation" />
          </details>
        ))}
        {!demo.mailer.sent.length && <p className="text-muted">No emails yet. Request an evaluation from a verified coach to start.</p>}
      </div>
    </main>
  );
}
