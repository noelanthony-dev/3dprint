# Repositories

Repository modules will own SQLite queries and map rows into domain-friendly objects. React components must not contain raw SQL.

Implemented repositories:

- `filamentsRepository.ts` owns the filament table schema, list, create, get, and update operations.
