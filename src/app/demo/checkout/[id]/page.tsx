import { notFound, redirect } from "next/navigation";
import { getDemo } from "@/lib/deps";
import { isDemoMode } from "@/lib/env";
import { money } from "@/lib/format";
import { handleCheckoutPaid } from "@/lib/services/lifecycle";

export const dynamic = "force-dynamic";

export default async function DemoCheckout({ params }: { params: Promise<{ id: string }> }) {
  if (!isDemoMode()) notFound();
  const { id } = await params;
  const demo = await getDemo();
  const s = demo.payments.sessions.get(id);
  if (!s) notFound();

  async function pay() {
    "use server";
    const d = await getDemo();
    const sess = d.payments.sessions.get(id)!;
    d.payments.authorize(`pi_demo_${sess.requestId}`); // simulated card hold
    await handleCheckoutPaid(d, { id, payment_status: "paid", payment_intent: `pi_demo_${sess.requestId}`, client_reference_id: sess.requestId, amount_total: sess.amountCents });
    redirect(sess.successUrl.replace(/^https?:\/\/[^/]+/, ""));
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface p-4">
      <div className="card w-full max-w-md p-6">
        <p className="pill bg-warn-50 text-warn">Simulated Stripe Checkout</p>
        <h1 className="mt-4 text-lg font-semibold">{s.productName}</h1>
        <p className="mt-1 text-sm text-muted">{s.description}</p>
        <p className="mt-4 text-3xl font-bold">{money(s.amountCents)}</p>
        <p className="text-xs text-muted">Authorization hold — charged only on delivery</p>
        <p className="mt-1 text-sm text-muted">{s.customerEmail}</p>
        <div className="mt-5 rounded-xl border border-line p-3 font-mono text-sm text-muted">4242 4242 4242 4242 · 12/34 · 123</div>
        <form action={pay} className="mt-5"><button className="btn-primary w-full">Authorize {money(s.amountCents)}</button></form>
        <a href={s.cancelUrl.replace(/^https?:\/\/[^/]+/, "")} className="mt-3 block text-center text-sm text-muted underline">Cancel</a>
      </div>
    </main>
  );
}
