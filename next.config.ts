import type { NextConfig } from "next";

const config: NextConfig = { ...(process.env.NEXT_BUILD_DIR ? { distDir: process.env.NEXT_BUILD_DIR } : {}), turbopack: { root: process.cwd() }, allowedDevOrigins: ["127.0.0.1"] };
export default config;
