export interface DestinationRecord {
  id: string;
  file_id: string;
  destination_path: string;
  last_local_hash: string | null;
  last_render_hash: string | null;
  last_tool_write_at: number | null;
  is_enabled: number | null;
  created_at: string | null;
  updated_at: string | null;
}

export type DestinationInput = Omit<DestinationRecord, "created_at" | "updated_at">;
