import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DeleteProjectOptions,
  ProjectFileListItem,
  ProjectListItem
} from "@shared/types";

export default function ProjectsPage(): JSX.Element {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [status, setStatus] = useState("");
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [projectFiles, setProjectFiles] = useState<
    Record<string, ProjectFileListItem[]>
  >({});
  const [fileStatus, setFileStatus] = useState<Record<string, string>>({});
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [deleteOptions, setDeleteOptions] = useState<DeleteProjectOptions>({
    deleteRemoteFiles: false,
    deleteRemoteRepo: false,
    deleteSecrets: false
  });
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadProjects = useCallback(async () => {
    setStatus("Loading projects...");
    try {
      const items = await window.syncvault?.listProjects?.();
      setProjects(items ?? []);
      setStatus("");
    } catch {
      setStatus("Failed to load projects.");
    }
  }, []);

  const loadProjectFiles = useCallback(async (projectId: string) => {
    setFileStatus((current) => ({ ...current, [projectId]: "Loading files..." }));
    try {
      const items = await window.syncvault?.listProjectFiles?.(projectId);
      setProjectFiles((current) => ({ ...current, [projectId]: items ?? [] }));
      setFileStatus((current) => ({ ...current, [projectId]: "" }));
    } catch {
      setFileStatus((current) => ({ ...current, [projectId]: "Failed to load files." }));
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const handleOpen = async (path: string | null) => {
    if (!path) return;
    await window.syncvault?.openPath?.(path);
  };

  const toggleFiles = (projectId: string) => {
    if (expandedProjectId === projectId) {
      setExpandedProjectId(null);
      return;
    }
    setExpandedProjectId(projectId);
    if (!projectFiles[projectId]) {
      void loadProjectFiles(projectId);
    }
  };

  const handleStopTrackingFile = async (
    projectId: string,
    file: ProjectFileListItem
  ) => {
    const confirmed = window.confirm(
      `Stop tracking ${file.sourceRelativePath}? This keeps the local file and remote templates.`
    );
    if (!confirmed) return;
    setStatus("Stopping tracking...");
    try {
      await window.syncvault?.stopTrackingFile?.(file.id);
      await loadProjectFiles(projectId);
      await loadProjects();
      setStatus("File removed from tracking.");
    } catch {
      setStatus("Failed to stop tracking file.");
    }
  };

  const openDeleteModal = (projectId: string) => {
    setDeleteProjectId(projectId);
    setDeleteOptions({
      deleteRemoteFiles: false,
      deleteRemoteRepo: false,
      deleteSecrets: false
    });
  };

  const closeDeleteModal = () => {
    if (deleteBusy) return;
    setDeleteProjectId(null);
  };

  const handleDeleteOptionChange = (key: keyof DeleteProjectOptions, value: boolean) => {
    setDeleteOptions((current) => {
      const next = { ...current, [key]: value };
      if (key === "deleteRemoteRepo" && value) {
        next.deleteRemoteFiles = false;
      }
      return next;
    });
  };

  const handleDeleteProject = async () => {
    if (!deleteProjectId) return;
    setDeleteBusy(true);
    setStatus("Removing project...");
    try {
      const result = await window.syncvault?.deleteProject?.(
        deleteProjectId,
        deleteOptions
      );
      const warnings = result?.warnings ?? [];
      setStatus(
        warnings.length > 0
          ? `Project removed with warnings: ${warnings.join(" ")}`
          : "Project removed."
      );
      setDeleteProjectId(null);
      setExpandedProjectId((current) => (current === deleteProjectId ? null : current));
      await loadProjects();
    } catch {
      setStatus("Failed to delete project.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === deleteProjectId) ?? null,
    [projects, deleteProjectId]
  );

  return (
    <section className="projects">
      <div className="projects__header">
        <h2>Projects</h2>
        <button type="button" onClick={loadProjects}>
          Refresh
        </button>
      </div>

      {projects.length === 0 ? (
        <p className="muted">No projects added yet.</p>
      ) : (
        <ul className="projects__list">
          {projects.map((project) => {
            const repoLabel =
              project.githubOwner && project.githubRepo
                ? `${project.githubOwner}/${project.githubRepo}`
                : "Not linked";
            const conflictClass =
              project.openConflicts > 0 ? "projects__count projects__count--warn" : "projects__count";

            return (
              <li key={project.id} className="projects__card">
                <div className="projects__title">
                  <h3>{project.displayName}</h3>
                  <span className="projects__meta">{project.localRepoRoot}</span>
                </div>

                <div className="projects__details">
                  <div className="projects__row">
                    <span className="projects__label">GitHub</span>
                    <span>{repoLabel}</span>
                  </div>
                  <div className="projects__row">
                    <span className="projects__label">AWS region</span>
                    <span>{project.awsRegion ?? "Not set"}</span>
                  </div>
                  <div className="projects__row">
                    <span className="projects__label">Secret ID</span>
                    <span>{project.awsSecretId ?? "Not set"}</span>
                  </div>
                </div>

                <div className="projects__counts">
                  <span className="projects__count">Files: {project.fileCount}</span>
                  <span className="projects__count">
                    Destinations: {project.destinationCount}
                  </span>
                  <span className={conflictClass}>Conflicts: {project.openConflicts}</span>
                </div>

                <div className="projects__actions">
                  <button type="button" onClick={() => handleOpen(project.localRepoRoot)}>
                    Open repo
                  </button>
                  {project.localClonePath && (
                    <button type="button" onClick={() => handleOpen(project.localClonePath)}>
                      Open cache
                    </button>
                  )}
                  <button type="button" onClick={() => toggleFiles(project.id)}>
                    {expandedProjectId === project.id ? "Hide files" : "Show files"}
                  </button>
                  <button
                    type="button"
                    className="is-danger"
                    onClick={() => openDeleteModal(project.id)}
                  >
                    Delete
                  </button>
                </div>

                {expandedProjectId === project.id && (
                  <div className="projects__files">
                    <div className="projects__files-header">
                      <strong>Tracked files</strong>
                      <span className="muted">{project.fileCount} total</span>
                    </div>
                    {fileStatus[project.id] ? (
                      <p className="projects__status">{fileStatus[project.id]}</p>
                    ) : projectFiles[project.id]?.length ? (
                      <ul className="projects__file-list">
                        {projectFiles[project.id].map((file) => (
                          <li key={file.id} className="projects__file">
                            <div>
                              <div className="projects__file-path">{file.sourceRelativePath}</div>
                              <div className="projects__file-meta">
                                Destinations: {file.destinationCount}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="is-danger"
                              onClick={() => handleStopTrackingFile(project.id, file)}
                            >
                              Stop tracking
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">No tracked files.</p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {status && <p className="projects__status">{status}</p>}

      {selectedProject && (
        <div className="projects__modal" role="dialog" aria-modal="true">
          <div className="projects__modal-card">
            <div className="projects__modal-header">
              <h3>Delete {selectedProject.displayName}</h3>
              <p className="muted">
                Choose how much to remove. Stop tracking always removes local metadata.
              </p>
            </div>
            <div className="projects__modal-options">
              <label>
                <input
                  type="checkbox"
                  checked={deleteOptions.deleteRemoteFiles}
                  disabled={deleteOptions.deleteRemoteRepo}
                  onChange={(event) =>
                    handleDeleteOptionChange("deleteRemoteFiles", event.target.checked)
                  }
                />
                Delete remote template files from GitHub
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={deleteOptions.deleteRemoteRepo}
                  onChange={(event) =>
                    handleDeleteOptionChange("deleteRemoteRepo", event.target.checked)
                  }
                />
                Delete the GitHub repo (removes all remote files)
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={deleteOptions.deleteSecrets}
                  onChange={(event) =>
                    handleDeleteOptionChange("deleteSecrets", event.target.checked)
                  }
                />
                Delete stored AWS Secrets Manager entry
              </label>
            </div>
            <div className="projects__modal-actions">
              <button type="button" onClick={closeDeleteModal} disabled={deleteBusy}>
                Cancel
              </button>
              <button
                type="button"
                className="is-danger"
                onClick={handleDeleteProject}
                disabled={deleteBusy}
              >
                {deleteBusy ? "Deleting..." : "Delete project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
