import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const API_BASE = process.env.API_BASE_URL || "http://localhost:3100";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    cors: true,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: API_BASE,
        changeOrigin: true,
      },
    },
  },
});
