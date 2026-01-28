import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "../../util/paths";
import { runGit } from "./git-client";

export async function ensureLocalRepo(repoPath: string): Promise<void> {
  ensureDir(repoPath);
  const gitDir = path.join(repoPath, ".git");
  if (fs.existsSync(gitDir)) return;
  await runGit(["init"], repoPath);
}

export async function cloneRepo(remoteUrl: string, targetPath: string): Promise<void> {
  if (fs.existsSync(path.join(targetPath, ".git"))) return;
  ensureDir(path.dirname(targetPath));
  await runGit(["clone", remoteUrl, targetPath], process.cwd());
}

export async function ensureRemote(repoPath: string, remoteUrl: string): Promise<void> {
  try {
    await runGit(["remote", "get-url", "origin"], repoPath);
  } catch {
    await runGit(["remote", "add", "origin", remoteUrl], repoPath);
  }
}

export async function checkoutMain(repoPath: string): Promise<void> {
  await runGit(["checkout", "-B", "main"], repoPath);
}

export async function hasChanges(repoPath: string): Promise<boolean> {
  const { stdout } = await runGit(["status", "--porcelain"], repoPath);
  return stdout.trim().length > 0;
}

export async function commitAll(repoPath: string, message: string): Promise<void> {
  await runGit(["add", "-A"], repoPath);
  if (!(await hasChanges(repoPath))) return;
  await runGit(["commit", "-m", message], repoPath);
}

export async function pushWithToken(
  repoPath: string,
  owner: string,
  repo: string,
  token: string
): Promise<void> {
  const pushUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
  await runGit(["push", pushUrl, "HEAD:main"], repoPath);
}
