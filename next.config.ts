import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for the Docker build (see Dockerfile): produces .next/standalone
  // with a minimal server.js and a pruned node_modules. It does NOT copy
  // public/ or .next/static — the Dockerfile copies those in explicitly.
  output: "standalone",

  // Clickjacking defense: without this, /login (and every other page) could
  // be embedded in a hidden <iframe> on an attacker's site.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
