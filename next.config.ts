import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const repository = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "-Management-laboratory-diary";
// configure-pages supplies an empty base path for custom domains and user sites.
const pagesBasePath = process.env.PAGES_BASE_PATH ??
  (repository.endsWith(".github.io") ? "" : `/${repository}`);
const basePath = isGitHubPages ? pagesBasePath : "";

const nextConfig: NextConfig = {
  // Static files for GitHub Pages and FTP (`out/`).
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath || undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  images: {
    unoptimized: true,
  },
  // Убрать индикатор «N» в углу во время dev
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
