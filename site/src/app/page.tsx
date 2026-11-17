import type { Metadata } from "next";
import CopyButton from "@/components/CopyButton";
import Errors from "@/components/Errors";
import Footer from "@/components/Footer";
import JsonLd from "@/components/JsonLd";
import Nav from "@/components/Nav";
import Board from "@/components/play/Board";
import Headline from "@/components/play/Headline";
import Tour from "@/components/play/Tour";
import { PlaygroundProvider } from "@/components/play/usePlayground";
import { Check, Compare, Faq, How, Rule, Stories } from "@/components/Sections";
import { home } from "@/content/home";
import { site } from "@/content/site";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({ title: home.meta.title, description: home.meta.description });

/** What the project is, for search engines and answer engines. */
const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    "@id": `${site.url}/#software`,
    name: site.name,
    description: home.meta.description,
    url: `${site.url}/`,
    codeRepository: site.repo,
    sameAs: site.package,
    programmingLanguage: "TypeScript",
    runtimePlatform: "Node.js",
    license: "https://opensource.org/license/mit",
    author: { "@type": "Person", name: site.author.name, url: site.author.url },
    publisher: { "@type": "Organization", name: site.maker.name, url: site.maker.url },
    keywords:
      "API key failover, OpenAI insufficient_quota, Anthropic credit balance too low, AI SDK, fetch, billing, key pool, fallback API key, high availability",
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${site.url}/#website`,
    name: site.name,
    url: `${site.url}/`,
    publisher: { "@type": "Organization", name: site.maker.name, url: site.maker.url },
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: home.faq.items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  },
];

export default function Page() {
  const install = (
    <div className="install">
      <code>{site.install}</code>
      <CopyButton text={site.install} label={home.hero.copy} copied={home.hero.copied} />
    </div>
  );
  return (
    <>
      <main>
        <PlaygroundProvider>
          <section className="hero">
            <Nav />
            <div className="hero-body">
              <Headline lines={home.hero.headline} />
              <div className="hero-side">
                <p className="lede">{home.hero.lede}</p>
                <div className="cta">
                  {install}
                  <a className="link" href={site.repo}>
                    {home.hero.source}
                  </a>
                </div>
                <Tour>{install}</Tour>
              </div>
              <Board />
            </div>
          </section>
        </PlaygroundProvider>
        <Stories />
        <How />
        <Rule />
        <Errors />
        <Check />
        <Compare />
        <Faq />
      </main>
      <Footer />
      <JsonLd data={jsonLd} />
    </>
  );
}
