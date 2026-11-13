import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://marketplace.theathletemarket.com";
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/r/", "/v/", "/coach/", "/unsubscribe/", "/demo", "/request/"] }],
    sitemap: `${site}/sitemap.xml`,
  };
}
