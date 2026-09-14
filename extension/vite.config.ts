import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(root, "..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const apiSecret = env.LOCAL_API_SECRET || "";

  return {
    root,
    plugins: [crx({ manifest })],
    define: {
      __API_SECRET__: JSON.stringify(apiSecret),
    },
    build: {
      outDir: path.join(root, "dist"),
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      strictPort: true,
      hmr: {
        port: 5173,
      },
    },
  };
});
