import Link from "next/link";
import { home } from "@/content/home";
import { site } from "@/content/site";

export default function Footer() {
  const { footer } = home;
  return (
    <footer className="footer">
      <div className="footer-inner">
        <p className="footer-mark">{site.name}</p>
        <p>
          {footer.made} <a href={site.maker.url}>{site.maker.name}</a>. {footer.license}.
        </p>
        <nav aria-label="Footer">
          <a href={site.repo}>{footer.links.github}</a>
          <a href={site.package}>{footer.links.npm}</a>
          <Link href="/errors/">{footer.links.errors}</Link>
          <a href={`${site.url}/llms.txt`}>{footer.links.llms}</a>
        </nav>
      </div>
    </footer>
  );
}
