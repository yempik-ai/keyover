import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CONTRACTS, type Contract } from "@spec/contracts";
import Code from "@/components/Code";
import Footer from "@/components/Footer";
import JsonLd from "@/components/JsonLd";
import Nav from "@/components/Nav";
import { providerOf, providers, verdicts } from "@/content/providers";
import { absolute, site } from "@/content/site";
import { pageMetadata } from "@/lib/seo";
import { snippet } from "@/lib/snippets";

export const dynamicParams = false;

export function generateStaticParams() {
  return providers.map((provider) => ({ provider: provider.id }));
}

type Params = { params: Promise<{ provider: string }> };

function copy(id: string) {
  const provider = providerOf(id);
  if (!provider) return null;
  const mine = CONTRACTS.filter((contract) => contract.provider === provider.id);
  const title = `${provider.name} billing and quota errors`;
  const description = `What ${provider.name} answers when credit runs out, a spend limit is reached or a key is refused: ${mine
    .filter((contract) => contract.expect !== null)
    .slice(0, 3)
    .map((contract) => `${contract.status} ${contract.title}`)
    .join("; ")}. The exact status and body, and how to keep serving.`;
  return { provider, mine, title, description };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = copy((await params).provider);
  if (!page) return {};
  return pageMetadata({ path: `/errors/${page.provider.id}`, title: page.title, description: page.description });
}

const slug = (contract: Contract) =>
  `${contract.status}-${contract.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

export default async function ProviderErrors({ params }: Params) {
  const page = copy((await params).provider);
  if (!page) notFound();
  const { provider, mine, title, description } = page;
  const moves = mine.filter((contract) => contract.expect !== null);
  const stays = mine.filter((contract) => contract.expect === null);

  return (
    <>
      <header className="subhead">
        <Nav />
      </header>
      <main className="doc">
        <p className="crumbs">
          <Link href="/errors/">Error reference</Link>
        </p>
        <h1>{title}</h1>
        <p className="doc-lede">
          The answers {provider.name} gives when an organization cannot pay for a request, and the ones that look
          similar but are not about money. For each: the status, the body, and what {site.name} does with it.
        </p>

        <h2 className="doc-group">Rejections about money or the key</h2>
        {moves.map((contract) => (
          <Entry key={slug(contract)} contract={contract} provider={provider.name} />
        ))}

        {stays.length > 0 && (
          <>
            <h2 className="doc-group">Answers that are not a reason to change key</h2>
            {stays.map((contract) => (
              <Entry key={slug(contract)} contract={contract} provider={provider.name} />
            ))}
          </>
        )}

        <h2 className="doc-group">Keep serving through it</h2>
        <p className="doc-text">
          Give the pool a second key that bills another organization you are authorized to use. When {provider.name}{" "}
          refuses the first for one of the rejections above, the same request is sent again on the second, inside the
          same call. Your code gets a normal response, and an event tells you which organization needs attention.
        </p>
        <Code code={snippet(provider)} />
        <p className="doc-text">
          <Link href="/">See it fail over in the playground</Link>, or read the{" "}
          <a href={`${site.repo}#readme`}>README</a>.
        </p>

        <nav className="doc-more" aria-label="Other providers">
          {providers
            .filter((other) => other.id !== provider.id)
            .map((other) => (
              <Link key={other.id} href={`/errors/${other.id}/`}>
                {other.name}
              </Link>
            ))}
        </nav>
      </main>
      <Footer />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "TechArticle",
          headline: title,
          description,
          url: absolute(`/errors/${provider.id}`),
          about: { "@type": "SoftwareApplication", name: provider.name },
          author: { "@type": "Organization", name: site.maker.name, url: site.maker.url },
          isPartOf: { "@type": "WebSite", name: site.name, url: `${site.url}/` },
        }}
      />
    </>
  );
}

function Entry({ contract, provider }: { contract: Contract; provider: string }) {
  const verdict = contract.expect === null ? verdicts.pass : verdicts[contract.expect];
  return (
    <article className="entry" id={slug(contract)} data-moves={contract.expect !== null && contract.expect !== "provider_limit"}>
      <h3>
        <code className="status">{contract.status}</code>
        {contract.title}
      </h3>
      <p className="verdict">{verdict}</p>
      {contract.note && <p className="doc-text">{contract.note}</p>}
      {contract.body !== null && <Code lang="json" code={JSON.stringify(contract.body, null, 2)} />}
      {contract.headers && (
        <p className="doc-text">
          Sent with the header{" "}
          {Object.entries(contract.headers).map(([name, value]) => (
            <code key={name}>
              {name}: {value}
            </code>
          ))}
          .
        </p>
      )}
      <p className="evidence">
        {contract.evidence === "documented" ? `Documented by ${provider}` : "Reported in the field"}:{" "}
        <a href={contract.source}>{new URL(contract.source).hostname.replace(/^www\./, "")}</a>
        {contract.body !== null && ". The body shows the fields the source establishes."}
      </p>
    </article>
  );
}
