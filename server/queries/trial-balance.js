'use strict';
const sql      = require('mssql');
const { getPool } = require('../db');

/*
 * Trial balance for a given date range, account level, and branch.
 *
 * Two-query approach:
 *   1. Single pass over JD with conditional aggregation for opening + period.
 *   2. Load the full AccountChart (small table).
 *   3. Resolve leaf → ancestor at requested level in JavaScript.
 *   4. rootCode filter uses actual parent-child relationships, not code-prefix
 *      matching (ERP account codes may not follow a strict prefix hierarchy).
 */
async function getTrialBalance(dbName, { from, to, level, branch, rootCode }) {
  const pool  = await getPool(dbName);
  const lvl   = parseInt(level,  10) || 3;
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

  // Walk a leaf up to the ancestor at targetLevel
  function resolveAncestor(leafID) {
    const visited = new Set();
    let cur = acMap.get(leafID);
    while (cur) {
      if (visited.has(cur.id)) break;
      visited.add(cur.id);
      if (cur.levelNo === lvl) return cur;
      if (cur.levelNo < lvl)  return cur;   // above target — use as-is
      if (!cur.parentID)      return cur;
      cur = acMap.get(cur.parentID) || null;
    }
    return null;
  }

  // Allowed-ancestor set: descendants of the rootCode account (by parentage, not prefix)
  let allowedAncs = null;
  if (rcode) {
    const root = [...acMap.values()].find(a => a.code === rcode);
    if (root) allowedAncs = subtreeIds(root.id);
  }

  // ── Aggregate ────────────────────────────────────────────────────────────────
  const aggMap = new Map();

  for (const row of jdRes.recordset) {
    const anc = resolveAncestor(row.leafID);
    if (!anc) continue;
    if (allowedAncs && !allowedAncs.has(anc.id)) continue;

    const ob = +row.openBal || 0;
    const dr = +row.pDebit  || 0;
    const cr = +row.pCredit || 0;

    if (aggMap.has(anc.id)) {
      const e = aggMap.get(anc.id);
      e.openBal += ob; e.pDebit += dr; e.pCredit += cr;
    } else {
      aggMap.set(anc.id, { ac: anc, openBal: ob, pDebit: dr, pCredit: cr });
    }
  }

  return [...aggMap.values()]
    .map(({ ac, openBal, pDebit, pCredit }) => ({
      code:     ac.code,
      name:     ac.name,
      levelNo:  ac.levelNo,
      openBal,
      pDebit,
      pCredit,
      closeBal: openBal + pDebit - pCredit,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

async function getBranchList(dbName) {
  const pool = await getPool(dbName);
  const res  = await pool.request()
    .query(`SELECT Id, NameAr FROM Branch ORDER BY Id`);
  return res.recordset.map(r => ({ id: r.Id, name: (r.NameAr || '').trim() }));
}

module.exports = { getTrialBalance, getBranchList };
