import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "__MSG_extName__",
  version: "0.1.0",
  description: "__MSG_extDescription__",
  default_locale: "en",
  permissions: ["storage", "activeTab"],
  host_permissions: ["<all_urls>", "https://api-free.deepl.com/*"],
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module" as const,
  },
  action: {
    default_popup: "src/popup/index.html",
    default_title: "Hover Translate",
  },
  commands: {
    "toggle-enabled": {
      suggested_key: {
        default: "Alt+Shift+T",
        mac: "Alt+Shift+T",
      },
      description: "Toggle hover translation on/off",
    },
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
  ],
});
