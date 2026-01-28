import fs from "node:fs";
import path from "node:path";

export function writeFileAtomic(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tempPath = path.join(dir, `.${base}.${Date.now()}.tmp`);

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, filePath);
}
