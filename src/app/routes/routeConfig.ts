import { lazy, type ComponentType, type LazyExoticComponent } from "react";

export type RouteId =
  | "dashboard"
  | "products"
  | "hueforge"
  | "inventory"
  | "inventory-filaments"
  | "inventory-addons"
  | "inventory-finished-goods"
  | "costing"
  | "production"
  | "sales"
  | "expenses"
  | "reports"
  | "shopping-list"
  | "settings"
  | "backup";

export type RoutePath =
  | "/"
  | "/products"
  | "/hueforge"
  | "/inventory"
  | "/inventory/filaments"
  | "/inventory/add-ons"
  | "/inventory/finished-goods"
  | "/costing"
  | "/production"
  | "/sales"
  | "/expenses"
  | "/reports"
  | "/shopping-list"
  | "/settings"
  | "/backup";

export interface AppRoute {
  readonly description: string;
  readonly id: RouteId;
  readonly label: string;
  readonly path: RoutePath;
  readonly Page: LazyExoticComponent<ComponentType>;
}

const DashboardPage = lazy(async () => {
  const module = await import("@/features/dashboard");
  return { default: module.DashboardPage };
});

const ProductLibraryPage = lazy(async () => {
  const module = await import("@/features/products");
  return { default: module.ProductLibraryPage };
});

const HueForgeMatchCheckerPage = lazy(async () => {
  const module = await import("@/features/hueforge");
  return { default: module.HueForgeMatchCheckerPage };
});

const InventoryPage = lazy(async () => {
  const module = await import("@/features/inventory");
  return { default: module.InventoryPage };
});

const FilamentInventoryPage = lazy(async () => {
  const module = await import("@/features/inventory/filaments");
  return { default: module.FilamentInventoryPage };
});

const AddOnsInventoryPage = lazy(async () => {
  const module = await import("@/features/inventory/addons");
  return { default: module.AddOnsInventoryPage };
});

const FinishedGoodsInventoryPage = lazy(async () => {
  const module = await import("@/features/inventory/finishedGoods");
  return { default: module.FinishedGoodsInventoryPage };
});

const CostingPage = lazy(async () => {
  const module = await import("@/features/costing");
  return { default: module.CostingPage };
});

const ProductionRunsPage = lazy(async () => {
  const module = await import("@/features/production");
  return { default: module.ProductionRunsPage };
});

const SalesPage = lazy(async () => {
  const module = await import("@/features/sales");
  return { default: module.SalesPage };
});

const ExpensesPage = lazy(async () => {
  const module = await import("@/features/expenses");
  return { default: module.ExpensesPage };
});

const MonthlyReportsPage = lazy(async () => {
  const module = await import("@/features/reports");
  return { default: module.MonthlyReportsPage };
});

const ShoppingListPage = lazy(async () => {
  const module = await import("@/features/shoppingList");
  return { default: module.ShoppingListPage };
});

const SettingsPage = lazy(async () => {
  const module = await import("@/features/settings");
  return { default: module.SettingsPage };
});

const BackupPage = lazy(async () => {
  const module = await import("@/features/backup");
  return { default: module.BackupPage };
});

export const appRoutes = [
  {
    description: "Startup page for later business summary widgets.",
    id: "dashboard",
    label: "Dashboard",
    path: "/",
    Page: DashboardPage,
  },
  {
    description: "Design library and product catalog placeholder.",
    id: "products",
    label: "Products",
    path: "/products",
    Page: ProductLibraryPage,
  },
  {
    description: "HueForge filament matching placeholder.",
    id: "hueforge",
    label: "HueForge",
    path: "/hueforge",
    Page: HueForgeMatchCheckerPage,
  },
  {
    description: "Inventory landing page for stock categories.",
    id: "inventory",
    label: "Inventory",
    path: "/inventory",
    Page: InventoryPage,
  },
  {
    description: "Filament inventory page placeholder.",
    id: "inventory-filaments",
    label: "Filaments",
    path: "/inventory/filaments",
    Page: FilamentInventoryPage,
  },
  {
    description: "Add-ons and hardware inventory page placeholder.",
    id: "inventory-addons",
    label: "Add-ons",
    path: "/inventory/add-ons",
    Page: AddOnsInventoryPage,
  },
  {
    description: "Finished goods inventory page placeholder.",
    id: "inventory-finished-goods",
    label: "Finished Goods",
    path: "/inventory/finished-goods",
    Page: FinishedGoodsInventoryPage,
  },
  {
    description: "Print profile and costing placeholder.",
    id: "costing",
    label: "Costing",
    path: "/costing",
    Page: CostingPage,
  },
  {
    description: "Production run tracking placeholder.",
    id: "production",
    label: "Production",
    path: "/production",
    Page: ProductionRunsPage,
  },
  {
    description: "Sales tracking placeholder.",
    id: "sales",
    label: "Sales",
    path: "/sales",
    Page: SalesPage,
  },
  {
    description: "Expenses, memberships, and licenses placeholder.",
    id: "expenses",
    label: "Expenses",
    path: "/expenses",
    Page: ExpensesPage,
  },
  {
    description: "Monthly reporting placeholder.",
    id: "reports",
    label: "Reports",
    path: "/reports",
    Page: MonthlyReportsPage,
  },
  {
    description: "Shopping list placeholder.",
    id: "shopping-list",
    label: "Shopping List",
    path: "/shopping-list",
    Page: ShoppingListPage,
  },
  {
    description: "Local app settings placeholder.",
    id: "settings",
    label: "Settings",
    path: "/settings",
    Page: SettingsPage,
  },
  {
    description: "Manual backup, export, and import placeholder.",
    id: "backup",
    label: "Backup",
    path: "/backup",
    Page: BackupPage,
  },
] as const satisfies readonly AppRoute[];

export const defaultRoute: AppRoute =
  appRoutes.find((route) => route.path === "/") ?? appRoutes[0];

export function findRouteByPath(path: string): AppRoute {
  return appRoutes.find((route) => route.path === path) ?? defaultRoute;
}

export function normalizeRoutePath(value: string): RoutePath {
  const candidate = value.startsWith("#") ? value.slice(1) : value;
  const normalized = candidate === "" ? "/" : candidate;

  if (appRoutes.some((route) => route.path === normalized)) {
    return normalized as RoutePath;
  }

  return defaultRoute.path;
}

