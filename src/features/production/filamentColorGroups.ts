import { converter } from "culori";

import { normalizeHexColor, type FilamentRecord } from "@/domain/inventory";

const UNKNOWN_COLOR_GROUP = { id: "unknown", label: "Other colors" } as const;

const COLOR_GROUPS = [
  { id: "white", label: "Whites & creams" },
  { id: "gray", label: "Grays & silvers" },
  { id: "black", label: "Blacks" },
  { id: "brown", label: "Browns & tans" },
  { id: "red", label: "Reds" },
  { id: "orange", label: "Oranges" },
  { id: "yellow", label: "Yellows & golds" },
  { id: "green", label: "Greens" },
  { id: "teal", label: "Teals & cyans" },
  { id: "blue", label: "Blues" },
  { id: "purple", label: "Purples" },
  { id: "pink", label: "Pinks" },
  { id: "clear", label: "Clear & translucent" },
  UNKNOWN_COLOR_GROUP,
] as const;

type ColorGroup = (typeof COLOR_GROUPS)[number];
type ColorGroupId = ColorGroup["id"];

export interface FilamentColorGroup {
  readonly id: string;
  readonly label: string;
  readonly filaments: readonly FilamentRecord[];
}

const toHsl = converter("hsl");

export function getFilamentDisplayName(
  filament: Pick<FilamentRecord, "brand" | "name" | "colorName" | "materialType">,
): string {
  const brand = filament.brand.trim();
  const name = filament.name.trim();
  const brandPrefix = name.slice(0, brand.length).toLowerCase();
  const followingCharacter = name.slice(brand.length, brand.length + 1);

  if (!brand || (brandPrefix === brand.toLowerCase() && (!followingCharacter || /[\s\-:/]/.test(followingCharacter)))) {
    return name || `${filament.colorName} ${filament.materialType}`.trim();
  }

  return name ? `${brand} ${name}` : brand;
}

export function getFilamentColorGroup(filament: FilamentRecord): ColorGroup {
  const id = classifyFilamentColor(filament);

  return COLOR_GROUPS.find((group) => group.id === id) ?? UNKNOWN_COLOR_GROUP;
}

/** Groups presentation choices only; callers retain responsibility for stock eligibility. */
export function groupFilamentsByColor(
  filaments: readonly FilamentRecord[],
  query = "",
): readonly FilamentColorGroup[] {
  const searchTerms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const entries = filaments.map((filament, index) => ({
    filament,
    group: getFilamentColorGroup(filament),
    hsl: readHsl(filament.hexColor),
    index,
  }));

  return COLOR_GROUPS.flatMap((group) => {
    const matches = entries.filter((entry) => {
      if (entry.group.id !== group.id) {
        return false;
      }

      const filament = entry.filament;
      const searchable = [
        filament.brand,
        filament.name,
        filament.colorName,
        filament.materialType,
        normalizeHexColor(filament.hexColor),
        group.label,
        group.id === "gray" ? "grey greys" : "",
      ].join(" ").toLowerCase();

      return searchTerms.every((term) => searchable.includes(term));
    });
    const sortByLightness = ["white", "gray", "black", "brown", "clear", "unknown"].includes(group.id);

    matches.sort((first, second) => {
      const hueDifference = sortableHue(first.hsl?.h, group.id) - sortableHue(second.hsl?.h, group.id);
      const lightnessDifference = (second.hsl?.l ?? 0) - (first.hsl?.l ?? 0);

      return (sortByLightness ? lightnessDifference || hueDifference : hueDifference || lightnessDifference)
        || (second.hsl?.s ?? 0) - (first.hsl?.s ?? 0)
        || first.index - second.index;
    });

    return matches.length ? [{ ...group, filaments: matches.map((entry) => entry.filament) }] : [];
  });
}

function readHsl(hexColor: string): ReturnType<typeof toHsl> {
  const normalizedHex = normalizeHexColor(hexColor);

  return /^#[0-9a-f]{6}$/.test(normalizedHex) ? toHsl(normalizedHex) : undefined;
}

function classifyFilamentColor(filament: FilamentRecord): ColorGroupId {
  // Hex colors cannot represent transparency, so use the recorded color name for clear stock.
  if (/\b(clear|transparent|translucent)\b/i.test(filament.colorName)) {
    return "clear";
  }

  const hsl = readHsl(filament.hexColor);

  if (!hsl || hsl.s == null || hsl.l == null) {
    return "unknown";
  }

  const hue = ((hsl.h ?? 0) + 360) % 360;
  const saturation = hsl.s;
  const lightness = hsl.l;

  if (saturation <= 0.16) {
    return lightness >= 0.82 ? "white" : lightness <= 0.16 ? "black" : "gray";
  }

  // Pale warm shades are visually cream even when HSL reports high saturation near white.
  if (hue >= 30 && hue <= 70 && lightness >= 0.85) {
    return "white";
  }

  if (hue >= 12 && hue < 55 && (
    (hue < 40 && (lightness < 0.47 || (lightness < 0.55 && saturation < 0.7)))
    || (lightness < 0.8 && saturation < 0.5)
  )) {
    return "brown";
  }

  if (hue < 15 || hue >= 345) {
    return lightness >= 0.7 ? "pink" : "red";
  }

  if (hue < 40) return "orange";
  if (hue < 70) return "yellow";
  if (hue < 165) return "green";
  if (hue < 200) return "teal";
  if (hue < 255) return "blue";
  if (hue < 300) return "purple";

  return "pink";
}

function sortableHue(hue: number | undefined, group: ColorGroupId): number {
  const normalized = ((hue ?? 0) + 360) % 360;

  return group === "red" && normalized >= 345 ? normalized - 360 : normalized;
}
