import { ArrowBendDownRight, ArrowUUpLeft } from "@phosphor-icons/react/dist/ssr";
import Code from "@/components/Code";
import CopyButton from "@/components/CopyButton";
import Tabs from "@/components/Tabs";
import { home } from "@/content/home";
import { site } from "@/content/site";
import { example } from "@/lib/examples";

/** How it goes into a project: the code, or the sentence for an agent. */
export function How() {
  const { how, hero } = home;
  return (
    <section className="section how" id="how" aria-labelledby="how-title">
      <div className="section-head">
        <h2 id="how-title">{how.title}</h2>
        <p>{how.lede}</p>
      </div>
      <div className="how-grid">
        <Tabs
          label={how.tabs}
          tabs={(["openai", "anthropic", "ai-sdk"] as const).map((sdk) => ({
            name: how.sdks[sdk],
            panel: <Code code={example(sdk)} />,
          }))}
        />
        <aside className="agent">
          <h3>{how.agent.title}</h3>
          <p>{how.agent.text}</p>
          <blockquote>{site.installPrompt}</blockquote>
          <CopyButton className="pill" text={site.installPrompt} label={how.agent.copy} copied={hero.copied} />
        </aside>
      </div>
    </section>
  );
}

/** The safety rule: what moves to the next key, and what never does. */
export function Rule() {
  const { rule } = home;
  return (
    <section className="section rule" id="rule" aria-labelledby="rule-title">
      <div className="section-head wide">
        <h2 id="rule-title">{rule.title}</h2>
        <p>{rule.lede}</p>
      </div>
      <div className="ledger">
        <div className="ledger-col moves">
          <h3>
            <ArrowBendDownRight size={22} weight="bold" aria-hidden="true" />
            {rule.moves.title}
          </h3>
          <ul>
            {rule.moves.items.map((item) => (
              <li key={item.what}>
                <strong>{item.what}</strong>
                <code>{item.code}</code>
              </li>
            ))}
          </ul>
        </div>
        <div className="ledger-col stays">
          <h3>
            <ArrowUUpLeft size={22} weight="bold" aria-hidden="true" />
            {rule.stays.title}
          </h3>
          <ul>
            {rule.stays.items.map((item) => (
              <li key={item.what}>
                <strong>{item.what}</strong>
                <code>{item.code}</code>
                <p>{item.why}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** The drill command and what it prints. */
export function Check() {
  const { check, hero } = home;
  return (
    <section className="section check" id="check" aria-labelledby="check-title">
      <div className="section-head">
        <h2 id="check-title">{check.title}</h2>
        <p>{check.lede}</p>
      </div>
      <figure className="terminal">
        <div className="terminal-cmd">
          <code>$ {check.command}</code>
          <CopyButton text={check.command} label={hero.copy} copied={hero.copied} />
        </div>
        <pre>{check.output.join("\n")}</pre>
        <figcaption>{check.caption}</figcaption>
      </figure>
    </section>
  );
}

/** Real outages, in their owners' words, each linked to where it was said. */
export function Stories() {
  const { stories } = home;
  return (
    <section className="section stories" aria-labelledby="stories-title">
      <div className="section-head">
        <h2 id="stories-title">{stories.title}</h2>
        <p>{stories.lede}</p>
      </div>
      <div className="stories-grid">
        {stories.items.map((story, index) => (
          <figure key={story.href} className={index === 0 ? "story story-lead" : "story"}>
            <blockquote>{story.quote}</blockquote>
            <figcaption>
              <strong>{story.who}</strong>
              <a href={story.href}>{story.where}</a>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

/** The comparison with the two things people reach for first, and when they are the right call. */
export function Compare() {
  const { compare } = home;
  return (
    <section className="section compare" id="compare" aria-labelledby="compare-title">
      <div className="section-head">
        <h2 id="compare-title">{compare.title}</h2>
        <p>{compare.lede}</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Aspect</span>
              </th>
              <th scope="col">{compare.columns.rotator}</th>
              <th scope="col">{compare.columns.gateway}</th>
              <th scope="col" className="own">
                {compare.columns.own}
              </th>
            </tr>
          </thead>
          <tbody>
            {compare.rows.map((row) => (
              <tr key={row.aspect}>
                <th scope="row">{row.aspect}</th>
                <td data-label={compare.columns.rotator}>{row.rotator}</td>
                <td data-label={compare.columns.gateway}>{row.gateway}</td>
                <td data-label={compare.columns.own} className="own">
                  {row.own}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="aside">
        <strong>{compare.wrong.title}.</strong> {compare.wrong.text}
      </p>
    </section>
  );
}

export function Faq() {
  const { faq } = home;
  return (
    <section className="section faq" id="faq" aria-labelledby="faq-title">
      <div className="section-head">
        <h2 id="faq-title">{faq.title}</h2>
      </div>
      <div className="faq-list">
        {faq.items.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
