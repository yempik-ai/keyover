import Link from "next/link";
import { GithubLogo } from "@phosphor-icons/react/dist/ssr";
import { home } from "@/content/home";
import { site } from "@/content/site";
import Wordmark from "./Wordmark";

export default function Nav() {
  return (
    <nav className="nav" aria-label="Site">
      <Link className="wordmark" href="/" aria-label={`${site.name}, home`}>
        <Wordmark />
      </Link>
      <div className="nav-links">
        <Link href="/#how">{home.nav.how}</Link>
        <Link href="/errors/">{home.nav.errors}</Link>
        <a href={site.repo}>
          <GithubLogo size={18} weight="fill" aria-hidden="true" />
          {home.nav.github}
        </a>
      </div>
    </nav>
  );
}
