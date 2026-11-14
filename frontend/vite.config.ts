import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The FastAPI backend (Person 1) will serve /api on :8000. Until it exists,
    // the app falls back to the in-browser demo planner in src/engine.
    proxy: { "/api": "http://localhost:8000" },
  },
});
