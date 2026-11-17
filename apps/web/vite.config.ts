import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// One Worker serves the API, the Durable Objects and the built single-page app (see wrangler.jsonc).
export default defineConfig({
  plugins: [react(), cloudflare()],
});
