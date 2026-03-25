import type { NextConfig } from "next";
import path from 'path';

const nextConfig: NextConfig = {
  // Ensure Next's output file tracing root is set to this project directory
  // to avoid warnings when multiple lockfiles exist on the machine.
  outputFileTracingRoot: __dirname,

  // Next.js runs ESLint during `next build` by default.
  // This repo uses the flat config (`eslint.config.js`), and some Next/ESLint combos
  // can fail builds due to option mismatches. Keep CI/dev lint via `npm run lint`.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
