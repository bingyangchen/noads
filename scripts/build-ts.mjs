import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const scriptsDirectoryPath = path.dirname(currentFilePath);
const workspacePath = path.resolve(scriptsDirectoryPath, "..");
const watchModeEnabled = process.argv.includes("--watch");

const buildOptions = {
  absWorkingDir: workspacePath,
  bundle: true,
  entryPoints: ["src/background.ts", "src/content.ts", "src/main.ts"],
  format: "iife",
  logLevel: "info",
  outdir: "dist",
  platform: "browser",
  target: "es2020",
};

if (watchModeEnabled) {
  const buildContext = await esbuild.context(buildOptions);
  await buildContext.watch();
  console.log("Watching TypeScript bundles for changes...");
} else {
  await esbuild.build(buildOptions);
}
