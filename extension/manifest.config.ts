import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Email Agent for Gmail",
  description:
    "Agent that lives inside Gmail — reads the open thread and inserts a reply into compose.",
  version: "0.3.0",
  permissions: ["storage", "sidePanel"],
  host_permissions: [
    "https://mail.google.com/*",
    "http://127.0.0.1:3000/*",
    "http://localhost:3000/*",
  ],
  externally_connectable: {
    matches: ["http://127.0.0.1:3000/*", "http://localhost:3000/*"],
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  action: {
    default_title: "Email Agent",
  },
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  commands: {
    _execute_action: {
      suggested_key: {
        default: "Ctrl+Shift+E",
        mac: "Command+Shift+E",
      },
      description: "Open Email Agent",
    },
  },
  content_scripts: [
    {
      matches: ["https://mail.google.com/*"],
      js: ["src/content-scripts/index.ts"],
      css: ["src/content-scripts/badge.css"],
      run_at: "document_idle",
    },
  ],
});
