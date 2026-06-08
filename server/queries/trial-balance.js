'use strict';
const sql      = require('mssql');
const { getPool } = require('../db');

/*
 * Trial balance for a given date range and branch — returned as a flat list
 * of EVERY account in the chart that has activity (directly or via
 * descendants), each carrying parentID so the frontend can build a
 * collapsible tree (دليل شجري). Balances are rolled up post-order: a
 * parent's totals are its own postings plus the sum of all its descendants'.
 *
 * Two-query approach:
 *   1. Single pass over JD with conditional aggregation for opening + period
 *      (grouped by the actual posting account — may be any level).
 *   2. Load the full AccountChart (small table) to resolve parent/child links.
 *   rootCode filter uses actual parent-child relationships, not code-prefix
 *   matching (ERP account codes may not follow a strict prefix hierarchy).
 */
async function getTrialBalance(dbName, { from, to, branch, rootCode }) {
  const pool  = await getPool(dbName);
  const brn   = parseInt(branch, 10) || 0;
  const rcode = (rootCode || '').trim();

  const [jdRes, acRes] = await Promise.all([
    pool.request()
      .input('from',   sql.Date, from)
      .input('to',     sql.Date, to)
      .input('branch', sql.Int,  brn)
      .query(`
        SELECT
          jd.AccountChart AS leafID,
          SUM(CASE WHEN h.TransactionDate <  @from
                   THEN jd.Debit - jd.Credit ELSE 0 END)  AS openBal,
          SUM(CASE WHEN h.TransactionDate >= @from
                    AND h.TransactionDate < DATEADD(day, 1, @to)
                   THEN jd.Debit  ELSE 0 END)             AS pDebit,
          SUM(CASE WHEN h.TransactionDate >= @from
                    AND h.TransactionDate < DATEADD(day, 1, @to)
                   THEN jd.Credit ELSE 0 END)             AS pCredit
        FROM JournalVoucherDetail jd WITH (NOLOCK)
        JOIN JournalVoucherHeader h  WITH (NOLOCK) ON h.ID = jd.HeaderID
        WHERE h.TransactionDate < DATEADD(day, 1, @to)
          AND (@branch = 0 OR ISNULL(jd.Branch, 0) = @branch)
        GROUP BY jd.AccountChart
      `),
    pool.request().query(`
      SELECT ID, Code, NameAr, LevelNo, ParentID
      FROM AccountChart WITH (NOLOCK)
    `),
  ]);

  if (!jdRes.recordset.length) return [];

  // ── Account map ─────────────────────────────────────────────────────────────
  const acMap = new Map();
  acRes.recordset.forEach(r => {
    acMap.set(r.ID, {
      id:       r.ID,
      code:     (r.Code   || '').trim(),
      name:     (r.NameAr || '').trim(),
      levelNo:  r.LevelNo  || 0,
      parentID: r.ParentID || null,
    });
  });

  // Parent → children index for subtree lookup
  const childrenOf = new Map();
  acMap.forEach((ac, id) => {
    if (ac.parentID) {
      if (!childrenOf.has(ac.parentID)) childrenOf.set(ac.parentID, []);
      childrenOf.get(ac.parentID).push(id);
    }
  });

  // BFS to collect full subtree (id inclusive) of an account
  function subtreeIds(id) {
    const set   = new Set([id]);
    const queue = [id];
    while (queue.length) {
      const cur = queue.shift();
      for (const child of (childrenOf.get(cur) || [])) {
        if (!set.has(child)) { set.add(child); queue.push(child); }
      }
    }
    return set;
  }

  // Allowed-ancestor set: descendants of the rootCode account (by parentage, not prefix)
  let allowedAncs = null;
  if (rcode) {
    const root = [...acMap.values()].find(a => a.code === rcode);
    if (root) allowedAncs = subtreeIds(root.id);
  }

  // ── Own (direct) postings per account — postings may land on any level ──────
  const ownAgg = new Map();
  for (const row of jdRes.recordset) {
    if (!acMap.has(row.leafID)) continue;
    const e = ownAgg.get(row.leafID) || { openBal: 0, pDebit: 0, pCredit: 0 };
    e.openBal += (+row.openBal || 0);
    e.pDebit  += (+row.pDebit  || 0);
    e.pCredit += (+row.pCredit || 0);
    ownAgg.set(row.leafID, e);
  }

  // ── Roll up post-order: a node's total = its own postings + all descendants ─
  const rollup = new Map();
  function computeRollup(id) {
    if (rollup.has(id)) return rollup.get(id);
    rollup.set(id, { openBal: 0, pDebit: 0, pCredit: 0 }); // cycle guard
    const own   = ownAgg.get(id) || { openBal: 0, pDebit: 0, pCredit: 0 };
    const total = { openBal: own.openBal, pDebit: own.pDebit, pCredit: own.pCredit };
    for (const childId of (childrenOf.get(id) || [])) {
      const c = computeRollup(childId);
      total.openBal += c.openBal;
      total.pDebit  += c.pDebit;
      total.pCredit += c.pCredit;
    }
    rollup.set(id, total);
    return total;
  }
  acMap.forEach((_, id) => computeRollup(id));

  const HAS_ACTIVITY = t => Math.abs(t.openBal) > 0.004 || Math.abs(t.pDebit) > 0.004 || Math.abs(t.pCredit) > 0.004;

  const result = [];
  acMap.forEach((ac, id) => {
    if (allowedAncs && !allowedAncs.has(id)) return;
    const t = rollup.get(id);
    if (!HAS_ACTIVITY(t)) return;
    result.push({
      id:       ac.id,
      parentID: ac.parentID,
      code:     ac.code,
      name:     ac.name,
      levelNo:  ac.levelNo,
      openBal:  t.openBal,
      pDebit:   t.pDebit,
      pCredit:  t.pCredit,
      closeBal: t.openBal + t.pDebit - t.pCredit,
    });
  });

  return result.sort((a, b) => a.code.localeCompare(b.code));
}

async function getBranchList(dbName) {
  const pool = await getPool(dbName);
  const res  = await pool.request()
    .query(`SELECT Id, NameAr FROM Branch ORDER BY Id`);
  return res.recordset.map(r => ({ id: r.Id, name: (r.NameAr || '').trim() }));
}

module.exports = { getTrialBalance, getBranchList };
