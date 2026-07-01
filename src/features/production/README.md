# Production Runs

Production run logging module.

Implemented scope:

- Lists saved production runs.
- Logs product/profile, run date, expected pieces, good pieces, failed pieces, optional failure reason, and notes.
- Deducts estimated filament from the selected spool through repository stock adjustments.
- Optionally deducts one add-on/hardware item per run through repository stock adjustments.
- Adds good pieces to finished goods home stock through finished goods adjustments.

Non-goals for this module:

- No sales tracking.
- No monthly reporting.
- No irreversible stock movement; inventory correction remains available through repository adjustment paths.
