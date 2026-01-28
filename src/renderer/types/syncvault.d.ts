import type {
  AddFileCommitPayload,
  AddFilePreviewResult,
  AwsProfileInfo,
  AwsProfileSelection,
  GitHubTokenPayload,
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
    };
  }
}

export {};
