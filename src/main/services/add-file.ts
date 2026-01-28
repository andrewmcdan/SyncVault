import fs from "node:fs";
import path from "node:path";
import { clipboard } from "electron";
import { appendLog, publishStatus } from "../ipc/handlers";
import { saveDatabase } from "../db/sqlite";
import {
  createProject,
  findProjectByLocalRoot,
  updateProjectFields
} from "../db/repositories/projects";
import { createFile, findFileByProjectPath } from "../db/repositories/files";
import {
  createDestination,
  findDestinationByPath
} from "../db/repositories/destinations";
import { generateId, hashString } from "../util/hash";
import { ensureDir, getDataRoot, toPosixPath } from "../util/paths";
import { ensureLocalRepo } from "./git/repo-manager";
import { runGit } from "./git/git-client";
import { parseDotenv, isLikelySecretKey } from "./parser/dotenv";
import { collectSecretKeys, renderTemplate } from "./parser/template";
import { buildMapping, serializeMapping } from "./parser/mapping";
import { upsertSecretJson } from "./aws/secrets-manager";
import { applyAwsSelection } from "./auth/aws-auth";
import type { ProjectRecord } from "../models/project";
import type { LogEntry } from "../../shared/types";

export interface AddFileOptions {
  secretKeys?: string[];
}

export interface AddFileResult {
  projectId: string;
  fileId: string;
  templatePath: string;
  mappingPath: string;
  secretKeys: string[];
  warnings: string[];
}

function createLog(level: LogEntry["level"], message: string): LogEntry {
  return {
    id: generateId(),
    level,
    message,
    timestamp: new Date().toISOString()
  };
}

function resolveAwsRegion(): string | null {
  const selection = applyAwsSelection();
  if (selection?.region) return selection.region;
  return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || null;
}

function determineFileType(filePath: string): "dotenv" {
  const base = path.basename(filePath);
  if (base.startsWith(".env")) {
    return "dotenv";
  }
  throw new Error("Unsupported file type. Only .env files are supported.");
}

function buildTemplatePath(relativePosixPath: string): string {
  return `templates/${relativePosixPath}.template`;
}

async function detectGitRoot(filePath: string): Promise<string> {
  const cwd = path.dirname(filePath);
  const { stdout } = await runGit(["rev-parse", "--show-toplevel"], cwd);
  return stdout.trim();
}

function ensureProject(localRepoRoot: string, awsRegion: string | null): ProjectRecord {
  const existing = findProjectByLocalRoot(localRepoRoot);
  if (existing) {
    if (!existing.local_clone_path) {
      const dataRoot = getDataRoot();
      const localClonePath = path.join(dataRoot, "repos", existing.id);
      updateProjectFields(existing.id, { local_clone_path: localClonePath });
      return { ...existing, local_clone_path: localClonePath };
    }
    if (!existing.aws_region && awsRegion) {
      updateProjectFields(existing.id, { aws_region: awsRegion });
      return { ...existing, aws_region: awsRegion };
    }
    return existing;
  }

  const projectId = generateId();
  const displayName = path.basename(localRepoRoot);
  const dataRoot = getDataRoot();
  const localClonePath = path.join(dataRoot, "repos", projectId);

  return createProject({
    id: projectId,
    local_repo_root: localRepoRoot,
    display_name: displayName,
    github_owner: null,
    github_repo: null,
    github_clone_url: null,
    local_clone_path: localClonePath,
    aws_region: awsRegion,
    aws_secret_id: awsRegion ? `syncvault/local/${projectId}` : null,
    poll_interval_seconds: 20,
    last_remote_head: null
  });
}

function ensureProjectMetadataFile(project: ProjectRecord): void {
  if (!project.local_clone_path) return;
  const metaPath = path.join(project.local_clone_path, "syncvault", "project.json");
  if (fs.existsSync(metaPath)) return;
  ensureDir(path.dirname(metaPath));
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        projectId: project.id,
        localRepoRoot: project.local_repo_root,
        createdAt: new Date().toISOString()
      },
      null,
      2
    ),
    "utf8"
  );
}

function gatherAllKeys(parsed: ReturnType<typeof parseDotenv>): string[] {
  const keys: string[] = [];
  for (const line of parsed.lines) {
    if (line.type === "kv") {
      keys.push(line.key);
    }
  }
  return Array.from(new Set(keys));
}

export async function addFileFromPath(
  filePath: string,
  options: AddFileOptions = {}
): Promise<AddFileResult> {
  const warnings: string[] = [];
  publishStatus({
    state: "syncing",
    message: "Adding file",
    updatedAt: new Date().toISOString()
  });
  try {

  const resolvedPath = path.resolve(filePath.trim());
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File does not exist: ${resolvedPath}`);
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) {
    throw new Error(`Path is not a file: ${resolvedPath}`);
  }

  const fileType = determineFileType(resolvedPath);
  const repoRoot = await detectGitRoot(resolvedPath);
  const relativePath = path.relative(repoRoot, resolvedPath);
  const relativePosix = toPosixPath(relativePath);

  const awsRegion = resolveAwsRegion();
  const project = ensureProject(repoRoot, awsRegion);

  if (!project.local_clone_path) {
    throw new Error("Project local clone path is missing.");
  }

  await ensureLocalRepo(project.local_clone_path);
  ensureProjectMetadataFile(project);

  const content = fs.readFileSync(resolvedPath, "utf8");
  const parsed = parseDotenv(content);

  let secretKeys = options.secretKeys ?? collectSecretKeys(parsed, isLikelySecretKey);
  if (secretKeys.length === 0) {
    secretKeys = gatherAllKeys(parsed);
  }

  const { template, secrets } = renderTemplate(parsed, new Set(secretKeys));

  const existingFile = findFileByProjectPath(project.id, relativePosix);
  const fileId = existingFile ? existingFile.id : generateId();
  const templatePath = buildTemplatePath(relativePosix);
  const mappingPath = path.posix.join("syncvault", "files", `${fileId}.json`);

  const templateFullPath = path.join(project.local_clone_path, templatePath);
  ensureDir(path.dirname(templateFullPath));
  fs.writeFileSync(templateFullPath, template, "utf8");

  const mapping = buildMapping(fileId, templatePath, fileType, secretKeys);
  const mappingFullPath = path.join(project.local_clone_path, mappingPath);
  ensureDir(path.dirname(mappingFullPath));
  fs.writeFileSync(mappingFullPath, serializeMapping(mapping), "utf8");

  const fileRecord = existingFile
    ? existingFile
    : createFile({
        id: fileId,
        project_id: project.id,
        source_relative_path: relativePosix,
        template_path: templatePath,
        mapping_path: mappingPath,
        type: fileType
      });

  const destinationPath = resolvedPath;
  const destinationExisting = findDestinationByPath(fileRecord.id, destinationPath);
  if (!destinationExisting) {
    createDestination({
      id: generateId(),
      file_id: fileRecord.id,
      destination_path: destinationPath,
      last_local_hash: hashString(content),
      last_render_hash: null,
      last_tool_write_at: null,
      is_enabled: 1
    });
  }

  saveDatabase();

  if (awsRegion && Object.keys(secrets).length > 0) {
    const secretId = project.aws_secret_id ?? `syncvault/local/${project.id}`;
    try {
      await upsertSecretJson(secretId, awsRegion, secrets);
      if (!project.aws_secret_id || !project.aws_region) {
        updateProjectFields(project.id, {
          aws_secret_id: secretId,
          aws_region: awsRegion
        });
        saveDatabase();
      }
    } catch (error: any) {
      warnings.push("Failed to update AWS Secrets Manager.");
      appendLog(
        createLog(
          "warn",
          `Secrets update failed for ${secretId}: ${error?.message ?? "unknown error"}`
        )
      );
    }
  } else if (!awsRegion) {
    warnings.push("AWS region is not configured; secrets were not saved.");
    appendLog(createLog("warn", "AWS region not configured; skipping secret update."));
  }

  appendLog(
    createLog(
      "info",
      `Added file ${relativePosix} to project ${project.display_name ?? project.id}`
    )
  );

  publishStatus({
    state: "ready",
    message: "File added",
    updatedAt: new Date().toISOString()
  });

  return {
    projectId: project.id,
    fileId: fileRecord.id,
    templatePath,
    mappingPath,
    secretKeys,
    warnings
  };
  } catch (error: any) {
    publishStatus({
      state: "error",
      message: "Add file failed",
      updatedAt: new Date().toISOString()
    });
    appendLog(
      createLog(
        "error",
        `Add file failed: ${error?.message ?? "unknown error"}`
      )
    );
    throw error;
  }
}

export async function addFileFromClipboard(): Promise<AddFileResult> {
  const raw = clipboard.readText().trim();
  if (!raw) {
    throw new Error("Clipboard is empty.");
  }
  return addFileFromPath(raw);
}
