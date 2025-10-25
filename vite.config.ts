import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { logseqDevPlugin } from "./vite-plugins/logseq";

export default defineConfig({
  plugins: [logseqDevPlugin(), react()],
  build: {
    target: "esnext",
    minify: "esbuild",
  },
});
