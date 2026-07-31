# Production Runs

Production run logging module.

Implemented scope:

- Lists saved production runs.
- Logs product/profile, run date, expected pieces, good pieces, failed pieces, optional failure reason, and notes.
- Deducts all selected filament spools and add-on/hardware items in one native transaction.
- Adds good pieces to finished goods in the same transaction as production history.
- Saves a linked full-cost Production expense in that same transaction.
- Corrects historical add-on allocations through audited compensating stock movements without rewriting the original run deductions.
- Recalculates the same linked production expense atomically after an add-on correction.

Non-goals for this module:

- No sales tracking.
- No monthly reporting.
- Inventory correction remains available through atomic repository adjustment paths.
