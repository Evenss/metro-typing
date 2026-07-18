import type { NextConfig } from "next";

const pagesBasePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: pagesBasePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: pagesBasePath,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
