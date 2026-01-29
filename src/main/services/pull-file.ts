import fs from "node:fs";
import path from "node:path";
import { dialog } from "electron";
import { appendLog, publishStatus } from "../ipc/handlers";
import { saveDatabase } from "../db/sqlite";
import { createDestination, findDestinationByPath, updateDestinationFields } from "../db/repositories/destinations";
import { createFile, findFileById, findFileByProjectPath } from "../db/repositories/files";
import {
  createProject,
  findProjectById,
  findProjectByLocalRoot,
  updateProjectFields
} from "../db/repositories/projects";
import { generateId, hashString } from "../util/hash";
import { ensureDir, getDataRoot } from "../util/paths";
import { cloneRepo, ensureRemote, pullWithToken } from "./git/repo-manager";
import { listSyncVaultRepos } from "./github/repo-service";
import {
  getGitHubApiToken,
  getGitHubToken,
  shouldUseGitHubTokenForGit,
  getGitHubAuthMode
} from "./auth/github-auth";
import { applyAwsSelection } from "./auth/aws-auth";
import { getSecretJson } from "./aws/secrets-manager";
import type { LogEntry } from "../../shared/types";

interface MappingFile {
  fileId: string;
  templatePath: string;
  type: string;
  secrets: Record<string, { jsonKey: string }>;
}

interface ProjectMetadata {
  projectId?: string;
  aws?: {
    region?: string;
    secretId?: string;
  };
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

function createLog(level: LogEntry["level"], message: string): LogEntry {
  return {
    id: generateId(),
    level,
    message,
    timestamp: new Date().toISOString()
  };
}

function getProjectClonePath(owner: string, repo: string): string {
  const dataRoot = getDataRoot();
  return path.join(dataRoot, "repos", `${owner}-${repo}`);
}

function loadMapping(fullPath: string): MappingFile {
  const raw = fs.readFileSync(fullPath, "utf8");
  return JSON.parse(raw) as MappingFile;
}

function loadProjectMetadata(repoPath: string): ProjectMetadata | null {
  const metaPath = path.join(repoPath, "syncvault", "project.json");
  if (!fs.existsSync(metaPath)) return null;
  try {
    const raw = fs.readFileSync(metaPath, "utf8");
    return JSON.parse(raw) as ProjectMetadata;
  } catch {
    return null;
  }
}

function renderTemplate(template: string, secrets: Record<string, string>): string {
  let output = template;
  for (const [key, value] of Object.entries(secrets)) {
    const placeholder = `{{SYNCVAULT:${key}}}`;
    output = output.split(placeholder).join(value);
  }
  return output;
}

export async function listRemoteProjects(): Promise<RemoteProjectItem[]> {
  const apiToken = await getGitHubApiToken();
  if (!apiToken) {
    if (getGitHubAuthMode() === "native") {
      return [];
    }
    throw new Error("GitHub token not configured.");
  }
  const repos = await listSyncVaultRepos(apiToken);
  return repos.map((repo) => ({ owner: repo.owner, repo: repo.name, cloneUrl: repo.cloneUrl }));
}

export async function listRemoteFiles(owner: string, repo: string): Promise<RemoteFileItem[]> {
  const token = getGitHubToken();
  if (!token && shouldUseGitHubTokenForGit()) {
    throw new Error("GitHub token not configured.");
  }
  const gitToken = shouldUseGitHubTokenForGit() ? token ?? undefined : undefined;
  const clonePath = getProjectClonePath(owner, repo);
  const remoteUrl = `https://github.com/${owner}/${repo}.git`;
  await cloneRepo(remoteUrl, clonePath, gitToken);
  await ensureRemote(clonePath, remoteUrl);
  await pullWithToken(clonePath, remoteUrl, "main", gitToken);

  const filesDir = path.join(clonePath, "syncvault", "files");
  if (!fs.existsSync(filesDir)) return [];
  const items: RemoteFileItem[] = [];
  for (const entry of fs.readdirSync(filesDir)) {
    if (!entry.endsWith(".json")) continue;
    const mappingPath = path.join(filesDir, entry);
    const mapping = loadMapping(mappingPath);
    items.push({
      fileId: mapping.fileId,
      templatePath: mapping.templatePath,
      mappingPath: path.posix.join("syncvault", "files", entry)
    });
  }
  return items;
}

export async function pullRemoteFile(
  owner: string,
  repo: string,
  fileId: string
): Promise<string> {
  publishStatus({
    state: "syncing",
    message: "Pulling remote file",
    updatedAt: new Date().toISOString()
  });

  const token = getGitHubToken();
  if (!token && shouldUseGitHubTokenForGit()) {
    throw new Error("GitHub token not configured.");
  }
  const gitToken = shouldUseGitHubTokenForGit() ? token ?? undefined : undefined;

  const clonePath = getProjectClonePath(owner, repo);
  const remoteUrl = `https://github.com/${owner}/${repo}.git`;
  await cloneRepo(remoteUrl, clonePath, gitToken);
  await ensureRemote(clonePath, remoteUrl);
  await pullWithToken(clonePath, remoteUrl, "main", gitToken);

  const mappingPath = path.join(clonePath, "syncvault", "files", `${fileId}.json`);
  const mapping = loadMapping(mappingPath);

  const templateFullPath = path.join(clonePath, mapping.templatePath);
  const templateContent = fs.readFileSync(templateFullPath, "utf8");

  const projectMeta = loadProjectMetadata(clonePath);
  const selection = applyAwsSelection();
  const region =
    selection?.region ??
    projectMeta?.aws?.region ??
    process.env.AWS_REGION ??
    process.env.AWS_DEFAULT_REGION;
  if (!region) throw new Error("AWS region not configured.");

  const candidateSecretIds = Array.from(
    new Set(
      [
        projectMeta?.aws?.secretId,
        projectMeta?.projectId ? `syncvault/${owner}/${projectMeta.projectId}` : null,
        `syncvault/${owner}/${repo}`,
        projectMeta?.projectId ? `syncvault/local/${projectMeta.projectId}` : null
      ].filter(Boolean)
    )
  ) as string[];

  let secrets: Record<string, string> = {};
  let resolvedSecretId: string | null = null;
  for (const candidate of candidateSecretIds) {
    try {
      secrets = await getSecretJson(candidate, region);
      resolvedSecretId = candidate;
      break;
    } catch (error: any) {
      if (error?.name === "ResourceNotFoundException") {
        continue;
      }
      throw error;
    }
  }

  if (!resolvedSecretId) {
    throw new Error(`AWS secret not found. Tried: ${candidateSecretIds.join(", ")}`);
  }

  const resolvedSecrets: Record<string, string> = {};
  for (const [key, config] of Object.entries(mapping.secrets)) {
    const jsonKey = config.jsonKey;
    if (jsonKey in secrets) {
      resolvedSecrets[key] = secrets[jsonKey];
    }
  }

  const rendered = renderTemplate(templateContent, resolvedSecrets);

  const result = await dialog.showSaveDialog({
    title: "Save rendered file",
    defaultPath: path.basename(mapping.templatePath.replace(/\.template$/, ""))
  });
  if (result.canceled || !result.filePath) {
    publishStatus({
      state: "ready",
      message: "Pull canceled",
      updatedAt: new Date().toISOString()
    });
    return "";
  }

  ensureDir(path.dirname(result.filePath));
  fs.writeFileSync(result.filePath, rendered, "utf8");

  const localRepoRoot = path.dirname(result.filePath);
  const existingById = projectMeta?.projectId
    ? findProjectById(projectMeta.projectId)
    : null;
  const existingByRoot = findProjectByLocalRoot(localRepoRoot);
  const projectRecord =
    existingById ??
    existingByRoot ??
    createProject({
      id: projectMeta?.projectId ?? generateId(),
      local_repo_root: localRepoRoot,
      display_name: path.basename(localRepoRoot),
      github_owner: owner,
      github_repo: repo,
      github_clone_url: `https://github.com/${owner}/${repo}.git`,
      local_clone_path: clonePath,
      aws_region: region,
      aws_secret_id: resolvedSecretId,
      poll_interval_seconds: 20,
      last_remote_head: null
    });

  const existingFileById = findFileById(fileId);
  const existingFileByPath = findFileByProjectPath(projectRecord.id, mapping.templatePath);
  const fileRecord =
    existingFileById ??
    existingFileByPath ??
    createFile({
      id: fileId,
      project_id: projectRecord.id,
      source_relative_path: mapping.templatePath,
      template_path: mapping.templatePath,
      mapping_path: path.posix.join("syncvault", "files", `${fileId}.json`),
      type: mapping.type
    });

  const destinationExisting = findDestinationByPath(fileRecord.id, result.filePath);
  if (!destinationExisting) {
    createDestination({
      id: generateId(),
      file_id: fileRecord.id,
      destination_path: result.filePath,
      last_local_hash: hashString(rendered),
      last_render_hash: hashString(rendered),
      last_tool_write_at: Date.now(),
      is_enabled: 1
    });
  } else {
    updateDestinationFields(destinationExisting.id, {
      last_tool_write_at: Date.now(),
      last_local_hash: hashString(rendered),
      last_render_hash: hashString(rendered)
    });
  }

  updateProjectFields(projectRecord.id, {
    github_owner: owner,
    github_repo: repo,
    github_clone_url: `https://github.com/${owner}/${repo}.git`,
    aws_secret_id: resolvedSecretId,
    aws_region: region
  });

  saveDatabase();

  appendLog(createLog("info", `Pulled ${mapping.templatePath} from ${owner}/${repo}`));

  publishStatus({
    state: "ready",
    message: "File pulled",
    updatedAt: new Date().toISOString()
  });

  return result.filePath;
}
