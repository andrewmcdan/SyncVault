import type {
  AddFileCommitPayload,
  AddFilePreviewResult,
  AwsProfileInfo,
  AwsProfileSelection,
  GitHubTokenPayload,
  PullFilePayload,
  RemoteFileItem,
  RemoteProjectItem,
  ConflictListItem,
  SyncSettings,
  LogEntry,
  SyncStatus
} from "@shared/types";

declare global {
  interface Window {
    syncvault: {
      getStatus: () => Promise<SyncStatus>;
      onStatus: (callback: (status: SyncStatus) => void) => () => void;
      getLogs: () => Promise<LogEntry[]>;
      onLog: (callback: (entry: LogEntry) => void) => () => void;
      pickAddFile: () => Promise<string | null>;
      previewAddFile: (filePath: string) => Promise<AddFilePreviewResult>;
      commitAddFile: (payload: AddFileCommitPayload) => Promise<unknown>;
      listAwsProfiles: () => Promise<AwsProfileInfo[]>;
      getAwsProfile: () => Promise<AwsProfileSelection | null>;
      setAwsProfile: (selection: AwsProfileSelection) => Promise<AwsProfileSelection>;
      setGitHubToken: (payload: GitHubTokenPayload) => Promise<{ ok: boolean }>;
      getGitHubAuthStatus: () => Promise<{ isAuthenticated: boolean }>;
      clearGitHubAuth: () => Promise<{ ok: boolean }>;
      listPullProjects: () => Promise<RemoteProjectItem[]>;
      listPullFiles: (owner: string, repo: string) => Promise<RemoteFileItem[]>;
      pullFile: (payload: PullFilePayload) => Promise<string>;
      getSyncSettings: () => Promise<SyncSettings>;
      setSyncSettings: (payload: Partial<SyncSettings>) => Promise<SyncSettings>;
      listConflicts: () => Promise<ConflictListItem[]>;
      resolveConflict: (conflictId: string) => Promise<{ ok: boolean }>;
      openPath: (filePath: string) => Promise<string>;
    };
  }
}

export {};
