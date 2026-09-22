import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PlayerApp } from "./PlayerApp";
import "./app.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root is missing from index.html");
}

createRoot(container).render(
  <StrictMode>
    <PlayerApp />
  </StrictMode>,
);
