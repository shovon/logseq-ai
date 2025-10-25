import { type PluginOption } from "vite";
import { rename } from "fs/promises";
import { join } from "path";

/**
 * Vite plugin to rename a specified HTML file (e.g., "index-browser.html") to
 * "index.html" in the output directory after build.
 *
 * @param {string} filename The original HTML filename to be renamed (e.g., "index-browser.html").
 * @returns {PluginOption} A Vite plugin option for renaming the file post-build.
 *
 * @example
 * // In vite.config.ts:
 * import { renameHtmlIndexPlugin } from "./vite-plugins";
 *
 * export default defineConfig({
 *   plugins: [renameHtmlIndexPlugin("index-browser.html")],
 * });
 */

export const renameHtmlIndexPlugin: (filename: string) => PluginOption = (
  filename
) => {
  return {
    name: "rename-html",
    async writeBundle(options): Promise<void> {
      const distPath = options.dir || "dist";
      const oldPath = join(distPath, filename);
      const newPath = join(distPath, "index.html");

      try {
        await rename(oldPath, newPath);
        console.log("✓ Renamed index-browser.html to index.html");
      } catch (error) {
        console.warn("Could not rename HTML file:", error);
      }
    },
  };
};
