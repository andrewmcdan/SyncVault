import fs from "node:fs";
import path from "node:path";
import { appendLog } from "../ipc/handlers";
import { saveDatabase } from "../db/sqlite";
import { deleteFile, findFileById } from "../db/repositories/files";
import {
  deleteProject as deleteProjectRecord,
  findProjectById
} from "../db/repositories/projects";
import {
  getGitHubApiToken,
  getGitHubToken,
  shouldUseGitHubTokenForGit
} from "./auth/github-auth";
import { applyAwsSelection } from "./auth/aws-auth";
import {
  cloneRepo,
  commitAll,
  ensureRemote,
  pullWithToken,
  pushWithAuth
} from "./git/repo-manager";
import { deleteRepo } from "./github/repo-service";
import { deleteSecret } from "./aws/secrets-manager";
import { getDataRoot } from "../util/paths";
import { generateId } from "../util/hash";
import type { DeleteProjectOptions, DeleteProjectResult, LogEntry } from "../../shared/types";

function createLog(level: LogEntry["level"], message: string): LogEntry {
  return {
    id: generateId(),
    level,
    message,
    timestamp: new Date().toISOString()
  };
}

function removeDir(targetPath: string | null, warnings: string[], label: string): void {
  if (!targetPath) return;
  if (!fs.existsSync(targetPath)) return;
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch (error: any) {
    warnings.push(`Failed to remove ${label}.`);
    appendLog(
      createLog(
        "warn",
        `Delete project: failed to remove ${label} (${targetPath}): ${error?.message ?? "unknown error"}`
      )
    );
  }
}

async function deleteRemoteFiles(
  project: NonNullable<ReturnType<typeof findProjectById>>,
  warnings: string[]
): Promise<void> {
  if (!project.github_owner || !project.github_repo) {
    warnings.push("Project is not linked to GitHub; remote files were not deleted.");
    return;
  }

  const clonePath = project.local_clone_path ?? path.join(getDataRoot(), "repos", project.id);
  const remoteUrl =
    project.github_clone_url ?? `https://github.com/${project.github_owner}/${project.github_repo}.git`;
  const token = getGitHubToken();
  const gitToken = shouldUseGitHubTokenForGit() ? token ?? undefined : undefined;
  if (shouldUseGitHubTokenForGit() && !token) {
    warnings.push("GitHub token not configured; remote files were not deleted.");
    return;
  }

  try {
    await cloneRepo(remoteUrl, clonePath, gitToken);
    await ensureRemote(clonePath, remoteUrl);
    await pullWithToken(clonePath, remoteUrl, "main", gitToken);
  } catch (error: any) {
    warnings.push("Failed to fetch GitHub repo; remote files may remain.");
    appendLog(
      createLog(
        "warn",
        `Delete project: failed to sync repo ${project.github_owner}/${project.github_repo}: ${
          error?.message ?? "unknown error"
        }`
      )
    );
    return;
  }

  const templatesDir = path.join(clonePath, "templates");
  const syncvaultDir = path.join(clonePath, "syncvault");
  let removedAnything = false;
  try {
    if (fs.existsSync(templatesDir)) {
      fs.rmSync(templatesDir, { recursive: true, force: true });
      removedAnything = true;
    }
    if (fs.existsSync(syncvaultDir)) {
      fs.rmSync(syncvaultDir, { recursive: true, force: true });
      removedAnything = true;
    }
  } catch (error: any) {
    warnings.push("Failed to remove template files locally before pushing.");
    appendLog(
      createLog(
        "warn",
        `Delete project: failed to remove template directories in ${clonePath}: ${
          error?.message ?? "unknown error"
        }`
      )
    );
    return;
  }

  if (!removedAnything) {
    return;
  }

  try {
    await commitAll(clonePath, "SyncVault: remove tracked files");
    if (project.github_owner && project.github_repo) {
      await pushWithAuth(
        clonePath,
        project.github_owner,
        project.github_repo,
        token,
        shouldUseGitHubTokenForGit()
      );
    }
  } catch (error: any) {
    warnings.push("Failed to delete remote files from GitHub.");
    appendLog(
      createLog(
        "warn",
        `Delete project: failed to push repo cleanup ${project.github_owner}/${project.github_repo}: ${
          error?.message ?? "unknown error"
        }`
      )
    );
  }
}

async function deleteRemoteRepo(
  project: NonNullable<ReturnType<typeof findProjectById>>,
  warnings: string[]
): Promise<void> {
  if (!project.github_owner || !project.github_repo) {
    warnings.push("Project is not linked to GitHub; no repo to delete.");
    return;
  }
  const token = await getGitHubApiToken();
  if (!token) {
    warnings.push("GitHub token not configured; remote repo not deleted.");
    return;
  }
  try {
    await deleteRepo(token, project.github_owner, project.github_repo);
  } catch (error: any) {
    warnings.push("Failed to delete GitHub repo.");
    appendLog(
      createLog(
        "warn",
        `Delete project: failed to delete repo ${project.github_owner}/${project.github_repo}: ${
          error?.message ?? "unknown error"
        }`
      )
    );
  }
}

async function deleteAwsSecret(
  project: NonNullable<ReturnType<typeof findProjectById>>,
  warnings: string[]
): Promise<void> {
  const selection = applyAwsSelection();
  const region = project.aws_region ?? selection?.region;
  if (!project.aws_secret_id || !region) {
    warnings.push("AWS secret info missing; stored secrets were not deleted.");
    return;
  }
  try {
    await deleteSecret(project.aws_secret_id, region);
  } catch (error: any) {
    if (error?.name === "ResourceNotFoundException") {
      return;
    }
    warnings.push("Failed to delete AWS Secrets Manager entry.");
    appendLog(
      createLog(
        "warn",
        `Delete project: failed to delete secret ${project.aws_secret_id}: ${
          error?.message ?? "unknown error"
        }`
      )
    );
  }
}

export async function deleteProject(
  projectId: string,
  options: DeleteProjectOptions
): Promise<DeleteProjectResult> {
  const project = findProjectById(projectId);
  if (!project) {
    throw new Error("Project not found.");
  }
  const warnings: string[] = [];

  if (options.deleteRemoteRepo) {
    await deleteRemoteRepo(project, warnings);
  } else if (options.deleteRemoteFiles) {
    await deleteRemoteFiles(project, warnings);
  }

  if (options.deleteSecrets) {
    await deleteAwsSecret(project, warnings);
  }

  deleteProjectRecord(projectId);
  saveDatabase();

  const fallbackClonePath =
    project.local_clone_path ?? path.join(getDataRoot(), "repos", project.id);
  removeDir(fallbackClonePath, warnings, "local cache");

  appendLog(
    createLog(
      "info",
      `Removed project ${project.display_name ?? project.id}${
        warnings.length ? " (with warnings)" : ""
      }`
    )
  );

  return { ok: true, warnings };
}

export function stopTrackingFile(fileId: string): { ok: boolean } {
  const file = findFileById(fileId);
  if (!file) {
    throw new Error("File not found.");
  }
  deleteFile(fileId);
  saveDatabase();
  appendLog(createLog("info", `Stopped tracking ${file.source_relative_path}`));
  return { ok: true };
}
