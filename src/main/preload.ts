import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "./ipc/channels";
import type {
  AddFileCommitPayload,
  AddFilePreviewResult,
  AwsProfileInfo,
  AwsProfileSelection,
  GitHubTokenPayload,
  PullFilePayload,
  RemoteFileItem,
  RemoteProjectItem,
  ProjectListItem,
  ConflictListItem,
  SyncSettings,
  LogEntry,
  SyncStatus
} from "../shared/types";

const api = {
  getStatus: (): Promise<SyncStatus> => ipcRenderer.invoke(IPC_CHANNELS.STATUS_GET),
  onStatus: (callback: (status: SyncStatus) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, status: SyncStatus) => {
      callback(status);
    };
    ipcRenderer.on(IPC_CHANNELS.STATUS_EVENT, listener);
    ipcRenderer.send(IPC_CHANNELS.STATUS_SUBSCRIBE);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.STATUS_EVENT, listener);
  },
  getLogs: (): Promise<LogEntry[]> => ipcRenderer.invoke(IPC_CHANNELS.LOGS_GET),
  onLog: (callback: (entry: LogEntry) => void): (() => void) => {
    const listener = (_: Electron.IpcRendererEvent, entry: LogEntry) => {
      callback(entry);
    };
    ipcRenderer.on(IPC_CHANNELS.LOGS_EVENT, listener);
    ipcRenderer.send(IPC_CHANNELS.LOGS_SUBSCRIBE);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.LOGS_EVENT, listener);
  },
  pickAddFile: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.ADD_FILE_PICK),
  previewAddFile: (filePath: string): Promise<AddFilePreviewResult> =>
    ipcRenderer.invoke(IPC_CHANNELS.ADD_FILE_PREVIEW, filePath),
  commitAddFile: (payload: AddFileCommitPayload): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNELS.ADD_FILE_COMMIT, payload),
  listAwsProfiles: (): Promise<AwsProfileInfo[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.AWS_PROFILES_LIST),
  getAwsProfile: (): Promise<AwsProfileSelection | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.AWS_PROFILE_GET),
  setAwsProfile: (selection: AwsProfileSelection): Promise<AwsProfileSelection> =>
    ipcRenderer.invoke(IPC_CHANNELS.AWS_PROFILE_SET, selection),
  setGitHubToken: (payload: GitHubTokenPayload): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.GITHUB_TOKEN_SET, payload),
  getGitHubAuthStatus: (): Promise<{ isAuthenticated: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.GITHUB_AUTH_STATUS),
  clearGitHubAuth: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.GITHUB_AUTH_CLEAR),
  listPullProjects: (): Promise<RemoteProjectItem[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.PULL_PROJECTS_LIST),
  listPullFiles: (owner: string, repo: string): Promise<RemoteFileItem[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.PULL_FILES_LIST, owner, repo),
  pullFile: (payload: PullFilePayload): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.PULL_FILE_COMMIT, payload),
  listProjects: (): Promise<ProjectListItem[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.PROJECTS_LIST),
  getSyncSettings: (): Promise<SyncSettings> =>
    ipcRenderer.invoke(IPC_CHANNELS.SYNC_SETTINGS_GET),
  setSyncSettings: (payload: Partial<SyncSettings>): Promise<SyncSettings> =>
    ipcRenderer.invoke(IPC_CHANNELS.SYNC_SETTINGS_SET, payload),
  listConflicts: (): Promise<ConflictListItem[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONFLICTS_LIST),
  resolveConflict: (conflictId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONFLICT_RESOLVE, conflictId),
  resolveConflictKeepLocal: (conflictId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONFLICT_RESOLVE_LOCAL, conflictId),
  resolveConflictKeepRemote: (conflictId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONFLICT_RESOLVE_REMOTE, conflictId),
  openDiff: (localPath: string, remotePath: string): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.CONFLICTS_OPEN_DIFF, localPath, remotePath),
  openPath: (filePath: string): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_PATH, filePath)
};

contextBridge.exposeInMainWorld("syncvault", api);
