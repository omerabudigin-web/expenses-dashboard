'use strict';
const { getPool } = require('../db');

const DATA_START   = process.env.DATA_START_DATE || '2025-10-01';
const MFG_EFF      = 0.97;
const MFG_CONV_COST = 350;

const MONTH_AR = {
  '01':'يناير','02':'فبراير','03':'مارس','04':'أبريل','05':'مايو','06':'يونيو',
  '07':'يوليو','08':'أغسطس','09':'سبتمبر','10':'أكتوبر','11':'نوفمبر','12':'ديسمبر',
};
const MONTH_SHORT = {
  '01':'ين','02':'فب','03':'مر','04':'أب','05':'ما','06':'يون',
  '07':'يول','08':'أغ','09':'سب','10':'أكت','11':'نوف','12':'ديس',
};

function monthRange() {
  const start  = new Date(DATA_START + 'T00:00:00');
  const today  = new Date();
  const list   = [];
  let d = new Date(start.getFullYear(), start.getMonth(), 1);
  const endM = new Date(today.getFullYear(), today.getMonth(), 1);
  while (d <= endM) {
    list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  return list;
}

const PALETTE = ['#4a9eda','#a78bfa','#f5a623','#f472b6','#34d399','#64b5f6','#4ada8e','#fb923c'];

async function getCoilsData(dbName) {
  const pool   = await getPool(dbName);
  const MONTHS = monthRange();
  const startYm    = MONTHS[0];
  const today      = new Date();
  const currentYm  = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const [mvRes, revRes, itemRes] = await Promise.all([

    // ── 1. All movements (all time) for coil items ──────────────────────────────
    pool.request().query(`
      SELECT
        v.Item     AS itemId,
        FORMAT(v.TransactionDate, 'yyyy-MM') AS ym,
        v.ScreenID,
        SUM(v.GroupQuantity)  AS qty,
        SUM(v.GroupCostPrice) AS cost
      FROM InventoryTransactionOnlyIncludedView v
      JOIN Item i ON i.Id = v.Item
      WHERE i.NameAr LIKE N'%كويل%'
      GROUP BY v.Item, FORMAT(v.TransactionDate, 'yyyy-MM'), v.ScreenID
    `),

    // ── 2. Monthly revenue from sales invoices (from DATA_START) ───────────────
    pool.request().query(`
      SELECT
        FORMAT(sih.TransactionDate, 'yyyy-MM')                AS ym,
        ABS(SUM(sid.GroupQuantity))                            AS qty,
        SUM(sid.Net)                                           AS revenue,
        SUM(sid.Net) / NULLIF(ABS(SUM(sid.GroupQuantity)), 0) AS avgPrice
      FROM SalesInvoiceDetail sid
      JOIN SalesInvoiceHeader sih ON sih.ID = sid.HeaderID
      JOIN Item i ON i.Id = sid.Item
      WHERE i.NameAr LIKE N'%كويل%'
        AND sih.TransactionDate >= '${DATA_START}'
      GROUP BY FORMAT(sih.TransactionDate, 'yyyy-MM')
    `),

    // ── 3. Per-item current stock + MAC (all-time cost basis) ──────────────────
    pool.request().query(`
      WITH CoilItems AS (
        SELECT i.Id, i.Code, i.NameAr
        FROM Item i
        WHERE i.NameAr LIKE N'%كويل%'
      ),
      OnHand    AS (SELECT v.Item, SUM(v.GroupQuantity) AS onHand FROM InventoryTransactionOnlyIncludedView v WHERE v.Item IN (SELECT Id FROM CoilItems) GROUP BY v.Item),
      Opening   AS (SELECT Item, SUM(Amount)        AS v FROM OpeningStockDetail      WHERE Item IN (SELECT Id FROM CoilItems) GROUP BY Item),
      Received  AS (SELECT Item, SUM(GroupCostPrice) AS v FROM ReceiptGoodsDetail     WHERE Item IN (SELECT Id FROM CoilItems) AND GroupQuantity > 0 GROUP BY Item),
      Increased AS (SELECT Item, SUM(GroupCostPrice) AS v FROM IncreaseStockDetail    WHERE Item IN (SELECT Id FROM CoilItems) GROUP BY Item),
      Delivered AS (SELECT Item, SUM(GroupCostPrice) AS v FROM DeliverGoodsDetail     WHERE Item IN (SELECT Id FROM CoilItems) GROUP BY Item),
      Decreased AS (SELECT Item, SUM(GroupCostPrice) AS v FROM DecreaseStockDetail    WHERE Item IN (SELECT Id FROM CoilItems) GROUP BY Item),
      TrOut     AS (SELECT Item, SUM(GroupCostPrice) AS v FROM TransferIssuedDetail   WHERE Item IN (SELECT Id FROM CoilItems) GROUP BY Item),
      TrIn      AS (SELECT Item, SUM(GroupCostPrice) AS v FROM TransferReceivingDetail WHERE Item IN (SELECT Id FROM CoilItems) GROUP BY Item)
      SELECT
        ci.Id    AS itemId,
        ci.Code  AS itemCode,
        ci.NameAr AS nameAr,
        ISNULL(oh.onHand, 0) AS currentQty,
        ROUND(
          ISNULL(o.v,0)+ISNULL(rc.v,0)+ISNULL(inc.v,0)+ISNULL(d.v,0)+ISNULL(dec.v,0)+ISNULL(tri.v,0)+ISNULL(tro.v,0)
        ,2) AS costValue,
        ROUND(
          (ISNULL(o.v,0)+ISNULL(rc.v,0)+ISNULL(inc.v,0)+ISNULL(d.v,0)+ISNULL(dec.v,0)+ISNULL(tri.v,0)+ISNULL(tro.v,0))
          / NULLIF(oh.onHand, 0)
        ,2) AS mac
      FROM CoilItems ci
      LEFT JOIN OnHand oh  ON oh.Item  = ci.Id
      LEFT JOIN Opening   o   ON o.Item   = ci.Id
      LEFT JOIN Received  rc  ON rc.Item  = ci.Id
      LEFT JOIN Increased inc ON inc.Item = ci.Id
      LEFT JOIN Delivered d   ON d.Item   = ci.Id
      LEFT JOIN Decreased dec ON dec.Item = ci.Id
      LEFT JOIN TrOut     tro ON tro.Item = ci.Id
      LEFT JOIN TrIn      tri ON tri.Item = ci.Id
      ORDER BY ci.NameAr
    `),
  ]);

  // ── Build movement maps ──────────────────────────────────────────────────────
  const agg     = {};   // { ym: { screenId: {qty,cost} } }   — all-items aggregate
  const perItem = {};   // { itemId: { ym: { screenId: {qty,cost} } } }

  mvRes.recordset.forEach(r => {
    const ym  = r.ym;
    const sid = r.ScreenID;
    const id  = r.itemId;

    if (!agg[ym])        agg[ym]        = {};
    if (!agg[ym][sid])   agg[ym][sid]   = { qty: 0, cost: 0 };
    agg[ym][sid].qty  += +r.qty  || 0;
    agg[ym][sid].cost += +r.cost || 0;

    if (!perItem[id])        perItem[id]        = {};
    if (!perItem[id][ym])    perItem[id][ym]    = {};
    if (!perItem[id][ym][sid]) perItem[id][ym][sid] = { qty: 0, cost: 0 };
    perItem[id][ym][sid].qty  += +r.qty  || 0;
    perItem[id][ym][sid].cost += +r.cost || 0;
  });

  // ── Opening balance before DATA_START ───────────────────────────────────────
  let openQty = 0;
  Object.entries(agg).forEach(([ym, screens]) => {
    if (ym < startYm) Object.values(screens).forEach(s => { openQty += s.qty; });
  });

  // ── Build monthly ledger ─────────────────────────────────────────────────────
  let runQty = openQty;
  const monthly = MONTHS.map(ym => {
    const sc   = agg[ym] || {};
    const yr   = ym.slice(0, 4);
    const mo   = ym.slice(5, 7);
    const daysTotal = new Date(+yr, +mo, 0).getDate();
    const partial   = ym === currentYm;
    const days      = partial ? today.getDate() : daysTotal;

    const rcp     = +(sc[62]?.qty  || 0);
    const rcpCost = +(sc[62]?.cost || 0);
    const del     = Math.abs(+(sc[61]?.qty  || 0));
    const delCost = Math.abs(+(sc[61]?.cost || 0));
    const tri     = Math.abs(+(sc[66]?.qty  || 0));
    const triCost = Math.abs(+(sc[66]?.cost || 0));
    const trr     = +(sc[67]?.qty  || 0);
    const adj     = (+(sc[68]?.qty || 0)) - Math.abs(+(sc[69]?.qty || 0)) + (+(sc[71]?.qty || 0));

    const open  = runQty;
    const close = open + rcp - del - tri + trr + adj;
    runQty = close;

    const avgInv   = (open + close) / 2;
    const doi      = del > 0 && days > 0 ? parseFloat(((avgInv / (del / days))).toFixed(1)) : null;
    const mfgInput = tri;
    const mfgOut   = parseFloat((mfgInput * MFG_EFF).toFixed(2));
    const mfgWaste = parseFloat((mfgInput * (1 - MFG_EFF)).toFixed(2));
    const mfgConv  = Math.round(mfgInput * MFG_CONV_COST);
    const mfgMat   = Math.round(triCost);
    const mfgTotal = mfgMat + mfgConv;
    const dailyRate = days > 0 ? parseFloat((mfgInput / days).toFixed(2)) : 0;

    return {
      ym, partial, days,
      label:    `${MONTH_AR[mo]} ${yr}`,
      shortLbl: `${MONTH_SHORT[mo]}-${yr.slice(2)}`,
      openQty:  parseFloat(open.toFixed(2)),
      receipts: parseFloat(rcp.toFixed(2)),
      rcpCost:  parseFloat(rcpCost.toFixed(2)),
      delivers: parseFloat(del.toFixed(2)),
      delCost:  parseFloat(delCost.toFixed(2)),
      trIssued: parseFloat(tri.toFixed(2)),
      triCost:  parseFloat(triCost.toFixed(2)),
      netAdj:   parseFloat(adj.toFixed(2)),
      closeQty: parseFloat(close.toFixed(2)),
      avgInv:   parseFloat(avgInv.toFixed(2)),
      doi,
      mfgInput, mfgOut, mfgWaste, mfgConv, mfgMat, mfgTotal, dailyRate,
    };
  });

  // ── Revenue map ──────────────────────────────────────────────────────────────
  const revMap = {};
  revRes.recordset.forEach(r => {
    revMap[r.ym] = { qty: +r.qty || 0, revenue: +r.revenue || 0, avgPrice: +r.avgPrice || 0 };
  });
  const revenue = MONTHS.map(ym => ({ ym, ...(revMap[ym] || { qty: 0, revenue: 0, avgPrice: 0 }) }));

  // ── Per-item data for breakdown ──────────────────────────────────────────────
  const items = itemRes.recordset.map((r, idx) => {
    const id = r.itemId;
    const mv = perItem[id] || {};

    let itemOpen = 0;
    Object.entries(mv).forEach(([ym, screens]) => {
      if (ym < startYm) Object.values(screens).forEach(s => { itemOpen += s.qty; });
    });

    let runItemQty = itemOpen;
    const mthData = MONTHS.map(ym => {
      const sc2 = mv[ym] || {};
      const rcp = +(sc2[62]?.qty || 0);
      const del = Math.abs(+(sc2[61]?.qty || 0));
      const tri = Math.abs(+(sc2[66]?.qty || 0));
      const trr = +(sc2[67]?.qty || 0);
      const adj = (+(sc2[68]?.qty || 0)) - Math.abs(+(sc2[69]?.qty || 0)) + (+(sc2[71]?.qty || 0));
      const open  = runItemQty;
      const close = open + rcp - del - tri + trr + adj;
      runItemQty  = close;
      return {
        ym,
        open:      parseFloat(open.toFixed(2)),
        receipts:  parseFloat(rcp.toFixed(2)),
        delivers:  parseFloat(del.toFixed(2)),
        transfers: parseFloat(tri.toFixed(2)),
        adj:       parseFloat(adj.toFixed(2)),
        close:     parseFloat(close.toFixed(2)),
      };
    });

    return {
      itemId:     r.itemId,
      itemCode:   (r.itemCode || '').trim(),
      nameAr:     (r.nameAr   || '').trim(),
      color:      PALETTE[idx % PALETTE.length],
      currentQty: +r.currentQty || 0,
      mac:        +r.mac        || 0,
      costValue:  +r.costValue  || 0,
      openPeriod: parseFloat(itemOpen.toFixed(2)),
      periodRcp:  parseFloat(mthData.reduce((s, m) => s + m.receipts,  0).toFixed(2)),
      periodDel:  parseFloat(mthData.reduce((s, m) => s + m.delivers,  0).toFixed(2)),
      periodTri:  parseFloat(mthData.reduce((s, m) => s + m.transfers, 0).toFixed(2)),
      periodAdj:  parseFloat(mthData.reduce((s, m) => s + m.adj,       0).toFixed(2)),
      monthly:    mthData,
    };
  });

  // ── Summary ──────────────────────────────────────────────────────────────────
  const completeMths = monthly.filter(m => !m.partial);
  const last3        = completeMths.slice(-3);
  const ma3          = last3.length ? last3.reduce((s, m) => s + m.delivers, 0) / last3.length : 0;
  const totalRcp     = monthly.reduce((s, m) => s + m.receipts, 0);
  const totalDel     = monthly.reduce((s, m) => s + m.delivers, 0);
  const totalTri     = monthly.reduce((s, m) => s + m.trIssued, 0);
  const totalRev     = revenue.reduce((s, r) => s + r.revenue,  0);
  const currentTons  = monthly.length ? monthly[monthly.length - 1].closeQty : 0;
  const totalCostVal = items.reduce((s, i) => s + i.costValue, 0);
  const totalCurQty  = items.reduce((s, i) => s + Math.max(0, i.currentQty), 0);
  const weightedMac  = totalCurQty > 0 ? totalCostVal / totalCurQty : 0;

  return {
    months: MONTHS,
    monthly,
    revenue,
    items,
    summary: {
      dataAsOf:     today.toISOString().slice(0, 10),
      startDate:    DATA_START,
      currentTons:  parseFloat(currentTons.toFixed(2)),
      openingTons:  parseFloat(openQty.toFixed(2)),
      totalRcp:     parseFloat(totalRcp.toFixed(2)),
      totalDel:     parseFloat(totalDel.toFixed(2)),
      totalTri:     parseFloat(totalTri.toFixed(2)),
      totalCostVal: parseFloat(totalCostVal.toFixed(2)),
      weightedMac:  parseFloat(weightedMac.toFixed(2)),
      totalRev:     parseFloat(totalRev.toFixed(2)),
      ma3:          parseFloat(ma3.toFixed(2)),
    },
  };
}

module.exports = { getCoilsData };
