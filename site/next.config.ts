import path from "node:path";
import type { NextConfig } from "next";

// The site is static. On GitHub Pages it is exported and served under the
// repository's name (NEXT_OUTPUT=export, NEXT_PUBLIC_BASE_PATH=/<repo>);
// anywhere else leave both unset.
const exported = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  trailingSlash: true,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  output: exported ? "export" : undefined,
  images: { unoptimized: true },
  // The playground runs the library's own source (../src), not a copy of it.
  turbopack: { root: path.join(import.meta.dirname, "..") },
};

export default nextConfig;
