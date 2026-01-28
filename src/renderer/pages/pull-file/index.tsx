import { useEffect, useState } from "react";
import type { RemoteFileItem, RemoteProjectItem } from "@shared/types";

export default function PullFilePage(): JSX.Element {
  const [projects, setProjects] = useState<RemoteProjectItem[]>([]);
  const [files, setFiles] = useState<RemoteFileItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<RemoteProjectItem | null>(null);
  const [selectedFile, setSelectedFile] = useState<RemoteFileItem | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    const load = async () => {
      const items = await window.syncvault?.listPullProjects?.();
      setProjects(items ?? []);
    };
    void load();
  }, []);

  const handleProjectSelect = async (project: RemoteProjectItem) => {
    setSelectedProject(project);
    setSelectedFile(null);
    setStatus("Loading files...");
    const list = await window.syncvault?.listPullFiles?.(project.owner, project.repo);
    setFiles(list ?? []);
    setStatus("");
  };

  const handlePull = async () => {
    if (!selectedProject || !selectedFile) return;
    setStatus("Pulling file...");
    await window.syncvault?.pullFile?.({
      owner: selectedProject.owner,
      repo: selectedProject.repo,
      fileId: selectedFile.fileId
    });
    setStatus("File pulled.");
  };

  return (
    <section className="pull-file">
      <h2>Pull file from remote</h2>
      <div className="pull-file__grid">
        <div>
          <h3>Projects</h3>
          {projects.length === 0 ? (
            <p className="muted">No SyncVault repos found.</p>
          ) : (
            <ul className="pull-file__list">
              {projects.map((project) => (
                <li key={`${project.owner}/${project.repo}`}>
                  <button
                    type="button"
                    className={selectedProject?.repo === project.repo ? "is-active" : ""}
                    onClick={() => handleProjectSelect(project)}
                  >
                    {project.owner}/{project.repo}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>Files</h3>
          {files.length === 0 ? (
            <p className="muted">Select a project to list files.</p>
          ) : (
            <ul className="pull-file__list">
              {files.map((file) => (
                <li key={file.fileId}>
                  <button
                    type="button"
                    className={selectedFile?.fileId === file.fileId ? "is-active" : ""}
                    onClick={() => setSelectedFile(file)}
                  >
                    {file.templatePath}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="pull-file__footer">
        <button
          type="button"
          onClick={handlePull}
          disabled={!selectedProject || !selectedFile}
        >
          Pull selected file
        </button>
        {status && <span className="pull-file__status">{status}</span>}
      </div>
    </section>
  );
}
