import { z } from "zod";

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : null));

export function isSafeFilmUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    if (/^(localhost|127\.|10\.|192\.168\.|0\.)/.test(u.hostname)) return false;
    return u.hostname.includes(".");
  } catch {
    return false;
  }
}

const currentYear = new Date().getFullYear();

export const requestSchema = z
  .object({
    coachSlug: z.string().trim().min(1).max(80),
    athleteName: trimmed(80).min(2, "Enter the athlete's full name"),
    sport: trimmed(60).min(2, "Choose a sport"),
    position: trimmed(60).min(1, "Enter a position"),
    gradYear: z.coerce.number().int().min(currentYear - 6, "Check graduation year").max(currentYear + 8, "Check graduation year"),
    filmUrl: z.string().trim().max(500).refine(isSafeFilmUrl, "Paste a full https:// link to your film (Hudl, YouTube, etc.)"),
    athleteIsMinor: z.enum(["yes", "no"], { message: "Tell us whether the athlete is under 18" }),
    relationship: z.enum(["parent_guardian", "athlete_adult"]),
    purchaserName: trimmed(80).min(2, "Enter your name"),
    purchaserEmail: z.string().trim().toLowerCase().max(254).email("Enter a valid email"),
    athleteEmail: z
      .string().trim().toLowerCase().max(254).optional()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || z.string().email().safeParse(v).success, "Enter a valid athlete email"),
    metrics: optionalText(300),
    gpa: optionalText(10),
    message: optionalText(500),
    guardianConsent: z.string().optional(),
    acceptTerms: z.literal("on", { message: "Please accept the terms to continue" }),
    company: z.string().max(0, "Bot detected").optional(), // honeypot
    utmSource: optionalText(60),
    utmCampaign: optionalText(60),
    fromToken: optionalText(200), // "second opinion" link from a delivered evaluation
    offerCents: z.coerce.number().int().positive().optional(), // family's offer when the coach hasn't set a price
    format: z.enum(["written", "voice", "video"]).default("video"),
    purchaserPhone: z.string().trim().max(30).optional().transform((v) => (v ? v : null)),
    parentSmsConsent: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.athleteIsMinor === "yes" && v.relationship !== "parent_guardian") {
      ctx.addIssue({ code: "custom", path: ["relationship"], message: "A parent or guardian must place requests for athletes under 18" });
    }
    if (v.athleteIsMinor === "yes" && v.guardianConsent !== "on") {
      ctx.addIssue({ code: "custom", path: ["guardianConsent"], message: "Parent/guardian consent is required for athletes under 18" });
    }
  });

export type RequestInput = z.infer<typeof requestSchema>;

export const applicationSchema = z.object({
  fullName: trimmed(80).min(2, "Enter your name"),
  email: z.string().trim().toLowerCase().max(254).email("Enter a valid email"),
  sport: trimmed(60).min(2, "Choose a sport"),
  title: optionalText(80),
  school: optionalText(120),
  division: optionalText(30),
  state: optionalText(2),
  coachKind: z.enum(["active_college", "former_college", "independent", "pro_player"]),
  credentials: optionalText(300),
  message: optionalText(1000),
  attest: z.literal("on", { message: "Please confirm the statement above" }),
  phone: z.string().trim().max(30).optional().transform((v) => (v ? v : null)),
  smsConsent: z.string().optional(),
  company: z.string().max(0).optional(),
});

export const uploadRequestSchema = z.object({
  mime: z.string().max(100),
  size: z.number().int().positive(),
});

const takeaway = z.string().trim().max(200).optional().transform((v) => (v ? v : null));
export const submitSchema = z.object({
  path: z.string().max(300),
  durationSeconds: z.number().min(0).max(3600).nullable().optional(),
  attest: z.literal(true, { message: "Please confirm the coach attestation" }),
  takeaways: z.object({ strength: takeaway, improve: takeaway, next: takeaway }).optional(),
});

export const introSubmitSchema = z.object({
  path: z.string().max(300),
  durationSeconds: z.number().min(0).max(600).nullable().optional(),
  attest: z.literal(true, { message: "Please confirm" }),
});

export const addCoachSchema = z.object({
  coachName: trimmed(80).min(3, "Enter the coach's full name"),
  coachEmail: z.string().trim().toLowerCase().max(254).email("Enter the coach's email (usually on the school's staff directory)"),
  school: trimmed(120).min(2, "Enter the school or team"),
  sport: trimmed(60).min(2, "Choose a sport"),
  title: optionalText(80),
  company: z.string().max(0).optional(),
});

export const ratingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  wouldBuyAgain: z.boolean().nullable().optional(),
  comment: z.string().trim().max(500).optional().transform((v) => (v ? v : null)),
});

export const filmIssueSchema = z.object({ note: z.string().trim().max(300).optional().transform((v) => (v ? v : null)) });
export const filmFixSchema = z.object({
  filmUrl: z.string().trim().max(500).refine(isSafeFilmUrl, "Paste a full https:// link to your film"),
});

export function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const k = String(issue.path[0] ?? "form");
    if (!out[k]) out[k] = issue.message;
  }
  return out;
}
