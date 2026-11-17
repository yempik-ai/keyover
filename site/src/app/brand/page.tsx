import type { Metadata } from "next";
import Wordmark from "@/components/Wordmark";
import { home } from "@/content/home";

// The source of the repository's images (media/wordmark.png, public/og.png):
// each card below is screenshotted at its own size. Not linked, not indexed.
export const metadata: Metadata = { title: "Brand", robots: { index: false, follow: false } };

export default function Brand() {
  const { headline } = home.hero;
  return (
    <main className="brand">
      <div className="brand-mark" id="wordmark">
        <Wordmark />
      </div>
      <div className="brand-og" id="og">
        <Wordmark />
        <p className="headline">
          <span className="headline-line">{headline.first}</span>
          <span className="headline-line">
            <span className="not">{headline.not}</span> {headline.rest}
          </span>
        </p>
        <p className="brand-og-line">API key failover for OpenAI, Anthropic and the AI SDK</p>
        <p className="brand-og-chip">One fetch. No gateway.</p>
      </div>
    </main>
  );
}
