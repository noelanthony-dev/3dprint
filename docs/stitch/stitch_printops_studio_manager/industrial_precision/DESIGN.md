---
name: Industrial Precision
colors:
  surface: '#121415'
  surface-dim: '#121415'
  surface-bright: '#38393a'
  surface-container-lowest: '#0c0e0f'
  surface-container-low: '#1a1c1d'
  surface-container: '#1e2021'
  surface-container-high: '#282a2b'
  surface-container-highest: '#333536'
  on-surface: '#e2e2e3'
  on-surface-variant: '#bbcbb8'
  inverse-surface: '#e2e2e3'
  inverse-on-surface: '#2f3132'
  outline: '#869583'
  outline-variant: '#3c4a3c'
  surface-tint: '#3ce36a'
  primary: '#3fe56c'
  on-primary: '#003912'
  primary-container: '#00c853'
  on-primary-container: '#004c1b'
  inverse-primary: '#006e2a'
  secondary: '#c7c6c6'
  on-secondary: '#303031'
  secondary-container: '#464747'
  on-secondary-container: '#b6b5b5'
  tertiary: '#fdbf02'
  on-tertiary: '#3f2e00'
  tertiary-container: '#dba500'
  on-tertiary-container: '#543e00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#69ff87'
  primary-fixed-dim: '#3ce36a'
  on-primary-fixed: '#002108'
  on-primary-fixed-variant: '#00531e'
  secondary-fixed: '#e3e2e2'
  secondary-fixed-dim: '#c7c6c6'
  on-secondary-fixed: '#1b1c1c'
  on-secondary-fixed-variant: '#464747'
  tertiary-fixed: '#ffdf9e'
  tertiary-fixed-dim: '#fabd00'
  on-tertiary-fixed: '#261a00'
  on-tertiary-fixed-variant: '#5b4300'
  background: '#121415'
  on-background: '#e2e2e3'
  surface-variant: '#333536'
typography:
  display-lg:
    fontFamily: Geist
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  unit-1: 4px
  unit-2: 8px
  unit-4: 16px
  unit-6: 24px
  unit-8: 32px
  container-margin: 24px
  gutter: 16px
---

## Brand & Style

This design system is built for "PrintOps Studio," focusing on the intersection of industrial hardware and high-performance software. The aesthetic is **Technical Minimalism** with a **Futuristic Industrial** lean. It prioritizes high density, legibility, and rapid status assessment, evoking the feel of a high-end CNC controller or a professional engineering workstation.

The brand personality is authoritative, precise, and utilitarian. It avoids the soft, rounded friendliness of consumer SaaS in favor of sharp lines, high-contrast indicators, and a somber, focused environment that lets the 3D printed works provide the color.

**Key Visual Principles:**
- **Machined Precision:** Every element feels calibrated and intentional.
- **High Information Density:** Minimized whitespace in favor of data visibility.
- **Instrumental Feedback:** Uses color strictly for status and functional signaling.
- **Hardware-Informed:** Draws inspiration from anodized aluminum, OLED displays, and laser-etched markings.

## Colors

The palette is anchored in a near-black "Obsidian" to minimize eye strain during long monitoring sessions.

- **Primary (Neon Green):** Reserved for "Ready," "Success," and primary interaction points. It represents the "Go" state of a machine.
- **Surface (Charcoal):** Used for cards and panels to create subtle depth against the background.
- **Borders (Steel):** Thin, low-opacity strokes define structure without adding visual bulk.
- **Functional Accents:** Amber and Red are used strictly for telemetry warnings and heater errors.
- **Typography:** Pure white is reserved for critical data and headers; secondary text uses a soft gray to maintain hierarchy and reduce glare.

## Typography

This design system utilizes a three-font strategy to balance impact, readability, and technical utility.

1.  **Geist (Headlines):** A technical sans-serif with a geometric foundation, providing a "built" feel for large headers and display numbers.
2.  **Inter (Body):** The workhorse for UI text, chosen for its exceptional legibility in small-scale dark mode interfaces.
3.  **JetBrains Mono (Labels/Technical):** Used for status indicators, coordinates, filament weights, and G-code snippets. The monospaced nature ensures that fluctuating numerical data (like temperature or progress percentages) doesn't cause layout jitter.

**Scaling:** On mobile/compact views, `display-lg` scales down to 32px to ensure titles remain visible within narrow viewports.

## Layout & Spacing

The layout follows a **4px baseline grid** to maintain strict alignment of technical components. 

- **Desktop App Structure:** A fixed left-hand narrow sidebar (64px) for primary navigation, a secondary collapsible sidebar for local machine controls, and a fluid main stage for content.
- **Grids:** A 12-column fluid grid is used for the main dashboard, with cards typically spanning 3, 4, or 6 columns.
- **Density:** Padding is intentionally tight (12px to 16px inside cards) to maximize the amount of telemetry visible on a single screen.
- **Breakpoints:** 
    - Compact: < 768px (Sidebars collapse to bottom bars or overlays)
    - Standard: 768px - 1440px
    - Wide: > 1440px (Main stage expands with increased column counts for multi-printer monitoring).

## Elevation & Depth

To maintain a lightweight and fast feel, this design system avoids heavy shadows in favor of **Tonal Layering** and **Outline Definition**.

- **Level 0 (Background):** `#0B0D0E` — The base machine state.
- **Level 1 (Panels):** `#171A1C` — Used for main cards and dashboard modules. Defined by a 1px border of `#2D3135`.
- **Level 2 (Popovers/Modals):** `#1E2225` — Slightly lighter than panels to indicate z-axis height. These are the only elements to receive a shadow: a 12px blur, 0% spread, 40% black shadow to lift them from the UI.
- **Interactive States:** Hovering over a card or list item should increase the border brightness to `#3D4248` rather than changing the background color.

## Shapes

The shape language is "Softened Industrial." 

- **Base Radius:** 4px to 6px. This provides enough roundness to feel modern and premium while maintaining the "sharp" professional look of a technical tool.
- **Status Pills:** Use a full "Pill" radius (100px) for status indicators (e.g., "Printing", "Idle") to distinguish them from functional buttons.
- **Inputs:** Maintain the 4px radius for text fields and dropdowns to ensure consistent vertical stacking.

## Components

### Buttons
- **Primary:** Background: Neon Green (`#00C853`), Text: Black (`#000000`). This is the only place where black text on a color background is used, for maximum impact on "Start Print" actions.
- **Secondary:** Transparent background with 1px border (`#2D3135`). Text: White.
- **Ghost:** Transparent background, gray text. Used for less frequent actions.

### Technical Indicators & Status Pills
- **Pills:** Compact, utilizing the Monospaced label font. Backgrounds should be low-opacity tints of the status color (e.g., Success: 10% Green background, 100% Green text).
- **Gauges:** Use thin 2px circular or linear tracks for temperature and filament usage. Background track: `#2D3135`. Progress track: Neon Green.

### Cards
- **Header:** Cards should include a header area with a 1px bottom border.
- **Content:** Information should be organized in "Key: Value" pairs using the monospaced font for values to ensure alignment in lists.

### Data Tables
- **Condensed:** 8px vertical padding per row.
- **Headers:** All-caps, monospaced, muted gray.
- **Dividers:** 1px horizontal lines (`#2D3135`) only; no vertical dividers.

### Input Fields
- **Styling:** Darker than the card background (`#0B0D0E`) to create an "etched" look.
- **Focus:** 1px Neon Green border. No glow/outer shadow.

### Specialized Components (PrintOps)
- **Filament Swatch:** A small 16x16px square with the hex color of the filament, paired with the material type (e.g., "PLA+") in monospaced font.
- **Progress Bar:** A segmented bar to represent print layers, using Neon Green for completed segments and Steel for remaining.