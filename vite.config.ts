import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Static GitHub Pages deployment model (no Actions, no SSR, no backend):
//   npm run build  →  dist/  →  deploy dist/ contents via Pages.
//
// `base: "./"` emits RELATIVE asset URLs (./assets/…) so the same dist/ works
// no matter which Pages source is used:
//   - main branch / (root)      → https://<user>.github.io/xpend/
//   - main branch /docs         → copy dist/* into docs/
//   - file:// preview           → still resolves
// An absolute base ("/xpend/") would break root- and file:// serving, so it is
// intentionally not used. PWA manifest keeps relative start_url/scope ("./")
// and the service worker is registered with a document-relative URL for the
// same reason.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    assetsDir: "assets",
  },
});
