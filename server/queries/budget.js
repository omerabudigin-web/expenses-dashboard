'use strict';
const { getPLMonthly } = require('./pl');

const AR_MONTHS = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو',
                   'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function linReg(values) {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0 };
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return { slope: den ? num / den : 0, intercept: meanY - (den ? num / den : 0) * meanX };
}

function avg(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

/*
 * Two-pass outlier detection:
 *
 * Pass 1 — net profit IQR (factor 1.5):
 *   Catches months distorted in BOTH directions by one-off accounting events
 *   (e.g. negative-price sales → inflated profit; inventory adjustment → inflated loss).
 *
 * Pass 2 — revenue IQR among remaining months (factor 1.0, tighter):
 *   Catches months with anomalously LOW revenue that would pull the trend line down
 *   (e.g. a month with near-zero sales due to a system gap or Ramadan slowdown).
 *
 * Requires ≥ 5 data points. Falls back gracefully if cleaning leaves too few.
 */
function findOutlierMonths(months) {
  if (months.length < 5) return new Set();

  function iqrSet(arr, key, factorHigh, factorLow) {
    const vals = arr.map(m => m[key]).sort((a, b) => a - b);
    const n    = vals.length;
    const q1   = vals[Math.floor(n * 0.25)];
    const q3   = vals[Math.floor(n * 0.75)];
    const iqr  = q3 - q1;
    return new Set(arr.filter(m => m[key] > q3 + factorHigh * iqr || m[key] < q1 - factorLow * iqr).map(m => m.month));
  }

  // Pass 1: net profit — symmetric ±1.5 IQR
  const pass1 = iqrSet(months, 'netProfit', 1.5, 1.5);
  const after1 = months.filter(m => !pass1.has(m.month));

  // Pass 2: revenue among remaining — only downward (1.0 IQR below Q1)
  const pass2 = after1.length >= 4 ? iqrSet(after1, 'revenue', Infinity, 1.0) : new Set();

  return new Set([...pass1, ...pass2]);
}

const OPEX_CATS = ['sal','rent','maint','sell','dist','adm','char','fin','oth'];

async function getBudget(dbName, startDate, options = {}) {
  const { scenario = 'conservative', customGrowth = 0, customCogs = null } = options;

  const raw = await getPLMonthly(dbName, startDate);
  if (!raw.length) return { historical: [], forecast: [], meta: {} };

  const now   = new Date();
  const curYr = now.getFullYear(), curMo = now.getMonth() + 1;

  /* ── Enrich all historical months ── */
  const hist = raw.map(m => {
    const [yr, mo] = m.month.split('-').map(Number);
    const opex        = OPEX_CATS.reduce((s, k) => s + (m[k] || 0), 0);
    const grossProfit = m.revenue - m.cogs;
    const netProfit   = grossProfit - opex;
    const grossMargin = m.revenue > 0 ? grossProfit / m.revenue : 0;
    const netMargin   = m.revenue > 0 ? netProfit   / m.revenue : 0;
    const isPartial   = yr === curYr && mo === curMo;
    return { ...m, opex, grossProfit, netProfit, grossMargin, netMargin,
             isForecast: false, isPartial };
  });

  /* Full confirmed set (no partial current month) */
  const confirmed = hist.filter(m => !m.isPartial);
  if (!confirmed.length) return { historical: hist, forecast: [], meta: {} };

  /* ── Outlier removal on net profit (IQR) ──
     Removes months distorted by one-off accounting events (inventory
     adjustments, negative-price sales corrections, etc.) in BOTH directions.
  ── */
  const outlierSet  = findOutlierMonths(confirmed);
  const cleanMonths = confirmed.filter(m => !outlierSet.has(m.month));
  /* Fall back to full set if cleaning removes too many points */
  const regBase     = cleanMonths.length >= 3 ? cleanMonths : confirmed;

  /* ── Revenue regression source ── */
  const regSrc = scenario === 'optimistic' ? regBase.slice(-3) : regBase;
  const { slope: revSlope, intercept: revBase_ } = linReg(regSrc.map(m => m.revenue));

  /* ── COGS ratio (from clean months or user override) ── */
  let cogsRatio;
  if (customCogs !== null && !isNaN(+customCogs)) {
    cogsRatio = Math.min(1, Math.max(0, +customCogs));
  } else {
    const cogsBase = scenario === 'optimistic' ? regBase.slice(-3) : regBase;
    const r = cogsBase.reduce((s, m) => s + m.revenue, 0);
    const c = cogsBase.reduce((s, m) => s + m.cogs,    0);
    cogsRatio = r > 0 ? c / r : 0;
  }

  /* ── OpEx: median of clean months (robust to spikes) ── */
  const opexSource = regBase.length >= 3 ? regBase.slice(-3) : regBase;
  const avgOpex = Object.fromEntries(
    OPEX_CATS.map(k => {
      const vals = [...opexSource.map(m => m[k] || 0)].sort((a, b) => a - b);
      const mid  = Math.floor(vals.length / 2);
      const med  = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
      return [k, med];
    })
  );

  /* Forecast starts after the last historical entry (incl. partial) */
  const [lastYr, lastMo]    = hist[hist.length - 1].month.split('-').map(Number);
  const lastConfirmedRev     = regBase[regBase.length - 1].revenue;

  /* Revenue floor = median of clean months × 65%
     Prevents the regression from projecting implausibly low revenues
     when all clean months show the business IS viable at current levels. */
  const revsSorted = [...regBase.map(m => m.revenue)].sort((a, b) => a - b);
  const revMedian  = revsSorted.length % 2
    ? revsSorted[Math.floor(revsSorted.length / 2)]
    : (revsSorted[revsSorted.length / 2 - 1] + revsSorted[revsSorted.length / 2]) / 2;
  const revFloor   = revMedian * 0.65;

  /* ── Conservative slope cap ────────────────────────────────────────────────
     When OLS slope is steeply negative every forecast month hits the floor
     and they all become identical — useless for planning.
     Cap: max monthly decline = 3% of average clean revenue.
     Line is re-anchored through the last clean confirmed month so the
     projection starts from real recent data, not the OLS y-intercept.
  ─────────────────────────────────────────────────────────────────────────── */
  const avgCleanRev    = avg(regBase.map(m => m.revenue));
  const consSlope      = Math.max(revSlope, -0.03 * avgCleanRev);
  const consIntercept  = lastConfirmedRev - consSlope * (regBase.length - 1);

  /* ── Generate 6 forecast months ── */
  const PERIODS  = 6;
  const forecast = [];
  for (let i = 1; i <= PERIODS; i++) {
    let yr = lastYr, mo = lastMo + i;
    while (mo > 12) { mo -= 12; yr++; }

    let revenue;
    if (scenario === 'custom') {
      revenue = Math.max(revFloor, lastConfirmedRev * Math.pow(1 + customGrowth / 100, i));
    } else if (scenario === 'optimistic') {
      const idx = regSrc.length - 1 + i;
      revenue   = Math.max(revFloor, revSlope * idx + revBase_);
    } else {
      // Conservative: capped + anchored slope
      const idx = regBase.length - 1 + i;
      revenue   = Math.max(revFloor, consSlope * idx + consIntercept);
    }

    const cogs        = revenue * cogsRatio;
    const grossProfit = revenue - cogs;
    const grossMargin = revenue > 0 ? grossProfit / revenue : 0;
    const opex        = OPEX_CATS.reduce((s, k) => s + avgOpex[k], 0);
    const netProfit   = grossProfit - opex;
    const netMargin   = revenue > 0 ? netProfit / revenue : 0;

    forecast.push({
      month: `${yr}-${String(mo).padStart(2, '0')}`,
      label: AR_MONTHS[mo] + ' ' + String(yr).slice(2),
      revenue, cogs, grossProfit, grossMargin,
      opex, netProfit, netMargin,
      ...avgOpex,
      isForecast: true, isPartial: false,
    });
  }

  /* ── Summary metadata ── */
  const fRev    = avg(forecast.map(m => m.revenue));
  const hRev    = avg(regBase.map(m => m.revenue));
  const fRevSum = forecast.reduce((s, m) => s + m.revenue,   0);
  const fNetSum = forecast.reduce((s, m) => s + m.netProfit, 0);

  /* Collect excluded month labels for UI disclosure */
  const excludedMonths = confirmed
    .filter(m => outlierSet.has(m.month))
    .map(m => m.label);

  return {
    historical: hist,
    forecast,
    meta: {
      scenario,
      histMonths:           hist.length,
      confirmedMonths:      confirmed.length,
      cleanMonths:          regBase.length,
      excludedMonths,
      forecastMonths:       PERIODS,
      avgCogsRatio:         cogsRatio,
      avgGrossMargin:       avg(forecast.map(m => m.grossMargin)),
      avgNetMargin:         avg(forecast.filter(m => m.revenue > 0).map(m => m.netMargin)),
      forecastTotalRevenue: fRevSum,
      forecastTotalNet:     fNetSum,
      revenueGrowthPct:     hRev > 0 ? (fRev - hRev) / hRev : 0,
    },
  };
}

module.exports = { getBudget };
