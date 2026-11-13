"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { applicationSchema, fieldErrors, requestSchema } from "@/lib/validation";
import { createRequestAndCheckout, UserFacingError } from "@/lib/services/lifecycle";
import { alertAdmin } from "@/lib/services/notify";
import { clientIp, getDeps } from "@/lib/server";
import { slugify } from "@/lib/format";
import { log } from "@/lib/log";

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
    listing_type: "participating",
    verification_status: "pending",
    eligibility_status: "pending_review",
  });
  await alertAdmin(deps, "New evaluator application", [`${a.fullName} (${a.sport}, ${a.coachKind})`, a.email], `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/admin/coaches/${coach.id}`);
  return { ok: true };
}
