export interface ConflictRecord {
  id: string;
  destination_id: string;
  detected_at: string | null;
  local_copy_path: string | null;
  remote_copy_path: string | null;
  status: string;
}
