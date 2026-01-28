export interface ProjectRecord {
  id: string;
  local_repo_root: string;
  display_name: string | null;
  github_owner: string | null;
  github_repo: string | null;
  github_clone_url: string | null;
  local_clone_path: string | null;
  aws_region: string | null;
  aws_secret_id: string | null;
  poll_interval_seconds: number | null;
  last_remote_head: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type ProjectInput = Omit<ProjectRecord, "created_at" | "updated_at">;
