import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config, { isServer, dev }) => {
    // Treat @dbos-inc/dbos-sdk as an external package for client builds
    config.externals = [
      ...config.externals,
      {
        "@dbos-inc/dbos-sdk": "commonjs @dbos-inc/dbos-sdk",
      },
    ];

    if (isServer || dev) {
      //If the minimizer is causing problems with class / function names,
      //  consider the following.
      const TerserPlugin = require('terser-webpack-plugin');

      config.optimization.minimizer = [
        new TerserPlugin({
          terserOptions: {
            keep_classnames: true, // Preserve class names
            keep_fnames: true,    // Preserve function names
          },
        }),
      ];

      // Or, more draconian:
      // config.optimization.minimize = false;
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
