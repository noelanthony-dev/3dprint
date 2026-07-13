# Backup Infrastructure

Manual backup, export, and import adapters using Tauri dialogs plus native consistent SQLite snapshot and validated restore commands.

This infrastructure is only called from user-triggered backup page actions. It does not schedule work, sync to cloud storage, or run in the background.
