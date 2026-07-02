# Backup / Export / Import

Manual backup, export, and import module.

Full backups are user-triggered JSON envelopes containing metadata, local settings, and the SQLite database bytes. Restore requires explicit confirmation and validates the backup before writing. No automatic sync, cloud storage, or background backup job is introduced in MVP.
