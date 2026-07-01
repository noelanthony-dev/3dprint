import type { PropsWithChildren } from "react";

import type { AppRoute, RoutePath } from "@/app/routes/routeConfig";

import { Sidebar } from "./Sidebar";

interface AppShellProps extends PropsWithChildren {
  readonly activePath: RoutePath;
  readonly onNavigate: (path: RoutePath) => void;
  readonly routes: readonly AppRoute[];
}

export function AppShell({
  activePath,
  children,
  onNavigate,
  routes,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <Sidebar activePath={activePath} onNavigate={onNavigate} routes={routes} />
      <main className="app-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}

