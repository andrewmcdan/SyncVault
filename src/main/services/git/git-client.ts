import { execFile } from "node:child_process";

export interface RunGitOptions {
  env?: NodeJS.ProcessEnv;
}

export async function runGit(
  args: string[],
  cwd: string,
  options: RunGitOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, env: { ...process.env, ...options.env } }, (error, stdout, stderr) => {
      if (error) {
        const wrapped = new Error(stderr || error.message);
        (wrapped as NodeJS.ErrnoException).cause = error;
        reject(wrapped);
        return;
      }
      resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
    });
  });
}
