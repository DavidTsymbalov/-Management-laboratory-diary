import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static files for Reg.ru / shared hosting (FTP upload of `out/`).
  output: "export",
  trailingSlash: true,
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
