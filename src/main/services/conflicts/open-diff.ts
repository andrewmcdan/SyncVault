import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { shell } from "electron";

const MAX_DIFF_BUFFER = 10 * 1024 * 1024;

function runGitDiff(localPath: string, remotePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["diff", "--no-index", "--", localPath, remotePath],
      { maxBuffer: MAX_DIFF_BUFFER },
      (error, stdout, stderr) => {
        if (error) {
          const rawCode = (error as { code?: string | number }).code;
          const exitCode =
            typeof rawCode === "number" ? rawCode : rawCode ? Number(rawCode) : undefined;
          if (exitCode !== 1) {
            reject(new Error(stderr || error.message));
            return;
          }
        }
        resolve(stdout ?? "");
      }
    );
  });
}

export async function openDiff(localPath: string, remotePath: string): Promise<string> {
  if (!localPath || !remotePath) {
    throw new Error("Both local and remote copy paths are required.");
  }
  if (!fs.existsSync(localPath) || !fs.existsSync(remotePath)) {
    throw new Error("One or both diff paths do not exist.");
  }
  const diffText = await runGitDiff(localPath, remotePath);
  const diffBody =
    diffText.trim().length > 0
      ? diffText
      : `No differences detected.\n\nLocal: ${localPath}\nRemote: ${remotePath}\n`;
  const diffPath = path.join(os.tmpdir(), `syncvault-diff-${Date.now()}.diff`);
  fs.writeFileSync(diffPath, diffBody, "utf8");
  await shell.openPath(diffPath);
  return diffPath;
}
