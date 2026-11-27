import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: [
      "@perspective-dev/client",
      "@perspective-dev/server",
      "@perspective-dev/viewer",
      "@perspective-dev/viewer-datagrid",
      "@perspective-dev/viewer-charts",
    ],
  },
  worker: {
    format: "es",
  },
  build: {
    target: "esnext",
  },
  server: {
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
