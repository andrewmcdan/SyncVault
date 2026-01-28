import { execFile } from "node:child_process";

export async function runGit(
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd }, (error, stdout, stderr) => {
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
