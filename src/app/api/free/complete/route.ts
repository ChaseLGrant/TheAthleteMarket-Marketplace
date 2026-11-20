import { NextResponse } from "next/server";
import { getDeps } from "@/lib/deps";
import { env, paymentsOff } from "@/lib/env";
import { log } from "@/lib/log";

/** PAYMENTS OFF only: stands in for Stripe Checkout — completes the order instantly and sends it. */
export async function GET(req: Request) {
  if (!paymentsOff()) return new NextResponse("Not found", { status: 404 });
  const u = new URL(req.url);
  const kind = u.searchParams.get("kind"), id = u.searchParams.get("id") ?? "";
  const deps = await getDeps();
  try {
    if (kind === "ask" && id.startsWith("free_setup_")) {
      const order = await deps.store.getOrderBySession(id);
      if (!order) return new NextResponse("Not found", { status: 404 });
      const { handleAskSetupCompleted } = await import("@/lib/services/line");
      if (order.status === "awaiting_payment") await handleAskSetupCompleted(deps, id);
      return NextResponse.redirect(`${env.siteUrl()}/ask/sent?order=${encodeURIComponent(order.ref)}`, 303);
    }
    if (kind === "eval" && id.startsWith("free_cs_")) {
      const requestId = id.slice("free_cs_".length);
      const r = await deps.store.getRequest(requestId);
      if (!r) return new NextResponse("Not found", { status: 404 });
      const { handleCheckoutPaid } = await import("@/lib/services/lifecycle");
      await handleCheckoutPaid(deps, { id, payment_status: "paid", payment_intent: `free_pi_${r.id}`, client_reference_id: r.id, amount_total: 0 });
      return NextResponse.redirect(`${env.siteUrl()}/request/success?ref=${encodeURIComponent(r.ref)}`, 303);
    }
  } catch (e) {
    log("error", "free checkout failed", { id, error: String(e) });
    return new NextResponse("Something went wrong — please go back and try again.", { status: 500 });
  }
  return new NextResponse("Not found", { status: 404 });
}
