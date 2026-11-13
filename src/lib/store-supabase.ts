import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";
import type { AskDraft, Coach, DisputeRow, EmailLogRow, EvalRequest, Order, RequestEvent, SavedPayer, Settings, ThreadMessage } from "./types";
import { DEFAULT_SETTINGS, escapeLike, type RequestWhere, type Store } from "./store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: SupabaseClient<any, any, any> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function supabaseAdmin(): SupabaseClient<any, any, any> {
  if (!client) {
    client = createClient(env.supabaseUrl(), env.supabaseServiceKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: env.dbSchema() }, // all queries + rpc go to the `marketplace` schema
    });
  }
  return client;
}

function must<T>(res: { data: T | null; error: { message: string } | null }, ctx: string): T {
  if (res.error) throw new Error(`[db] ${ctx}: ${res.error.message}`);
  return res.data as T;
}

const COACH_PUBLIC_ORDER = [
  { col: "listing_type", asc: false }, // 'participating' > 'directory'
  { col: "full_name", asc: true },
] as const;

export class SupabaseStore implements Store {
  private db = supabaseAdmin();

  async getSettings(): Promise<Settings> {
    const r = await this.db.from("settings").select("*").eq("id", 1).maybeSingle();
    return { ...DEFAULT_SETTINGS, ...(must(r, "settings") ?? {}) } as Settings;
  }
  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    must(await this.db.from("settings").update(patch).eq("id", 1), "settings.update");
    return this.getSettings();
  }

  async getCoach(id: string) {
    return must(await this.db.from("coaches").select("*").eq("id", id).maybeSingle(), "coach") as Coach | null;
  }
  async getCoachBySlug(slug: string) {
    return must(await this.db.from("coaches").select("*").eq("slug", slug).maybeSingle(), "coach.slug") as Coach | null;
  }
  async getCoachByStripeAccount(accountId: string) {
    return must(
      await this.db.from("coaches").select("*").eq("stripe_account_id", accountId).maybeSingle(),
      "coach.acct",
    ) as Coach | null;
  }
  async findCoachesByEmail(email: string) {
    return must(await this.db.from("coaches").select("*").ilike("email", escapeLike(email.trim())), "coach.email") as Coach[];
  }
  async searchCoaches(s: Parameters<Store["searchCoaches"]>[0]) {
    let q = this.db.from("coaches").select("*", { count: "exact" });
    // Public: everyone except removed, unlisted (family-added) and unconfirmed self-signups.
    q = q.eq("removed", false).eq("unlisted", false).eq("opted_out", false).or("source.neq.self,email_confirmed_at.not.is.null");
    if (s.q?.trim()) {
      for (const term of s.q.trim().toLowerCase().split(/\s+/).slice(0, 5)) {
        q = q.ilike("search_text", `%${escapeLike(term)}%`);
      }
    }
    if (s.sport) q = q.eq("sport", s.sport);
    if (s.division) q = q.eq("division", s.division);
    if (s.conference) q = q.eq("conference", s.conference);
    if (s.state) q = q.eq("state", s.state);
    if (s.availableOnly) q = q.eq("listing_type", "participating").or("stripe_transfers_active.eq.true,email_confirmed_at.not.is.null");
    for (const o of COACH_PUBLIC_ORDER) q = q.order(o.col, { ascending: o.asc });
    const limit = Math.min(s.limit ?? 24, 60);
    const offset = s.offset ?? 0;
    const r = await q.range(offset, offset + limit - 1);
    if (r.error) throw new Error(`[db] search: ${r.error.message}`);
    return { coaches: (r.data ?? []) as Coach[], total: r.count ?? 0 };
  }
  async listCoachesAdmin(f: { q?: string; listing?: string; eligibility?: string; limit?: number }) {
    let q = this.db.from("coaches").select("*");
    if (f.q?.trim()) q = q.ilike("search_text", `%${escapeLike(f.q.trim().toLowerCase())}%`);
    if (f.listing) q = q.eq("listing_type", f.listing);
    if (f.eligibility) q = q.eq("eligibility_status", f.eligibility);
    return must(await q.order("updated_at", { ascending: false }).limit(f.limit ?? 200), "coaches.admin") as Coach[];
  }
  async coachFacets() {
    const r = must(await this.db.from("coaches").select("sport, conference").limit(5000), "facets") as {
      sport: string; conference: string | null;
    }[];
    const sports = [...new Set(r.map((x) => x.sport))].sort();
    const conferences = [...new Set(r.map((x) => x.conference).filter((x): x is string => !!x))].sort();
    return { sports, conferences };
  }
  async insertCoach(c: Partial<Coach>) {
    return must(await this.db.from("coaches").insert(c).select("*").single(), "coach.insert") as Coach;
  }
  async updateCoach(id: string, patch: Partial<Coach>) {
    return must(await this.db.from("coaches").update(patch).eq("id", id).select("*").single(), "coach.update") as Coach;
  }

  async insertRequest(r: Parameters<Store["insertRequest"]>[0]) {
    return must(await this.db.from("requests").insert(r).select("*").single(), "request.insert") as EvalRequest;
  }
  async getRequest(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return must(await this.db.from("requests").select("*").eq("id", id).maybeSingle(), "request") as EvalRequest | null;
  }
  async getRequestBy(field: string, value: string) {
    return must(
      await this.db.from("requests").select("*").eq(field, value).maybeSingle(),
      `request.${field}`,
    ) as EvalRequest | null;
  }
  async casRequest(id: string, where: RequestWhere, patch: Partial<EvalRequest>) {
    // A single UPDATE ... WHERE ... RETURNING statement: atomic in Postgres, so exactly one
    // concurrent caller can win a given transition.
    let q = this.db.from("requests").update(patch).eq("id", id);
    if (where.status) q = q.in("status", where.status);
    if (where.payout_status) q = q.in("payout_status", where.payout_status);
    if (where.refund_status) q = q.in("refund_status", where.refund_status);
    if (where.expiresAfter) q = q.gt("expires_at", where.expiresAfter);
    if (where.expiresBefore) q = q.lte("expires_at", where.expiresBefore);
    for (const col of where.isNull ?? []) q = q.is(col, null);
    const r = await q.select("*");
    const rows = must(r, "request.cas") as EvalRequest[];
    return rows[0] ?? null;
  }
  async listRequests(f: Parameters<Store["listRequests"]>[0]) {
    let q = this.db.from("requests").select("*");
    if (f.status) q = q.in("status", f.status);
    if (f.payout_status) q = q.in("payout_status", f.payout_status);
    if (f.refund_status) q = q.in("refund_status", f.refund_status);
    if (f.coach_id) q = q.eq("coach_id", f.coach_id);
    if (f.order_id) q = q.eq("order_id", f.order_id);
    if (f.expiresBefore) q = q.lt("expires_at", f.expiresBefore);
    if (f.completedBefore) q = q.lt("completed_at", f.completedBefore);
    if (f.purchaser_email) q = q.ilike("purchaser_email", escapeLike(f.purchaser_email));
    if (f.q?.trim()) {
      const t = escapeLike(f.q.trim());
      q = q.or(`ref.ilike.%${t}%,athlete_name.ilike.%${t}%,purchaser_email.ilike.%${t}%`);
    }
    return must(await q.order("created_at", { ascending: false }).limit(f.limit ?? 500), "requests") as EvalRequest[];
  }
  async countOpenRequestsForCoach(coachId: string) {
    const r = await this.db
      .from("requests")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", coachId)
      .in("status", ["paid", "coach_notified", "accepted", "submitted"]);
    if (r.error) throw new Error(r.error.message);
    return r.count ?? 0;
  }

  async addEvent(e: Omit<RequestEvent, "id" | "created_at">) {
    must(await this.db.from("request_events").insert(e), "event.insert");
  }
  async listEvents(requestId: string) {
    return must(
      await this.db.from("request_events").select("*").eq("request_id", requestId).order("created_at"),
      "events",
    ) as RequestEvent[];
  }

  async claimStripeEvent(id: string, type: string) {
    const ins = await this.db.from("stripe_events").insert({ id, type }).select("id");
    if (!ins.error) return "new" as const;
    if (ins.error.code !== "23505") throw new Error(`[db] stripe_events: ${ins.error.message}`);
    const row = must(await this.db.from("stripe_events").select("processed_at").eq("id", id).single(), "stripe_events.get") as {
      processed_at: string | null;
    };
    return row.processed_at ? ("done" as const) : ("retry" as const);
  }
  async finishStripeEvent(id: string, error?: string) {
    must(
      await this.db
        .from("stripe_events")
        .update(error ? { error } : { processed_at: new Date().toISOString(), error: null })
        .eq("id", id),
      "stripe_events.finish",
    );
  }

  async logEmail(row: Omit<EmailLogRow, "id" | "created_at">) {
    must(await this.db.from("email_log").insert(row), "email_log");
  }
  async listEmails(f: { request_id?: string; limit?: number }) {
    let q = this.db.from("email_log").select("*");
    if (f.request_id) q = q.eq("request_id", f.request_id);
    return must(await q.order("created_at", { ascending: false }).limit(f.limit ?? 200), "emails") as EmailLogRow[];
  }
  async claimMessage(row: Omit<EmailLogRow, "id" | "created_at"> & { dedupe_key: string }) {
    const r = await this.db.from("email_log").insert(row);
    if (!r.error) return true;
    if (r.error.code === "23505") return false;
    throw new Error(`[db] claimMessage: ${r.error.message}`);
  }
  async finishMessage(key: string, patch: { status: EmailLogRow["status"]; provider_id?: string | null; error?: string | null }) {
    must(await this.db.from("email_log").update(patch).eq("dedupe_key", key), "finishMessage");
  }
  async listParticipatingCoaches() {
    return must(await this.db.from("coaches").select("*").eq("listing_type", "participating").limit(5000), "coaches.participating") as Coach[];
  }
  async isSuppressed(email: string) {
    const r = await this.db.from("email_suppressions").select("email").eq("email", email.toLowerCase()).maybeSingle();
    return !!must(r, "suppressions");
  }
  async suppress(email: string, reason: string) {
    must(
      await this.db.from("email_suppressions").upsert({ email: email.toLowerCase(), reason }, { onConflict: "email" }),
      "suppress",
    );
  }

  async upsertDispute(d: Omit<DisputeRow, "created_at" | "updated_at">) {
    must(await this.db.from("disputes").upsert({ ...d, updated_at: new Date().toISOString() }), "dispute");
  }
  async listDisputes() {
    return must(await this.db.from("disputes").select("*").order("created_at", { ascending: false }), "disputes") as DisputeRow[];
  }

  async addWaitlist(coachId: string, email: string) {
    must(
      await this.db.from("waitlist").upsert({ coach_id: coachId, email: email.toLowerCase() }, { onConflict: "coach_id,email", ignoreDuplicates: true }),
      "waitlist",
    );
  }
  async waitlistCounts() {
    const rows = must(await this.db.from("waitlist").select("coach_id").limit(20000), "waitlist.counts") as { coach_id: string }[];
    const out: Record<string, number> = {};
    for (const r of rows) out[r.coach_id] = (out[r.coach_id] ?? 0) + 1;
    return out;
  }

  async track(name: string, coachId?: string | null, requestId?: string | null) {
    await this.db.from("analytics_events").insert({ name, coach_id: coachId ?? null, request_id: requestId ?? null });
  }
  async countAnalytics(name: string, sinceIso?: string) {
    let q = this.db.from("analytics_events").select("id", { count: "exact", head: true }).eq("name", name);
    if (sinceIso) q = q.gte("created_at", sinceIso);
    const r = await q;
    if (r.error) throw new Error(r.error.message);
    return r.count ?? 0;
  }

  async listMarketingSpend() {
    return must(await this.db.from("marketing_spend").select("*").order("month", { ascending: false }), "spend") as {
      id: number; month: string; channel: string; amount_cents: number;
    }[];
  }
  async addMarketingSpend(r: { month: string; channel: string; amount_cents: number }) {
    must(await this.db.from("marketing_spend").insert(r), "spend.insert");
  }

  async insertOrder(o: Omit<Order, "id" | "created_at" | "status" | "stripe_customer_id" | "stripe_payment_method_id">) {
    return must(await this.db.from("orders").insert(o).select("*").single(), "order.insert") as Order;
  }
  async getOrder(id: string) {
    return must(await this.db.from("orders").select("*").eq("id", id).maybeSingle(), "order") as Order | null;
  }
  async getOrderBySession(sid: string) {
    return must(await this.db.from("orders").select("*").eq("stripe_checkout_session_id", sid).maybeSingle(), "order.session") as Order | null;
  }
  async updateOrder(id: string, patch: Partial<Order>) {
    return must(await this.db.from("orders").update(patch).eq("id", id).select("*").single(), "order.update") as Order;
  }
  async addThreadMessage(m: Omit<ThreadMessage, "id" | "created_at">) {
    must(await this.db.from("thread_messages").insert(m), "thread.insert");
  }
  async listThread(requestId: string) {
    return must(await this.db.from("thread_messages").select("*").eq("request_id", requestId).order("created_at"), "thread") as ThreadMessage[];
  }
  async listStaff(school: string, sport: string) {
    return must(await this.db.from("coaches").select("*").ilike("school", escapeLike(school.trim())).eq("sport", sport).limit(50), "staff") as Coach[];
  }
  async suggestSchools(q: string, limit: number) {
    let qy = this.db.from("coaches").select("school, sport").eq("removed", false).not("email", "is", null).not("school", "is", null);
    if (q.trim()) qy = qy.ilike("search_text", `%${escapeLike(q.trim().toLowerCase())}%`);
    const rows = must(await qy.limit(2000), "suggest") as { school: string; sport: string }[];
    const groups = new Map<string, { school: string; sport: string; staff: number }>();
    for (const r of rows) {
      const k = `${r.school}|${r.sport}`;
      const g = groups.get(k) ?? { school: r.school, sport: r.sport, staff: 0 };
      g.staff++;
      groups.set(k, g);
    }
    return [...groups.values()].sort((a, b) => b.staff - a.staff || a.school.localeCompare(b.school)).slice(0, limit);
  }
  async insertDraft(d: Omit<AskDraft, "id" | "created_at" | "status" | "request_id">) {
    return must(await this.db.from("ask_drafts").insert(d).select("*").single(), "draft.insert") as AskDraft;
  }
  async getDraft(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    return must(await this.db.from("ask_drafts").select("*").eq("id", id).maybeSingle(), "draft") as AskDraft | null;
  }
  async updateDraft(id: string, patch: Partial<AskDraft>) {
    return must(await this.db.from("ask_drafts").update(patch).eq("id", id).select("*").maybeSingle(), "draft.update") as AskDraft | null;
  }
  async getSavedPayer(email: string) {
    return must(await this.db.from("saved_payers").select("*").eq("email", email.toLowerCase()).maybeSingle(), "payer") as SavedPayer | null;
  }
  async upsertSavedPayer(p: Omit<SavedPayer, "updated_at">) {
    must(await this.db.from("saved_payers").upsert({ ...p, email: p.email.toLowerCase(), updated_at: new Date().toISOString() }), "payer.upsert");
  }
  async claimInbound(id: string, requestId: string | null, fromEmail: string | null) {
    const r = await this.db.from("inbound_messages").insert({ id, request_id: requestId, from_email: fromEmail, outcome: "processing" });
    if (!r.error) return true;
    if (r.error.code === "23505") {
      // A previous attempt crashed mid-way → allow the provider's retry to reprocess it.
      const retry = await this.db.from("inbound_messages").update({ outcome: "processing" }).eq("id", id).eq("outcome", "error").select("id");
      return !retry.error && (retry.data?.length ?? 0) > 0;
    }
    throw new Error(`[db] claimInbound: ${r.error.message}`);
  }
  async setInboundOutcome(id: string, outcome: string) {
    must(await this.db.from("inbound_messages").update({ outcome }).eq("id", id), "inbound.outcome");
  }
  async rateLimit(key: string, windowSeconds: number, max: number) {
    const r = await this.db.rpc("rate_limit_hit", { p_key: key, p_window_seconds: windowSeconds, p_max: max });
    if (r.error) {
      console.error("[rate-limit] failing open:", r.error.message);
      return true;
    }
    return r.data as boolean;
  }
}
