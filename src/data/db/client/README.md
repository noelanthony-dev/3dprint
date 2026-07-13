# SQLite Client

The frontend client is a small facade over native `db_select` and restricted single-statement `db_execute` commands. Rust owns the only SQLite connection.

The client is initialized outside React and exposed only to repository modules. Compound writes use typed native workflow commands; feature components and shared UI must not issue raw SQL.
