import type { Provider } from "@/content/providers";
import { site } from "@/content/site";
import { example } from "./examples";

/** The few lines that put the pool in front of a provider, as its error page shows them. */
export function snippet(provider: Provider): string {
  if (provider.id === "openai" || provider.id === "anthropic") return example(provider.id);
  const pool = `const pool = createKeyPool({
  provider: ${provider.profile},
  keys: {
    primary: process.env.${provider.keyEnv},
    spare: process.env.${provider.keyEnv}_SPARE,
  },
})`;
  if (provider.id === "gemini") {
    return `import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createKeyPool, ${provider.profile} } from "${site.name}"

${pool}

const google = createGoogleGenerativeAI(pool.clientOptions)`;
  }
  return `import OpenAI from "openai"
import { createKeyPool, ${provider.profile} } from "${site.name}"

${pool}

const client = new OpenAI({ ...pool.clientOptions, baseURL: "${provider.baseURL}" })`;
}
