import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export function getAppRoot(): string {
  return app.getAppPath();
}

export function resolveAppPath(...segments: string[]): string {
  return path.join(getAppRoot(), ...segments);
}

export function resolveAssetPath(...segments: string[]): string {
  const appPath = resolveAppPath(...segments);
  if (fs.existsSync(appPath)) return appPath;
  return path.join(process.resourcesPath, ...segments);
}

export function getDataRoot(): string {
  return path.join(app.getPath("userData"), "data");
}

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}


export function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}
