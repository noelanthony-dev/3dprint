# SQLite Client

The native app uses `@tauri-apps/plugin-sql` and loads `sqlite:printops-studio.db`.

The client is initialized outside React and exposed only to repository modules. Do not import the SQL plugin directly from feature components or shared UI components.
