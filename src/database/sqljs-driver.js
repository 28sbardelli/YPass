/**
 * sql.js-backed SQLite driver that mimics the better-sqlite3 surface Knex expects.
 * Used because native better-sqlite3 binaries can fail on Windows without MSVC.
 * Production clustered deployments still use PostgreSQL.
 */

export function wrapSqlJsDatabase(sqlJsDb, { filename, persist } = {}) {
  let txDepth = 0;

  function noteTransaction(sql) {
    if (/^BEGIN\b/i.test(sql) || /^SAVEPOINT\b/i.test(sql)) {
      txDepth += 1;
      return;
    }
    if (/^ROLLBACK\s+TO\b/i.test(sql)) {
      return;
    }
    if (/^(COMMIT|END|RELEASE|ROLLBACK)\b/i.test(sql)) {
      txDepth = Math.max(0, txDepth - 1);
    }
  }

  function maybePersist() {
    if (txDepth === 0 && typeof persist === 'function') {
      persist();
    }
  }

  return {
    native: sqlJsDb,
    filename,
    persist,
    prepare(sql) {
      const reader = isReader(sql);
      return {
        reader,
        all(bindings = []) {
          const stmt = sqlJsDb.prepare(sql);
          try {
            stmt.bind(normalizeBindings(bindings));
            const rows = [];
            while (stmt.step()) {
              rows.push(normalizeRow(stmt.getAsObject()));
            }
            return rows;
          } finally {
            stmt.free();
          }
        },
        run(bindings = []) {
          const trimmed = String(sql)
            .trim()
            .replace(/;+\s*$/, '');
          if (/^(BEGIN|COMMIT|ROLLBACK|END|SAVEPOINT|RELEASE)\b/i.test(trimmed)) {
            try {
              sqlJsDb.run(trimmed);
            } catch (error) {
              if (/no transaction is active/i.test(error.message)) {
                txDepth = 0;
                return { changes: 0, lastInsertRowid: 0 };
              }
              throw error;
            }
            noteTransaction(trimmed);
            maybePersist();
            return { changes: 0, lastInsertRowid: 0 };
          }
          sqlJsDb.run(sql, normalizeBindings(bindings));
          const changes = sqlJsDb.getRowsModified();
          const idRows = sqlJsDb.exec('SELECT last_insert_rowid() AS id');
          const lastInsertRowid = idRows[0] ? Number(idRows[0].values[0][0]) : 0;
          maybePersist();
          return {
            changes,
            lastInsertRowid,
          };
        },
      };
    },
    pragma(statement) {
      sqlJsDb.run(`PRAGMA ${statement}`);
    },
    close() {
      if (typeof persist === 'function') {
        persist();
      }
      sqlJsDb.close();
    },
  };
}

function isReader(sql) {
  return /^\s*(select|pragma|with|values|explain)\b/i.test(String(sql));
}

function normalizeBindings(bindings) {
  return (bindings || []).map((value) => {
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (value === undefined) {
      return null;
    }
    return value;
  });
}

function normalizeRow(row) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value;
  }
  return out;
}
