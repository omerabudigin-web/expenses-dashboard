'use strict';
const sql      = require('mssql');
const { getPool } = require('../db');

/*
 * Income Statement for a date range / level / branch.
 *
 * Two-query approach:
 *   1. Aggregate JD by leaf account (no hierarchy joins).
 *   2. Load full AccountChart.
 *   3. Resolve leaf → ancestor at requested level in JavaScript.
 *   4. rootCode filter uses actual parent-child relationships, not code-prefix.
 */
async function getIncomeStatement(dbName, { from, to, level, branch, rootCode }) {
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
          SUM(jd.Debit)   AS pDebit,
          SUM(jd.Credit)  AS pCredit
        FROM JournalVoucherDetail jd WITH (NOLOCK)
        JOIN JournalVoucherHeader h  WITH (NOLOCK) ON h.ID = jd.HeaderID
        WHERE h.TransactionDate >= @from
          AND h.TransactionDate < DATEADD(day, 1, @to)
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

  // Parent → children index
  const childrenOf = new Map();
  acMap.forEach((ac, id) => {
    if (ac.parentID) {
      if (!childrenOf.has(ac.parentID)) childrenOf.set(ac.parentID, []);
      childrenOf.get(ac.parentID).push(id);
    }
  });

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

  function resolveAncestor(leafID) {
    const visited = new Set();
    let cur = acMap.get(leafID);
    while (cur) {
      if (visited.has(cur.id)) break;
      visited.add(cur.id);
      if (cur.levelNo === lvl) return cur;
      if (cur.levelNo < lvl)  return cur;
      if (!cur.parentID)      return cur;
      cur = acMap.get(cur.parentID) || null;
    }
    return null;
  }

  // Allowed-ancestor set by actual parentage, not code prefix
  let allowedAncs = null;
  if (rcode) {
    const root = [...acMap.values()].find(a => a.code === rcode);
    if (root) allowedAncs = subtreeIds(root.id);
  }

  // ── Aggregate ────────────────────────────────────────────────────────────────
  const aggMap = new Map();

  for (const row of jdRes.recordset) {
    const leaf = acMap.get(row.leafID);
    if (!leaf) continue;
    if (!['4','5','6','7'].includes(leaf.code.charAt(0))) continue;

    const anc = resolveAncestor(row.leafID);
    if (!anc) continue;
    if (allowedAncs && !allowedAncs.has(anc.id)) continue;

    const dr = +row.pDebit  || 0;
    const cr = +row.pCredit || 0;
    if (aggMap.has(anc.id)) {
      aggMap.get(anc.id).pDebit  += dr;
      aggMap.get(anc.id).pCredit += cr;
    } else {
      aggMap.set(anc.id, { ac: anc, pDebit: dr, pCredit: cr });
    }
  }

  return [...aggMap.values()]
    .map(({ ac, pDebit, pCredit }) => {
      const isRev = ['5','6','7'].includes(ac.code.charAt(0));
      const par   = ac.parentID ? acMap.get(ac.parentID) : null;
      return {
        code:       ac.code,
        name:       ac.name,
        levelNo:    ac.levelNo,
        parentCode: par ? par.code : '',
        parentName: par ? par.name : '',
        pDebit,
        pCredit,
        plType: isRev ? 'rev' : 'exp',
        net:    isRev ? pCredit - pDebit : pDebit - pCredit,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

/*
 * Full-hierarchy tree for IS tab.
 * Returns ALL P&L accounts at every level with rolled-up amounts.
 * The frontend builds the collapsible tree from this flat list.
 */
async function getIncomeStatementTree(dbName, { from, to, branch }) {
  const pool = await getPool(dbName);
  const brn  = parseInt(branch, 10) || 0;

  const [jdRes, acRes] = await Promise.all([
    pool.request()
      .input('from',   sql.Date, from)
      .input('to',     sql.Date, to)
      .input('branch', sql.Int,  brn)
      .query(`
        SELECT jd.AccountChart AS leafID,
               SUM(jd.Debit)   AS pDebit,
               SUM(jd.Credit)  AS pCredit
        FROM JournalVoucherDetail jd WITH (NOLOCK)
        JOIN JournalVoucherHeader h  WITH (NOLOCK) ON h.ID = jd.HeaderID
        WHERE h.TransactionDate >= @from
          AND h.TransactionDate < DATEADD(day, 1, @to)
          AND (@branch = 0 OR ISNULL(jd.Branch, 0) = @branch)
        GROUP BY jd.AccountChart
      `),
    pool.request().query(`
      SELECT ID, Code, NameAr, LevelNo, ParentID
      FROM AccountChart WITH (NOLOCK)
    `),
  ]);

  if (!jdRes.recordset.length) return [];

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

  const childrenOf = new Map();
  acMap.forEach((ac, id) => {
    if (ac.parentID) {
      if (!childrenOf.has(ac.parentID)) childrenOf.set(ac.parentID, []);
      childrenOf.get(ac.parentID).push(id);
    }
  });

  // Roll up leaf amounts to every P&L ancestor (levelNo >= 1)
  const rollup = new Map();

  for (const row of jdRes.recordset) {
    const leaf = acMap.get(row.leafID);
    if (!leaf) continue;
    if (!['4','5','6','7'].includes(leaf.code.charAt(0))) continue;

    const dr = +row.pDebit  || 0;
    const cr = +row.pCredit || 0;

    let cur = leaf;
    const visited = new Set();
    while (cur && cur.levelNo >= 1) {
      if (visited.has(cur.id)) break;
      visited.add(cur.id);
      if (!rollup.has(cur.id)) rollup.set(cur.id, { ac: cur, pDebit: 0, pCredit: 0 });
      rollup.get(cur.id).pDebit  += dr;
      rollup.get(cur.id).pCredit += cr;
      if (!cur.parentID) break;
      cur = acMap.get(cur.parentID) || null;
    }
  }

  return [...rollup.values()]
    .map(({ ac, pDebit, pCredit }) => {
      const isRev   = ['5','6','7'].includes(ac.code.charAt(0));
      const children = childrenOf.get(ac.id) || [];
      return {
        id:          ac.id,
        parentId:    ac.parentID || null,
        code:        ac.code,
        name:        ac.name,
        levelNo:     ac.levelNo,
        pDebit,
        pCredit,
        plType:      isRev ? 'rev' : 'exp',
        net:         isRev ? pCredit - pDebit : pDebit - pCredit,
        hasChildren: children.some(cid => rollup.has(cid)),
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

module.exports = { getIncomeStatement, getIncomeStatementTree };
