import { defineConfig } from "vite";

// GitHub Pages serves a project site from /<repo-name>/, not from the domain
// root. The deploy workflow sets BASE_PATH; locally it stays "/".
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  // Three.js alone is ~700 kB minified (~180 kB gzipped); one chunk is fine for this app.
  build: { chunkSizeWarningLimit: 1000 },
});
