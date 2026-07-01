# Performance

## Goals

The app should feel fast, local, and responsive on a MacBook. Startup should be lightweight and should not perform work that belongs to later feature pages.

## Startup Rules

- Lazy-load feature pages where practical.
- Do not load every feature module at startup.
- Do not perform database-heavy work during app boot.
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

