import fs from "node:fs";
import path from "node:path";

export function writeFileAtomic(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tempPath = path.join(dir, `.${base}.${Date.now()}.tmp`);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tempPath, content, "utf8");
  try {
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    const retryable =
      err.code === "EEXIST" ||
      err.code === "EPERM" ||
      err.code === "ENOTEMPTY" ||
      err.code === "EACCES";
    if (!retryable) {
      try {
        fs.unlinkSync(tempPath);
      } catch {
        // best-effort cleanup
      }
      throw error;
    }

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      fs.renameSync(tempPath, filePath);
    } catch (fallbackError) {
      try {
        fs.copyFileSync(tempPath, filePath);
      } finally {
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // best-effort cleanup
        }
      }
      if (fallbackError) {
        // copyFileSync succeeded, ignore rename error
      }
    }
  }
}
