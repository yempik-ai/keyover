import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { CONTRACTS } from "@spec/contracts";
import { home } from "@/content/home";
import { providers } from "@/content/providers";

/** The error reference, as a wall of the strings people paste into a search box. */
export default function Errors() {
  const { errors } = home;
  return (
    <section className="section errors" id="errors" aria-labelledby="errors-title">
      <div className="section-head">
        <h2 id="errors-title">{errors.title}</h2>
        <p>{errors.lede}</p>
      </div>
      <ul className="atlas">
        {providers.map((provider, index) => {
          const mine = CONTRACTS.filter((contract) => contract.provider === provider.id);
          const moves = mine.filter((contract) => contract.expect !== null && contract.expect !== "provider_limit").length;
          return (
            <li key={provider.id} className={index < 2 ? "atlas-item atlas-major" : "atlas-item"}>
              <Link href={`/errors/${provider.id}/`}>
                <h3>{provider.name}</h3>
                <p>{provider.blurb}</p>
                {provider.sample && <code>{provider.sample}</code>}
                <span className="atlas-count">
                  {moves} {errors.moves}, {mine.length - moves} {errors.stays}
                  <ArrowRight size={16} weight="bold" aria-hidden="true" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
