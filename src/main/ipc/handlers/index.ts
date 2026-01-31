import { BrowserWindow, dialog, ipcMain, shell, WebContents } from "electron";
import { IPC_CHANNELS } from "../channels";
import type {
  AddFileCommitPayload,
  AddFilePreviewResult,
  AwsProfileSelection,
  ConflictListItem,
  ProjectListItem,
  ProjectFileListItem,
  DeleteProjectOptions,
  DeleteProjectResult,
  SyncSettings,
  GitHubTokenPayload,
  GitHubAuthStatus,
  PullFilePayload,
  RemoteFileItem,
  RemoteProjectItem,
  LogEntry,
  SyncStatus
} from "../../../shared/types";
import { parseDotenv, isLikelySecretKey, hasSecretMarker } from "../../services/parser/dotenv";
import { collectSecretKeys } from "../../services/parser/template";
import path from "node:path";
import { addFileFromPath } from "../../services/add-file";
import { getSyncSettings, setSyncSettings } from "../../services/sync/settings";
import { startSyncEngine, stopSyncEngine } from "../../services/sync/engine";
import { listOpenConflicts, resolveConflict } from "../../db/repositories/conflicts";
import { openDiff } from "../../services/conflicts/open-diff";
import { listProjectSummaries } from "../../db/repositories/projects";
import { listFilesByProject } from "../../db/repositories/files";
import {
  resolveConflictKeepLocal,
  resolveConflictKeepRemote
} from "../../services/conflicts/resolve-conflict";
import { listRemoteFiles, listRemoteProjects, pullRemoteFile } from "../../services/pull-file";
import {
  listAwsProfiles,
  getAwsSelection,
  setAwsSelection
} from "../../services/auth/aws-auth";
import {
  clearGitHubToken,
  getGitHubToken,
  setGitHubToken,
  getGitHubAuthMode
} from "../../services/auth/github-auth";
import { deleteProject, stopTrackingFile } from "../../services/projects";

const statusSubscribers = new Set<WebContents>();
const statusListeners = new Set<(status: SyncStatus) => void>();
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
  for (const listener of statusListeners) {
    listener(currentStatus);
  }
}

export function getCurrentStatus(): SyncStatus {
  return currentStatus;
}

export function onStatusChange(listener: (status: SyncStatus) => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
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
      const suggestedSecretKeys = collectSecretKeys(parsed, (line) =>
        isLikelySecretKey(line.key) || hasSecretMarker(line.valuePart)
      );
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

  ipcMain.handle(IPC_CHANNELS.GITHUB_AUTH_STATUS, (): GitHubAuthStatus => {
    const mode = getGitHubAuthMode();
    return {
      isAuthenticated: Boolean(getGitHubToken()),
      mode,
      message:
        mode === "native"
          ? "GitHub already enabled via system Git credentials."
          : undefined
    };
  });

  ipcMain.handle(IPC_CHANNELS.GITHUB_AUTH_CLEAR, () => {
    clearGitHubToken();
    return { ok: true };
  });

  ipcMain.handle(
    IPC_CHANNELS.PULL_PROJECTS_LIST,
    async (): Promise<RemoteProjectItem[]> => listRemoteProjects()
  );

  ipcMain.handle(
    IPC_CHANNELS.PULL_FILES_LIST,
    async (_event, owner: string, repo: string): Promise<RemoteFileItem[]> =>
      listRemoteFiles(owner, repo)
  );

  ipcMain.handle(
    IPC_CHANNELS.PULL_FILE_COMMIT,
    async (_event, payload: PullFilePayload): Promise<string> =>
      pullRemoteFile(payload.owner, payload.repo, payload.fileId)
  );

  ipcMain.handle(IPC_CHANNELS.PROJECTS_LIST, (): ProjectListItem[] => {
    return listProjectSummaries().map((project) => ({
      id: project.id,
      displayName: project.display_name ?? path.basename(project.local_repo_root),
      localRepoRoot: project.local_repo_root,
      localClonePath: project.local_clone_path,
      githubOwner: project.github_owner,
      githubRepo: project.github_repo,
      awsRegion: project.aws_region,
      awsSecretId: project.aws_secret_id,
      fileCount: project.file_count,
      destinationCount: project.destination_count,
      openConflicts: project.open_conflicts,
      createdAt: project.created_at
    }));
  });

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_FILES_LIST,
    (_event, projectId: string): ProjectFileListItem[] => {
      return listFilesByProject(projectId).map((file) => ({
        id: file.id,
        sourceRelativePath: file.source_relative_path,
        templatePath: file.template_path,
        mappingPath: file.mapping_path,
        destinationCount: file.destination_count,
        updatedAt: file.updated_at
      }));
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PROJECT_DELETE,
    async (_event, projectId: string, options: DeleteProjectOptions): Promise<DeleteProjectResult> =>
      deleteProject(projectId, options)
  );

  ipcMain.handle(IPC_CHANNELS.FILE_UNTRACK, (_event, fileId: string) => {
    return stopTrackingFile(fileId);
  });

  ipcMain.handle(IPC_CHANNELS.SYNC_SETTINGS_GET, (): SyncSettings => getSyncSettings());
  ipcMain.handle(IPC_CHANNELS.SYNC_SETTINGS_SET, async (_event, payload: Partial<SyncSettings>) => {
    const next = setSyncSettings(payload);
    await stopSyncEngine();
    startSyncEngine();
    return next;
  });

  ipcMain.handle(IPC_CHANNELS.CONFLICTS_LIST, (): ConflictListItem[] => {
    return listOpenConflicts().map((conflict) => ({
      id: conflict.id,
      destinationId: conflict.destination_id,
      destinationPath: conflict.destination_path,
      localCopyPath: conflict.local_copy_path,
      remoteCopyPath: conflict.remote_copy_path,
      status: conflict.status,
      detectedAt: conflict.detected_at
    }));
  });
  ipcMain.handle(IPC_CHANNELS.CONFLICT_RESOLVE, (_event, conflictId: string) => {
    resolveConflict(conflictId);
    return { ok: true };
  });
  ipcMain.handle(IPC_CHANNELS.CONFLICT_RESOLVE_LOCAL, async (_event, conflictId: string) => {
    await resolveConflictKeepLocal(conflictId);
    return { ok: true };
  });
  ipcMain.handle(IPC_CHANNELS.CONFLICT_RESOLVE_REMOTE, async (_event, conflictId: string) => {
    await resolveConflictKeepRemote(conflictId);
    return { ok: true };
  });
  ipcMain.handle(
    IPC_CHANNELS.CONFLICTS_OPEN_DIFF,
    async (_event, localPath: string, remotePath: string) => openDiff(localPath, remotePath)
  );

  ipcMain.handle(IPC_CHANNELS.OPEN_PATH, (_event, filePath: string) => shell.openPath(filePath));

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
