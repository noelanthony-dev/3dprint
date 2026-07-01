import type { AppRoute, RouteId } from "@/app/routes/routeConfig";

export const primaryNavigationRouteIds = [
  "dashboard",
  "products",
  "hueforge",
  "inventory",
  "costing",
  "production",
  "sales",
  "expenses",
  "reports",
  "shopping-list",
  "settings",
  "backup",
] as const satisfies readonly RouteId[];

export function getNavigationRoutes(
  routes: readonly AppRoute[],
): readonly AppRoute[] {
  return primaryNavigationRouteIds.map((routeId) => {
    const route = routes.find((candidate) => candidate.id === routeId);

    if (!route) {
      throw new Error(`Missing navigation route: ${routeId}`);
    }

    return route;
  });
}

