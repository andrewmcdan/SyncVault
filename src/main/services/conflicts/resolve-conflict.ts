import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { appendLog } from "../../ipc/handlers";
import { saveDatabase } from "../../db/sqlite";
import { getDestinationContextByPath, updateDestinationFields } from "../../db/repositories/destinations";
import {
  findConflictListItemById,
  resolveConflict
} from "../../db/repositories/conflicts";
import { hashString } from "../../util/hash";
import { writeFileAtomic } from "../../util/fs-atomic";
import { parseDotenv } from "../parser/dotenv";
import { renderTemplate } from "../parser/template";
import { upsertSecretJson, getSecretJson } from "../aws/secrets-manager";
import { applyAwsSelection } from "../auth/aws-auth";
import { commitAll, pushWithAuth } from "../git/repo-manager";
import { getGitHubToken, shouldUseGitHubTokenForGit } from "../auth/github-auth";
import type { LogEntry } from "../../../shared/types";

interface MappingFile {
  secrets?: Record<string, { jsonKey: string }>;
}

function createLog(level: LogEntry["level"], message: string): LogEntry {
  return {
    id: crypto.randomUUID(),
    level,
    message,
    timestamp: new Date().toISOString()
  };
}

function loadMapping(mappingPath: string): MappingFile {
  const raw = fs.readFileSync(mappingPath, "utf8");
  return JSON.parse(raw) as MappingFile;
}

function renderFromTemplate(template: string, secrets: Record<string, string>): string {
  let output = template;
  for (const [key, value] of Object.entries(secrets)) {
    const placeholder = `{{SYNCVAULT:${key}}}`;
    output = output.split(placeholder).join(value);
  }
  return output;
}

function cleanupConflictCopies(localPath: string | null, remotePath: string | null): void {
  if (localPath && fs.existsSync(localPath)) {
    fs.unlinkSync(localPath);
  }
  if (remotePath && fs.existsSync(remotePath)) {
    fs.unlinkSync(remotePath);
  }
}

export async function resolveConflictKeepLocal(conflictId: string): Promise<void> {
  const conflict = findConflictListItemById(conflictId);
  if (!conflict) {
    throw new Error("Conflict not found.");
  }

  const context = getDestinationContextByPath(conflict.destination_path);
  if (!context || !context.local_clone_path) {
    throw new Error("Destination context unavailable for conflict.");
  }

  const destinationPath = context.destination_path;
  const localPath = fs.existsSync(destinationPath)
    ? destinationPath
    : conflict.local_copy_path;

  if (!localPath || !fs.existsSync(localPath)) {
    throw new Error("Local copy not found for conflict.");
  }

  const content = fs.readFileSync(localPath, "utf8");
  if (localPath !== destinationPath) {
    writeFileAtomic(destinationPath, content);
  }

  const mappingFullPath = path.join(context.local_clone_path, context.mapping_path);
  if (!fs.existsSync(mappingFullPath)) {
    throw new Error("Mapping file missing for conflict.");
  }

  const mapping = loadMapping(mappingFullPath);
  const secretKeys = new Set(Object.keys(mapping.secrets ?? {}));
  const parsed = parseDotenv(content);
  const { template, secrets } = renderTemplate(parsed, secretKeys);

  const templateFullPath = path.join(context.local_clone_path, context.template_path);
  fs.mkdirSync(path.dirname(templateFullPath), { recursive: true });
  fs.writeFileSync(templateFullPath, template, "utf8");

  const selection = applyAwsSelection();
  const region = context.aws_region ?? selection?.region;
  if (region && context.aws_secret_id && Object.keys(secrets).length > 0) {
    await upsertSecretJson(context.aws_secret_id, region, secrets);
  }

  await commitAll(context.local_clone_path, "SyncVault: resolve conflict (keep local)");
  const token = getGitHubToken();
  if (context.github_owner && context.github_repo) {
    await pushWithAuth(
      context.local_clone_path,
      context.github_owner,
      context.github_repo,
      token,
      shouldUseGitHubTokenForGit()
    );
  }

  const localHash = hashString(content);
  updateDestinationFields(context.id, {
    last_local_hash: localHash,
    last_render_hash: localHash,
    last_tool_write_at: Date.now()
  });

  resolveConflict(conflict.id);
  cleanupConflictCopies(conflict.local_copy_path, conflict.remote_copy_path);
  saveDatabase();
  appendLog(createLog("info", `Resolved conflict (kept local): ${destinationPath}`));
}

export async function resolveConflictKeepRemote(conflictId: string): Promise<void> {
  const conflict = findConflictListItemById(conflictId);
  if (!conflict) {
    throw new Error("Conflict not found.");
  }

  const context = getDestinationContextByPath(conflict.destination_path);
  if (!context || !context.local_clone_path) {
    throw new Error("Destination context unavailable for conflict.");
  }

  let content: string | null = null;
  if (conflict.remote_copy_path && fs.existsSync(conflict.remote_copy_path)) {
    content = fs.readFileSync(conflict.remote_copy_path, "utf8");
  } else {
    const templateFullPath = path.join(context.local_clone_path, context.template_path);
    if (!fs.existsSync(templateFullPath)) {
      throw new Error("Template missing for conflict.");
    }
    const selection = applyAwsSelection();
    const region = context.aws_region ?? selection?.region;
    if (!region || !context.aws_secret_id) {
      throw new Error("AWS configuration missing for conflict resolution.");
    }
    const secrets = await getSecretJson(context.aws_secret_id, region);
    const template = fs.readFileSync(templateFullPath, "utf8");
    content = renderFromTemplate(template, secrets);
  }

  if (!content) {
    throw new Error("Remote content unavailable for conflict.");
  }

  writeFileAtomic(context.destination_path, content);
  const renderHash = hashString(content);
  updateDestinationFields(context.id, {
    last_local_hash: renderHash,
    last_render_hash: renderHash,
    last_tool_write_at: Date.now()
  });

  resolveConflict(conflict.id);
  cleanupConflictCopies(conflict.local_copy_path, conflict.remote_copy_path);
  saveDatabase();
  appendLog(createLog("info", `Resolved conflict (kept remote): ${context.destination_path}`));
}
