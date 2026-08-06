# Reports

Monthly and lifetime reporting module for sales, expenses, production, inventory movement, and simple profit summaries. The period selector supports previous/next month navigation, a native month picker, and an all-recorded-data lifetime view. Lifetime totals count recurring expense and membership definitions once because individual historical payments are not stored as separate transactions.

The business selector uses the same sales-channel dimension as Sales Analytics. It filters revenue, orders, units, average order value, and revenue breakdowns. Expenses, memberships, production, recent activity, and profit remain all-business totals because those source records do not currently store business attribution; the page calls out that boundary whenever a single business is selected.

Report data is loaded from local repositories only when the reports page is opened or explicitly refreshed. Aggregation logic lives in `src/domain/reports` and remains pure TypeScript so it can be tested without native SQLite.

The Reports toolbar also exports a versioned AI Analysis Pack as a local JSON file. The pack always contains the complete analytical dataset rather than the active page filters, including source records, current costing calculations, report/analytics outputs, relationships, field definitions, and accuracy limitations. It includes private notes and identifying text as stored, but references image paths instead of embedding image files. The export does not upload data or call an AI service.
