import { getNavigationRoutes } from "@/app/navigation/navigationItems";
import type { AppRoute, RoutePath } from "@/app/routes/routeConfig";

interface SidebarProps {
  readonly activePath: RoutePath;
  readonly onNavigate: (path: RoutePath) => void;
  readonly routes: readonly AppRoute[];
}

export function Sidebar({ activePath, onNavigate, routes }: SidebarProps) {
  const navigationRoutes = getNavigationRoutes(routes);

  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="sidebar__brand">
        <span className="sidebar__brand-mark" aria-hidden="true">
          3D
        </span>
        <div>
          <strong>Print Manager</strong>
          <span>Offline desktop scaffold</span>
        </div>
      </div>

      <nav className="sidebar__nav">
        {navigationRoutes.map((route) => {
          const isActive = route.path === activePath;

          return (
            <a
              aria-current={isActive ? "page" : undefined}
              className="sidebar__link"
              data-active={isActive ? "true" : "false"}
              href={`#${route.path}`}
              key={route.id}
              onClick={(event) => {
                event.preventDefault();
                onNavigate(route.path);
              }}
            >
              <span>{route.label}</span>
            </a>
          );
        })}
      </nav>
    </aside>
  );
}

