import { HashRouter } from "react-router-dom";
import App from "./App";

export default function AppRoutes(): JSX.Element {
  return (
    <HashRouter>
      <App />
    </HashRouter>
  );
}
