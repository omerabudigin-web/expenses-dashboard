'use strict';
const sql      = require('mssql');
const { getPool } = require('../db');
const { catFromCode } = require('./expenses');

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

  const emptySummary = {
    revenueTotal: 0, cogsTotal: 0, otherDirectCostTotal: 0, costOfSales: 0,
    grossProfit: 0, grossMargin: 0, expenseTotal: 0, opexTotal: 0,
    financeCostTotal: 0, operatingProfit: 0, netProfit: 0,
    catTotals: { sal:0, rent:0, maint:0, sell:0, dist:0, adm:0, fin:0, char:0, oth:0 },
  };
  if (!jdRes.recordset.length) return { rows: [], summary: emptySummary };

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
  // Two accumulators over the same leaf-level rows:
  //   aggMap   → drill-level rows for the grid (respects rootCode filter)
  //   summary  → whole-statement Revenue/COGS/Gross Profit/Net Profit,
  //              always computed over the FULL P&L regardless of rootCode,
  //              since "gross profit" only makes sense for the entity as a whole.
  const aggMap = new Map();
  let revenueTotal = 0, cogsTotal = 0, otherDirectCostTotal = 0, expenseTotal = 0, financeCostTotal = 0;
  const catTotals = { sal:0, rent:0, maint:0, sell:0, dist:0, adm:0, fin:0, char:0, oth:0 };

  for (const row of jdRes.recordset) {
    const leaf = acMap.get(row.leafID);
    if (!leaf) continue;
    const codeChar = leaf.code.charAt(0);
    if (!['4','5','6','7'].includes(codeChar)) continue;

    const dr = +row.pDebit  || 0;
    const cr = +row.pCredit || 0;

    if (['5','6','7'].includes(codeChar)) {
      revenueTotal += cr - dr;
    } else {
      const net = dr - cr;
      expenseTotal += net;
      if (leaf.code.startsWith('40101010')) {
        cogsTotal += net;
      } else if (leaf.code.startsWith('40101020')) {
        otherDirectCostTotal += net;
      } else {
        // Operating expense (not cost of sales) — bucket by the same
        // category convention used across the rest of the dashboard.
        const cat = catFromCode(leaf.code);
        catTotals[cat] = (catTotals[cat] || 0) + net;
        if (cat === 'fin') financeCostTotal += net;
      }
    }

    const anc = resolveAncestor(row.leafID);
    if (!anc) continue;
    if (allowedAncs && !allowedAncs.has(anc.id)) continue;

    if (aggMap.has(anc.id)) {
      aggMap.get(anc.id).pDebit  += dr;
      aggMap.get(anc.id).pCredit += cr;
    } else {
      aggMap.set(anc.id, { ac: anc, pDebit: dr, pCredit: cr });
    }
  }

  const costOfSales = cogsTotal + otherDirectCostTotal;
  const grossProfit = revenueTotal - costOfSales;
  const netProfit    = revenueTotal - expenseTotal;
  const summary = {
    revenueTotal, cogsTotal, otherDirectCostTotal, costOfSales,
    grossProfit,
    grossMargin: revenueTotal ? grossProfit / revenueTotal * 100 : 0,
    expenseTotal,
    opexTotal: expenseTotal - costOfSales,
    financeCostTotal,
    // EBIT-equivalent: operating result before financing costs, Zakat and income tax.
    operatingProfit: netProfit + financeCostTotal,
    netProfit,
    catTotals,
  };

  const rows = [...aggMap.values()]
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

  return { rows, summary };
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
