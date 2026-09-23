import { Component, Suspense, type ErrorInfo, type ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, ScrollRestoration, useLocation } from "react-router";
import { useTheme, type ScreenId, type ShellKind } from "@kidcom/theme-kit";

import { useMe } from "../auth/hooks";
import { CurrentScreenContext } from "./currentScreen";
import { ROUTES, type RouteAccess } from "./routes";
import { paths } from "./paths";

class ScreenErrorBoundary extends Component<
  { fallback: (error: unknown, reset: () => void) => ReactNode; children: ReactNode },
  { error: unknown }
> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Screen crashed", error, info.componentStack);
  }
  render() {
    if (this.state.error) return this.props.fallback(this.state.error, () => this.setState({ error: null }));
    return this.props.children;
  }
}

/** Only "/"-relative, same-app paths are accepted as a post-login target. */
export function safeNextPath(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

function Guard({ access, children }: { access: RouteAccess; children: ReactNode }) {
  const theme = useTheme();
  const location = useLocation();
  const { data: me, isPending } = useMe();

  if (access === "public") return <>{children}</>;
  if (isPending) return <theme.Loading />;

  if (access === "guest") {
    if (!me) return <>{children}</>;
    const next = safeNextPath(new URLSearchParams(location.search).get("next"));
    return <Navigate to={next ?? paths.today()} replace />;
  }

  // authed
  if (!me) {
    const next = location.pathname + location.search;
    return <Navigate to={`${paths.auth.login()}?next=${encodeURIComponent(next)}`} replace />;
  }
  if (!me.emailVerifiedAt) return <Navigate to={paths.auth.verifyEmail()} replace />;
  return <>{children}</>;
}

function RoutedScreen({ screen, shell, access }: { screen: ScreenId; shell: ShellKind; access: RouteAccess }) {
  const theme = useTheme();
  const Shell = theme.shells[shell];
  const Screen = theme.screens[screen];
  return (
    <CurrentScreenContext.Provider value={screen}>
      <Guard access={access}>
        <Shell screen={screen}>
          <ScreenErrorBoundary fallback={(error, reset) => <theme.ErrorFallback error={error} reset={reset} />}>
            <Suspense fallback={<theme.Loading />}>
              <Screen />
            </Suspense>
          </ScreenErrorBoundary>
        </Shell>
      </Guard>
    </CurrentScreenContext.Provider>
  );
}

function NotFound() {
  const theme = useTheme();
  const Blank = theme.shells.blank;
  const Screen = theme.screens["system.notFound"];
  return (
    <CurrentScreenContext.Provider value="system.notFound">
      <Blank screen="system.notFound">
        <Suspense fallback={<theme.Loading />}>
          <Screen />
        </Suspense>
      </Blank>
    </CurrentScreenContext.Provider>
  );
}

function Root() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      ...ROUTES.map((route) => ({
        path: route.path,
        element: <RoutedScreen screen={route.screen} shell={route.shell} access={route.access} />,
      })),
      { path: "*", element: <NotFound /> },
    ],
  },
]);

/** The whole routed app, rendered through the active theme. */
export function AppRouter() {
  return <RouterProvider router={router} />;
}
