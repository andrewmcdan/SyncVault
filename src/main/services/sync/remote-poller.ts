import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { appendLog, publishStatus } from "../../ipc/handlers";
import { saveDatabase } from "../../db/sqlite";
import { listProjects } from "../../db/repositories/projects";
import { createConflict, findOpenConflictByDestination } from "../../db/repositories/conflicts";
import {
  listDestinationsByFileId,
  updateDestinationFields
} from "../../db/repositories/destinations";
import { applyAwsSelection } from "../auth/aws-auth";
import { getGitHubToken, shouldUseGitHubTokenForGit } from "../auth/github-auth";
import { getSecretJson } from "../aws/secrets-manager";
import { cloneRepo, ensureRemote, pullWithToken } from "../git/repo-manager";
import { writeFileAtomic } from "../../util/fs-atomic";
import { hashString } from "../../util/hash";
import { ensureDir, getDataRoot } from "../../util/paths";
import type { LogEntry } from "../../../shared/types";

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

let timer: NodeJS.Timeout | null = null;
let running = false;

function createLog(level: LogEntry["level"], message: string): LogEntry {
  return {
    id: crypto.randomUUID(),
    level,
    message,
    timestamp: new Date().toISOString()
  };
}

function loadProjectMetadata(repoPath: string): ProjectMetadata | null {
  const metaPath = path.join(repoPath, "syncvault", "project.json");
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8")) as ProjectMetadata;
  } catch {
    return null;
  }
}

function loadMapping(fullPath: string): MappingFile {
  const raw = fs.readFileSync(fullPath, "utf8");
  return JSON.parse(raw) as MappingFile;
}

function renderTemplate(template: string, secrets: Record<string, string>): string {
  let output = template;
  for (const [key, value] of Object.entries(secrets)) {
    const placeholder = `{{SYNCVAULT:${key}}}`;
    output = output.split(placeholder).join(value);
  }
  return output;
}

function buildConflictCopyPaths(
  destinationPath: string,
  conflictId: string
): { localCopy: string; remoteCopy: string } {
  const baseName = path.basename(destinationPath);
  const slug = `${baseName}-${hashString(destinationPath).slice(0, 8)}`;
  const rootDir = path.join(getDataRoot(), "conflicts", slug);
  ensureDir(rootDir);
  return {
    localCopy: path.join(rootDir, `${conflictId}.local`),
    remoteCopy: path.join(rootDir, `${conflictId}.remote`)
  };
}

async function syncProject(project: ReturnType<typeof listProjects>[number]): Promise<void> {
  if (!project.local_clone_path || !project.github_clone_url) return;

  const token = getGitHubToken();
  const gitToken = shouldUseGitHubTokenForGit() ? token ?? undefined : undefined;
  await cloneRepo(project.github_clone_url, project.local_clone_path, gitToken);
  await ensureRemote(project.local_clone_path, project.github_clone_url);

  try {
    await pullWithToken(project.local_clone_path, project.github_clone_url, "main", gitToken);
  } catch (error) {
    appendLog(createLog("warn", `Git pull failed for ${project.github_repo ?? "repo"}`));
    return;
  }

  const projectMeta = loadProjectMetadata(project.local_clone_path);
  const selection = applyAwsSelection();
  const region = projectMeta?.aws?.region ?? project.aws_region ?? selection?.region;
  const secretId = projectMeta?.aws?.secretId ?? project.aws_secret_id;
  if (!region || !secretId) {
    appendLog(createLog("warn", `Skipping ${project.github_repo ?? "repo"}: AWS config missing`));
    return;
  }

  let secrets: Record<string, string> = {};
  try {
    secrets = await getSecretJson(secretId, region);
  } catch (error: any) {
    appendLog(createLog("warn", `Secrets load failed for ${secretId}`));
    return;
  }

  const filesDir = path.join(project.local_clone_path, "syncvault", "files");
  if (!fs.existsSync(filesDir)) return;

  const mappingFiles = fs.readdirSync(filesDir).filter((file) => file.endsWith(".json"));

  for (const mappingFile of mappingFiles) {
    const mappingFullPath = path.join(filesDir, mappingFile);
    const mapping = loadMapping(mappingFullPath);
    const templateFullPath = path.join(project.local_clone_path, mapping.templatePath);
    if (!fs.existsSync(templateFullPath)) continue;

    const templateContent = fs.readFileSync(templateFullPath, "utf8");
    const resolvedSecrets: Record<string, string> = {};
    for (const [key, config] of Object.entries(mapping.secrets ?? {})) {
      const jsonKey = config.jsonKey;
      if (jsonKey in secrets) {
        resolvedSecrets[key] = secrets[jsonKey];
      }
    }

    const rendered = renderTemplate(templateContent, resolvedSecrets);
    const renderedHash = hashString(rendered);

    const destinations = listDestinationsByFileId(mapping.fileId);
    for (const destination of destinations) {
      if (fs.existsSync(destination.destination_path)) {
        const current = fs.readFileSync(destination.destination_path, "utf8");
        const currentHash = hashString(current);
        if (
          destination.last_render_hash &&
          destination.last_render_hash !== currentHash
        ) {
          const existingConflict = findOpenConflictByDestination(destination.id);
          const conflictId = existingConflict?.id ?? crypto.randomUUID();
          const { localCopy, remoteCopy } =
            existingConflict?.local_copy_path && existingConflict.remote_copy_path
              ? {
                  localCopy: existingConflict.local_copy_path,
                  remoteCopy: existingConflict.remote_copy_path
                }
              : buildConflictCopyPaths(destination.destination_path, conflictId);
          writeFileAtomic(localCopy, current);
          writeFileAtomic(remoteCopy, rendered);
          if (!existingConflict) {
            createConflict({
              id: conflictId,
              destination_id: destination.id,
              detected_at: new Date().toISOString(),
              local_copy_path: localCopy,
              remote_copy_path: remoteCopy,
              status: "open"
            });
          }
          appendLog(
            createLog(
              "warn",
              `Conflict detected for ${destination.destination_path}. Wrote .local and .remote copies.`
            )
          );
          continue;
        }
      }

      writeFileAtomic(destination.destination_path, rendered);
      updateDestinationFields(destination.id, {
        last_render_hash: renderedHash,
        last_local_hash: renderedHash,
        last_tool_write_at: Date.now()
      });
    }
  }

  saveDatabase();
}

async function poll(): Promise<void> {
  if (running) return;
  running = true;
  publishStatus({
    state: "syncing",
    message: "Syncing remote projects",
    updatedAt: new Date().toISOString()
  });
  const projects = listProjects();
  let hadError = false;
  for (const project of projects) {
    try {
      await syncProject(project);
    } catch (error: any) {
      hadError = true;
      publishStatus({
        state: "error",
        message: `Remote sync failed for ${project.github_repo ?? project.id}`,
        updatedAt: new Date().toISOString()
      });
      appendLog(
        createLog("warn", `Remote poll error: ${project.github_repo ?? project.id}`)
      );
    }
  }
  publishStatus({
    state: hadError ? "error" : "ready",
    message: hadError ? "Remote sync completed with errors" : "Remote sync complete",
    updatedAt: new Date().toISOString()
  });
  running = false;
}

export function startRemotePoller(intervalMs = 20000): void {
  if (timer) return;
  timer = setInterval(() => {
    void poll();
  }, intervalMs);
  void poll();
}

export function stopRemotePoller(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
