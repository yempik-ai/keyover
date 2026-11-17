import type { Metadata } from "next";
import Link from "next/link";
import { CONTRACTS } from "@spec/contracts";
import Footer from "@/components/Footer";
import Nav from "@/components/Nav";
import { providers } from "@/content/providers";
import { site } from "@/content/site";
import { pageMetadata } from "@/lib/seo";

const title = "AI API billing and quota errors, by provider";
const description =
  "What OpenAI, Anthropic, Gemini, OpenRouter, Groq, DeepSeek, Mistral, Together, Fireworks and Cerebras answer when credit runs out or a spend limit is reached: the status, the body, and how to keep serving.";

export const metadata: Metadata = pageMetadata({ path: "/errors", title, description });

export default function ErrorsIndex() {
  return (
    <>
      <header className="subhead">
        <Nav />
      </header>
      <main className="doc">
        <h1>{title}</h1>
        <p className="doc-lede">
          Every provider has its own way to say the money ran out, and several say it with a status that looks like
          something else. These pages give the exact status and body of each answer, where it is documented, and what{" "}
          {site.name} does with it.
        </p>
        <ul className="doc-index">
          {providers.map((provider) => {
            const mine = CONTRACTS.filter((contract) => contract.provider === provider.id);
            return (
              <li key={provider.id}>
                <Link href={`/errors/${provider.id}/`}>
                  <h2>{provider.name}</h2>
                  <p>{provider.blurb}</p>
                  <ul>
                    {mine.slice(0, 3).map((contract) => (
                      <li key={contract.title}>
                        <code>{contract.status}</code> {contract.title}
                      </li>
                    ))}
                  </ul>
                </Link>
              </li>
            );
          })}
        </ul>
      </main>
      <Footer />
    </>
  );
}
