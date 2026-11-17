// The site's identity. Every page, the metadata and llms.txt read it from here.

/** Set by the deploy (GitHub Pages serves this site under the repository's name). */
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const site = {
  name: "keyover",
  /** The public address, without a trailing slash. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://yempik-ai.github.io/keyover",
  repo: "https://github.com/yempik-ai/keyover",
  license: "MIT",
  maker: { name: "Yempik", url: "https://www.yempik.com" },
  author: { name: "Simone Bova", url: "https://simonebova.com" },
  install: "pnpm add keyover",
  /** The sentence to give a coding agent that should add the pool to a project. */
  installPrompt:
    "Add keyover to this project. Follow https://github.com/yempik-ai/keyover/blob/main/SPEC.md from start to finish.",
} as const;

/** The absolute address of a page, for canonical links, sitemaps and agents. */
export function absolute(path = ""): string {
  return `${site.url}${path}/`.replace(/\/+$/, "/");
}
