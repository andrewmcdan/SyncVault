import { createRoot } from "react-dom/client";
import "../styles/app.css";
import AppRoutes from "./routes";

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(<AppRoutes />);
}
