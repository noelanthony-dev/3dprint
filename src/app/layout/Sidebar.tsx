import { getNavigationRoutes } from "@/app/navigation/navigationItems";
import type { AppRoute, RouteId, RoutePath } from "@/app/routes/routeConfig";

interface SidebarProps {
  readonly activePath: RoutePath;
  readonly onNavigate: (path: RoutePath) => void;
  readonly routes: readonly AppRoute[];
}

const routeInitials: Record<RouteId, string> = {
  backup: "BK",
  costing: "CO",
  dashboard: "DB",
  expenses: "EX",
  hueforge: "HF",
  inventory: "IN",
  "inventory-addons": "AD",
  "inventory-filaments": "FI",
  "inventory-finished-goods": "FG",
  production: "PR",
  products: "PD",
  reports: "RP",
  sales: "SA",
  settings: "ST",
  "shopping-list": "SL",
};

export function Sidebar({ activePath, onNavigate, routes }: SidebarProps) {
  const navigationRoutes = getNavigationRoutes(routes);

  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="sidebar__brand">
        <span className="sidebar__brand-mark" aria-hidden="true">
          PO
        </span>
        <div>
          <strong>PrintOps Studio</strong>
          <span>v0.1 scaffold</span>
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
              <span className="sidebar__link-icon" aria-hidden="true">
                {routeInitials[route.id]}
              </span>
              <span>{route.label}</span>
            </a>
          );
        })}
      </nav>
      <div className="sidebar__footer">
        <span className="sidebar__footer-label">System</span>
        <span>Local-only desktop</span>
        <span className="sidebar__online">Ready for native plugins</span>
      </div>
    </aside>
  );
}
