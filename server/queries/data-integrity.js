'use strict';
const { getPool } = require('../db');

// Whole-ledger debit=credit check — every JournalVoucherDetail row ever posted
// must balance globally regardless of period/branch. A nonzero diff signals a
// data-integrity problem (orphaned posting, partial import, etc.), not a
// period-specific imbalance (which the trial-balance tab already surfaces).
async function getDataIntegrityCheck(dbName) {
  const pool = await getPool(dbName);
  const r = await pool.request().query(`
    SELECT SUM(Debit) AS totDr, SUM(Credit) AS totCr
    FROM JournalVoucherDetail WITH (NOLOCK)
  `);
  const totDr = r.recordset[0].totDr || 0;
  const totCr = r.recordset[0].totCr || 0;
  const diff  = Math.round((totDr - totCr) * 100) / 100;
  return { totDr, totCr, diff, balanced: Math.abs(diff) < 1 };
}

module.exports = { getDataIntegrityCheck };
