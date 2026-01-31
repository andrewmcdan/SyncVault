import type {
  AddFileCommitPayload,
  AddFilePreviewResult,
  AwsProfileInfo,
  AwsProfileSelection,
  GitHubAuthStatus,
  GitHubTokenPayload,
  PullFilePayload,
  RemoteFileItem,
  RemoteProjectItem,
  ProjectListItem,
  ProjectFileListItem,
  DeleteProjectOptions,
  DeleteProjectResult,
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
      getGitHubAuthStatus: () => Promise<GitHubAuthStatus>;
      clearGitHubAuth: () => Promise<{ ok: boolean }>;
      listPullProjects: () => Promise<RemoteProjectItem[]>;
      listPullFiles: (owner: string, repo: string) => Promise<RemoteFileItem[]>;
      pullFile: (payload: PullFilePayload) => Promise<string>;
      listProjects: () => Promise<ProjectListItem[]>;
      listProjectFiles: (projectId: string) => Promise<ProjectFileListItem[]>;
      deleteProject: (
        projectId: string,
        options: DeleteProjectOptions
      ) => Promise<DeleteProjectResult>;
      stopTrackingFile: (fileId: string) => Promise<{ ok: boolean }>;
      getSyncSettings: () => Promise<SyncSettings>;
      setSyncSettings: (payload: Partial<SyncSettings>) => Promise<SyncSettings>;
      listConflicts: () => Promise<ConflictListItem[]>;
      resolveConflict: (conflictId: string) => Promise<{ ok: boolean }>;
      resolveConflictKeepLocal: (conflictId: string) => Promise<{ ok: boolean }>;
      resolveConflictKeepRemote: (conflictId: string) => Promise<{ ok: boolean }>;
      openDiff: (localPath: string, remotePath: string) => Promise<string>;
      openPath: (filePath: string) => Promise<string>;
    };
  }
}

export {};
