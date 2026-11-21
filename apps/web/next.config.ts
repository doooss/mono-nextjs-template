import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages ship TS source (JIT) — Next compiles them.
  transpilePackages: ['@repo/ui'],
  // Self-contained server bundle, only for the optional Docker image (docker/web.Dockerfile
  // sets BUILD_STANDALONE=true). Plain `next start` stays warning-free.
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
};

export default nextConfig;
