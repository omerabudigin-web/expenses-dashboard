'use strict';
const { getCCCData }         = require('./ccc');
const { getPLMonthly }       = require('./pl');
const { getLiabilitiesData } = require('./liabilities');
const { getAgingData }       = require('./aging');
const { getIntercoRecon }    = require('./interco-recon');

const DB1        = process.env.DB1_NAME        || 'MekSoftDb1';
const DB2        = process.env.DB2_NAME        || 'MekSoftDb2';
const DATA_START = process.env.DATA_START_DATE || '2025-10-01';

const r2 = v => Math.round((+v || 0) * 100) / 100;

async function getExecutiveSummary(selectedDb, from, to, asOf) {
  const isDb2 = selectedDb === DB2;

  // Stock (balance) measures use period-end date as the "as of" snapshot.
  // Flow measures (P&L, CCC) use the full from→to range.
  const balanceAsOf = to; // always the period end date

  const [cccData, plRows, liabData, agingData, intercoData] = await Promise.all([
    getCCCData(DB1, DB2, from, to),
    getPLMonthly(selectedDb, from, to),           // flow: filtered to selected range
    getLiabilitiesData(DB1, DB2, selectedDb, balanceAsOf), // stock: snapshot at period end
    getAgingData(selectedDb, balanceAsOf),         // stock: snapshot at period end
    getIntercoRecon(DATA_START),                  // stock: full GL balance (no date filter in query)
  ]);

  // ── CCC: pick selected company ────────────────────────────────────────────────
  const cccCo = isDb2 ? cccData.companies[1] : cccData.companies[0];
  const cm    = cccCo.metrics;
  const cc    = cccCo.components;
  const cDays = cccCo.days || 1;

  // ── P&L aggregation ───────────────────────────────────────────────────────────
  let revenue = 0, cogs = 0, sal = 0, rent = 0, maint = 0,
      sell = 0, dist = 0, adm = 0, fin = 0, char = 0, oth = 0;
  plRows.forEach(m => {
    revenue += m.revenue || 0;
    cogs    += m.cogs    || 0;
    sal     += m.sal     || 0;
    rent    += m.rent    || 0;
    maint   += m.maint   || 0;
    sell    += m.sell    || 0;
    dist    += m.dist    || 0;
    adm     += m.adm     || 0;
    fin     += m.fin     || 0;
    char    += m.char    || 0;
    oth     += m.oth     || 0;
  });
  const grossProfit    = revenue - cogs;
  const totalOpex      = sal + rent + maint + sell + dist + adm + fin + char + oth;
  const netProfit      = grossProfit - totalOpex;
  const grossMarginPct = revenue > 0 ? r2(grossProfit / revenue * 100) : 0;
  const netMarginPct   = revenue > 0 ? r2(netProfit   / revenue * 100) : 0;
  const finCost        = r2(fin); // أعباء التمويل من قائمة الدخل

  // ── Financing ─────────────────────────────────────────────────────────────────
  const totalFinancing = r2(liabData.totals.financingTotal);
  const effectiveRate  = totalFinancing > 0 ? finCost / totalFinancing : 0;

  // ── AR aging ──────────────────────────────────────────────────────────────────
  const agT     = agingData.totals;
  const netAR   = r2(agT.balance || 0);
  // Gross AR before AP netting — for netted customers use arBalance, otherwise balance
  const grossAR = r2(agingData.customers.reduce(
    (s, c) => s + (c.arBalance !== undefined ? c.arBalance : c.balance || 0), 0
  ));
  const overdue90       = r2((agT.b91_120 || 0) + (agT.bOver120 || 0));
  const overdueRatioPct = netAR > 0 ? r2(overdue90 / netAR * 100) : 0;
  // Estimated opportunity cost of overdue capital (avg 120-day overdue period)
  const delayCost = r2(overdue90 * effectiveRate * (120 / 365));

  // ── Interco ───────────────────────────────────────────────────────────────────
  // From selected company's books: net = AR_from_peer - AP_to_peer
  // Negative = we owe more to peer = peer is financing us
  const myInterco  = isDb2 ? intercoData.db2 : intercoData.db1;
  const intercoNet = r2(myInterco.net);

  // ── Health Score (0–100) ─────────────────────────────────────────────────────
  // Profitability (0-30): based on net margin %
  const sp = netMarginPct > 10 ? 30 : netMarginPct > 5 ? 20 : netMarginPct > 0 ? 10 : 0;

  // Liquidity (0-25): based on CCC days
  const cccDays = cm.ccc || 999;
  const sl = cccDays < 30 ? 25 : cccDays < 60 ? 15 : cccDays < 90 ? 8 : 2;

  // Financing burden (0-25): finCost / netProfit
  const finBurden = finCost > 0 && netProfit > 0 ? finCost / netProfit
                  : (finCost > 0 ? 10 : 0);
  const sf = finBurden < 0.5 ? 25 : finBurden < 1.0 ? 15 : finBurden < 1.5 ? 8 : 2;

  // Collection quality (0-20): overdue>90 % of AR
  const sc = overdueRatioPct < 10 ? 20 : overdueRatioPct < 25 ? 12
           : overdueRatioPct < 50 ? 6 : 2;

  const healthTotal = sp + sl + sf + sc;

  return {
    db:          selectedDb,
    companyName: isDb2 ? 'وسام الفولاذ' : 'أبعاد الحديد',
    peerName:    isDb2 ? 'أبعاد الحديد' : 'وسام الفولاذ',
    from,           // flow period start
    to,             // flow period end = balance snapshot date
    balanceAsOf,    // = to; explicit alias for stock metrics
    asOf,           // kept for API compat (ignored internally — balanceAsOf is used)
    asOfTs:  new Date().toISOString(),
    dataFrom: DATA_START,
    ccc: {
      dso:     r2(cm.dso),
      dio:     r2(cm.dio),
      dpo:     r2(cm.dpo),
      ccc:     r2(cm.ccc),
      dpoIncl: r2(cm.dpoIncl),
      cccIncl: r2(cm.cccIncl),
    },
    cccLevers: {
      salesPerDay: r2((cc.netSales  || 0) / cDays),
      cogsPerDay:  r2((cc.cogs      || 0) / cDays),
      purchPerDay: r2((cc.purchases || 0) / cDays),
    },
    pl: {
      revenue:     r2(revenue),
      cogs:        r2(cogs),
      grossProfit: r2(grossProfit),
      grossMargin: grossMarginPct,
      netProfit:   r2(netProfit),
      netMargin:   netMarginPct,
      finCost,
      finBurden:   r2(finBurden * 100),
    },
    financing: {
      total:        totalFinancing,
      annualCost:   finCost,
      effectiveRate: r2(effectiveRate * 100),
    },
    ar: {
      gross:        grossAR,
      net:          netAR,
      overdue90,
      overdueRatio: overdueRatioPct,
      delayCost,
    },
    interco: {
      net:    intercoNet,
      status: intercoData.status,
      gap:    r2(intercoData.gapAbs),
    },
    liabilities: liabData.totals,
    healthScore: {
      total:         healthTotal,
      profitability: sp,
      liquidity:     sl,
      financing:     sf,
      collection:    sc,
    },
  };
}

module.exports = { getExecutiveSummary };
