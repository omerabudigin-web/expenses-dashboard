'use strict';
const { getPool } = require('../db');

const DATA_START = process.env.DATA_START_DATE || '2025-10-01';

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

// Classify a FinishedGoodsReceipt/SalesInvoice item into product group.
// Returns null for items that are NOT manufactured products (to exclude them).
function classifyProduct(nameAr) {
  if (!nameAr) return null;
  const n = nameAr.trim();
  // مشرشر: ribbed coil produced at factory
  if (n.includes('مشرشر')) return 'sh';
  // MD75 / MD45: exact product codes
  if (/MD\s*75/i.test(n)) return 'md75';
  if (/MD\s*45/i.test(n)) return 'md45';
  // All other items (مجدول, سكراب, شبك, كويل أملس, etc.) → excluded
  return null;
}

// Classify coil by diameter for purchase price tracking
function classifyCoil(nameAr) {
  if (!nameAr) return 'other';
  const n = nameAr;
  if (n.includes('10') && n.includes('مم')) return 'c10';
  if (n.includes('11') && n.includes('مم')) return 'c11';
  if (n.includes('8')  && n.includes('مم')) return 'c8';
  if (n.includes('9')  && n.includes('مم')) return 'c9';
  if (n.includes('5.5')|| (n.includes('5') && n.includes('مم'))) return 'c5';
  return 'other';
}

async function getMfgData(dbName) {
  const pool   = await getPool(dbName);
  const MONTHS = monthRange();
  const today  = new Date();
  const currentYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  const [fgrRes, salesRes, rmiRes, coilPurchRes] = await Promise.all([

    // ── 1. FinishedGoodsReceipt: production by item per month at factory ──────
    pool.request().query(`
      SELECT
        i.Id   AS itemId,
        i.NameAr,
        FORMAT(fgrh.TransactionDate, 'yyyy-MM') AS ym,
        SUM(fgrd.GroupQuantity)  AS qty,
        SUM(fgrd.GroupCostPrice) AS cost
      FROM FinishedGoodsReceiptDetail fgrd
      JOIN FinishedGoodsReceiptHeader fgrh ON fgrh.ID = fgrd.HeaderID
      JOIN Item i ON i.Id = fgrd.Item
      WHERE fgrh.TransactionDate >= '${DATA_START}'
      GROUP BY i.Id, i.NameAr, FORMAT(fgrh.TransactionDate, 'yyyy-MM')
    `),

    // ── 2. SalesInvoice for manufactured products (MD75, MD45, مشرشر) ─────────
    pool.request().query(`
      SELECT
        i.Id   AS itemId,
        i.NameAr,
        FORMAT(sih.TransactionDate, 'yyyy-MM') AS ym,
        ABS(SUM(sid.GroupQuantity)) AS qty,
        SUM(sid.Net)                AS revenue
      FROM SalesInvoiceDetail sid
      JOIN SalesInvoiceHeader sih ON sih.ID = sid.HeaderID
      JOIN Item i ON i.Id = sid.Item
      WHERE sih.TransactionDate >= '${DATA_START}'
        AND (
          i.NameAr LIKE N'%MD 75%' OR i.NameAr LIKE N'%MD75%' OR
          i.NameAr LIKE N'%MD 45%' OR i.NameAr LIKE N'%MD45%' OR
          i.NameAr LIKE N'%مشرشر%'
        )
      GROUP BY i.Id, i.NameAr, FORMAT(sih.TransactionDate, 'yyyy-MM')
    `),

    // ── 3. RawMaterialIssue: coil inputs to factory per month ─────────────────
    pool.request().query(`
      SELECT
        FORMAT(rmih.TransactionDate, 'yyyy-MM') AS ym,
        COUNT(DISTINCT rmih.ID)       AS batches,
        SUM(ABS(rmid.GroupQuantity))  AS qty,
        SUM(ABS(rmid.GroupCostPrice)) AS cost
      FROM RawMaterialIssueDetail rmid
      JOIN RawMaterialIssueHeader rmih ON rmih.ID = rmid.HeaderID
      JOIN Item i ON i.Id = rmid.Item
      WHERE i.NameAr LIKE N'%كويل%'
        AND rmih.TransactionDate >= '${DATA_START}'
      GROUP BY FORMAT(rmih.TransactionDate, 'yyyy-MM')
    `),

    // ── 4. PurchaseInvoice: coil purchase prices by coil type per month ───────
    pool.request().query(`
      SELECT
        FORMAT(pih.TransactionDate, 'yyyy-MM') AS ym,
        i.NameAr,
        SUM(ABS(pid.GroupQuantity)) AS qty,
        SUM(pid.Net)                AS cost,
        SUM(pid.Net) / NULLIF(SUM(ABS(pid.GroupQuantity)), 0) AS avgPrice
      FROM PurchaseInvoiceDetail pid
      JOIN PurchaseInvoiceHeader pih ON pih.ID = pid.HeaderID
      JOIN Item i ON i.Id = pid.Item
      WHERE i.NameAr LIKE N'%كويل%'
        AND pih.TransactionDate >= '${DATA_START}'
      GROUP BY FORMAT(pih.TransactionDate, 'yyyy-MM'), i.NameAr
    `),
  ]);

  // ── Aggregate FGR by product group ──────────────────────────────────────────
  const GRPS = ['md75', 'md45', 'sh'];
  const grpProd  = { md75:{}, md45:{}, sh:{} };
  const grpSales = { md75:{}, md45:{}, sh:{} };
  const itemNames = { md75:[], md45:[], sh:[] };

  fgrRes.recordset.forEach(r => {
    const grp = classifyProduct(r.NameAr);
    if (!grp || !grpProd[grp]) return;  // skip excluded items
    if (!grpProd[grp][r.ym]) grpProd[grp][r.ym] = { qty: 0, cost: 0 };
    grpProd[grp][r.ym].qty  += +r.qty  || 0;
    grpProd[grp][r.ym].cost += +r.cost || 0;
    if (!itemNames[grp].includes(r.NameAr)) itemNames[grp].push(r.NameAr);
  });

  salesRes.recordset.forEach(r => {
    const grp = classifyProduct(r.NameAr);
    if (!grp || !grpSales[grp]) return;
    if (!grpSales[grp][r.ym]) grpSales[grp][r.ym] = { qty: 0, revenue: 0 };
    grpSales[grp][r.ym].qty     += +r.qty     || 0;
    grpSales[grp][r.ym].revenue += +r.revenue || 0;
  });

  // ── Build RMI map ────────────────────────────────────────────────────────────
  const rmiMap = {};
  rmiRes.recordset.forEach(r => {
    rmiMap[r.ym] = { batches: +r.batches || 0, qty: +r.qty || 0, cost: +r.cost || 0 };
  });

  // ── Build coil purchase price map ────────────────────────────────────────────
  const coilMap = {}; // { ym: { c10: avgPrice, c8: avgPrice, ... } }
  // Accumulate weighted avg
  const coilAcc = {}; // { ym: { key: { qty, cost } } }
  coilPurchRes.recordset.forEach(r => {
    const ck = classifyCoil(r.NameAr);
    if (!coilAcc[r.ym]) coilAcc[r.ym] = {};
    if (!coilAcc[r.ym][ck]) coilAcc[r.ym][ck] = { qty: 0, cost: 0 };
    coilAcc[r.ym][ck].qty  += +r.qty  || 0;
    coilAcc[r.ym][ck].cost += +r.cost || 0;
  });
  Object.entries(coilAcc).forEach(([ym, keys]) => {
    coilMap[ym] = {};
    Object.entries(keys).forEach(([ck, v]) => {
      coilMap[ym][ck] = v.qty > 0 ? Math.round(v.cost / v.qty) : null;
    });
  });

  // ── Build monthly data ───────────────────────────────────────────────────────
  const monthly = MONTHS.map(ym => {
    const yr  = ym.slice(0, 4);
    const mo  = ym.slice(5, 7);
    const rmi = rmiMap[ym] || { batches: 0, qty: 0, cost: 0 };
    const cp  = coilMap[ym] || {};

    const g = (grp) => ({
      prod:  grpProd[grp][ym]  || { qty: 0, cost: 0 },
      sales: grpSales[grp][ym] || { qty: 0, revenue: 0 },
    });
    const gm = (grp) => {
      const { prod, sales } = g(grp);
      const avgCost  = prod.qty  > 0 ? prod.cost    / prod.qty  : null;
      const avgPrice = sales.qty > 0 ? sales.revenue / sales.qty : null;
      const margin   = (avgCost !== null && avgPrice !== null) ? avgPrice - avgCost : null;
      const pct      = (margin !== null && avgPrice > 0) ? parseFloat((margin / avgPrice * 100).toFixed(1)) : null;
      return {
        prodQty:  parseFloat(prod.qty.toFixed(2)),
        prodCost: Math.round(prod.cost),
        avgCost:  avgCost  !== null ? Math.round(avgCost)  : null,
        saleQty:  parseFloat(sales.qty.toFixed(2)),
        revenue:  Math.round(sales.revenue),
        avgPrice: avgPrice !== null ? Math.round(avgPrice) : null,
        marginAmt: margin !== null ? Math.round(margin) : null,
        marginPct: pct,
      };
    };

    return {
      ym,
      label:    `${MONTH_AR[mo]} ${yr}`,
      shortLbl: `${MONTH_SHORT[mo]}-${yr.slice(2)}`,
      partial:  ym === currentYm,
      batches:  rmi.batches,
      rmiQty:   parseFloat(rmi.qty.toFixed(2)),
      rmiCost:  Math.round(rmi.cost),
      coil10:   cp.c10 ?? null,
      coil8:    cp.c8  ?? null,
      md75:     gm('md75'),
      md45:     gm('md45'),
      sh:       gm('sh'),
    };
  });

  // ── Per-group summary ────────────────────────────────────────────────────────
  const grpSummary = (key) => {
    const totalProdQty  = monthly.reduce((s, m) => s + m[key].prodQty,  0);
    const totalProdCost = monthly.reduce((s, m) => s + m[key].prodCost, 0);
    const totalSaleQty  = monthly.reduce((s, m) => s + m[key].saleQty,  0);
    const totalRevenue  = monthly.reduce((s, m) => s + m[key].revenue,  0);
    const avgCostPerTon  = totalProdQty  > 0 ? totalProdCost / totalProdQty  : 0;
    const avgPricePerTon = totalSaleQty  > 0 ? totalRevenue  / totalSaleQty  : 0;
    const marginPerTon   = avgPricePerTon - avgCostPerTon;
    const marginPct      = avgPricePerTon > 0 ? marginPerTon / avgPricePerTon * 100 : 0;
    return {
      totalProdQty:  parseFloat(totalProdQty.toFixed(2)),
      totalProdCost: Math.round(totalProdCost),
      totalSaleQty:  parseFloat(totalSaleQty.toFixed(2)),
      totalRevenue:  Math.round(totalRevenue),
      avgCostPerTon: Math.round(avgCostPerTon),
      avgPricePerTon: Math.round(avgPricePerTon),
      marginPerTon:  Math.round(marginPerTon),
      marginPct:     parseFloat(marginPct.toFixed(1)),
    };
  };

  const s75 = grpSummary('md75');
  const s45 = grpSummary('md45');
  const sSH = grpSummary('sh');

  // Totals
  const totalBatches   = monthly.reduce((s, m) => s + m.batches, 0);
  const totalRmiCost   = monthly.reduce((s, m) => s + m.rmiCost, 0);
  const totalRmiQty    = monthly.reduce((s, m) => s + m.rmiQty,  0);
  const totalRevenue   = s75.totalRevenue + s45.totalRevenue + sSH.totalRevenue;
  const totalProdQty   = s75.totalProdQty + s45.totalProdQty + sSH.totalProdQty;
  const avgCoilPrice   = totalRmiQty > 0 ? totalRmiCost / totalRmiQty : 0;

  // Allocation factors & break-even
  const f75  = avgCoilPrice > 0 ? s75.avgCostPerTon / avgCoilPrice : 0;
  const f45  = avgCoilPrice > 0 ? s45.avgCostPerTon / avgCoilPrice : 0;
  const bep75 = f75 > 0 ? Math.round(s75.avgPricePerTon / f75) : 0;
  const bep45 = f45 > 0 ? Math.round(s45.avgPricePerTon / f45) : 0;

  // Latest non-null coil prices
  const latestCoil10 = [...MONTHS].reverse().reduce((v, ym) => v ?? coilMap[ym]?.c10, null) ?? 0;
  const latestCoil8  = [...MONTHS].reverse().reduce((v, ym) => v ?? coilMap[ym]?.c8,  null) ?? 0;

  return {
    months:  MONTHS,
    monthly,
    md75:    { ...s75, label: 'MD75 / M12', color: '#4a9eda' },
    md45:    { ...s45, label: 'MD45 / M6',  color: '#f5a623' },
    sh:      { ...sSH, label: 'مشرشر',       color: '#4ada8e' },
    itemNames: Object.fromEntries(Object.entries(itemNames).map(([k, v]) => [k, [...v]])),
    summary: {
      dataAsOf:     today.toISOString().slice(0, 10),
      startDate:    DATA_START,
      totalBatches,
      totalRmiCost: Math.round(totalRmiCost),
      totalRmiQty:  parseFloat(totalRmiQty.toFixed(2)),
      avgCoilPrice: Math.round(avgCoilPrice),
      totalRevenue,
      totalProdQty: parseFloat(totalProdQty.toFixed(2)),
      f75:   parseFloat(f75.toFixed(3)),
      f45:   parseFloat(f45.toFixed(3)),
      bep75,
      bep45,
      latestCoil10,
      latestCoil8,
    },
  };
}

module.exports = { getMfgData };
