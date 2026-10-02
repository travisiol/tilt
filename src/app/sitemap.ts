import type { MetadataRoute } from "next";
import { ASSETS } from "@/config/game";
import { site } from "@/config/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: site.url }, ...ASSETS.map((a) => ({ url: `${site.url}/rounds/${a.symbol.toLowerCase()}` }))];
}
