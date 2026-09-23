import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { KidcomApp } from "@kidcom/core";

import { themeRegistry } from "./themes";

// Theme-neutral splash for the few milliseconds before the first theme's
// chunk has loaded. Inline-styled on purpose: no theme CSS exists yet.
const splash = (
  <div
    aria-busy="true"
    style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background: "#f8faf9" }}
  >
    <img src="/logo.svg" alt="KidCom" width={72} height={72} />
  </div>
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <KidcomApp registry={themeRegistry} apiBaseUrl={import.meta.env.VITE_API_BASE ?? "/api"} splash={splash} />
  </StrictMode>,
);

registerSW({ immediate: true });
