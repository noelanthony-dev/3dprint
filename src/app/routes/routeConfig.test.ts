import { describe, expect, it } from "vitest";

import {
  appRoutes,
  findRouteByPath,
  normalizeRoutePath,
} from "./routeConfig";

describe("routeConfig", () => {
  it("keeps route paths unique", () => {
    const paths = appRoutes.map((route) => route.path);

    expect(new Set(paths).size).toBe(paths.length);
  });

  it("includes the required sidebar destinations", () => {
    expect(appRoutes.map((route) => route.label)).toEqual(
      expect.arrayContaining([
        "Dashboard",
        "Products",
        "HueForge",
        "Inventory",
        "Costing",
        "Production",
        "Sales",
        "Expenses",
        "Reports",
        "Shopping List",
        "Settings",
        "Backup",
      ]),
    );
  });

  it("falls back to the dashboard for unknown routes", () => {
    expect(findRouteByPath("/missing").path).toBe("/");
    expect(normalizeRoutePath("#/missing")).toBe("/");
  });
});

