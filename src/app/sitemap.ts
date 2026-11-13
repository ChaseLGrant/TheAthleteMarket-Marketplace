import type { MetadataRoute } from "next";
import { getDeps } from "@/lib/deps";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://marketplace.theathletemarket.com";
  const base: MetadataRoute.Sitemap = ["", "/coaches", "/join", "/legal/terms", "/legal/privacy", "/legal/evaluator-policy"].map((p) => ({
    url: `${site}${p}`, changeFrequency: "weekly", priority: p === "" ? 1 : 0.6,
  }));
  try {
    const { coaches } = await (await getDeps()).store.searchCoaches({ availableOnly: true, limit: 60 });
    return [...base, ...coaches.map((c) => ({ url: `${site}/coaches/${c.slug}`, lastModified: c.updated_at, priority: 0.8 }))];
  } catch {
    return base;
  }
}
