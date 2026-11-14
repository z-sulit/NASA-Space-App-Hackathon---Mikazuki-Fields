import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The FastAPI backend (backend/, run from the repo root) serves /api on :8000.
    // Without it the app falls back to public/fallback_plans.json, then src/engine.
    proxy: { "/api": "http://localhost:8000" },
  },
});
