import { getSetting, setSetting } from "../../db/repositories/settings";
import { listProjects } from "../../db/repositories/projects";
import { runGit } from "../git/git-client";

export type GitHubAuthMode = "pat" | "native";

const AUTH_MODE_KEY = "github.auth.mode";

export function getGitHubToken(): string | null {
  return getSetting("github.token");
}

export function setGitHubToken(token: string): void {
  setSetting("github.token", token);
}

export function clearGitHubToken(): void {
  setSetting("github.token", null);
}

export function getGitHubAuthMode(): GitHubAuthMode {
  return getSetting(AUTH_MODE_KEY) === "native" ? "native" : "pat";
}

export function setGitHubAuthMode(mode: GitHubAuthMode): void {
  setSetting(AUTH_MODE_KEY, mode);
}

export function shouldUseGitHubTokenForGit(): boolean {
  return getGitHubAuthMode() === "pat";
}

export async function detectGitHubAuthMode(): Promise<GitHubAuthMode> {
  if (process.platform !== "win32") {
    return getGitHubAuthMode();
  }

  const projects = listProjects().filter((project) => project.github_clone_url);
  if (projects.length === 0) {
    return getGitHubAuthMode();
  }

  const env = {
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never"
  };

  for (const project of projects) {
    const cloneUrl = project.github_clone_url;
    if (!cloneUrl) continue;
    try {
      await runGit(["ls-remote", cloneUrl, "HEAD"], process.cwd(), { env });
      setGitHubAuthMode("native");
      return "native";
    } catch {
      continue;
    }
  }

  setGitHubAuthMode("pat");
  return "pat";
}
