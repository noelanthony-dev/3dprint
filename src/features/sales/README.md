# Sales

Offline sales tracking module.

Implemented scope:

- Lists recorded sales with date, product reference, channel, quantity, gross revenue, net revenue, and stock movement.
- Filters all sales KPIs, branch/channel totals, and transaction rows by lifetime, selected month, or exact date; channel filtering composes with the selected period for the table.
- Summarizes units sold by historical product name and sale unit for the selected period and detail channel.
- Presents product totals as leader-relative ranked bars with a Top 10 preview and expandable complete list.
- Exports the full period-and-detail-channel-filtered transaction list to CSV through a native Save dialog. Files include PHP amounts, quantities, stock movement, and notes; product ranking expansion does not affect exports.
- Records sales against finished goods home stock.
- Tracks sale unit, channel, gross revenue, discounts/fees, net revenue, and notes.
- Reduces finished goods ready quantity through repository/service stock adjustment paths.

Non-goals for this module:

- No payment processing.
- No online marketplace integrations.
- No full accounting.
- No reports beyond storing the sales data needed for a later reporting phase.
