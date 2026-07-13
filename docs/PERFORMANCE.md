# Performance

## Goals

The app should feel fast, local, and responsive on a MacBook. Startup should be lightweight and should not perform work that belongs to later feature pages.

## Startup Rules

- Lazy-load feature pages where practical.
- Do not load every feature module at startup.
- Limit database startup work to opening the single connection and applying bounded versioned migrations; feature data queries remain lazy.
- Do not load product images at startup.
- Do not calculate monthly reports at startup.
- Keep the app shell small and predictable.

## Dependency Rules

- Prefer small, stable dependencies.
- Do not add beta, canary, experimental, or deprecated packages.
- Avoid heavy UI frameworks during scaffolding.
- Avoid table and chart libraries until a real screen needs them.
- Explain any large dependency before adding it.

## React Rules

- Keep components lean and feature-scoped.
- Keep business logic out of React components.
- Use local state first.
- Do not add Redux, Zustand, Jotai, or another global state library without a specific reason.
- Use page-level organization and lazy route loading.

## Domain Rules

- Keep costing, pricing, HueForge, inventory, and report calculations as pure TypeScript.
- Test pure calculations directly with Vitest.
- Keep report calculations on report pages or explicit refresh actions.
- Add table virtualization later only when real data volume requires it.

## Phase 13 Report Notes

- Monthly report aggregation is isolated in `src/domain/reports` and runs against records loaded by the reports page.
- The reports route loads sales, expenses, memberships, and production runs only when the page opens or the user refreshes it.
- Report visuals use existing panels, tables, metric cards, and progress bars; no charting library is loaded for the MVP.

## Phase 14 Backup Notes

- Settings are read from `localStorage` only when the Settings or Backup pages need them.
- Backup and restore use Tauri dialog/file-system plugins only after explicit user actions.
- Full backup creation asks native SQLite for a consistent snapshot and encodes it into the existing JSON envelope; no backup work runs at startup.
- Restore validates `quick_check`, closes the managed connection, swaps the database, removes stale sidecars, and requires restart.
