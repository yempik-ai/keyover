import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { home } from "@/content/home";
import { site } from "@/content/site";
import "./globals.css";

// The fonts are in the repository (src/app/fonts, SIL Open Font License), so
// the dev server and the build never wait on a font service.
const geist = localFont({ src: "./fonts/geist-latin-wght-normal.woff2", weight: "100 900", variable: "--font-sans" });
const geistMono = localFont({ src: "./fonts/geist-mono-latin-wght-normal.woff2", weight: "100 900", variable: "--font-mono" });
// The display face has two axes, weight and width: the headline is set narrow and heavy.
const archivo = localFont({
  src: "./fonts/archivo-latin-wdth-normal.woff2",
  weight: "100 900",
  variable: "--font-display",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
});

export const viewport: Viewport = { themeColor: "#ff5a1f" };

export const metadata: Metadata = {
  metadataBase: new URL(`${site.url}/`),
  title: { default: home.meta.title, template: `%s · ${site.name}` },
  description: home.meta.description,
  applicationName: site.name,
  authors: [{ name: site.author.name, url: site.author.url }],
  creator: site.maker.name,
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${archivo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
