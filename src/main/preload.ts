import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "./ipc/channels";
import type {
  AddFileCommitPayload,
  AddFilePreviewResult,
  AwsProfileInfo,
  AwsProfileSelection,
  GitHubTokenPayload,
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
    ipcRenderer.invoke(IPC_CHANNELS.GITHUB_AUTH_CLEAR)
};

contextBridge.exposeInMainWorld("syncvault", api);
