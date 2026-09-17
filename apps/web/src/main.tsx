import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { AuthProvider } from "./lib/AuthContext";
import { SkinProvider } from "./lib/SkinContext";
import { getSkin } from "./lib/preferences";
import { applySkin } from "./lib/themes";
import "./index.css";

applySkin(getSkin());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SkinProvider>
          <App />
        </SkinProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
