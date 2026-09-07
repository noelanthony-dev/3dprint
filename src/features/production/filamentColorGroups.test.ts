import { describe, expect, it } from "vitest";

import type { FilamentRecord } from "@/domain/inventory";

import {
  getFilamentColorGroup,
  getFilamentDisplayName,
  groupFilamentsByColor,
} from "./filamentColorGroups";

describe("production filament color groups", () => {
  it.each([
    ["White", "#ffffff", "white"],
    ["Ivory", "#fffdd0", "white"],
    ["Silver", "#c0c0c0", "gray"],
    ["Black", "#171717", "black"],
    ["Cocoa", "#6f4e37", "brown"],
    ["Tan", "#d2b48c", "brown"],
    ["Scarlet", "#ff2400", "red"],
    ["Pastel pink", "#ffc0cb", "pink"],
    ["Hot pink", "#ff1493", "pink"],
    ["Orange", "#ff8c00", "orange"],
    ["Sunshine", "#ffff00", "yellow"],
    ["Silk gold", "#d4af37", "yellow"],
    ["Apple green", "#8db600", "green"],
    ["Arctic teal", "#008080", "teal"],
    ["Blue", "#0000ff", "blue"],
    ["Lavender", "#b57edc", "purple"],
    ["Clear", "#ffffff", "clear"],
    ["Unrecognized", "bad-value", "unknown"],
  ])("groups %s by its displayed color", (colorName, hexColor, expectedGroup) => {
    expect(getFilamentColorGroup(makeFilament(1, { colorName, hexColor })).id).toBe(expectedGroup);
  });

  it("uses normalized hex instead of misleading brand or color names for chromatic colors", () => {
    const filament = makeFilament(1, {
      brand: "Green Supplies",
      colorName: "Rose Red",
      hexColor: " 00AAFF ",
    });

    expect(getFilamentColorGroup(filament).id).toBe("blue");
  });

  it("keeps every supplied spool, groups adjacent shades, and preserves duplicate stock rank without mutation", () => {
    const darkerWhite = makeFilament(1, { hexColor: "#dddddd" });
    const green = makeFilament(2, { hexColor: "#00ff00" });
    const firstWhite = makeFilament(3, { hexColor: "#ffffff", spoolStatus: "sealed" });
    const secondWhite = makeFilament(4, { hexColor: "#ffffff" });
    const unknown = makeFilament(5, { hexColor: "unknown", spoolStatus: "empty" });
    const input = Object.freeze([darkerWhite, green, firstWhite, secondWhite, unknown]);
    const result = groupFilamentsByColor(input);

    expect(result.map((group) => group.id)).toEqual(["white", "green", "unknown"]);
    expect(result[0]?.filaments).toEqual([firstWhite, secondWhite, darkerWhite]);
    expect(result.flatMap((group) => group.filaments)).toHaveLength(input.length);
    expect(result[0]?.filaments[0]).toBe(firstWhite);
    expect(input).toEqual([darkerWhite, green, firstWhite, secondWhite, unknown]);
  });

  it("orders nearby chromatic hues together while preserving input rank for identical shades", () => {
    const warmGreen = makeFilament(1, { hexColor: "#80ff00" });
    const coolGreen = makeFilament(2, { hexColor: "#00ff80" });
    const green = makeFilament(3, { hexColor: "#00ff00" });
    const duplicateGreen = makeFilament(4, { hexColor: "#00ff00" });

    expect(groupFilamentsByColor([coolGreen, green, warmGreen, duplicateGreen])[0]?.filaments)
      .toEqual([warmGreen, green, duplicateGreen, coolGreen]);
  });

  it("searches brand, spool name, recorded color, material, normalized hex, and group labels", () => {
    const filament = makeFilament(1, {
      brand: "Bambu",
      name: "Matte Apple",
      colorName: "Orchard",
      materialType: "PLA+",
      hexColor: " 8DB600 ",
    });

    for (const query of ["bambu", "MATTE", "orchard", "pla+", "#8db600", "green", "apple bambu green"]) {
      expect(groupFilamentsByColor([filament], query).flatMap((group) => group.filaments)).toEqual([filament]);
    }

    expect(groupFilamentsByColor([filament], "green blue")).toEqual([]);
    expect(groupFilamentsByColor([], " ")).toEqual([]);
  });
});

describe("filament display names", () => {
  it("includes the brand once when the saved spool name already starts with it", () => {
    expect(getFilamentDisplayName(makeFilament(1, { brand: "Bambu", name: "Bambu PLA Basic Orange" })))
      .toBe("Bambu PLA Basic Orange");
    expect(getFilamentDisplayName(makeFilament(1, { brand: "eSUN", name: "eSun PLA Silk Gold" })))
      .toBe("eSun PLA Silk Gold");
  });

  it("retains brands that are absent from the name or only match part of a word", () => {
    expect(getFilamentDisplayName(makeFilament(1, { brand: "Bambu", name: "PLA Basic Orange" })))
      .toBe("Bambu PLA Basic Orange");
    expect(getFilamentDisplayName(makeFilament(1, { brand: "Sun", name: "Sunshine Yellow" })))
      .toBe("Sun Sunshine Yellow");
  });
});

function makeFilament(id: number, overrides: Partial<FilamentRecord> = {}): FilamentRecord {
  return {
    id,
    brand: "Generic",
    name: `Spool ${id}`,
    materialType: "PLA",
    colorName: "Color",
    hexColor: "#808080",
    transmissionDistance: null,
    spoolStatus: "open",
    startingGrams: 1000,
    estimatedGramsLeft: 100,
    spoolCost: 1000,
    purchaseSource: "",
    notes: "",
    lowStockThresholdGrams: 50,
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
    ...overrides,
  };
}
