import path from "node:path"

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  productionBrowserSourceMaps: false,
  allowedDevOrigins: process.env.COZE_PROJECT_DOMAIN_DEFAULT
    ? [process.env.COZE_PROJECT_DOMAIN_DEFAULT]
    : [],
  turbopack: {
    root: path.resolve(process.cwd(), "../..")
  }
}

export default nextConfig
