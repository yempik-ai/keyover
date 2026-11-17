import { readFileSync } from "node:fs";
import path from "node:path";
import { site } from "@/content/site";

/**
 * An example from the repository's `examples` folder, as a reader would write
 * it: importing the package by its name. The files are typechecked against
 * the real SDKs, so the code on the page is code that compiles.
 */
export function example(name: "openai" | "anthropic" | "ai-sdk" | "observe"): string {
  const file = path.join(process.cwd(), "..", "examples", `${name}.ts`);
  return readFileSync(file, "utf8").replace('"../src/index.ts"', `"${site.name}"`).trim();
}
