# UI/UX Direction

## Source References

Stitch-generated design references live under:

- `docs/stitch/DESIGN.md`
- `docs/stitch/stitch_printops_studio_manager/`
- `docs/stitch/stitch_printops_studio_manager/industrial_precision/DESIGN.md`
- `docs/stitch/stitch_printops_studio_manager/industrial_precision_light/DESIGN.md`

These files are the visual and interaction reference for future UI work. They should guide aesthetics, layout density, component shape, color use, and screen composition. They are not production app code.

## Visual Direction

The intended aesthetic is PrintOps Studio / Industrial Precision:

- macOS-first desktop operations tool
- premium industrial workspace
- high information density
- compact tables and metric panels
- technical badges for TD values, materials, statuses, and hex swatches
- sharp outlined panels with minimal shadows
- 4px to 8px radius depending on component size
- neon green reserved for primary actions, success, and ready states
- amber reserved for warnings and feasibility concerns
- red reserved for failed, expired, or risky states

Both dark and light references exist. Dark mode currently carries the strongest "industrial control system" identity. Light mode is useful for a cleaner lab-style variant.

## Screen References

The Stitch bundle includes screenshots and generated HTML for these areas:

- Dashboard
- Design Library
- Product Detail
- HueForge Match Checker
- Filament Inventory
- Add-ons & Hardware
- Print Costing
- Production Runs
- Sales Tracking
- Expenses & Licenses
- Business Reports
- Settings / Backup

Use screenshots first when translating the design into React components. Generated `code.html` files can be inspected for spacing, hierarchy, and copy hints, but do not paste them wholesale into the app.

## Implementation Rules

- Keep the app shell and feature pages aligned with the Stitch visual language as UI phases begin.
- Convert designs into project-native React, TypeScript, and CSS modules or lightweight CSS.
- Do not introduce Tailwind, a heavy UI framework, charting library, or table library only because Stitch output uses a certain style.
- Keep components feature-scoped until a UI primitive is genuinely reused.
- Preserve the architecture boundary: UI components do not own raw SQL or business calculations.
- Maintain fast startup by lazy-loading feature pages and avoiding image/report/database work on boot.
- Do not implement business features while applying visual polish unless that phase is explicitly approved.

## Implemented Foundation

- `src/styles/global.css` owns the initial lightweight design tokens for color, spacing, radius, borders, typography, and dark-mode surface hierarchy.
- `src/components/layout` owns the PrintOps Studio shell: fixed industrial sidebar, compact top status bar, route-aware headers, and placeholder-only feature framing.
- `src/components/ui` owns small reusable primitives for badges, metric panels, panels, toolbar buttons, table shells, progress bars, and color swatches.
- Dashboard, Design Library, HueForge, and Filament Inventory now have custom placeholder compositions based on the Stitch screenshots. Other feature routes use the shared scaffold until their domain UI phases begin.
- Table placeholders can define explicit CSS grid column tracks when technical content needs more room, especially swatches, progress bars, status badges, and short numeric fields.
- Dark mode remains the primary direction. Light-mode refinement is deferred until the product surface stabilizes.

## Phase 2 Refinements

- Search bars and segmented filters are lightweight disabled UI primitives for placeholder screens. They communicate future workflows without introducing state, filtering, or persistence.
- Color swatches can render with or without labels so dense technical tables can use compact color-only cells.
- Product, HueForge, and filament screens use richer sample data to match Stitch density. These values are static visual placeholders, not calculated or database-backed values.
- Selected-item side panels should use technical key/value blocks, warning callouts, compact badges, and progress indicators before any real editing workflows are introduced.

## HueForge Match UI

- HueForge matching uses dense editable requirement rows and match cards with swatches, match badges, TD delta, RGB color distance, and stock readouts.
- The current color comparison is a temporary RGB distance heuristic. If perceptual Delta E matching is approved later, preserve the same match-card UI contract and swap the underlying domain calculation.
- Feasibility copy should remain explicit about non-destructive behavior: adding to Design Library saves metadata and match snapshots only, with no filament deduction.
