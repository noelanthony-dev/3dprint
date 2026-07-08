import type { PropsWithChildren, SVGProps } from "react";

import type { AppRoute, RoutePath } from "@/app/routes/routeConfig";
import { useTheme } from "@/app/theme";
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
  const { themeMode, toggleTheme } = useTheme();
  const nextThemeLabel = themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode";
  const ThemeIcon = themeMode === "dark" ? SunIcon : MoonIcon;

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
          <div className="topbar__actions">
            <button
              aria-label={nextThemeLabel}
              className="theme-toggle"
              data-theme-mode={themeMode}
              onClick={toggleTheme}
              title={nextThemeLabel}
              type="button"
            >
              <ThemeIcon aria-hidden="true" />
            </button>
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

function MoonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path
        d="M20.2 15.1A7.5 7.5 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function SunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" viewBox="0 0 24 24" {...props}>
      <path
        d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
