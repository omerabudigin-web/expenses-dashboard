'use strict';
const { getPool } = require('../db');

const DATA_START = process.env.DATA_START_DATE || '2025-10-01';

const CATS = [
  { id: 72, key: 'tas', name: 'تسليح (حديد)',     unit: 'طن',   color: '#4a9eda', colorA: 'rgba(74,158,218,0.15)' },
  { id: 76, key: 'tao', name: 'تسليح اخرى',       unit: 'قطعة', color: '#f5a623', colorA: 'rgba(245,166,35,0.15)' },
  { id: 91, key: 'sal', name: 'مستلزمات السلامة', unit: 'حبة',  color: '#4ada8e', colorA: 'rgba(74,218,142,0.15)' },
  { id: 73, key: 'taj', name: 'حديد تجاري',       unit: 'قطعة', color: '#a78bfa', colorA: 'rgba(167,139,250,0.15)' },
];

const MONTH_AR = {
  '01':'يناير','02':'فبراير','03':'مارس','04':'أبريل','05':'مايو','06':'يونيو',
  '07':'يوليو','08':'أغسطس','09':'سبتمبر','10':'أكتوبر','11':'نوفمبر','12':'ديسمبر',
};
const MONTH_SHORT = {
  '01':'ين','02':'فب','03':'مر','04':'أب','05':'ما','06':'يون',
  '07':'يول','08':'أغ','09':'سب','10':'أكت','11':'نوف','12':'ديس',
};

function monthRange() {
  const start = new Date(DATA_START + 'T00:00:00');
  const today = new Date();
  const list  = [];
  let d = new Date(start.getFullYear(), start.getMonth(), 1);
  const endM = new Date(today.getFullYear(), today.getMonth(), 1);
  while (d <= endM) {
    list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  return list;
}

// Recursive CTE that maps all ItemCategory IDs → root category (72|73|76|91)
const RC_CTE = `
WITH RootCat AS (
  SELECT ID, ID AS RootID FROM ItemCategory WHERE ID IN (72, 73, 76, 91)
  UNION ALL
  SELECT ic.ID, rc.RootID FROM ItemCategory ic
  INNER JOIN RootCat rc ON ic.ParentID = rc.ID
),
ItemRoot AS (
  SELECT i.Id AS ItemId, rc.RootID
  FROM Item i
  INNER JOIN RootCat rc ON rc.ID = i.Category
)
`;

async function getInventoryData(dbName) {
  const pool   = await getPool(dbName);
  const MONTHS = monthRange();
  const today  = new Date();
  const currentYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const [movRes, openRes, salesRes, purchRes, a41Res, a41OpenRes, a124Res] = await Promise.all([

    // Q1: Monthly inventory movements by root category and screen type
    // ScreenIDs: 61=DeliverGoods 62=ReceiptGoods 66=TransferIssued 67=TransferReceiving 68=Inc 69=Dec 71=Opening
    pool.request().query(`
      ${RC_CTE}
      SELECT
        ir.RootID                                                         AS catId,
        FORMAT(itv.TransactionDate, 'yyyy-MM')                           AS ym,
        itv.ScreenID,
        SUM(itv.GroupQuantity)                                            AS qty,
        SUM(ABS(ISNULL(itv.GroupCostPrice, 0)))                          AS costVal
      FROM InventoryTransactionOnlyIncludedView itv
      INNER JOIN ItemRoot ir ON ir.ItemId = itv.Item
      WHERE itv.TransactionDate >= '${DATA_START}'
      GROUP BY ir.RootID, FORMAT(itv.TransactionDate, 'yyyy-MM'), itv.ScreenID
      OPTION (MAXRECURSION 100)
    `),

    // Q2: Opening qty balance (all transactions before DATA_START, by root category)
    pool.request().query(`
      ${RC_CTE}
      SELECT ir.RootID AS catId, SUM(itv.GroupQuantity) AS openQty
      FROM InventoryTransactionOnlyIncludedView itv
      INNER JOIN ItemRoot ir ON ir.ItemId = itv.Item
      WHERE itv.TransactionDate < '${DATA_START}'
      GROUP BY ir.RootID
      OPTION (MAXRECURSION 100)
    `),

    // Q3: Sales values by root category and month (SalesInvoice)
    pool.request().query(`
      ${RC_CTE}
      SELECT
        ir.RootID                                  AS catId,
        FORMAT(sih.TransactionDate, 'yyyy-MM')     AS ym,
        ABS(SUM(sid.GroupQuantity))                AS qty,
        SUM(sid.Net)                               AS salesVal
      FROM SalesInvoiceDetail sid
      INNER JOIN SalesInvoiceHeader sih ON sih.ID = sid.HeaderID
      INNER JOIN ItemRoot ir            ON ir.ItemId = sid.Item
      WHERE sih.TransactionDate >= '${DATA_START}'
      GROUP BY ir.RootID, FORMAT(sih.TransactionDate, 'yyyy-MM')
      OPTION (MAXRECURSION 100)
    `),

    // Q4: Purchase invoice values by root category and month (PurchaseInvoice)
    pool.request().query(`
      ${RC_CTE}
      SELECT
        ir.RootID                                  AS catId,
        FORMAT(pih.TransactionDate, 'yyyy-MM')     AS ym,
        SUM(ABS(pid.GroupQuantity))                AS qty,
        SUM(pid.Net)                               AS purchVal
      FROM PurchaseInvoiceDetail pid
      INNER JOIN PurchaseInvoiceHeader pih ON pih.ID = pid.HeaderID
      INNER JOIN ItemRoot ir               ON ir.ItemId = pid.Item
      WHERE pih.TransactionDate >= '${DATA_START}'
      GROUP BY ir.RootID, FORMAT(pih.TransactionDate, 'yyyy-MM')
      OPTION (MAXRECURSION 100)
    `),

    // Q5: Account 41 (Finished Goods Stock) monthly changes from JVs
    pool.request().query(`
      SELECT
        FORMAT(jvh.TransactionDate, 'yyyy-MM') AS ym,
        SUM(jvd.Debit)                         AS debit,
        SUM(jvd.Credit)                        AS credit
      FROM JournalVoucherDetail jvd
      INNER JOIN JournalVoucherHeader jvh ON jvh.ID = jvd.HeaderID
      WHERE jvd.AccountChart = 41
        AND jvh.TransactionDate >= '${DATA_START}'
      GROUP BY FORMAT(jvh.TransactionDate, 'yyyy-MM')
    `),

    // Q6: Account 41 opening balance (before DATA_START)
    pool.request().query(`
      SELECT SUM(jvd.Debit) - SUM(jvd.Credit) AS openBal
      FROM JournalVoucherDetail jvd
      INNER JOIN JournalVoucherHeader jvh ON jvh.ID = jvd.HeaderID
      WHERE jvd.AccountChart = 41
        AND jvh.TransactionDate < '${DATA_START}'
    `),

    // Q7: Account 124 (COGS) monthly net — P&L basis (Debit - Credit = net COGS)
    pool.request().query(`
      SELECT
        FORMAT(jvh.TransactionDate, 'yyyy-MM') AS ym,
        SUM(jvd.Debit) - SUM(jvd.Credit)       AS cogsPl
      FROM JournalVoucherDetail jvd
      INNER JOIN JournalVoucherHeader jvh ON jvh.ID = jvd.HeaderID
      WHERE jvd.AccountChart = 124
        AND jvh.TransactionDate >= '${DATA_START}'
      GROUP BY FORMAT(jvh.TransactionDate, 'yyyy-MM')
    `),
  ]);

  // ── Build lookup maps ────────────────────────────────────────────────────────
  const openQtyMap = {};
  openRes.recordset.forEach(r => { openQtyMap[r.catId] = +r.openQty || 0; });

  // movMap[catId][ym][screenId] = { qty, costVal }
  const movMap = {};
  movRes.recordset.forEach(r => {
    if (!movMap[r.catId]) movMap[r.catId] = {};
    if (!movMap[r.catId][r.ym]) movMap[r.catId][r.ym] = {};
    movMap[r.catId][r.ym][r.ScreenID] = { qty: +r.qty || 0, costVal: +r.costVal || 0 };
  });

  const salesMap = {};
  salesRes.recordset.forEach(r => {
    if (!salesMap[r.catId]) salesMap[r.catId] = {};
    salesMap[r.catId][r.ym] = { qty: +r.qty || 0, salesVal: +r.salesVal || 0 };
  });

  const purchMap = {};
  purchRes.recordset.forEach(r => {
    if (!purchMap[r.catId]) purchMap[r.catId] = {};
    purchMap[r.catId][r.ym] = { qty: +r.qty || 0, purchVal: +r.purchVal || 0 };
  });

  const a41Map = {};
  a41Res.recordset.forEach(r => {
    a41Map[r.ym] = { debit: +r.debit || 0, credit: +r.credit || 0 };
  });
  const a41OpenBal = +a41OpenRes.recordset[0]?.openBal || 0;

  const a124Map = {};
  a124Res.recordset.forEach(r => { a124Map[r.ym] = +r.cogsPl || 0; });

  // ── Compute per-month raw movements per category ──────────────────────────────
  const movByMonth = {};
  MONTHS.forEach(ym => {
    movByMonth[ym] = {};
    CATS.forEach(c => {
      const m  = movMap[c.id]?.[ym] || {};
      const s  = salesMap[c.id]?.[ym] || { qty: 0, salesVal: 0 };
      const p  = purchMap[c.id]?.[ym] || { qty: 0, purchVal: 0 };
      const rcpQty  = +(m[62]?.qty    || 0);            // ReceiptGoods (positive)
      const delQty  = Math.abs(+(m[61]?.qty  || 0));   // DeliverGoods (absolute)
      const delCost = +(m[61]?.costVal || 0);            // COGS cost
      const triQty  = Math.abs(+(m[66]?.qty  || 0));   // TransferIssued (absolute)
      const troQty  = +(m[67]?.qty    || 0);            // TransferReceiving (positive)
      const incQty  = +(m[68]?.qty    || 0);            // IncreaseStock
      const decQty  = Math.abs(+(m[69]?.qty  || 0));   // DecreaseStock (absolute)
      const os71    = +(m[71]?.qty    || 0);            // OpeningStock
      const netQty  = rcpQty - delQty + (troQty - triQty) + incQty - decQty + os71;
      movByMonth[ym][c.key] = {
        rcpQty, delQty, delCost, triQty, troQty, incQty, decQty, netQty,
        salesQty: s.qty, salesVal: s.salesVal,
        purchQty: p.qty, purchVal: p.purchVal,
      };
    });
  });

  // ── Running closing qty per category ─────────────────────────────────────────
  const openingQty = {};
  const closingQty = {};
  CATS.forEach(c => {
    openingQty[c.key] = openQtyMap[c.id] || 0;
    let q = openingQty[c.key];
    closingQty[c.key] = MONTHS.map(ym => {
      q += movByMonth[ym][c.key].netQty;
      return q;
    });
  });

  // ── DOH per category per month ────────────────────────────────────────────────
  // DOH = closing / daily_rate, where daily_rate = avg COGS qty last 3 complete months / 30
  const dohByCat = {};
  CATS.forEach(c => {
    const N = MONTHS.length;
    const lastN = Math.min(3, N);
    let totalCogs = 0;
    for (let i = N - lastN; i < N; i++) totalCogs += movByMonth[MONTHS[i]][c.key].delQty;
    const dailyCogs = totalCogs > 0 ? totalCogs / (lastN * 30) : 0;
    dohByCat[c.key] = closingQty[c.key].map(q => dailyCogs > 0.001 ? Math.round(q / dailyCogs) : 9999);
  });

  // ── Avg unit cost from last 3 months COGS ────────────────────────────────────
  const avgUnitCost = {};
  CATS.forEach(c => {
    const N = MONTHS.length;
    const lastN = Math.min(3, N);
    let totalCost = 0, totalQty = 0;
    for (let i = N - lastN; i < N; i++) {
      totalCost += movByMonth[MONTHS[i]][c.key].delCost;
      totalQty  += movByMonth[MONTHS[i]][c.key].delQty;
    }
    avgUnitCost[c.key] = totalQty > 0 ? Math.round(totalCost / totalQty) : 0;
  });

  // ── Account 41 running balance ────────────────────────────────────────────────
  let a41RunBal = a41OpenBal;
  const a41Balances = MONTHS.map(ym => {
    const a41m = a41Map[ym] || { debit: 0, credit: 0 };
    a41RunBal += a41m.debit - a41m.credit;
    return Math.round(a41RunBal);
  });

  // ── FIFO aging (dynamic: mid-month days from today) ──────────────────────────
  function fifoAge(catKey) {
    const now = today.getTime();
    const buckets = [0, 0, 0, 0, 0]; // <30, 30-60, 60-90, 90-180, >180 days
    let rem = Math.max(0, closingQty[catKey][MONTHS.length - 1] || 0);
    for (let i = MONTHS.length - 1; i >= 0 && rem > 0.001; i--) {
      const moDate = new Date(MONTHS[i] + '-15').getTime();
      const daysAgo = Math.floor((now - moDate) / 86400000);
      const take = Math.min(movByMonth[MONTHS[i]][catKey].rcpQty, rem);
      if (take > 0) {
        rem -= take;
        const b = daysAgo < 30 ? 0 : daysAgo < 60 ? 1 : daysAgo < 90 ? 2 : daysAgo < 180 ? 3 : 4;
        buckets[b] += take;
      }
    }
    if (rem > 0) buckets[4] += rem; // older than DATA_START
    const tot = buckets.reduce((s, v) => s + v, 0);
    return tot > 0 ? buckets.map(v => parseFloat((v / tot * 100).toFixed(1))) : [0, 0, 0, 0, 0];
  }
  const aging = {};
  CATS.forEach(c => { aging[c.key] = fifoAge(c.key); });

  // ── Build monthly array ───────────────────────────────────────────────────────
  const monthly = MONTHS.map((ym, i) => {
    const yr = ym.slice(0, 4), mo = ym.slice(5, 7);
    const catData = {};
    CATS.forEach(c => {
      const mv = movByMonth[ym][c.key];
      catData[c.key] = {
        ...mv,
        openQty:  parseFloat((i === 0 ? openingQty[c.key] : closingQty[c.key][i - 1]).toFixed(2)),
        closeQty: parseFloat(closingQty[c.key][i].toFixed(2)),
        doh:      dohByCat[c.key][i],
        invVal:   Math.round(closingQty[c.key][i] * avgUnitCost[c.key]),
      };
    });
    return {
      ym,
      label:    `${MONTH_AR[mo]} ${yr}`,
      shortLbl: `${MONTH_SHORT[mo]}-${yr.slice(2)}`,
      partial:  ym === currentYm,
      ...catData,
      a41Balance: a41Balances[i],
      a41Net:     (a41Map[ym]?.debit || 0) - (a41Map[ym]?.credit || 0),
      a124:       Math.round(a124Map[ym] || 0),
    };
  });

  // ── Summary ───────────────────────────────────────────────────────────────────
  const totalCogs124  = monthly.reduce((s, m) => s + m.a124, 0);
  const lastA41       = a41Balances[a41Balances.length - 1] || 0;

  // Use only COMPLETE months for turnover/DSI (exclude partial current month)
  const completeMths  = monthly.filter(m => !m.partial);
  const cmpCogs       = completeMths.reduce((s, m) => s + m.a124, 0);
  const cmpAvgA41     = completeMths.length > 0
    ? completeMths.reduce((s, m) => s + m.a41Balance, 0) / completeMths.length : 0;
  const periodDays    = completeMths.length * 30;
  const periodTurnover = cmpCogs > 0 && cmpAvgA41 > 0 ? cmpCogs / cmpAvgA41 : 0;
  const dsi           = periodDays > 0 && cmpCogs > 0
    ? Math.round(periodDays * cmpAvgA41 / cmpCogs) : 0;

  // avgA41 across all months for display
  const avgA41        = a41Balances.length > 0 ? a41Balances.reduce((s, v) => s + v, 0) / a41Balances.length : 0;
  const mCount        = monthly.length;

  const lastIdx = MONTHS.length - 1;
  const lastClose  = {};
  const lastDoh    = {};
  const lastInvVal = {};
  CATS.forEach(c => {
    lastClose[c.key]  = lastIdx >= 0 ? parseFloat(closingQty[c.key][lastIdx].toFixed(2)) : 0;
    lastDoh[c.key]    = lastIdx >= 0 ? dohByCat[c.key][lastIdx] : 9999;
    lastInvVal[c.key] = Math.round(lastClose[c.key] * avgUnitCost[c.key]);
  });

  return {
    cats:   CATS,
    months: MONTHS,
    monthly,
    summary: {
      dataAsOf:       today.toISOString().slice(0, 10),
      startDate:      DATA_START,
      totalCogs124:   Math.round(totalCogs124),   // all months incl. partial (for display)
      cmpCogs124:     Math.round(cmpCogs),         // complete months only — used in turnover
      lastA41:        lastA41,
      avgA41:         Math.round(cmpAvgA41),        // avg over complete months only
      periodMonths:   completeMths.length,
      periodDays,
      periodTurnover: parseFloat(periodTurnover.toFixed(1)),
      dsi,
      a41OpenBal:     Math.round(a41OpenBal),
    },
    lastClose,
    lastDoh,
    lastInvVal,
    avgUnitCost,
    aging,
    dohByCat,
    closingQty: Object.fromEntries(CATS.map(c => [c.key, closingQty[c.key].map(v => parseFloat(v.toFixed(2)))])),
    a41Balances,
    a41OpenBal: Math.round(a41OpenBal),
  };
}

module.exports = { getInventoryData };
