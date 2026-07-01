import { describe, expect, it } from "vitest";

import {
  createScaffoldModuleStatus,
  isPlaceholderModule,
} from "./scaffoldStatus";

describe("scaffoldStatus", () => {
  it("creates explicit placeholder module metadata", () => {
    const status = createScaffoldModuleStatus({
      layer: "domain",
      name: "costing",
      notes: ["pure calculations later"],
    });

    expect(status).toEqual({
      implementation: "placeholder",
      layer: "domain",
      name: "costing",
      notes: ["pure calculations later"],
    });
    expect(isPlaceholderModule(status)).toBe(true);
  });
});

