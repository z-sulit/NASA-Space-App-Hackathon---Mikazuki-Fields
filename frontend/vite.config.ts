import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/leaflet")) return "leaflet";
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/") || id.includes("node_modules/scheduler")) {
            return "react-vendor";
          }
          if (id.includes("node_modules/three")) return "three";
        },
      },
    },
  },
  server: {
    port: 5173,
    // The FastAPI backend (backend/, run from the repo root) serves /api on :8000.
    // Without it the app falls back to public/fallback_plans.json, then src/engine.
    proxy: { "/api": "http://localhost:8000" },
  },
});
