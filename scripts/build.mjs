import archiver from "archiver";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const scriptsDirectoryPath = path.dirname(currentFilePath);
const workspacePath = path.resolve(scriptsDirectoryPath, "..");
const manifestFileName = "manifest.json";
const assetsDirectoryName = "assets";
const distributionDirectoryName = "dist";
const artifactPath = path.join(workspacePath, "build.zip");
const manifestFilePath = path.join(workspacePath, manifestFileName);
const assetsDirectoryPath = path.join(workspacePath, assetsDirectoryName);
const distributionDirectoryPath = path.join(workspacePath, distributionDirectoryName);
const npmExecutableName = process.platform === "win32" ? "npm.cmd" : "npm";

function runCommand(command, argumentsList) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, argumentsList, {
      cwd: workspacePath,
      stdio: "inherit",
    });

    childProcess.on("error", reject);
    childProcess.on("exit", (exitCode) => {
      if (exitCode === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed: ${command} ${argumentsList.join(" ")}`));
    });
  });
}

function createBuildArchive() {
  return new Promise((resolve, reject) => {
    const outputStream = createWriteStream(artifactPath);
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    outputStream.on("close", resolve);
    outputStream.on("error", reject);
    archive.on("warning", reject);
    archive.on("error", reject);

    archive.pipe(outputStream);
    archive.file(manifestFilePath, { name: manifestFileName });
    archive.directory(assetsDirectoryPath, assetsDirectoryName);
    archive.directory(distributionDirectoryPath, distributionDirectoryName);
    void archive.finalize();
  });
}

try {
  await runCommand(npmExecutableName, ["exec", "--", "tsc"]);
  await runCommand(npmExecutableName, ["run", "scss"]);
  await runCommand(npmExecutableName, ["run", "copy:popup-html"]);

  await rm(artifactPath, { force: true });
  await createBuildArchive();

  console.log("Done!");
  console.log(`Build artifact created: ${artifactPath}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
