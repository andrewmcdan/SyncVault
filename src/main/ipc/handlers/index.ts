import { BrowserWindow, dialog, ipcMain, WebContents } from "electron";
import { IPC_CHANNELS } from "../channels";
import type {
  AddFileCommitPayload,
  AddFilePreviewResult,
  AwsProfileSelection,
  GitHubTokenPayload,
  LogEntry,
  SyncStatus
} from "../../../shared/types";
import { parseDotenv, isLikelySecretKey } from "../../services/parser/dotenv";
import { collectSecretKeys } from "../../services/parser/template";
import { addFileFromPath } from "../../services/add-file";
import {
  listAwsProfiles,
  getAwsSelection,
  setAwsSelection
} from "../../services/auth/aws-auth";
import {
  clearGitHubToken,
  getGitHubToken,
  setGitHubToken
} from "../../services/auth/github-auth";

const statusSubscribers = new Set<WebContents>();
const logSubscribers = new Set<WebContents>();

let currentStatus: SyncStatus = {
  state: "ready",
  message: "Ready",
  updatedAt: new Date().toISOString()
};

let logs: LogEntry[] = [
  {
    id: "log-boot",
    level: "info",
    message: "SyncVault initialized",
    timestamp: new Date().toISOString()
  }
];

function addSubscriber(set: Set<WebContents>, sender: WebContents): void {
  set.add(sender);
  const cleanup = () => set.delete(sender);
  sender.once("destroyed", cleanup);
}

export function publishStatus(nextStatus: SyncStatus): void {
  currentStatus = nextStatus;
  for (const subscriber of statusSubscribers) {
    subscriber.send(IPC_CHANNELS.STATUS_EVENT, currentStatus);
  }
}

export function appendLog(entry: LogEntry): void {
  logs = [entry, ...logs].slice(0, 200);
  for (const subscriber of logSubscribers) {
    subscriber.send(IPC_CHANNELS.LOGS_EVENT, entry);
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.STATUS_GET, () => currentStatus);
  ipcMain.handle(IPC_CHANNELS.LOGS_GET, () => logs);
  ipcMain.handle(IPC_CHANNELS.ADD_FILE_PICK, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      properties: ["openFile"],
      filters: [
        { name: "Env files", extensions: ["env"] },
        { name: "All files", extensions: ["*"] }
      ]
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(
    IPC_CHANNELS.ADD_FILE_PREVIEW,
    async (_event, filePath: string): Promise<AddFilePreviewResult> => {
      const { readFileSync } = await import("node:fs");
      const content = readFileSync(filePath, "utf8");
      const parsed = parseDotenv(content);
      const suggestedSecretKeys = collectSecretKeys(parsed, isLikelySecretKey);
      const lines = parsed.lines.map((line, index) => ({
        index,
        raw: line.raw,
        type: line.type,
        key: line.type === "kv" ? line.key : undefined
      }));
      return { filePath, lines, suggestedSecretKeys };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.ADD_FILE_COMMIT,
    async (_event, payload: AddFileCommitPayload) => {
      return addFileFromPath(payload.filePath, {
        secretKeys: payload.secretKeys
      });
    }
  );

  ipcMain.handle(IPC_CHANNELS.AWS_PROFILES_LIST, () => listAwsProfiles());
  ipcMain.handle(IPC_CHANNELS.AWS_PROFILE_GET, () => getAwsSelection());
  ipcMain.handle(
    IPC_CHANNELS.AWS_PROFILE_SET,
    (_event, selection: AwsProfileSelection) => {
      setAwsSelection(selection);
      return selection;
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GITHUB_TOKEN_SET,
    (_event, payload: GitHubTokenPayload) => {
      const token = payload.token?.trim();
      if (!token) {
        throw new Error("GitHub token is required.");
      }
      setGitHubToken(token);
      return { ok: true };
    }
  );

  ipcMain.handle(IPC_CHANNELS.GITHUB_AUTH_STATUS, () => ({
    isAuthenticated: Boolean(getGitHubToken())
  }));

  ipcMain.handle(IPC_CHANNELS.GITHUB_AUTH_CLEAR, () => {
    clearGitHubToken();
    return { ok: true };
  });

  ipcMain.on(IPC_CHANNELS.STATUS_SUBSCRIBE, (event) => {
    addSubscriber(statusSubscribers, event.sender);
    event.sender.send(IPC_CHANNELS.STATUS_EVENT, currentStatus);
  });

  ipcMain.on(IPC_CHANNELS.LOGS_SUBSCRIBE, (event) => {
    addSubscriber(logSubscribers, event.sender);
    for (const entry of logs) {
      event.sender.send(IPC_CHANNELS.LOGS_EVENT, entry);
    }
  });
}
