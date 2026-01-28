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
