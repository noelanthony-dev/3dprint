# Production Runs

Production run logging module.

Implemented scope:

- Lists saved production runs.
- Logs product/profile, run date, expected pieces, good pieces, failed pieces, optional failure reason, and notes.
- Deducts all selected filament spools and add-on/hardware items in one native transaction.
- Adds good pieces to finished goods in the same transaction as production history.

Non-goals for this module:

- No sales tracking.
- No monthly reporting.
- Inventory correction remains available through atomic repository adjustment paths.
