import type { PropsWithChildren } from "react";

import type { AppRoute, RoutePath } from "@/app/routes/routeConfig";
import { ToolbarButton } from "@/components/ui";

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
  const activeRoute = routes.find((route) => route.path === activePath);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Sidebar activePath={activePath} onNavigate={onNavigate} routes={routes} />
      <div className="workspace">
        <header className="topbar">
          <div className="topbar__title">
            <strong>PrintOps Studio</strong>
            <span>{activeRoute?.label ?? "Dashboard"}</span>
          </div>
          <div className="topbar__status" aria-label="Application status">
            <span>Offline mode</span>
            <span>Home stock</span>
            <span>SQLite active</span>
          </div>
          <div className="topbar__actions">
            <ToolbarButton onClick={() => onNavigate("/sales")}>Log Sale</ToolbarButton>
            <ToolbarButton onClick={() => onNavigate("/production")} tone="primary">
              Production Run
            </ToolbarButton>
          </div>
        </header>
        <main className="app-main" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
