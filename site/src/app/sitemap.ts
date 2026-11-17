import type { MetadataRoute } from "next";
import { providers } from "@/content/providers";
import { absolute } from "@/content/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absolute(), priority: 1 },
    { url: absolute("/errors"), priority: 0.8 },
    ...providers.map((provider) => ({ url: absolute(`/errors/${provider.id}`), priority: 0.7 })),
  ];
}
