export interface FileRecord {
  id: string;
  project_id: string;
  source_relative_path: string;
  template_path: string;
  mapping_path: string;
  type: string;
  created_at: string | null;
  updated_at: string | null;
}

export type FileInput = Omit<FileRecord, "created_at" | "updated_at">;
