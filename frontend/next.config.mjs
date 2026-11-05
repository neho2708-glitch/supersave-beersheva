import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const config = {
  // Domain logic lives in ../backend and is imported directly.
  experimental: { externalDir: true },
  outputFileTracingRoot: join(here, ".."),
  serverExternalPackages: ["@prisma/client"],
  images: { unoptimized: true },
};

export default config;
