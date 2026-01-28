import { useCallback, useEffect, useState } from "react";
import type { ProjectListItem } from "@shared/types";

export default function ProjectsPage(): JSX.Element {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [status, setStatus] = useState("");

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

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const handleOpen = async (path: string | null) => {
    if (!path) return;
    await window.syncvault?.openPath?.(path);
  };

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
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {status && <p className="projects__status">{status}</p>}
    </section>
  );
}
