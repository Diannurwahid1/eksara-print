import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist", emptyOutDir: true, rollupOptions: { input: { main: resolve(fileURLToPath(new URL(".", import.meta.url)), "index.html"), print: resolve(fileURLToPath(new URL(".", import.meta.url)), "print.html") } } }
});
