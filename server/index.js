'use strict';
require('dotenv').config();

const express = require('express');
const helmet  = require('helmet');
const path    = require('path');
const fs      = require('fs');

const { connectAll, getAvailableDbs, getDefaultDb, DB_NAMES, closeAll } = require('./db');
const { addClient, pushToClient, startPolling }               = require('./sse');
const { getDetails, getAccounts, getAssets, getMonthly, getCompanyName } = require('./queries/expenses');
const { getPLMonthly }                                        = require('./queries/pl');
const { getBSMonthly, getBankFacilitiesMonthly }              = require('./queries/bs');
const { getICPLElimination, getICBSElimination }              = require('./queries/consolidation');
const { getPLComparisonData, getAdjDetail }                   = require('./queries/pl-comparison');
const { getTrialBalance, getBranchList }                      = require('./queries/trial-balance');
const { getIncomeStatement, getIncomeStatementTree }           = require('./queries/income-statement');
const { getCashSales }                                         = require('./queries/cash-sales');
const { getBudget }                                            = require('./queries/budget');
const { getCashFlowBudget }                                    = require('./queries/cashflow');
const { getAgingData }                                         = require('./queries/aging');
const { getFixedAssets }                                       = require('./queries/fixed-assets');

const app        = express();
const PORT       = parseInt(process.env.PORT, 10)             || 3001;
const POLL_MS    = parseInt(process.env.POLL_INTERVAL_MS, 10) || 60000;
const START_DATE = process.env.DATA_START_DATE                || '2025-10-01';

// ── Security headers ───────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'", 'https://cdn.jsdelivr.net', "'unsafe-inline'"],
        styleSrc:   ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'"],
        imgSrc:     ["'self'", 'data:'],
        fontSrc:    ["'self'", 'data:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.static(path.join(__dirname, '../public')));

// Validates and resolves the ?db= query param against the whitelist
function resolveDb(query) {
  const req = query.db;
  return (req && DB_NAMES.includes(req)) ? req : getDefaultDb();
}

// ── GET /api/config ────────────────────────────────────────────────────────────
app.get('/api/config', (_req, res) => {
  res.json({
    databases:      DB_NAMES,
    defaultDb:      getDefaultDb(),
    dataStartDate:  START_DATE,
    pollIntervalMs: POLL_MS,
  });
});

// ── GET /api/health ────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ dbs: getAvailableDbs(), uptime: Math.floor(process.uptime()) });
});

// ── GET /api/sse?db= ───────────────────────────────────────────────────────────
app.get('/api/sse', (req, res) => {
  const dbName = resolveDb(req.query);
  const remove = addClient(res, dbName);
  pushToClient(res, dbName, START_DATE).catch(err =>
    console.error('[sse] pushToClient error:', err.message)
  );
  req.on('close', remove);
  res.on('error', remove);
});

// ── GET /api/details ──────────────────────────────────────────────────────────
app.get('/api/details', async (req, res) => {
  const dbName = resolveDb(req.query);
  try {
    const result = await getDetails(dbName, {
      startDate: START_DATE,
      page:      Math.max(1, parseInt(req.query.page, 10)     || 1),
      pageSize:  Math.min(10000, parseInt(req.query.pageSize,10)|| 50),
      cat:       req.query.cat    || '',
      branch:    req.query.branch || '',
      period:    req.query.period || '',
      search:    (req.query.search || '').slice(0, 100),
      sortCol:   req.query.sortCol || '0',
      sortDir:   req.query.sortDir === 'asc' ? 'asc' : 'desc',
    });
    res.json(result);
  } catch (err) {
    console.error('[api/details]', err.message);
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

// ── GET /api/accounts?db=&start=&end= ─────────────────────────────────────────
app.get('/api/accounts', async (req, res) => {
  const dbName = resolveDb(req.query);
  try {
    const start = req.query.start || START_DATE;
    const end   = req.query.end   || null;
    const result = await getAccounts(dbName, start, end);
    res.json(result);
  } catch (err) {
    console.error('[api/accounts]', err.message);
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

// ── GET /api/assets?db=&start=&end= ───────────────────────────────────────────
app.get('/api/assets', async (req, res) => {
  const dbName = resolveDb(req.query);
  try {
    const start = req.query.start || START_DATE;
    const end   = req.query.end   || null;
    const result = await getAssets(dbName, start, end);
    res.json(result);
  } catch (err) {
    console.error('[api/assets]', err.message);
    res.status(500).json({ error: 'query failed', message: err.message });
  }
});

// ── GET /api/verify?db= — fresh ERP data + health checks ─────────────────────
app.get('/api/verify', async (req, res) => {
  const dbName = resolveDb(req.query);
  try {
    const [accounts, plMonths, bsRows, monthlyRaw] = await Promise.all([
      getAccounts(dbName, START_DATE),
      getPLMonthly(dbName, START_DATE),
      getBSMonthly(dbName),
      getMonthly(dbName, START_DATE),
    ]);

    // Aggregate P&L
    const pl = { revenue:0, cogs:0, sal:0, rent:0, maint:0, sell:0, dist:0, adm:0, char:0, fin:0, oth:0 };
    plMonths.forEach(m => { Object.keys(pl).forEach(k => { pl[k] += (m[k] || 0); }); });
    pl.grossProfit = pl.revenue - pl.cogs;
    pl.totalOpex   = pl.sal + pl.rent + pl.maint + pl.sell + pl.dist + pl.adm + pl.char + pl.fin + pl.oth;
    pl.netProfit   = pl.grossProfit - pl.totalOpex;
    pl.months      = plMonths.length;

    // Aggregate monthly expenses by category
    const CAT_KEYS = ['sal','rent','maint','sell','dist','adm','fin','char','oth'];
    const monthly  = Object.fromEntries([...CAT_KEYS, 'total'].map(k => [k, 0]));
    monthlyRaw.forEach(m => {
      CAT_KEYS.forEach(k => { monthly[k] += (m[k] || 0); });
      monthly.total += CAT_KEYS.reduce((s,k) => s + (m[k] || 0), 0);
    });

    // Latest BS
    const bsMonths  = [...new Set(bsRows.map(r => r.month))].sort();
    const lastMonth = bsMonths[bsMonths.length - 1] || null;
    const bsLatest  = lastMonth ? bsRows.filter(r => r.month === lastMonth) : [];
    const totalA    = bsLatest.filter(r => r.grpCode.startsWith('1')).reduce((s,r) => s + r.balance, 0);
    const totalL    = bsLatest.filter(r => r.grpCode.startsWith('2')).reduce((s,r) => s - r.balance, 0);
    const totalE    = bsLatest.filter(r => r.grpCode.startsWith('3')).reduce((s,r) => s - r.balance, 0);
    const bsSum     = bsLatest.reduce((s,r) => s + r.balance, 0); // should ≈ 0

    // Account total
    const accTotal = accounts.reduce((s,a) => s + a.total, 0);

    // ── Health checks ──────────────────────────────────────────────────────────
    const hcs = [];
    const hc  = (id, name, pass, detail) => hcs.push({ id, name, pass, detail });
    const n2  = v => (+v || 0).toLocaleString('ar-SA', { minimumFractionDigits:2, maximumFractionDigits:2 });

    // 1. BS equation: A = L + E + currentNetIncome (income not yet closed to equity)
    //    In open periods, net income sits in 4xx/5xx and hasn't been transferred to equity.
    //    So the expected diff = net profit of the period.
    const bsEquityDiff = totalA - totalL - totalE; // should ≈ pl.netProfit
    const bsEqOk = Math.abs(bsEquityDiff - pl.netProfit) < 1;
    hc('bs_equation',
       'معادلة الميزانية — الأصول = الخصوم + حقوق الملكية + صافي ربح الفترة',
       bsEqOk,
       `الأصول: ${n2(totalA)} | الخصوم: ${n2(totalL)} | حقوق الملكية: ${n2(totalE)} | صافي الربح: ${n2(pl.netProfit)} | الفرق المتبقي: ${n2(bsEquityDiff - pl.netProfit)}`);

    // 2. Monthly expenses ↔ accounts total
    hc('monthly_acc_consistency',
       'توافق المصروفات — الشهري ↔ الحسابات (نفس المصدر، تجميع مختلف)',
       Math.abs(monthly.total - accTotal) < 1,
       `الشهري: ${n2(monthly.total)} | الحسابات: ${n2(accTotal)} | الفرق: ${n2(monthly.total - accTotal)}`);

    // 3. Revenue > 0
    hc('pl_revenue',
       'الإيرادات موجودة في قاعدة البيانات',
       pl.revenue > 0,
       `إجمالي الإيرادات: ${n2(pl.revenue)}`);

    // 4. COGS > 0
    hc('pl_cogs',
       'تكلفة المبيعات موجودة في قاعدة البيانات',
       pl.cogs > 0,
       `إجمالي تكلفة المبيعات: ${n2(pl.cogs)}`);

    // 5. Gross margin positive (basic sanity)
    hc('pl_gross_positive',
       'مجمل الربح موجب (الإيرادات > التكلفة)',
       pl.grossProfit > 0,
       `مجمل الربح: ${n2(pl.grossProfit)}`);

    // 6. BS has equity data
    hc('bs_equity_exists',
       'بيانات حقوق الملكية موجودة (حسابات 3xx)',
       Math.abs(totalE) > 0,
       `حقوق الملكية: ${n2(totalE)}`);

    // 7. Cash balance >= 0
    const cashBal = bsLatest.filter(r => r.grpCode === '10301').reduce((s,r) => s + r.balance, 0);
    hc('cash_non_negative',
       'رصيد النقدية غير سالب',
       cashBal >= 0,
       `رصيد النقدية والبنوك: ${n2(cashBal)}`);

    // 8. Data completeness: check for no-data months
    const expectedMonths = plMonths.length;
    hc('pl_months_complete',
       `اكتمال بيانات قائمة الدخل (${expectedMonths} شهر منذ بداية البيانات)`,
       expectedMonths > 0,
       `عدد الأشهر ذات البيانات: ${expectedMonths}`);

    res.json({
      timestamp: new Date().toISOString(),
      db:        dbName,
      pl,
      monthly,
      accounts:  { total: accTotal, count: accounts.length, items: accounts },
      bs:        { month: lastMonth, totalAssets: totalA, totalLiabilities: totalL, totalEquity: totalE, items: bsLatest },
      healthChecks: hcs,
    });
  } catch (err) {
    console.error('[api/verify]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Intercompany relationship map (IC customer/supplier IDs per DB) ───────────
// When MekSoftDb1 + MekSoftDb2 are consolidated:
//   DB1 (أبعاد): وسام is Customer 109 and Supplier 3
//   DB2 (وسام):  أبعاد is Customer 3   and Supplier 2
const IC_MAP = {
  MekSoftDb1: { icCustomerId: 109, icSupplierId: 3 },
  MekSoftDb2: { icCustomerId: 3,   icSupplierId: 2 },
};

// ── GET /api/consolidated?dbs=db1,db2 ────────────────────────────────────────
app.get('/api/consolidated', async (req, res) => {
  const requested = (req.query.dbs || '').split(',').map(s => s.trim()).filter(Boolean);
  const dbs = requested.filter(d => DB_NAMES.includes(d));
  if (dbs.length < 1)
    return res.status(400).json({ error: 'specify at least one valid db name in ?dbs=' });

  try {
    const results = await Promise.all(dbs.map(async dbName => {
      const [plMonths, bsRows, companyName, moRows, bfRows] = await Promise.all([
        getPLMonthly(dbName, START_DATE),
        getBSMonthly(dbName),
        getCompanyName(dbName),
        getMonthly(dbName, START_DATE),
        getBankFacilitiesMonthly(dbName),
      ]);
      return { db: dbName, name: companyName, pl: plMonths, bs: bsRows, monthly: moRows, bf: bfRows };
    }));

    // Merge P&L by month — sum all keys per month
    const PL_KEYS = ['revenue','cogs','otherCost','sal','rent','maint','sell','dist','adm','fin','char','oth'];
    const plMap = new Map();
    results.forEach(r => {
      r.pl.forEach(m => {
        if (!plMap.has(m.month)) {
          plMap.set(m.month, { month: m.month, label: m.label, ...Object.fromEntries(PL_KEYS.map(k => [k, 0])) });
        }
        const entry = plMap.get(m.month);
        PL_KEYS.forEach(k => { entry[k] += (m[k] || 0); });
      });
    });
    const combinedPL = [...plMap.values()].sort((a, b) => a.month.localeCompare(b.month));

    // Merge BS by (month, grpCode) — sum balances, keep first encountered name
    const bsMap = new Map();
    results.forEach(r => {
      r.bs.forEach(b => {
        const key = `${b.month}|${b.grpCode}`;
        if (bsMap.has(key)) {
          bsMap.get(key).balance += b.balance;
        } else {
          bsMap.set(key, { ...b });
        }
      });
    });
    const combinedBS = [...bsMap.values()]
      .sort((a, b) => a.month.localeCompare(b.month) || a.grpCode.localeCompare(b.grpCode));

    // Merge monthly (management) data — includes full dist/adm (with 4010301001)
    const MO_KEYS = ['sal','rent','maint','sell','dist','adm','fin','char','oth'];
    const moMap = new Map();
    results.forEach(r => {
      (r.monthly || []).forEach(m => {
        if (!moMap.has(m.month)) moMap.set(m.month, { month: m.month, label: m.label, ...Object.fromEntries(MO_KEYS.map(k => [k, 0])) });
        const entry = moMap.get(m.month);
        MO_KEYS.forEach(k => { entry[k] += (m[k] || 0); });
      });
    });
    const combinedMonthly = [...moMap.values()].sort((a, b) => a.month.localeCompare(b.month));

    // Merge bank facilities with carry-forward per DB before summing.
    // getBankFacilitiesMonthly only emits months with journal activity; months with no
    // new entries are absent. When merging across DBs, a month where DB1 is active but
    // DB2 is silent would miss DB2's carried balance. Fix: carry each DB's last known
    // BF balance across ALL BS months, then sum.
    const allBSMonths = [...new Set(results.flatMap(r => r.bs.map(b => b.month)))].sort();
    const bfSumByMonth = new Map(allBSMonths.map(mo => [mo, 0]));
    results.forEach(r => {
      const bfSpot = {};
      (r.bf || []).forEach(m => { bfSpot[m.month] = m.balance; });
      let carried = 0;
      allBSMonths.forEach(mo => {
        if (bfSpot[mo] !== undefined) carried = bfSpot[mo];
        bfSumByMonth.set(mo, bfSumByMonth.get(mo) + carried);
      });
    });
    const combinedBF = allBSMonths.map(mo => ({ month: mo, balance: bfSumByMonth.get(mo) }));

    // ── Intercompany Elimination ──────────────────────────────────────────────
    const canElim = dbs.every(d => IC_MAP[d]);
    let elimination = { applied: false };
    let icAdj = [];

    if (canElim) {
      // Fetch IC P&L and BS elimination data for each DB in parallel
      const icResults = await Promise.all(dbs.map(async dbName => {
        const { icCustomerId, icSupplierId } = IC_MAP[dbName];
        const [icPL, icBS] = await Promise.all([
          getICPLElimination(dbName, START_DATE, icCustomerId),
          getICBSElimination(dbName, icCustomerId, icSupplierId),
        ]);
        return { db: dbName, icPL, icBS };
      }));

      // Build monthly P&L elimination map
      const plElimMap = new Map(); // month → { revenue, cogs }
      icResults.forEach(ic => {
        ic.icPL.forEach(m => {
          if (!plElimMap.has(m.month)) plElimMap.set(m.month, { revenue: 0, cogs: 0 });
          const e = plElimMap.get(m.month);
          e.revenue += m.icRevenue;
          e.cogs    += m.icCOGS;
        });
      });

      // Apply P&L eliminations.
      // Revenue elimination: remove IC sales so group doesn't double-count internal transfers.
      // COGS elimination: adjust by the same IC revenue amount (= the transfer price the buyer
      // paid). Using transfer price rather than seller's cost preserves the seller's IC margin
      // in the group GP — that margin is realised when the buyer sells externally, so it
      // belongs in the consolidated P&L.  Using seller's cost (e.cogs) would eliminate the
      // IC markup from group GP, which is wrong when all IC goods are sold in the same period.
      combinedPL.forEach(m => {
        const e = plElimMap.get(m.month);
        if (e) {
          m.revenue -= e.revenue;
          m.cogs    -= e.revenue;     // use transfer price, not seller cost
          m._icRevenue = e.revenue;   // carry for disclosure
          m._icCOGS    = e.cogs;      // keep original for disclosure card
        }
      });

      // Build monthly BS elimination map using net IC position per company.
      // For each month we accumulate each company's (AR, AP, net) separately,
      // then derive the combined elimination amounts symmetrically:
      //   elimAR = sum of AR balances across all companies (removes IC from assets)
      //   elimAP = sum of AP balances across all companies (removes IC from liabilities)
      //   netGap = |combined AR − combined AP| = true reconciliation gap (should be small)
      const bsElimMap = new Map(); // month → { icAR, icAP }
      icResults.forEach(ic => {
        ic.icBS.forEach(m => {
          if (!bsElimMap.has(m.month)) bsElimMap.set(m.month, { icAR: 0, icAP: 0 });
          const e = bsElimMap.get(m.month);
          e.icAR += m.icARBalance;
          e.icAP += m.icAPBalance;
        });
      });

      // Build icAdj: monthly IC AR/AP with carry-forward across all BS months.
      // getBSMonthly maps all leaf accounts to level-3 ancestors, so combinedBS
      // only contains level-3 grpCodes. bsElimMap only covers months with IC activity;
      // carry-forward fills the gaps so every BS month gets the correct cumulative IC balance.
      {
        let lastAR = 0, lastAP = 0;
        icAdj = allBSMonths.map(mo => {
          const e = bsElimMap.get(mo);
          if (e) { lastAR = e.icAR; lastAP = e.icAP; }
          return { month: mo, icAR: lastAR, icAP: lastAP };
        });
      }

      // Apply BS eliminations at level-3 group codes (the only codes present in combinedBS).
      // 10303 = customers/AR group  → reduce by combined IC receivable (shrinks assets)
      // 20101 = suppliers/AP group  → add back IC payable (shrinks liabilities, balance is credit-normal)
      // Uses icAdj (carry-forward) not bsElimMap so gap months are correctly adjusted.
      {
        const icAdjMap = {};
        icAdj.forEach(r => { icAdjMap[r.month] = r; });
        combinedBS.forEach(b => {
          const ic = icAdjMap[b.month];
          if (!ic) return;
          if (b.grpCode === '10303') b.balance -= ic.icAR;
          if (b.grpCode === '20101') b.balance += ic.icAP;
        });
      }

      // Elimination totals (cumulative over full period)
      const totalRev   = [...plElimMap.values()].reduce((s, e) => s + e.revenue, 0);
      const totalCogs  = [...plElimMap.values()].reduce((s, e) => s + e.cogs,    0);
      const lastMonth  = [...bsElimMap.keys()].sort().pop() || null;
      const lastBsElim = lastMonth ? bsElimMap.get(lastMonth) : { icAR: 0, icAP: 0 };

      // Net IC positions per company (AR − AP) for reconciliation disclosure.
      // For two companies A and B: A's net = A.AR − A.AP, B's net = B.AR − B.AP.
      // If perfectly recorded: A.net + B.net = 0 (they cancel). Residual = reconciliation gap.
      const netByDb = icResults.map(ic => {
        const last = ic.icBS.length ? ic.icBS[ic.icBS.length - 1] : null;
        return {
          db:     ic.db,
          icAR:   last ? last.icARBalance  : 0,
          icAP:   last ? last.icAPBalance  : 0,
          icNet:  last ? last.icNetBalance : 0,
        };
      });
      const combinedNetIC = netByDb.reduce((s, d) => s + d.icNet, 0);  // residual after netting

      elimination = {
        applied:        true,
        totalRevenue:   totalRev,
        totalCOGS:      totalCogs,
        grossProfit:    totalRev - totalCogs,
        latestARElim:   lastBsElim.icAR,
        latestAPElim:   lastBsElim.icAP,
        netGap:         Math.abs(combinedNetIC),   // true IC reconciliation gap (should be ~39K)
        netByDb,
        byDb: icResults.map(ic => ({
          db:         ic.db,
          plMonthly:  ic.icPL,
          bsMonthly:  ic.icBS,
        })),
      };
    }

    res.json({
      dbs,
      companies: results.map(r => ({ db: r.db, name: r.name })),
      pl:             combinedPL,
      bs:             combinedBS,
      monthly:        combinedMonthly,
      bankFacilities: combinedBF,
      byDb:           results.map(r => ({ db: r.db, name: r.name, pl: r.pl, bs: r.bs, monthly: r.monthly })),
      elimination,
      icAdj,
    });
  } catch (err) {
    console.error('[api/consolidated]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── P&L Comparison (Perpetual vs Periodic) ─────────────────────────────────────
app.get('/api/pl-comparison', async (req, res) => {
  const dbName = req.query.db;
  const valid  = (process.env.DB1_NAME||'MekSoftDb1') + ',' +
                 (process.env.DB2_NAME||'MekSoftDb2') + ',' +
                 (process.env.DB3_NAME||'MekSoftDb3');
  if (!dbName || !valid.split(',').includes(dbName)) {
    return res.status(400).json({ error: 'db param required (MekSoftDb1|2|3)' });
  }
  try {
    const data = await getPLComparisonData(dbName);
    res.json(data);
  } catch (err) {
    console.error('[api/pl-comparison]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/trial-balance ────────────────────────────────────────────────────
app.get('/api/trial-balance', async (req, res) => {
  const dbName = resolveDb(req.query);
  const from     = req.query.from     || null;
  const to       = req.query.to       || null;
  const branch   = parseInt(req.query.branch, 10) || 0;
  const rootCode = (req.query.rootCode || '').replace(/[^0-9]/g, '').slice(0, 20);

  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
    return res.status(400).json({ error: 'from and to must be YYYY-MM-DD' });

  try {
    const rows = await getTrialBalance(dbName, { from, to, branch, rootCode });
    res.json(rows);
  } catch (err) {
    console.error('[api/trial-balance]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/branches?db= — branch list for dropdowns ────────────────────────
app.get('/api/branches', async (req, res) => {
  const dbName = resolveDb(req.query);
  try {
    const rows = await getBranchList(dbName);
    res.json(rows);
  } catch (err) {
    console.error('[api/branches]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/income-statement ──────────────────────────────────────────────────
app.get('/api/income-statement', async (req, res) => {
  const { from, to, level, branch, rootCode } = req.query;
  const dbName = resolveDb(req.query);
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
    return res.status(400).json({ error: 'from and to required as YYYY-MM-DD' });
  const lvl = parseInt(level, 10);
  if (isNaN(lvl) || lvl < 1 || lvl > 9)
    return res.status(400).json({ error: 'level must be 1–9' });
  const rcode = (rootCode || '').replace(/[^0-9]/g, '').substring(0, 20);
  try {
    const rows = await getIncomeStatement(dbName, {
      from, to,
      level:    lvl,
      branch:   parseInt(branch, 10) || 0,
      rootCode: rcode,
    });
    res.json(rows);
  } catch (err) {
    console.error('[api/income-statement]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/income-statement-tree ────────────────────────────────────────────
app.get('/api/income-statement-tree', async (req, res) => {
  const { from, to, branch } = req.query;
  const dbName = resolveDb(req.query);
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
    return res.status(400).json({ error: 'from and to required as YYYY-MM-DD' });
  try {
    const rows = await getIncomeStatementTree(dbName, {
      from, to, branch: parseInt(branch, 10) || 0,
    });
    res.json(rows);
  } catch (err) {
    console.error('[api/income-statement-tree]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/company-name?db= ─────────────────────────────────────────────────
app.get('/api/company-name', async (req, res) => {
  const dbName = resolveDb(req.query);
  try {
    const name = await getCompanyName(dbName);
    res.json({ db: dbName, name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/cash-sales?db=&from=&to= ─────────────────────────────────────────
app.get('/api/cash-sales', async (req, res) => {
  const dbName = resolveDb(req.query);
  const from   = req.query.from || START_DATE;
  const to     = req.query.to   || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
    return res.status(400).json({ error: 'from and to must be YYYY-MM-DD' });
  try {
    const data = await getCashSales(dbName, { from, to });
    res.json(data);
  } catch (err) {
    console.error('[api/cash-sales]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/budget?db=&scenario=conservative|optimistic|custom&growth=3&cogs=0.88 ──
app.get('/api/budget', async (req, res) => {
  const dbName   = resolveDb(req.query);
  const SCENARIOS = ['conservative', 'optimistic', 'custom'];
  const scenario  = SCENARIOS.includes(req.query.scenario) ? req.query.scenario : 'conservative';
  const customGrowth = parseFloat(req.query.growth) || 0;
  const customCogs   = req.query.cogs != null && req.query.cogs !== ''
                       ? parseFloat(req.query.cogs) : null;
  try {
    const data = await getBudget(dbName, START_DATE, { scenario, customGrowth, customCogs });
    res.json(data);
  } catch (err) {
    console.error('[api/budget]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/aging?db=&asOf=YYYY-MM-DD ────────────────────────────────────────
app.get('/api/aging', async (req, res) => {
  const dbName  = resolveDb(req.query);
  const asOf    = /^\d{4}-\d{2}-\d{2}$/.test(req.query.asOf || '')
    ? req.query.asOf
    : new Date().toISOString().slice(0, 10);
  try {
    const data = await getAgingData(dbName, asOf);
    res.json(data);
  } catch (err) {
    console.error('[api/aging]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/fixed-assets?db= ─────────────────────────────────────────────────
app.get('/api/fixed-assets', async (req, res) => {
  const dbName = resolveDb(req.query);
  try {
    const data = await getFixedAssets(dbName);
    res.json(data);
  } catch (err) {
    console.error('[api/fixed-assets]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/cashflow?db=&scenario=&growth=&cogs= ──────────────────────────────
app.get('/api/cashflow', async (req, res) => {
  const dbName   = resolveDb(req.query);
  const SCENARIOS = ['conservative', 'optimistic', 'custom'];
  const scenario  = SCENARIOS.includes(req.query.scenario) ? req.query.scenario : 'conservative';
  const customGrowth = parseFloat(req.query.growth) || 0;
  const customCogs   = req.query.cogs != null && req.query.cogs !== ''
                       ? parseFloat(req.query.cogs) : null;
  try {
    const data = await getCashFlowBudget(dbName, START_DATE, { scenario, customGrowth, customCogs });
    res.json(data);
  } catch (err) {
    console.error('[api/cashflow]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── P&L Adj Detail (breakdown of تسويات وإضافات أخرى) ─────────────────────────
app.get('/api/pl-adj-detail', async (req, res) => {
  const { db, from, to } = req.query;
  const valid = (process.env.DB1_NAME||'MekSoftDb1') + ',' +
                (process.env.DB2_NAME||'MekSoftDb2') + ',' +
                (process.env.DB3_NAME||'MekSoftDb3');
  if (!db || !valid.split(',').includes(db)) return res.status(400).json({ error: 'db required' });
  if (!from || !to || !/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to))
    return res.status(400).json({ error: 'from and to must be YYYY-MM' });
  try {
    const data = await getAdjDetail(db, from, to);
    res.json(data);
  } catch (err) {
    console.error('[api/pl-adj-detail]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────────
async function start() {
  console.log('[app] connecting to databases …');
  await connectAll();

  app.listen(PORT, () => {
    console.log(`[app] expenses-dashboard → http://localhost:${PORT}`);
    console.log(`[app] polling every ${POLL_MS / 1000}s  |  data from ${START_DATE}`);
  });

  startPolling(START_DATE, POLL_MS);
}

function shutdown() {
  console.log('[app] shutting down…');
  closeAll().finally(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

// ── Coils analysis file watcher ────────────────────────────────────────────────
(function watchCoilsFile() {
  const SRC  = path.join(require('os').homedir(), 'Desktop', 'coils-analysis-2026.html');
  const DEST = path.join(__dirname, '..', 'public', 'coils-analysis-2026.html');
  if (!fs.existsSync(SRC)) return;
  let debounce;
  fs.watch(SRC, () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      try {
        fs.copyFileSync(SRC, DEST);
        console.log('[coils-sync] coils-analysis-2026.html synced to public/');
      } catch (e) {
        console.error('[coils-sync] copy failed:', e.message);
      }
    }, 300);
  });
  console.log('[coils-sync] watching', SRC);
})();

start().catch(err => {
  console.error('[app] fatal startup error:', err.message);
  process.exit(1);
});
