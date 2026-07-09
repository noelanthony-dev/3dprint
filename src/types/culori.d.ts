declare module "culori" {
  export interface HslColor {
    readonly mode: "hsl";
    readonly h?: number;
    readonly s?: number;
    readonly l?: number;
    readonly alpha?: number;
  }

  export function converter(mode?: "hsl"): (color: string) => HslColor | undefined;
  export function converter(mode?: string): (color: string | object) => unknown;

  export function differenceCiede2000(
    Kl?: number,
    Kc?: number,
    Kh?: number,
  ): (standard: string | object, sample: string | object) => number;
}
