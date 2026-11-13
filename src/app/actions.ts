"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { addCoachSchema, applicationSchema, fieldErrors, requestSchema } from "@/lib/validation";
import { createRequestAndCheckout, UserFacingError } from "@/lib/services/lifecycle";
import { checkFilmLink, sendPayoutInvite } from "@/lib/services/experience";
import { alertAdmin } from "@/lib/services/notify";
import { clientIp, getDeps } from "@/lib/server";
import { slugify } from "@/lib/format";
import { log } from "@/lib/log";
import { toE164 } from "@/lib/phone";

export interface FormState {
  ok?: boolean;
  error?: string;
  fields?: Record<string, string>;
  values?: Record<string, string>;
}

const formValues = (fd: FormData) =>
  Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string").map(([k, v]) => [k, String(v)]));

export async function submitRequest(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  const parsed = requestSchema.safeParse(values);
  if (!parsed.success) return { error: "Please fix the highlighted fields.", fields: fieldErrors(parsed.error), values };
  // Catch private/broken film links BEFORE payment — the #1 reason an order would fail.
  const film = await checkFilmLink(parsed.data.filmUrl);
  if (film.status === "private" || film.status === "not_found")
    return { error: "The coach won't be able to open your film link.", fields: { filmUrl: film.message ?? "Check your film link." }, values };
  let url: string;
  try {
    const deps = await getDeps();
    ({ url } = await createRequestAndCheckout(deps, parsed.data, { ip: await clientIp() }));
  } catch (e) {
    if (e instanceof UserFacingError) return { error: e.message, values };
    log("error", "checkout creation failed", { error: String(e) });
    return { error: "We couldn't start checkout. Please try again in a moment.", values };
  }
  redirect(url);
}

export async function joinWaitlist(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = z.string().trim().toLowerCase().email().safeParse(fd.get("email"));
  const coachId = z.string().uuid().safeParse(fd.get("coachId"));
  if (!email.success || !coachId.success) return { error: "Enter a valid email." };
  if (fd.get("company")) return { ok: true };
  const deps = await getDeps();
  if (!(await deps.store.rateLimit(`waitlist:${await clientIp()}`, 3600, 20))) return { error: "Please try again later." };
  await deps.store.addWaitlist(coachId.data, email.data);
  return { ok: true };
}

export async function submitApplication(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  const parsed = applicationSchema.safeParse(values);
  if (!parsed.success) return { error: "Please fix the highlighted fields.", fields: fieldErrors(parsed.error), values };
  const deps = await getDeps();
  if (!(await deps.store.rateLimit(`apply:${await clientIp()}`, 3600, 5))) return { error: "Too many applications. Try again later." };
  const a = parsed.data;
  const phone = toE164(a.phone);
  if (a.phone && !phone) return { error: "Please fix the highlighted fields.", fields: { phone: "Enter a valid US mobile number" }, values };
  if ((await deps.store.findCoachesByEmail(a.email)).some((c) => c.listing_type === "participating"))
    return { ok: true }; // don't reveal whether an email is registered
  const base = slugify(a.fullName) || "coach";
  let slug = base;
  for (let i = 2; await deps.store.getCoachBySlug(slug); i++) slug = `${base}-${i}`;
  const coach = await deps.store.insertCoach({
    slug,
    full_name: a.fullName,
    email: a.email,
    sport: a.sport,
    title: a.title,
    school: a.school,
    division: a.division,
    state: a.state?.toUpperCase() ?? null,
    coach_kind: a.coachKind,
    credentials: a.credentials,
    application_message: a.message,
    phone,
    sms_opt_in_at: phone && a.smsConsent === "on" ? new Date().toISOString() : null,
    listing_type: "participating",
    source: "self",
    verification_status: "unverified",
    eligibility_status: "not_reviewed",
    self_attested_at: new Date().toISOString(),
    eligibility_basis: `Self-attested on application ${new Date().toISOString().slice(0, 10)}: permitted to accept payment under the rules that apply to them (${a.coachKind.replace("_", " ")}).`,
  });
  // No approval: they go live as soon as they open the confirmation (coach hub) link we email them.
  await sendPayoutInvite(deps, coach).catch((e) => log("error", "welcome email failed", { error: String(e) }));
  await alertAdmin(deps, "New coach signed up", [`${a.fullName} (${a.sport}, ${a.coachKind})`, a.email], `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/admin/coaches/${coach.id}`);
  return { ok: true };
}

/** "Can't find your coach?" — a family adds any coach by name + email, then requests them. */
export async function addCoachAndRequest(_prev: FormState, fd: FormData): Promise<FormState> {
  const values = formValues(fd);
  const parsed = addCoachSchema.safeParse(values);
  if (!parsed.success) return { error: "Please fix the highlighted fields.", fields: fieldErrors(parsed.error), values };
  const deps = await getDeps();
  if (!(await deps.store.rateLimit(`addcoach:${await clientIp()}`, 3600, 10))) return { error: "Too many attempts. Try again later.", values };
  const a = parsed.data;
  if (await deps.store.isSuppressed(a.coachEmail)) return { error: "This coach has asked not to receive requests.", values };
  const existing = (await deps.store.findCoachesByEmail(a.coachEmail)).find((c) => !c.removed);
  let slug = existing?.slug;
  if (!slug) {
    const base = slugify(`${a.coachName} ${a.school}`) || "coach";
    slug = base;
    for (let i = 2; await deps.store.getCoachBySlug(slug); i++) slug = `${base}-${i}`;
    await deps.store.insertCoach({
      slug, full_name: a.coachName, email: a.coachEmail, school: a.school, sport: a.sport, title: a.title,
      listing_type: "directory", source: "family", unlisted: true, coach_kind: "active_college",
    });
  }
  redirect(`/coaches/${slug}/request`);
}
