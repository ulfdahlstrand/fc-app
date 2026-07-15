/**
 * Application entry point.
 *
 * Imports i18n configuration first (as a side-effect) so that the i18next
 * instance is initialised before any component renders and calls `useTranslation`.
 */
import "./i18n/i18n";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error(
    'Root element with id "root" not found. Check that index.html contains <div id="root">.'
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
