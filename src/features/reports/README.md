# Reports

Monthly reporting module for sales, expenses, production, inventory movement, and simple profit summaries.

Report data is loaded from local repositories only when the reports page is opened or explicitly refreshed. Aggregation logic lives in `src/domain/reports` and remains pure TypeScript so it can be tested without native SQLite.
