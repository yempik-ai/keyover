import { codeToHtml, createCssVariablesTheme } from "shiki";

// Colours come from the page's own tokens (globals.css, `.code`), not a theme file.
const theme = createCssVariablesTheme({ name: "page", variablePrefix: "--code-", fontStyle: false });

/** A block of code, highlighted at build time. No script reaches the browser. */
export default async function Code({ code, lang = "ts" }: { code: string; lang?: "ts" | "sh" | "text" | "json" }) {
  const html = await codeToHtml(code, { lang, theme });
  return <div className="code" dangerouslySetInnerHTML={{ __html: html }} />;
}
