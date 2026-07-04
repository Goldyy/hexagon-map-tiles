import "@fontsource-variable/archivo/index.css";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import "./styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
