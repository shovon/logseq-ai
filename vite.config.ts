import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { logseqDevPlugin } from "./vite-plugins/logseq";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss({}), logseqDevPlugin(), react()],
  build: {
    target: "esnext",
    minify: "esbuild",
  },
});
