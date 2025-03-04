import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // ✅ Forces Next.js to treat API routes as runtime-only

  /* config options here */
  webpack: (config, { isServer, dev: _dev }) => {
    // Treat @dbos-inc/dbos-sdk and code using it as an external package for builds
    if (isServer) {
      config.externals = [
        ...config.externals,
        {
          "@dbos-inc/dbos-sdk": "commonjs @dbos-inc/dbos-sdk",
          "@dbos-inc/dbos-random": "commonjs @dbos-inc/dbos-random",
        },
        /^@dbos\/.+$/, // Treat ALL `@dbos/*` imports (from src/dbos) as external
      ];
    }

    return config;
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['*.cloud.dbos.dev'], // Allow DBOS Cloud to call server actions
    },
  },
};

export default nextConfig;
