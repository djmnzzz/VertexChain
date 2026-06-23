import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `output: 'standalone'` produces a self-contained `.next/standalone/`
  // directory that ships only the files Next.js traced as required at
  // runtime (server.js + a pruned `node_modules`). The Docker image at
  // `docker/frontend.Dockerfile` copies that directory into the runtime
  // stage, which is what keeps the production image minimal.
  //
  // `productionBrowserSourceMaps: false` skips inlining browser source
  // maps into the client bundle, which would otherwise bloat `.next/static`
  // and partially defeat the standalone-output trimming.
  output: "standalone",
  productionBrowserSourceMaps: false,
};

export default nextConfig;
