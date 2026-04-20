import { watch } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = path.dirname(currentFilePath);
const workspacePath = path.resolve(currentDirectoryPath, "..");
const sourceFilePath = path.join(workspacePath, "src", "index.html");
const destinationDirectoryPath = path.join(workspacePath, "dist");
const destinationFilePath = path.join(destinationDirectoryPath, "index.html");
const watchModeEnabled = process.argv.includes("--watch");

async function copyPopupHtmlFile() {
  await mkdir(destinationDirectoryPath, { recursive: true });
  await copyFile(sourceFilePath, destinationFilePath);
  console.log(`Synchronized ${sourceFilePath} -> ${destinationFilePath}`);
}

await copyPopupHtmlFile();

if (watchModeEnabled) {
  console.log("Watching popup HTML for changes...");

  let copyInProgress = false;
  let pendingCopyRequested = false;

  async function scheduleCopy() {
    if (copyInProgress) {
      pendingCopyRequested = true;
      return;
    }

    copyInProgress = true;

    try {
      await copyPopupHtmlFile();
    } catch (error) {
      console.error("Failed to synchronize popup HTML:", error);
    } finally {
      copyInProgress = false;

      if (pendingCopyRequested) {
        pendingCopyRequested = false;
        await scheduleCopy();
      }
    }
  }

  watch(sourceFilePath, async (eventType) => {
    if (eventType === "change" || eventType === "rename") {
      await scheduleCopy();
    }
  });
}
