import { BrowserWindow, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveAppPath } from "../util/paths";

let mainWindow: BrowserWindow | null = null;

function getPreloadPath(): string {
  const candidates = [
    resolveAppPath("dist", "main", "preload.js"),
    resolveAppPath("main", "preload.js"),
    resolveAppPath("src", "main", "preload.ts")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
}


function getRendererBaseUrl(): string {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    return devServerUrl;
  }

  const indexPath = resolveAppPath("dist", "renderer", "index.html");
  return pathToFileURL(indexPath).toString();
}

async function loadWindow(route?: string): Promise<void> {
  if (!mainWindow) return;
  const baseUrl = getRendererBaseUrl();
  const targetUrl = route ? `${baseUrl}#/${route}` : baseUrl;
  await mainWindow.loadURL(targetUrl);
}

export function showMainWindow(route?: string): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    void loadWindow(route);
    return;
  }

  mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    show: false,
    backgroundColor: "#f5f3ef",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: getPreloadPath()
    }
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  void loadWindow(route);
}
