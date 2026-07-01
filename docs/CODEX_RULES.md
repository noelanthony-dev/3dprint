# Codex Rules

Use this file as a standing instruction set for future Codex work in this repository.

## Scope

- Work in small phases.
- Do not implement unrelated features.
- Do not move ahead to business feature implementation without approval.
- Update docs when architecture changes.

## Architecture

- Preserve feature/domain/data/infrastructure boundaries.
- Do not put raw SQL in React components.
- Do not put costing, HueForge, inventory, pricing, or report logic directly inside UI components.
- Keep SQLite access inside repository modules.
- Prefer named exports for shared modules.

## UI/UX

- Treat `docs/stitch` and `docs/UI_UX.md` as the visual reference for future UI work.
- Translate Stitch screens into project-native React, TypeScript, and lightweight CSS.
- Do not paste generated Stitch HTML wholesale into the app.
- Do not add a heavy styling or component dependency just to match a static screen.
- Keep the Industrial Precision aesthetic: dense, technical, outlined, fast, and status-driven.

## Product Direction

- Do not add cloud services.
- Do not add authentication.
- Do not use Firebase.
- Do not introduce automatic sync.
- Keep the app macOS-first and offline-first for MVP.

## Dependencies

- Use stable package versions only.
- Do not add beta, canary, experimental, or deprecated packages.
- Do not add heavy dependencies without explaining why.
- Avoid heavy UI frameworks, charting libraries, and table libraries until needed.
- Do not add Redux, Zustand, Jotai, or another global state library during scaffolding.

## Testing

- Add tests for pure logic.
- Keep tests focused on the changed module.
- Add repository tests when persistence is introduced.
- Keep business calculations testable outside React.

## Performance

- Keep UI fast and lightweight.
- Lazy-load feature pages where practical.
- Avoid database-heavy work on app boot.
- Do not load product images on startup.
- Run reports only when the report feature is opened or explicitly refreshed.
