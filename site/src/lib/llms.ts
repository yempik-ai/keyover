import { CONTRACTS } from "@spec/contracts";
import { home } from "@/content/home";
import { providers, verdicts } from "@/content/providers";
import { absolute, site } from "@/content/site";
import { example } from "./examples";

// The site as plain text for language models (/llms.txt and /llms-full.txt),
// generated from the same content as the pages.

/** The short index: what the library is and where to read more. */
export function llmsIndex(): string {
  return [
    `# ${site.name}`,
    `> ${home.meta.description}`,
    [
      `${site.name} is open source (${site.license}), made at ${site.maker.name}. Source: ${site.repo}`,
      `Install: ${site.install}`,
      `Install prompt for a coding agent: ${site.installPrompt}`,
    ].join("\n"),
    "## Docs",
    [
      `- [README](${site.repo}#readme): what it is, quick start, guarantees, what counts as a rejection, limits`,
      `- [SPEC.md](${site.repo}/blob/main/SPEC.md): how to add ${site.name} to a project, written for coding agents`,
      `- [Everything on one page](${site.url}/llms-full.txt): this site as plain text`,
    ].join("\n"),
    "## Error reference",
    providers.map((provider) => `- [${provider.name}](${absolute(`/errors/${provider.id}`)}): ${provider.blurb}`).join("\n"),
  ].join("\n\n") + "\n";
}

/** Everything a model needs to answer questions about the library, in one file. */
export function llmsFull(): string {
  const { compare, rule, how, check, faq } = home;
  const table = [
    `| | ${compare.columns.rotator} | ${compare.columns.gateway} | ${compare.columns.own} |`,
    "|---|---|---|---|",
    ...compare.rows.map((row) => `| ${row.aspect} | ${row.rotator} | ${row.gateway} | ${row.own} |`),
  ].join("\n");

  const reference = providers
    .map((provider) => {
      const rows = CONTRACTS.filter((contract) => contract.provider === provider.id).map(
        (contract) =>
          `| ${contract.status} | ${contract.title} | ${contract.expect === null ? verdicts.pass : verdicts[contract.expect]} | ${contract.evidence}: ${contract.source} |`,
      );
      return [`### ${provider.name} (profile \`${provider.profile}\`)`, "| Status | Answer | What the pool does | Evidence |", "|---|---|---|---|", ...rows].join("\n");
    })
    .join("\n\n");

  return [
    `# ${site.name}`,
    `> ${home.meta.description}`,
    `Source: ${site.repo} · License: ${site.license} · Made at ${site.maker.name} (${site.maker.url})`,
    `## ${how.title}`,
    how.lede,
    `\`\`\`sh\n${site.install}\n\`\`\``,
    `\`\`\`ts\n${example("openai")}\n\`\`\``,
    `\`\`\`ts\n${example("anthropic")}\n\`\`\``,
    `\`\`\`ts\n${example("ai-sdk")}\n\`\`\``,
    `To have a coding agent add it: ${site.installPrompt}`,
    `## ${rule.title}`,
    rule.lede,
    `**${rule.moves.title}:** ${rule.moves.items.map((item) => `${item.what} (\`${item.code}\`)`).join("; ")}.`,
    `**${rule.stays.title}:** ${rule.stays.items.map((item) => `${item.what} (\`${item.code}\`): ${item.why}`).join(" ")}`,
    `## ${check.title}`,
    check.lede,
    `\`\`\`sh\n${check.command}\n\`\`\``,
    check.caption,
    `## ${compare.title}`,
    compare.lede,
    table,
    `${compare.wrong.title}. ${compare.wrong.text}`,
    "## Error reference",
    reference,
    "## Questions and answers",
    faq.items.map((item) => `### ${item.q}\n\n${item.a}`).join("\n\n"),
  ].join("\n\n") + "\n";
}
