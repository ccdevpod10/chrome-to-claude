import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    rollupOptions: {
      input: {
        panel: "src/ui/panel/index.html",
        options: "src/ui/options/index.html",
      },
    },
  },
  server: { port: 5173, strictPort: true, hmr: { port: 5173 } },
});
