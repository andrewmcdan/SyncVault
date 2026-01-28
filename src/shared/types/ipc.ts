export type SyncStatusState = "ready" | "syncing" | "error";

export interface SyncStatus {
  state: SyncStatusState;
  message: string;
  updatedAt: string;
}

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  timestamp: string;
}

export type DotenvLineType = "blank" | "comment" | "raw" | "kv";

export interface AddFilePreviewLine {
  index: number;
  raw: string;
  type: DotenvLineType;
  key?: string;
}

export interface AddFilePreviewResult {
  filePath: string;
  lines: AddFilePreviewLine[];
  suggestedSecretKeys: string[];
}

export interface AddFileCommitPayload {
  filePath: string;
  secretKeys: string[];
}

export interface AwsProfileInfo {
  name: string;
  region?: string;
  source: "config" | "credentials";
}

export interface AwsProfileSelection {
  profile: string;
  region?: string;
}

export interface GitHubTokenPayload {
  token: string;
}

export interface RemoteProjectItem {
  owner: string;
  repo: string;
  cloneUrl: string;
}

export interface RemoteFileItem {
  fileId: string;
  templatePath: string;
  mappingPath: string;
}

export interface PullFilePayload {
  owner: string;
  repo: string;
  fileId: string;
}

export interface SyncSettings {
  pollIntervalMs: number;
  debounceMs: number;
  loopWindowMs: number;
  refreshIntervalMs: number;
}

export interface ConflictListItem {
  id: string;
  destinationId: string;
  destinationPath: string;
  localCopyPath: string | null;
  remoteCopyPath: string | null;
  status: string;
  detectedAt: string | null;
}
