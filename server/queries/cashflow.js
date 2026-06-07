'use strict';
const { getBSMonthly, getBankFacilitiesMonthly } = require('./bs');
const { getPLMonthly }                            = require('./pl');
const { getBudget }                               = require('./budget');

const OPEX_CATS  = ['sal','rent','maint','sell','dist','adm','char','fin','oth'];
const FIXED_GRPS = ['10101','10102','10103','10104','10105','10106','10107','10108'];

function avg(arr)    { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/*
 * getCashFlowBudget
 *
 * Three-section cash flow statement (IFRS for SMEs §7 / SOCPA):
 *
 *  I.   التشغيلية  — Indirect: Net Income ± WC changes (Inventory, AR, AP, …)
 *  II.  الاستثمارية — Net change in fixed assets & projects
 *  III. التمويلية   — Net change in bank facilities, LT loans, equity
 *
 * Historical months: derived from actual BS balance changes (same logic as tab-cf.js).
 *
 * Forecast months (6): projected using budget P&L + observed ratios:
 *   - δAR       projected from budget revenue × (DSO / 30)
 *   - δAP       projected from budget COGS    × (DPO / 30)
 *   - δInventory projected from budget COGS    × (Inv-days / 30)
 *   - δFixedAssets = historical average monthly capex
 *   - Financing  = 0 (no planned debt/equity changes assumed)
 *
 * Group codes (level-3 AccountChart.Code):
 *   Cash:  10301   Inventory: 10302   AR: 10303
 *   EmpRec:10304   OtherCA:   10305
 *   AP:    20101   OtherCL:   20102   Accrued: 20103
 *   Fixed assets: 10101–10108   Projects: 10201
 *   LT Loans: 20201   Bank Facilities: 2010202% (via getBankFacilitiesMonthly)
 *   Capital: 30101   Partners: 30102
 */
async function getCashFlowBudget(dbName, startDate, options = {}) {
  const { scenario = 'conservative', customGrowth = 0, customCogs = null } = options;

  const [plData, bsData, bfData, budgetData] = await Promise.all([
    getPLMonthly(dbName, startDate),
    getBSMonthly(dbName),
    getBankFacilitiesMonthly(dbName),
    getBudget(dbName, startDate, { scenario, customGrowth, customCogs }),
  ]);

  if (!plData.length) return { historical: [], forecast: [], meta: {} };

  /* ── Build lookups ── */
  const byMonth = {};
  bsData.forEach(r => {
    if (!byMonth[r.month]) byMonth[r.month] = { _label: r.label };
    byMonth[r.month][r.grpCode] = r.balance;
  });

  const plByMonth = {};
  plData.forEach(m => {
    const opex = OPEX_CATS.reduce((s, k) => s + (m[k] || 0), 0);
    plByMonth[m.month] = { revenue: m.revenue, cogs: m.cogs, opex, netIncome: m.revenue - m.cogs - opex, label: m.label };
  });

  /* Bank-facilities carry-forward */
  const bfSpot = {};
  (bfData || []).forEach(r => { bfSpot[r.month] = r.balance; });

  const allMonths = [...new Set([
    ...bsData.map(r => r.month),
    ...plData.map(m => m.month),
  ])].filter(m => m >= startDate).sort();

  let lastBF = 0;
  const bfCarried = {};
  allMonths.forEach(mo => {
    if (bfSpot[mo] !== undefined) lastBF = bfSpot[mo];
    bfCarried[mo] = lastBF;
  });

  const now = new Date();
  const curYr = now.getFullYear(), curMo = now.getMonth() + 1;

  /* ── Historical CF (indirect method) ── */
  const historical = allMonths.map((mo, i) => {
    const cur  = byMonth[mo]  || {};
    const prev = i > 0 ? (byMonth[allMonths[i - 1]] || {}) : {};
    const pl   = plByMonth[mo] || { revenue: 0, cogs: 0, opex: 0, netIncome: 0 };

    const b  = c => cur[c]  || 0;
    const p  = c => prev[c] || 0;
    const Δ  = c => b(c) - p(c);

    const openingCash = p('10301');
    const closingCash = b('10301');

    const prevMo  = i > 0 ? allMonths[i - 1] : null;
    const Δ_bf    = bfCarried[mo] - (prevMo ? bfCarried[prevMo] : 0);

    /* Section I — Operating */
    const netIncome   = pl.netIncome;
    const δInventory  = -Δ('10302');
    const δAR         = -Δ('10303');
    const δEmpRec     = -Δ('10304');
    const δOtherCA    = -Δ('10305');
    const δAP         = -Δ('20101');
    const δOtherPay   = -(Δ('20102') - Δ_bf);
    const δAccrued    = -Δ('20103');
    const wcAdjust    = δInventory + δAR + δEmpRec + δOtherCA + δAP + δOtherPay + δAccrued;
    const operatingCF = netIncome + wcAdjust;

    /* Section II — Investing */
    const δFixedAssets = -FIXED_GRPS.reduce((s, c) => s + Δ(c), 0);
    const δProjects    = -Δ('10201');
    const investingCF  = δFixedAssets + δProjects;

    /* Section III — Financing */
    const δLTLoans        = -Δ('20201');
    const δBankFacilities = -Δ_bf;
    const δCapital        = -Δ('30101');
    const δPartners       = -Δ('30102');
    const financingCF     = δLTLoans + δBankFacilities + δCapital + δPartners;

    const netCashChange = operatingCF + investingCF + financingCF;
    const label  = cur._label || pl.label || mo;
    const [yr, m_n] = mo.split('-').map(Number);

    return {
      month: mo, label,
      revenue: pl.revenue, cogs: pl.cogs, opex: pl.opex,
      netIncome,
      δInventory, δAR, δEmpRec, δOtherCA, δAP, δOtherPay, δAccrued,
      wcAdjust, operatingCF,
      δFixedAssets, δProjects, investingCF,
      δLTLoans, δBankFacilities, δCapital, δPartners, financingCF,
      netCashChange, openingCash, closingCash,
      isForecast: false,
      isPartial:  yr === curYr && m_n === curMo,
    };
  });

  /* ── Parameters from confirmed months ── */
  const confirmed   = historical.filter(m => !m.isPartial);
  const lastHistMo  = allMonths[allMonths.length - 1];
  const lastBS      = byMonth[lastHistMo] || {};

  /* DSO / DPO */
  const dsoArr = confirmed.filter(m => m.revenue > 0)
    .map(m => (lastBS['10303'] !== undefined
      ? (byMonth[m.month]?.['10303'] || 0)
      : 0) / m.revenue * 30);
  const dsoArr2 = confirmed.filter(m => m.revenue > 0)
    .map(m => (byMonth[m.month]?.['10303'] || 0) / m.revenue * 30)
    .filter(v => v >= 0 && v <= 180);
  const avgDso = Math.max(1, median(dsoArr2));

  const dpoArr = confirmed.filter(m => m.cogs > 0)
    .map(m => Math.abs(byMonth[m.month]?.['20101'] || 0) / m.cogs * 30)
    .filter(v => v >= 0 && v <= 180);
  const avgDpo = Math.max(1, median(dpoArr));

  /* Inventory days (median of confirmed months) */
  const invDaysArr = confirmed.filter(m => m.cogs > 0)
    .map(m => (byMonth[m.month]?.['10302'] || 0) / m.cogs * 30)
    .filter(v => v > 0 && v < 730);
  const avgInvDays = median(invDaysArr);

  /* Monthly capex average (from historical investing) */
  const capexArr = confirmed.filter(m => m.δFixedAssets !== 0).map(m => m.δFixedAssets);
  const avgCapex = capexArr.length ? avg(capexArr) : 0;

  /* Anchor WC projection on last CONFIRMED month (never the partial month)
     to avoid distortion from low partial-month revenue/COGS.               */
  const lastConfirmedPL = confirmed.length
    ? (plByMonth[confirmed[confirmed.length - 1].month] || {})
    : {};
  let prevFcastRev  = lastConfirmedPL.revenue || avg(confirmed.map(m => m.revenue));
  let prevFcastCogs = lastConfirmedPL.cogs    || avg(confirmed.filter(m => m.cogs > 0).map(m => m.cogs));
  let runningCash   = historical.length ? historical[historical.length - 1].closingCash : 0;

  /* Cap inventory days: avoid unrealistically large swings for trading firms
     with temporary over-stocking.  Use 0 if invDays > 180 (just hold stable). */
  const effectiveInvDays = avgInvDays > 0 && avgInvDays <= 180 ? avgInvDays : 0;

  /* ── Forecast CF — projected three sections ── */
  /* Marginal WC projection (anchored on last confirmed month):
       δAR        = -(Δrevenue × DSO/30)       — AR grows with billing
       δAP        =   Δcogs    × DPO/30        — AP grows with purchasing (deferred)
       δInventory = -(Δcogs    × InvDays/30)   — inventory grows with purchasing
     Zero if effectiveInvDays=0 (over-stocked company; inventory assumed stable).
  */
  const forecast = budgetData.forecast.map(f => {
    const dRev  = f.revenue - prevFcastRev;
    const dCogs = f.cogs    - prevFcastCogs;

    const δAR        = -(dRev  * (avgDso          / 30));
    const δAP        =   dCogs * (avgDpo          / 30);
    const δInventory = -(dCogs * (effectiveInvDays / 30));

    prevFcastRev  = f.revenue;
    prevFcastCogs = f.cogs;

    const wcAdjust    = δInventory + δAR + 0 + 0 + δAP + 0 + 0;
    const operatingCF = f.netProfit + wcAdjust;

    /* Section II — Investing: historical average monthly capex */
    const δFixedAssets = avgCapex;
    const investingCF  = δFixedAssets;

    /* Section III — Financing: 0 (no planned changes) */
    const δBankFacilities = 0;
    const δLTLoans        = 0;
    const δCapital        = 0;
    const δPartners       = 0;
    const financingCF     = 0;

    const netCashChange = operatingCF + investingCF;
    const openingCash   = runningCash;
    runningCash += netCashChange;

    return {
      month: f.month, label: f.label,
      revenue: f.revenue, cogs: f.cogs, opex: f.opex,
      netIncome: f.netProfit,
      δInventory, δAR, δEmpRec: 0, δOtherCA: 0,
      δAP, δOtherPay: 0, δAccrued: 0,
      wcAdjust, operatingCF,
      δFixedAssets, δProjects: 0, investingCF,
      δLTLoans, δBankFacilities, δCapital, δPartners, financingCF,
      netCashChange, openingCash, closingCash: runningCash,
      isForecast: true, isPartial: false,
    };
  });

  /* ── Metadata ── */
  const avgMonthlyOpex = avg(confirmed.map(m => m.opex));
  const currentCash    = historical.length ? historical[historical.length - 1].closingCash : 0;
  const cashRunway     = avgMonthlyOpex > 0 ? currentCash / avgMonthlyOpex : 99;
  const cumOperating   = confirmed.reduce((s, m) => s + m.operatingCF, 0);
  const cumInvesting   = confirmed.reduce((s, m) => s + m.investingCF, 0);
  const cumFinancing   = confirmed.reduce((s, m) => s + m.financingCF, 0);
  const fcastNetOper   = forecast.reduce((s, m) => s + m.operatingCF, 0);

  return {
    historical,
    forecast,
    meta: {
      scenario,
      avgDso, avgDpo, avgInvDays, avgCapex,
      currentCash,
      currentAR:        lastBS['10303'] || 0,
      currentAP:        Math.abs(lastBS['20101'] || 0),
      currentInventory: lastBS['10302'] || 0,
      cashRunwayMonths: cashRunway,
      avgMonthlyOpex,
      forecastNetOperatingCF: fcastNetOper,
      forecastNetTotalCF:     forecast.reduce((s, m) => s + m.netCashChange, 0),
      cumOperating, cumInvesting, cumFinancing,
      budgetMeta: budgetData.meta || {},
    },
  };
}

module.exports = { getCashFlowBudget };
