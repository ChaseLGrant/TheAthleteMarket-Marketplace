import "server-only";
import { headers } from "next/headers";
import { getDeps } from "./deps";
import { availabilityLabel } from "./compliance";
import type { Coach, Settings } from "./types";

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0] ?? "unknown").trim();
}

export async function isBot(): Promise<boolean> {
  const ua = (await headers()).get("user-agent") ?? "";
  return /bot|crawl|spider|slurp|preview|facebookexternalhit|linkedin|embedly|monitor/i.test(ua);
}

export function annotate(coaches: Coach[], settings: Settings) {
  return coaches.map((c) => ({ coach: c, availability: availabilityLabel(c, settings) }));
}

export { getDeps };
