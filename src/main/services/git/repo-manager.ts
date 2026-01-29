import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "../../util/paths";
import { runGit } from "./git-client";

function buildAuthUrl(remoteUrl: string, token: string): string {
  try {
    const url = new URL(remoteUrl);
    if (!url.hostname.includes("github.com")) {
      return remoteUrl;
    }
    url.username = "x-access-token";
    url.password = token;
    return url.toString();
  } catch {
    return remoteUrl;
  }
}

export async function ensureLocalRepo(repoPath: string): Promise<void> {
  ensureDir(repoPath);
  const gitDir = path.join(repoPath, ".git");
  if (fs.existsSync(gitDir)) return;
  await runGit(["init"], repoPath);
}

export async function cloneRepo(
  remoteUrl: string,
  targetPath: string,
  token?: string
): Promise<void> {
  if (fs.existsSync(path.join(targetPath, ".git"))) return;
  ensureDir(path.dirname(targetPath));
  const cloneUrl = token ? buildAuthUrl(remoteUrl, token) : remoteUrl;
  await runGit(["clone", cloneUrl, targetPath], process.cwd());
  if (token) {
    await runGit(["remote", "set-url", "origin", remoteUrl], targetPath);
  }
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

export async function pullWithToken(
  repoPath: string,
  remoteUrl: string,
  branch: string,
  token?: string
): Promise<void> {
  const pullUrl = token ? buildAuthUrl(remoteUrl, token) : remoteUrl;
  await runGit(["pull", pullUrl, branch], repoPath);
}
