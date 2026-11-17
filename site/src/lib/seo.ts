import type { Metadata } from "next";
import { absolute, site } from "@/content/site";

/**
 * The metadata of one page: its own title, description and address for search
 * engines and for link previews, so the canonical and the social card never
 * drift apart.
 */
export function pageMetadata(page: { path?: string; title: string; description: string }): Metadata {
  const { path = "", title, description } = page;
  const url = absolute(path);
  const image = { url: `${site.url}/og.png`, width: 1200, height: 630, alt: `${site.name}: out of credit, not out of service` };
  return {
    title: path === "" ? { absolute: title } : title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: site.name, locale: "en_US", type: "website", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}
