import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config) => {
    // Treat @dbos-inc/dbos-sdk as an external package for client builds
    config.externals = [
      ...config.externals,
      {
        "@dbos-inc/dbos-sdk": "commonjs @dbos-inc/dbos-sdk",
      },
    ];

    return config;
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['*.cloud.dbos.dev'], // Allow DBOS Cloud to call server actions
    },
  },
};

export default nextConfig;
