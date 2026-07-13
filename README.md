# 3D Print Business Manager

Personal-use, macOS-first desktop app scaffold for managing a small 3D print business.

This repository is intentionally scaffold-only right now. It sets up the app shell, feature folders, documentation, and development guardrails without implementing business logic, persistence, forms, or production workflows.

## Tech Direction

- Tauri v2
- React
- TypeScript
- Vite
- SQLite through the Tauri SQL plugin later
- Vitest

## Commands

```sh
npm run dev
npm run typecheck
npm run test
npm run build
npm run tauri:dev
```

Rust and Cargo are required for `npm run tauri:dev` and `npm run tauri:build`.

npm run tauri:build
When it finishes, your Mac app will be here:
/Users/noel/Desktop/Coding/3dprint/src-tauri/target/release/bundle/macos/3D Print Business Manager.app