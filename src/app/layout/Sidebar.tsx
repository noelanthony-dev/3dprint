import bambuLogoUrl from "@/assets/bambu-logo.webp";
import { getNavigationRoutes } from "@/app/navigation/navigationItems";
import type { AppRoute, RouteId, RoutePath } from "@/app/routes/routeConfig";
import type { ReactElement, SVGProps } from "react";

interface SidebarProps {
  readonly activePath: RoutePath;
  readonly onNavigate: (path: RoutePath) => void;
  readonly routes: readonly AppRoute[];
}

type SidebarIcon = (props: SVGProps<SVGSVGElement>) => ReactElement;

const routeIcons: Record<RouteId, SidebarIcon> = {
  backup: BackupIcon,
  costing: CalculatorIcon,
  dashboard: DashboardIcon,
  expenses: ExpenseIcon,
  hueforge: PaletteIcon,
  inventory: InventoryIcon,
  "inventory-addons": InventoryIcon,
  "inventory-filaments": FilamentIcon,
  "inventory-finished-goods": BoxIcon,
  production: ProductionIcon,
  products: BoxIcon,
  reports: ReportsIcon,
  sales: SalesIcon,
  settings: SettingsIcon,
  "shopping-list": ShoppingCartIcon,
};

export function Sidebar({ activePath, onNavigate, routes }: SidebarProps) {
  const navigationRoutes = getNavigationRoutes(routes);

  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="sidebar__brand">
        <span className="sidebar__brand-mark" aria-hidden="true">
          <img alt="" src={bambuLogoUrl} />
        </span>
        <div>
          <strong>PrintOps Studio</strong>
          <span>v0.1 MVP</span>
        </div>
      </div>

      <nav className="sidebar__nav">
        {navigationRoutes.map((route) => {
          const isActive = route.path === activePath;
          const Icon = routeIcons[route.id];

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
                <Icon />
              </span>
              <span>{route.label}</span>
            </a>
          );
        })}
      </nav>
    </aside>
  );
}

function IconSvg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="18"
      {...props}
    />
  );
}

function DashboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg {...props}>
      <path d="M4 5h7v6H4z" />
      <path d="M13 5h7v4h-7z" />
      <path d="M13 11h7v8h-7z" />
      <path d="M4 13h7v6H4z" />
    </IconSvg>
  );
}

function BoxIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg {...props}>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M4.5 7.5 12 12l7.5-4.5" />
      <path d="M12 12v9" />
    </IconSvg>
  );
}

function PaletteIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg {...props}>
      <path d="M12 4a8 8 0 0 0 0 16h1.2a1.8 1.8 0 0 0 1.3-3.1 1.8 1.8 0 0 1 1.3-3.1H17a3 3 0 0 0 3-3C20 7 16.5 4 12 4z" />
      <path d="M7.5 11h.01" />
      <path d="M9.5 7.5h.01" />
      <path d="M14 7.5h.01" />
    </IconSvg>
  );
}

function InventoryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg {...props}>
      <path d="M4 5h16" />
      <path d="M5 5v14" />
      <path d="M19 5v14" />
      <path d="M4 12h16" />
      <path d="M7 8h4" />
      <path d="M13 15h4" />
      <path d="M4 19h16" />
    </IconSvg>
  );
}

function FilamentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg {...props}>
      <circle cx="11" cy="12" r="6" />
      <circle cx="11" cy="12" r="2" />
      <path d="M17 12h2a3 3 0 0 1 0 6h-1" />
    </IconSvg>
  );
}

function CalculatorIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg {...props}>
      <path d="M6 3h12v18H6z" />
      <path d="M8.5 6.5h7" />
      <path d="M9 11h.01" />
      <path d="M12 11h.01" />
      <path d="M15 11h.01" />
      <path d="M9 15h.01" />
      <path d="M12 15h.01" />
      <path d="M15 15h.01" />
    </IconSvg>
  );
}

function ProductionIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg {...props}>
      <path d="M4 18h16" />
      <path d="M6 18V9l5-3v12" />
      <path d="M11 10h7v8" />
      <path d="M8 13h1" />
      <path d="M14 13h1" />
      <path d="M17 13h1" />
    </IconSvg>
  );
}

function SalesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg {...props}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M9 16h3" />
    </IconSvg>
  );
}

function ExpenseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg {...props}>
      <path d="M4 7h16v11H4z" />
      <path d="M4 10h16" />
      <path d="M8 15h3" />
      <path d="M15 15h1" />
    </IconSvg>
  );
}

function ReportsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg {...props}>
      <path d="M5 19V5" />
      <path d="M5 19h14" />
      <path d="M8 15v-4" />
      <path d="M12 15V8" />
      <path d="M16 15v-6" />
    </IconSvg>
  );
}

function ShoppingCartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg {...props}>
      <path d="M4 5h2l2 10h9l2-7H7" />
      <circle cx="10" cy="19" r="1" />
      <circle cx="17" cy="19" r="1" />
    </IconSvg>
  );
}

function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg {...props}>
      <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="m4.9 4.9 2.1 2.1" />
      <path d="m17 17 2.1 2.1" />
      <path d="M2 12h3" />
      <path d="M19 12h3" />
      <path d="m4.9 19.1 2.1-2.1" />
      <path d="m17 7 2.1-2.1" />
    </IconSvg>
  );
}

function BackupIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconSvg {...props}>
      <ellipse cx="12" cy="5" rx="7" ry="3" />
      <path d="M5 5v10c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
      <path d="M5 10c0 1.7 3.1 3 7 3s7-1.3 7-3" />
      <path d="m15 21 3-3 3 3" />
    </IconSvg>
  );
}
