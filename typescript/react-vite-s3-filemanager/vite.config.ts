import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "client",
  plugins: [react()],
  server: {
    port: 5173, // Default port (change if needed)
    proxy: {
      "/api": {
        target: "http://localhost:3000", // Express backend
        changeOrigin: true,
        secure: false,
      },
    },
  },
  resolve: {
    alias: {
      "@": "/client", // Allows importing like "@/components/Example"
    },
  },
  build: {
    outDir: "../dist/client", // ✅ Puts frontend build **outside** client/
    emptyOutDir: true, // ✅ Clears dist before building
  },
});
