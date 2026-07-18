import type { MetadataRoute } from "next";
import { cities } from "../lib/metro/cities";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.PAGES_BASE_URL ?? "http://localhost:3000";

  return cities.map((city) => ({
    url: new URL(city.path, baseUrl).toString(),
    lastModified: new Date("2026-07-18"),
    changeFrequency: "monthly",
    priority: city.id === "hangzhou" ? 1 : 0.9,
  }));
}
