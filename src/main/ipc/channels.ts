export const IPC_CHANNELS = {
  STATUS_GET: "syncvault:status:get",
  STATUS_SUBSCRIBE: "syncvault:status:subscribe",
  STATUS_EVENT: "syncvault:status:event",
  LOGS_GET: "syncvault:logs:get",
  LOGS_SUBSCRIBE: "syncvault:logs:subscribe",
  LOGS_EVENT: "syncvault:logs:event",
  ADD_FILE_PICK: "syncvault:add-file:pick",
  ADD_FILE_PREVIEW: "syncvault:add-file:preview",
  ADD_FILE_COMMIT: "syncvault:add-file:commit",
  AWS_PROFILES_LIST: "syncvault:aws:profiles:list",
  AWS_PROFILE_GET: "syncvault:aws:profile:get",
  AWS_PROFILE_SET: "syncvault:aws:profile:set",
  GITHUB_TOKEN_SET: "syncvault:github:token:set",
  GITHUB_AUTH_STATUS: "syncvault:github:auth:status",
  GITHUB_AUTH_CLEAR: "syncvault:github:auth:clear"
} as const;
