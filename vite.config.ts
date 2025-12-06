import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { copyFileSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "copy-extension-files",
      closeBundle() {
        const distDir = resolve(__dirname, "dist");
        if (!existsSync(distDir)) {
          mkdirSync(distDir, { recursive: true });
        }
        copyFileSync(
          resolve(__dirname, "public/manifest.json"),
          resolve(distDir, "manifest.json")
        );
        copyFileSync(
          resolve(__dirname, "public/background.js"),
          resolve(distDir, "background.js")
        );
        const iconPath = resolve(__dirname, "public/icon.svg");
        if (existsSync(iconPath)) {
          copyFileSync(iconPath, resolve(distDir, "icon.svg"));
        }
        // Move popup.html from nested path to dist root and fix paths
        const nestedPopup = resolve(distDir, "src/popup/popup.html");
        if (existsSync(nestedPopup)) {
          let html = readFileSync(nestedPopup, "utf-8");
          // Fix relative paths to be direct
          html = html.replace(/\.\.\/\.\.\//g, "./");
          writeFileSync(resolve(distDir, "popup.html"), html);
          rmSync(resolve(distDir, "src"), { recursive: true, force: true });
        }
      },
    },
  ],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/popup.html"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
});
