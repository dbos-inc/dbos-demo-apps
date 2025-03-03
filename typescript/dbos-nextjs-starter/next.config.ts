import type { NextConfig } from "next";

import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config, { isServer, dev }) => {
    // Treat @dbos-inc/dbos-sdk as an external package for client builds
    if (isServer) {
      config.output.pathinfo = true; // ✅ Shows which files are bundled
      config.externals = [
        ...config.externals,
        {
          "@dbos-inc/dbos-sdk": "commonjs @dbos-inc/dbos-sdk",
          //"@dbos/operations": "commonjs @dbos/operations",
        },

        ({context: _contextany, request}: {context: any, request: any}, callback: any) => {
          if (request.includes("operations")) {
            console.log(`🚀 Marking as external: ${request}`);
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
    }

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
