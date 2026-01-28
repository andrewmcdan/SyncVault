import { Link, Route, Routes } from "react-router-dom";
import AddFilePage from "../pages/add-file";
import ConflictsPage from "../pages/conflicts";
import HomePage from "../pages/home";
import LogsPage from "../pages/logs";
import ProjectsPage from "../pages/projects";
import PullFilePage from "../pages/pull-file";
import SettingsPage from "../pages/settings";

export default function App(): JSX.Element {
  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1>SyncVault</h1>
          <p>Tray app for secure config sync.</p>
        </div>
        <nav className="app__nav">
          <Link to="/">Home</Link>
          <Link to="/add-file">Add file</Link>
          <Link to="/pull-file">Pull file</Link>
          <Link to="/projects">Projects</Link>
          <Link to="/conflicts">Conflicts</Link>
          <Link to="/logs">Logs</Link>
          <Link to="/settings">Settings</Link>
        </nav>
      </header>
      <main className="app__content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/add-file" element={<AddFilePage />} />
          <Route path="/pull-file" element={<PullFilePage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/conflicts" element={<ConflictsPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
