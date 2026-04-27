import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "AI Code Assistant",
  version: pkg.version,
  description: "Provider-agnostic AI assistant for web code editors.",
  permissions: ["storage", "activeTab", "sidePanel", "scripting"],
  host_permissions: [
    "https://openrouter.ai/*",
    "https://api.openai.com/*",
    "https://api.anthropic.com/*",
  ],
  optional_host_permissions: ["http://*/*", "https://*/*"],
  background: { service_worker: "src/background/service-worker.ts", type: "module" },
  side_panel: { default_path: "src/ui/panel/index.html" },
  options_page: "src/ui/options/index.html",
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/main-world.ts"],
      run_at: "document_start",
      all_frames: true,
      world: "MAIN",
    },
    {
      matches: ["<all_urls>"],
      js: ["src/content/content-script.ts"],
      run_at: "document_idle",
      all_frames: true,
    },
  ],
  commands: {
    "trigger-assist": {
      suggested_key: { default: "Ctrl+Shift+A", mac: "Command+Shift+A" },
      description: "Run AI on current selection",
    },
  },
  action: { default_title: "AI Code Assistant" },
  icons: { "16": "icons/16.png", "48": "icons/48.png", "128": "icons/128.png" },
});
