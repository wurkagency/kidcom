import "./styles.css";

import { defineTheme } from "@kidcom/theme-kit";

import { screens } from "./screens";
import { AppShell, AuthShell, BlankShell, StackShell } from "./shells/shells";
import { ErrorFallback, Loading } from "./system/SystemScreens";

export default defineTheme({
  id: "aura",
  name: "Aura",
  meta: { themeColor: "#f8faf9", backgroundColor: "#f8faf9" },
  shells: { app: AppShell, stack: StackShell, auth: AuthShell, blank: BlankShell },
  screens,
  Loading,
  ErrorFallback,
});
