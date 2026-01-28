import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { appendLog } from "../../ipc/handlers";
import { saveDatabase } from "../../db/sqlite";
import { listProjects } from "../../db/repositories/projects";
import { createConflict, findOpenConflictByDestination } from "../../db/repositories/conflicts";
import {
  listDestinationsByFileId,
  updateDestinationFields
} from "../../db/repositories/destinations";
import { applyAwsSelection } from "../auth/aws-auth";
import { getGitHubToken } from "../auth/github-auth";
import { getSecretJson } from "../aws/secrets-manager";
import { cloneRepo, ensureRemote } from "../git/repo-manager";
import { runGit } from "../git/git-client";
import { writeFileAtomic } from "../../util/fs-atomic";
import { hashString } from "../../util/hash";
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

async function syncProject(project: ReturnType<typeof listProjects>[number]): Promise<void> {
  if (!project.local_clone_path || !project.github_clone_url) return;

  await cloneRepo(project.github_clone_url, project.local_clone_path);
  await ensureRemote(project.local_clone_path, project.github_clone_url);

  try {
    await runGit(["pull", "origin", "main"], project.local_clone_path);
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
          const localCopy = `${destination.destination_path}.local`;
          const remoteCopy = `${destination.destination_path}.remote`;
          writeFileAtomic(localCopy, current);
          writeFileAtomic(remoteCopy, rendered);
          if (!findOpenConflictByDestination(destination.id)) {
            createConflict({
              id: crypto.randomUUID(),
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
  const projects = listProjects();
  for (const project of projects) {
    try {
      await syncProject(project);
    } catch (error) {
      appendLog(createLog("warn", `Remote poll error: ${project.github_repo ?? project.id}`));
    }
  }
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
