import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for the Docker build (see Dockerfile): produces .next/standalone
  // with a minimal server.js and a pruned node_modules. It does NOT copy
  // public/ or .next/static — the Dockerfile copies those in explicitly.
  output: "standalone",
};

export default nextConfig;
