import { app, Menu, Tray, nativeImage, type Event as AppEvent } from "electron";
import { closeDatabase, initDatabase } from "../db/sqlite";
import { addFileFromClipboard } from "../services/add-file";
import type { SyncStatus } from "../../shared/types";
import { getCurrentStatus, onStatusChange, registerIpcHandlers } from "../ipc/handlers";
import { showMainWindow } from "../windows/main-window";
import { resolveAssetPath } from "../util/paths";
import { startSyncEngine, stopSyncEngine } from "../services/sync/engine";
import { getSyncSettings, setSyncSettings } from "../services/sync/settings";
import { detectGitHubAuthMode } from "../services/auth/github-auth";

let tray: Tray | null = null;
let currentStatus: SyncStatus = {
  state: "ready",
  message: "Ready",
  updatedAt: new Date().toISOString()
};

function formatStatusLabel(status: SyncStatus): string {
  const label =
    status.state === "syncing" ? "Syncing" : status.state === "error" ? "Error" : "Ready";
  const message =
    status.message && status.message !== label ? ` · ${status.message}` : "";
  return `Status: ${label}${message}`;
}

function buildTrayMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: formatStatusLabel(currentStatus), enabled: false },
    { type: "separator" },
    { label: "Add file from clipboard", click: () => { void addFileFromClipboard().catch((error) => console.error(error)); } },
    { label: "Add file (browse)", click: () => showMainWindow("add-file") },
    { label: "Pull file from remote", click: () => showMainWindow("pull-file") },
    { type: "separator" },
    { label: "Home...", click: () => showMainWindow() },
    { label: "Projects...", click: () => showMainWindow("projects") },
    { label: "Conflicts...", click: () => showMainWindow("conflicts") },
    { label: "Logs...", click: () => showMainWindow("logs") },
    { type: "separator" },
    {
      label: "Pause syncing",
      type: "checkbox",
      checked: getSyncSettings().paused,
      click: (menuItem) => {
        const next = setSyncSettings({ paused: menuItem.checked });
        if (next.paused) {
          void stopSyncEngine();
        } else {
          startSyncEngine();
        }
        if (tray) {
          tray.setContextMenu(buildTrayMenu());
        }
      }
    },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
}

function createTray(): void {
  if (tray) return;
  const iconPath = resolveAssetPath("assets", "icons", "tray", "tray.png");
  const icon = nativeImage.createFromPath(iconPath);
  const trayIcon = icon.isEmpty() ? nativeImage.createEmpty() : icon;
  tray = new Tray(trayIcon);
  tray.setToolTip("SyncVault");
  tray.setContextMenu(buildTrayMenu());
  tray.on("double-click", () => showMainWindow());
}

function registerAppHandlers(): void {
  app.on("window-all-closed", (event: AppEvent) => {
    event.preventDefault();
  });

  app.on("before-quit", () => {
    void stopSyncEngine();
    closeDatabase();
    tray?.destroy();
    tray = null;
  });
}

async function start(): Promise<void> {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.syncvault.tray");
  }

  try {
    await initDatabase();
  } catch (error) {
    console.error("Failed to initialize database", error);
    app.quit();
    return;
  }

  registerIpcHandlers();
  currentStatus = getCurrentStatus();
  onStatusChange((status) => {
    currentStatus = status;
    if (tray) {
      tray.setContextMenu(buildTrayMenu());
    }
  });
  registerAppHandlers();
  try {
    await detectGitHubAuthMode();
  } catch (error) {
    console.warn("GitHub auth detection failed", error);
  }
  createTray();
  startSyncEngine();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!tray) createTray();
  });

  app.whenReady().then(start);
}
