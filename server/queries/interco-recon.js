'use strict';
const { getPool } = require('../db');

const DB1 = process.env.DB1_NAME || 'MekSoftDb1';
const DB2 = process.env.DB2_NAME || 'MekSoftDb2';

// Four accounts — not two companies. Confirmed via name-pattern inventory search
// (no 5th/duplicate/dormant account exists for either VAT). Do not net customer
// against supplier as a matching method — that hid two ~22M offsetting deviations
// behind a 688,908 residual. See docs/spec_intercompany_tab_v2.md for the full
// investigation that established this.
const WISSAM_VATNO   = '300925211200003';
const ABAAD_VATNO    = '311128368400003';
const DB1_CUST_WISSAM = 109; // وسام كعميل لدى أبعاد
const DB1_SUPP_WISSAM = 3;   // وسام كمورد لدى أبعاد
const DB2_CUST_ABAAD  = 3;   // أبعاد كعميل لدى وسام
const DB2_SUPP_ABAAD  = 2;   // أبعاد كمورد لدى وسام

const AMT_TOL = 0.05; // SAR
const DAY_TOL = 7;

// Category-3 (شared operational cost) vocabulary — established from reading all
// 263 manual-journal lines by hand; covers ~95% of that population.
const CAT3_RX = /رواتب|راتب|تأمين|تامين|كفال|اقام|إقام|ديزل|صيان|عهدة|عهده|كفوف|مياه|كهرباء|انترنت|اشتراك|رخص|مخالف|بدل|اضافي|فطور|طباعة|حبر|قرطاسية|نظاف|بلدية|غرفة تجارية|ابشر|تم المرور|سلفة|مديونية|ايجار|إيجار|عقد/;
// Category-4 (owner personal draws) — narrow on purpose; anything not matching
// this AND not matching CAT3 falls to category 5 (third-party / posting errors).
const CAT4_RX = /بيت علي|قرض بيت|تمويل بيت|مسحوبات شخصية|سحب شخصي/;

function _dateStr(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}
function _normRef(r) {
  if (r == null) return null;
  const s = String(r).trim().replace(/^0+(?=\d)/, '');
  return s === '' ? null : s;
}

// ── Doc-type CASE fragment, shared by every account query ───────────────────
// Precedence (see plan item R): invoice/return link tables win first, then
// receipt/payment vouchers, and ONLY rows matching neither are "manual" —
// every row lands in exactly one bucket, checked in this fixed order.
const DOC_TYPE_CASE = `
  CASE
    WHEN EXISTS (SELECT 1 FROM SalesInvoice_JournalVoucherHeader x WHERE x.JournalVoucherHeaderID=jd.HeaderID) THEN 'inv'
    WHEN EXISTS (SELECT 1 FROM SalesCreditNote_JournalVoucherHeader x WHERE x.JournalVoucherHeaderID=jd.HeaderID) THEN 'inv'
    WHEN EXISTS (SELECT 1 FROM SalesDebitNote_JournalVoucherHeader x WHERE x.JournalVoucherHeaderID=jd.HeaderID) THEN 'inv'
    WHEN EXISTS (SELECT 1 FROM SalesReturn_JournalVoucherHeader x WHERE x.JournalVoucherHeaderID=jd.HeaderID) THEN 'ret'
    WHEN EXISTS (SELECT 1 FROM PurchaseInvoice_JournalVoucherHeader x WHERE x.JournalVoucherHeaderID=jd.HeaderID) THEN 'inv'
    WHEN EXISTS (SELECT 1 FROM PurchaseCreditNote_JournalVoucherHeader x WHERE x.JournalVoucherHeaderID=jd.HeaderID) THEN 'inv'
    WHEN EXISTS (SELECT 1 FROM PurchaseDebitNote_JournalVoucherHeader x WHERE x.JournalVoucherHeaderID=jd.HeaderID) THEN 'inv'
    WHEN EXISTS (SELECT 1 FROM PurchaseReturn_JournalVoucherHeader x WHERE x.JournalVoucherHeaderID=jd.HeaderID) THEN 'ret'
    WHEN EXISTS (SELECT 1 FROM ReceiptVoucher_JournalVoucherHeader x WHERE x.JournalVoucherHeaderID=jd.HeaderID) THEN 'cash'
    WHEN EXISTS (SELECT 1 FROM Paymentvoucher_JournalVoucherHeader x WHERE x.JournalVoucherHeaderID=jd.HeaderID) THEN 'cash'
    ELSE 'manual'
  END`;

function _accountQuery(chartSQL, partyCol, partyId, from) {
  return `
    SELECT jvh.ID AS headerId, CAST(jvh.TransactionDate AS DATE) AS txDate,
           jd.Debit, jd.Credit, jd.Description AS lineDesc, jvh.Description AS hdrDesc,
           ${DOC_TYPE_CASE} AS docType
    FROM JournalVoucherDetail jd
    JOIN JournalVoucherHeader jvh ON jvh.ID = jd.HeaderID
    WHERE jd.AccountChart ${chartSQL} AND jd.${partyCol} = ${partyId}
      AND CAST(jvh.TransactionDate AS DATE) >= '${from}'
  `;
}

function _ageDays(txDate, asOf) {
  return Math.floor((new Date(asOf) - new Date(txDate)) / 86400000);
}

// Amount-only match, no date window — used for RETURNS in Memo 2 (see plan
// control 2/3), which can mirror with a long lag or never at all. Time-boxing
// them like trade invoices would hide genuinely orphaned entries behind a
// false "outside tolerance" read. Populations here are tiny (a handful of
// returns per period), so O(n*m) is fine.
function _matchUnrestricted(sideA, sideB) {
  const usedB = new Set();
  const aOnly = [];
  const matched = [];
  for (const a of sideA) {
    const i = sideB.findIndex((b, idx) => !usedB.has(idx) && Math.abs(a.amount - b.amount) <= AMT_TOL);
    if (i >= 0) { usedB.add(i); matched.push({ a, b: sideB[i] }); }
    else aOnly.push(a);
  }
  const bOnly = sideB.filter((_, idx) => !usedB.has(idx));
  return { aOnly, bOnly, matched };
}

function _classifyManual(row) {
  const text = `${row.lineDesc || ''} ${row.hdrDesc || ''}`;
  if (CAT4_RX.test(text)) return 'ownerDraw';
  if (CAT3_RX.test(text)) return 'sharedCost';
  return 'thirdPartyOrError';
}

// Greedy nearest-date matcher shared by trade and cash layers.
// tierFn(a,b) returns 'confirmed' | 'probable' | null, checked in that order.
function _match(sideA, sideB, tierFn) {
  const usedB = new Set();
  const rows = [];
  for (const a of sideA) {
    let best = -1, bestDays = Infinity, bestTier = null;
    for (let i = 0; i < sideB.length; i++) {
      if (usedB.has(i)) continue;
      const b = sideB[i];
      if (Math.abs(a.amount - b.amount) > AMT_TOL) continue;
      const dd = Math.abs(new Date(a.txDate) - new Date(b.txDate)) / 86400000;
      if (dd > DAY_TOL) continue;
      const tier = tierFn(a, b);
      if (!tier) continue;
      if (dd < bestDays) { bestDays = dd; best = i; bestTier = tier; }
    }
    if (best >= 0) {
      const b = sideB[best];
      usedB.add(best);
      rows.push({ ...a, matchTier: bestTier, matchedWith: b, status: 'matched' });
    } else {
      rows.push({ ...a, matchTier: null, matchedWith: null, status: 'aonly' });
    }
  }
  const bonly = sideB.filter((_, i) => !usedB.has(i)).map(b => ({ ...b, matchTier: null, matchedWith: null, status: 'bonly' }));
  return [...rows, ...bonly];
}

async function getIntercoRecon(from) {
  const [pool1, pool2] = await Promise.all([getPool(DB1), getPool(DB2)]);

  // ── Account balances (opening/period/closing) — the rollforward that proved
  // the mirror is clean at opening (1,000,000↔1,000,000, 0↔0) and the whole
  // deviation is generated within [from, now]. ─────────────────────────────
  const balQuery = (chartSQL, partyCol, partyId, sign) => `
    SELECT
      ROUND(SUM(CASE WHEN CAST(jvh.TransactionDate AS DATE) < '${from}' THEN ${sign} ELSE 0 END),2) AS opening,
      ROUND(SUM(CASE WHEN CAST(jvh.TransactionDate AS DATE) >= '${from}' THEN jd.Debit ELSE 0 END),2) AS periodDebit,
      ROUND(SUM(CASE WHEN CAST(jvh.TransactionDate AS DATE) >= '${from}' THEN jd.Credit ELSE 0 END),2) AS periodCredit,
      ROUND(SUM(${sign}),2) AS closing,
      COUNT(*) AS lineCount
    FROM JournalVoucherDetail jd
    JOIN JournalVoucherHeader jvh ON jvh.ID = jd.HeaderID
    WHERE jd.AccountChart ${chartSQL} AND jd.${partyCol} = ${partyId}
  `;

  const [b1c, b1s, b2c, b2s] = await Promise.all([
    pool1.request().query(balQuery('=47', 'Customer', DB1_CUST_WISSAM, 'jd.Debit-jd.Credit')),
    pool1.request().query(balQuery('IN (77,78)', 'Supplier', DB1_SUPP_WISSAM, 'jd.Credit-jd.Debit')),
    pool2.request().query(balQuery('=47', 'Customer', DB2_CUST_ABAAD, 'jd.Debit-jd.Credit')),
    pool2.request().query(balQuery('IN (77,78)', 'Supplier', DB2_SUPP_ABAAD, 'jd.Credit-jd.Debit')),
  ]);
  const accounts = {
    db1Cust: { label: 'وسام عميل / أبعاد', ...b1c.recordset[0] },
    db1Supp: { label: 'وسام مورد / أبعاد', ...b1s.recordset[0] },
    db2Cust: { label: 'أبعاد عميل / وسام', ...b2c.recordset[0] },
    db2Supp: { label: 'أبعاد مورد / وسام', ...b2s.recordset[0] },
  };

  // ── Tagged rows per account (drives categories 2–5; category 1 fetched
  // separately below with the extra fields — Refrence, linked invoice —
  // that trade matching needs) ─────────────────────────────────────────────
  const [t1c, t1s, t2c, t2s] = await Promise.all([
    pool1.request().query(_accountQuery('=47', 'Customer', DB1_CUST_WISSAM, from)),
    pool1.request().query(_accountQuery('IN (77,78)', 'Supplier', DB1_SUPP_WISSAM, from)),
    pool2.request().query(_accountQuery('=47', 'Customer', DB2_CUST_ABAAD, from)),
    pool2.request().query(_accountQuery('IN (77,78)', 'Supplier', DB2_SUPP_ABAAD, from)),
  ]);
  const allTagged = [
    ...t1c.recordset.map(r => ({ ...r, book: 'db1', account: 'db1Cust' })),
    ...t1s.recordset.map(r => ({ ...r, book: 'db1', account: 'db1Supp' })),
    ...t2c.recordset.map(r => ({ ...r, book: 'db2', account: 'db2Cust' })),
    ...t2s.recordset.map(r => ({ ...r, book: 'db2', account: 'db2Supp' })),
  ];

  // ── Closure control (plan item Q) — computed before anything else renders.
  const totalTurnoverAmount = allTagged.reduce((s, r) => s + Math.abs(r.Debit) + Math.abs(r.Credit), 0);
  const totalTurnoverCount  = allTagged.length;

  // ── Category 2 — نقد بيني: pool cash-tagged rows per book, match across
  // the pool (not account-pair-restricted — أبعاد routes IC cash through one
  // account, وسام splits it across two, so pair-matching always fails). ────
  const cashDb1 = allTagged.filter(r => r.book === 'db1' && r.docType === 'cash')
    .map(r => ({ txDate: _dateStr(r.txDate), amount: parseFloat((r.Debit - r.Credit).toFixed(2)), lineDesc: r.lineDesc, hdrDesc: r.hdrDesc, account: r.account }));
  const cashDb2 = allTagged.filter(r => r.book === 'db2' && r.docType === 'cash')
    .map(r => ({ txDate: _dateStr(r.txDate), amount: parseFloat((r.Credit - r.Debit).toFixed(2)), lineDesc: r.lineDesc, hdrDesc: r.hdrDesc, account: r.account }));
  // Sign convention: db1 amount = أبعاد's net outflow to وسام for that line;
  // db2 amount = وسام's net inflow from أبعاد. A real transfer has db1.amount ≈ db2.amount.
  const cashMatch = _match(cashDb1, cashDb2, (a, b) => Math.abs(a.amount - b.amount) <= AMT_TOL ? 'confirmed' : null);
  const cashMatched   = cashMatch.filter(r => r.status === 'matched');
  const cashUnmatched = cashMatch.filter(r => r.status !== 'matched');
  const cashCategory = {
    // NOTE: count is the true source-line count (both sides), not
    // cashMatch.length — _match() merges each matched pair into one display
    // row, so cashMatch.length would silently undercount by the match count
    // and make the Q closure control fire red even when nothing is wrong.
    count: cashDb1.length + cashDb2.length,
    matchedCount: cashMatched.length,
    unmatchedCount: cashUnmatched.length,
    total: cashDb1.reduce((s, r) => s + Math.abs(r.amount), 0) + cashDb2.reduce((s, r) => s + Math.abs(r.amount), 0),
    transactions: cashMatch,
  };

  // ── Category 3/4/5 — manual-only rows, classified by description text
  // (plan item R: only rows with NO link-table match reach this step). ─────
  const manualRows = allTagged.filter(r => r.docType === 'manual')
    .map(r => ({ txDate: _dateStr(r.txDate), amount: parseFloat((r.Debit - r.Credit).toFixed(2)), lineDesc: r.lineDesc, hdrDesc: r.hdrDesc, account: r.account, book: r.book }));
  const sharedCostRows    = manualRows.filter(r => _classifyManual(r) === 'sharedCost');
  const ownerDrawRows     = manualRows.filter(r => _classifyManual(r) === 'ownerDraw');
  const thirdPartyRows    = manualRows.filter(r => _classifyManual(r) === 'thirdPartyOrError');
  const sumAbs = arr => arr.reduce((s, r) => s + Math.abs(r.amount), 0);

  const asnRx = /ASN|اماراتي|الامارات/i;
  const asnTable = thirdPartyRows.filter(r => asnRx.test(`${r.lineDesc || ''} ${r.hdrDesc || ''}`));

  // ── Category 1 — تجاري بيني: directional trade matching (goods flow has a
  // direction, unlike cash — dirA and dirB stay separate pairs on purpose). ──
  // Kept deliberately simple (separate inv/ret fetches unioned in JS) rather
  // than one mega-query — this mirrors the exact queries already validated
  // live earlier in the investigation, so the numbers are known-correct.
  const [d1SalesInv, d2PurchInv, d2SalesInv, d1PurchInv, d1SalesRet, d2PurchRet, d2SalesRet, d1PurchRet] = await Promise.all([
    pool1.request().query(`
      SELECT sih.ID AS docId, CAST(sih.TransactionDate AS DATE) AS txDate, sih.ManualID AS ref,
             ROUND(SUM(jd.Debit),2) AS amount
      FROM SalesInvoice_JournalVoucherHeader lnk
      JOIN JournalVoucherHeader jvh ON jvh.ID = lnk.JournalVoucherHeaderID
      JOIN JournalVoucherDetail jd  ON jd.HeaderID = jvh.ID
      JOIN SalesInvoiceHeader sih   ON sih.ID = lnk.SalesInvoiceHeaderID
      WHERE jd.AccountChart = 47 AND sih.Customer = ${DB1_CUST_WISSAM}
        AND CAST(sih.TransactionDate AS DATE) >= '${from}'
      GROUP BY sih.ID, sih.ManualID, sih.TransactionDate HAVING SUM(jd.Debit) > 0
    `),
    pool2.request().query(`
      SELECT pih.ID AS docId, CAST(pih.TransactionDate AS DATE) AS txDate, pih.Refrence AS ref,
             ROUND(SUM(jd.Credit-jd.Debit),2) AS amount
      FROM PurchaseInvoice_JournalVoucherHeader lnk
      JOIN JournalVoucherHeader jvh ON jvh.ID = lnk.JournalVoucherHeaderID
      JOIN JournalVoucherDetail jd  ON jd.HeaderID = jvh.ID
      JOIN PurchaseInvoiceHeader pih ON pih.ID = lnk.PurchaseInvoiceHeaderID
      WHERE jd.AccountChart IN (77,78) AND pih.Supplier = ${DB2_SUPP_ABAAD}
        AND CAST(pih.TransactionDate AS DATE) >= '${from}'
      GROUP BY pih.ID, pih.Refrence, pih.TransactionDate HAVING SUM(jd.Credit-jd.Debit) > 0
    `),
    pool2.request().query(`
      SELECT sih.ID AS docId, CAST(sih.TransactionDate AS DATE) AS txDate, sih.ManualID AS ref,
             ROUND(SUM(jd.Debit),2) AS amount
      FROM SalesInvoice_JournalVoucherHeader lnk
      JOIN JournalVoucherHeader jvh ON jvh.ID = lnk.JournalVoucherHeaderID
      JOIN JournalVoucherDetail jd  ON jd.HeaderID = jvh.ID
      JOIN SalesInvoiceHeader sih   ON sih.ID = lnk.SalesInvoiceHeaderID
      WHERE jd.AccountChart = 47 AND sih.Customer = ${DB2_CUST_ABAAD}
        AND CAST(sih.TransactionDate AS DATE) >= '${from}'
      GROUP BY sih.ID, sih.ManualID, sih.TransactionDate HAVING SUM(jd.Debit) > 0
    `),
    pool1.request().query(`
      SELECT pih.ID AS docId, CAST(pih.TransactionDate AS DATE) AS txDate, pih.Refrence AS ref,
             ROUND(SUM(jd.Credit-jd.Debit),2) AS amount
      FROM PurchaseInvoice_JournalVoucherHeader lnk
      JOIN JournalVoucherHeader jvh ON jvh.ID = lnk.JournalVoucherHeaderID
      JOIN JournalVoucherDetail jd  ON jd.HeaderID = jvh.ID
      JOIN PurchaseInvoiceHeader pih ON pih.ID = lnk.PurchaseInvoiceHeaderID
      WHERE jd.AccountChart IN (77,78) AND pih.Supplier = ${DB1_SUPP_WISSAM}
        AND CAST(pih.TransactionDate AS DATE) >= '${from}'
      GROUP BY pih.ID, pih.Refrence, pih.TransactionDate HAVING SUM(jd.Credit-jd.Debit) > 0
    `),
    pool1.request().query(`
      SELECT srh.ID AS docId, CAST(jvh.TransactionDate AS DATE) AS txDate, srh.SalesInvoiceId,
             ROUND(SUM(jd.Credit),2) AS amount
      FROM SalesReturn_JournalVoucherHeader lnk
      JOIN JournalVoucherHeader jvh ON jvh.ID = lnk.JournalVoucherHeaderID
      JOIN JournalVoucherDetail jd  ON jd.HeaderID = jvh.ID
      JOIN SalesReturnHeader srh    ON srh.ID = lnk.SalesReturnHeaderID
      WHERE jd.AccountChart = 47 AND jd.Customer = ${DB1_CUST_WISSAM}
        AND CAST(jvh.TransactionDate AS DATE) >= '${from}'
      GROUP BY srh.ID, srh.SalesInvoiceId, jvh.TransactionDate
    `),
    pool2.request().query(`
      SELECT CAST(jvh.TransactionDate AS DATE) AS txDate, ROUND(SUM(jd.Debit),2) AS amount
      FROM PurchaseReturn_JournalVoucherHeader lnk
      JOIN JournalVoucherHeader jvh ON jvh.ID = lnk.JournalVoucherHeaderID
      JOIN JournalVoucherDetail jd  ON jd.HeaderID = jvh.ID
      WHERE jd.AccountChart IN (77,78) AND jd.Supplier = ${DB2_SUPP_ABAAD}
        AND CAST(jvh.TransactionDate AS DATE) >= '${from}'
      GROUP BY jvh.ID, jvh.TransactionDate
    `),
    pool2.request().query(`
      SELECT CAST(jvh.TransactionDate AS DATE) AS txDate, ROUND(SUM(jd.Credit),2) AS amount
      FROM SalesReturn_JournalVoucherHeader lnk
      JOIN JournalVoucherHeader jvh ON jvh.ID = lnk.JournalVoucherHeaderID
      JOIN JournalVoucherDetail jd  ON jd.HeaderID = jvh.ID
      WHERE jd.AccountChart = 47 AND jd.Customer = ${DB2_CUST_ABAAD}
        AND CAST(jvh.TransactionDate AS DATE) >= '${from}'
      GROUP BY jvh.ID, jvh.TransactionDate
    `),
    pool1.request().query(`
      SELECT CAST(jvh.TransactionDate AS DATE) AS txDate, ROUND(SUM(jd.Debit),2) AS amount
      FROM PurchaseReturn_JournalVoucherHeader lnk
      JOIN JournalVoucherHeader jvh ON jvh.ID = lnk.JournalVoucherHeaderID
      JOIN JournalVoucherDetail jd  ON jd.HeaderID = jvh.ID
      WHERE jd.AccountChart IN (77,78) AND jd.Supplier = ${DB1_SUPP_WISSAM}
        AND CAST(jvh.TransactionDate AS DATE) >= '${from}'
      GROUP BY jvh.ID, jvh.TransactionDate
    `),
  ]);

  // Returns are folded into the same matching pool as invoices, signed
  // negative — this is what lets category 1's matched/unmatched counts
  // actually include returns, instead of only counting them in the closure
  // total while leaving them invisible in the displayed transaction list.
  const mk = (recordset, refField, sign = 1) => recordset.map(r => ({
    txDate: _dateStr(r.txDate), amount: parseFloat((r.amount * sign).toFixed(2)), ref: refField ? _normRef(r[refField]) : null,
    docId: r.docId != null ? r.docId : null, // fallback identifier when ref is the placeholder 'افتراضي'/'1'
  }));
  const dirA_sideA = [...mk(d1SalesInv.recordset, 'ref'), ...mk(d1SalesRet.recordset, null, -1)];
  const dirA_sideB = [...mk(d2PurchInv.recordset, 'ref'), ...mk(d2PurchRet.recordset, null, -1)];
  const dirB_sideA = [...mk(d2SalesInv.recordset, 'ref'), ...mk(d2SalesRet.recordset, null, -1)];
  const dirB_sideB = [...mk(d1PurchInv.recordset, 'ref'), ...mk(d1PurchRet.recordset, null, -1)];

  // Tier: 'confirmed' when the buyer's Refrence carries the seller's own
  // SalesInvoiceHeader.ID (confirmed real pattern, ~4% coverage one direction,
  // ~82% the other — never blended into one number, see accounts below).
  const tradeTier = (a, b) => {
    if (a.ref && b.ref && a.ref === b.ref && Math.abs(a.amount - b.amount) <= AMT_TOL) return 'confirmed';
    if (Math.abs(a.amount - b.amount) <= AMT_TOL) return 'probable';
    return null;
  };
  const dirA = _match(dirA_sideA, dirA_sideB, tradeTier);
  const dirB = _match(dirB_sideA, dirB_sideB, tradeTier);

  const refCoverage = (sideRecordset) => {
    const total = sideRecordset.length;
    const withRef = sideRecordset.filter(r => r.ref && r.ref !== '1').length;
    return { total, withRef, pct: total ? +(withRef / total * 100).toFixed(1) : 0 };
  };
  const tradeCoverage = {
    dirA: refCoverage(dirA_sideB), // بائع أبعاد / مشتري وسام — الطرف الذي قد يحمل المرجع هو وسام (المشتري)
    dirB: refCoverage(dirB_sideB), // بائع وسام / مشتري أبعاد — الطرف الذي قد يحمل المرجع هو أبعاد (المشتري)
  };

  // ── O/S: full-cancellation sales returns with no mirrored purchase return.
  // "Full cancellation" = return amount ≈ the original invoice's own amount.
  const salesInvAmounts = new Map();
  d1SalesInv.recordset.forEach(r => salesInvAmounts.set(r.docId, r.amount));
  const purchInvRowsB2 = d2PurchInv.recordset.map(r => ({ txDate: _dateStr(r.txDate), amount: r.amount }));
  const purchRetRowsB2 = d2PurchRet.recordset.map(r => ({ txDate: _dateStr(r.txDate), amount: r.amount }));

  const cancelledNoMirror = [];
  for (const ret of d1SalesRet.recordset) {
    const origAmt = salesInvAmounts.get(ret.SalesInvoiceId);
    if (origAmt == null) continue;
    const isFullCancellation = Math.abs(ret.amount - origAmt) <= 1;
    if (!isFullCancellation) continue;
    const retDate = _dateStr(ret.txDate);
    const hasMirrorReturn = purchRetRowsB2.some(r => Math.abs(r.amount - ret.amount) <= AMT_TOL && Math.abs(new Date(r.txDate) - new Date(retDate)) / 86400000 <= 14);
    if (hasMirrorReturn) continue;
    const matchingPurchInv = purchInvRowsB2.find(r => Math.abs(r.amount - origAmt) <= AMT_TOL);
    cancelledNoMirror.push({
      salesInvoiceId: ret.SalesInvoiceId, amount: origAmt, returnDate: retDate,
      matchedDb2PurchaseInvoiceDate: matchingPurchInv ? matchingPurchInv.txDate : null,
      hasMirror: false,
    });
  }

  // ── S: input VAT on the cancelled-invoice population, where a matching
  // DB2 purchase invoice could be identified. Amounts here (chart 47) are
  // VAT-INCLUSIVE — same journal entry that posts the gross AR/AP debit also
  // carries the separate VAT line (chart 88/64); the figure below is pulled
  // directly from chart 64 (input VAT), not derived from the gross amount.
  let cancelledInvoiceVat = [];
  if (cancelledNoMirror.length) {
    const dates = cancelledNoMirror.map(c => c.matchedDb2PurchaseInvoiceDate).filter(Boolean);
    if (dates.length) {
      const vatRows = await pool2.request().query(`
        SELECT pih.ID AS docId, CAST(pih.TransactionDate AS DATE) AS txDate,
               ROUND(SUM(jd.Debit),2) AS inputVat, ROUND(SUM(jdAll.Credit-jdAll.Debit),2) AS grossAmount
        FROM PurchaseInvoice_JournalVoucherHeader lnk
        JOIN JournalVoucherHeader jvh ON jvh.ID = lnk.JournalVoucherHeaderID
        JOIN JournalVoucherDetail jd ON jd.HeaderID = jvh.ID AND jd.AccountChart = 64
        JOIN JournalVoucherDetail jdAll ON jdAll.HeaderID = jvh.ID AND jdAll.AccountChart IN (77,78) AND jdAll.Supplier = ${DB2_SUPP_ABAAD}
        JOIN PurchaseInvoiceHeader pih ON pih.ID = lnk.PurchaseInvoiceHeaderID
        WHERE pih.Supplier = ${DB2_SUPP_ABAAD}
          AND CAST(pih.TransactionDate AS DATE) >= '${from}'
        GROUP BY pih.ID, pih.TransactionDate
      `);
      cancelledInvoiceVat = cancelledNoMirror.map(c => {
        const match = vatRows.recordset.find(v => Math.abs(v.grossAmount - c.amount) <= AMT_TOL && v.txDate.toISOString().slice(0,10) === c.matchedDb2PurchaseInvoiceDate);
        return { ...c, inputVat: match ? match.inputVat : null, note: match ? null : 'لم يُعثر على قيد ضريبة مدخلات مطابق' };
      });
    }
  }
  const cancelledInvoiceVatTotal = cancelledInvoiceVat.reduce((s, c) => s + (c.inputVat || 0), 0);

  // ── T4-style VAT check, translated to an invoice-value estimate ─────────
  const [vatRow1, vatRow2] = await Promise.all([
    pool1.request().query(`
      SELECT
        ISNULL((SELECT ROUND(SUM(jd.Credit-jd.Debit),2) FROM JournalVoucherDetail jd WHERE jd.AccountChart=88 AND jd.Customer=${DB1_CUST_WISSAM} AND jd.HeaderID IN (SELECT jd2.HeaderID FROM JournalVoucherDetail jd2 JOIN JournalVoucherHeader h ON h.ID=jd2.HeaderID WHERE CAST(h.TransactionDate AS DATE)>='${from}')),0) AS vat88,
        ISNULL((SELECT ROUND(SUM(jd.Debit-jd.Credit),2) FROM JournalVoucherDetail jd WHERE jd.AccountChart=64 AND jd.Supplier=${DB1_SUPP_WISSAM} AND jd.HeaderID IN (SELECT jd2.HeaderID FROM JournalVoucherDetail jd2 JOIN JournalVoucherHeader h ON h.ID=jd2.HeaderID WHERE CAST(h.TransactionDate AS DATE)>='${from}')),0) AS vat64
    `),
    pool2.request().query(`
      SELECT
        ISNULL((SELECT ROUND(SUM(jd.Credit-jd.Debit),2) FROM JournalVoucherDetail jd WHERE jd.AccountChart=88 AND jd.Customer=${DB2_CUST_ABAAD} AND jd.HeaderID IN (SELECT jd2.HeaderID FROM JournalVoucherDetail jd2 JOIN JournalVoucherHeader h ON h.ID=jd2.HeaderID WHERE CAST(h.TransactionDate AS DATE)>='${from}')),0) AS vat88,
        ISNULL((SELECT ROUND(SUM(jd.Debit-jd.Credit),2) FROM JournalVoucherDetail jd WHERE jd.AccountChart=64 AND jd.Supplier=${DB2_SUPP_ABAAD} AND jd.HeaderID IN (SELECT jd2.HeaderID FROM JournalVoucherDetail jd2 JOIN JournalVoucherHeader h ON h.ID=jd2.HeaderID WHERE CAST(h.TransactionDate AS DATE)>='${from}')),0) AS vat64
    `),
  ]);
  const gapA = parseFloat((vatRow1.recordset[0].vat88 - vatRow2.recordset[0].vat64).toFixed(2));
  const gapB = parseFloat((vatRow2.recordset[0].vat88 - vatRow1.recordset[0].vat64).toFixed(2));
  const impliedInvoiceValue = gap => parseFloat((gap / 0.15 * 1.15).toFixed(2));

  // ── Cash-flow mirror guard (T2) — kept as a plain-language summary; the
  // real matched/unmatched detail now lives in the cash category above. ────
  const cashDb1Net = cashDb1.reduce((s, r) => s + r.amount, 0);
  const cashDb2Net = cashDb2.reduce((s, r) => s + r.amount, 0);
  const mirrorOk = Math.abs(cashDb1Net + cashDb2Net) < 50000; // loose — real signal is cashCategory.unmatchedCount
  const cashFlowCheck = {
    ok: mirrorOk,
    diffs: { db1NetOutflow: cashDb1Net, db2NetInflow: cashDb2Net, sum: cashDb1Net + cashDb2Net },
    probableCauses: mirrorOk ? [] : [
      'غالبية التحويلات المسجَّلة لدى أحد الطرفين غير مرحّلة على حساب الذمم البيني لدى الطرف الآخر',
      'التقاط أطراف ثالثة ضمن سندات الصرف/القبض (مؤكد جزئياً — راجع فئة 5)',
      'تصنيف خاطئ لنوع السند أو انعكاس إشارة المدين-الدائن',
    ],
  };

  // ── Monthly current-account series (plan item M) ────────────────────────
  const monthlyMap = new Map();
  for (const r of [...cashDb1.map(r => ({ ...r, book: 'db1' })), ...cashDb2.map(r => ({ ...r, book: 'db2' }))]) {
    const month = r.txDate.slice(0, 7);
    if (!monthlyMap.has(month)) monthlyMap.set(month, { month, db1Net: 0, db2Net: 0 });
    const e = monthlyMap.get(month);
    if (r.book === 'db1') e.db1Net += r.amount; else e.db2Net += r.amount;
  }
  const monthlyCurrentAccount = [...monthlyMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  // ── Closure control (Q) ──────────────────────────────────────────────────
  // True source-line count (both sides, not dirA.length/dirB.length — same
  // undercounting risk as cashCategory.count above, see note there).
  const tradeCount  = dirA_sideA.length + dirA_sideB.length + dirB_sideA.length + dirB_sideB.length;
  const tradeAmount = sumAbs(dirA_sideA) + sumAbs(dirA_sideB) + sumAbs(dirB_sideA) + sumAbs(dirB_sideB);
  const classifiedCount  = tradeCount + cashCategory.count + sharedCostRows.length + ownerDrawRows.length + thirdPartyRows.length;
  const classifiedAmount = tradeAmount + cashCategory.total + sumAbs(sharedCostRows) + sumAbs(ownerDrawRows) + sumAbs(thirdPartyRows);
  const closure = {
    totalTurnoverAmount: parseFloat(totalTurnoverAmount.toFixed(2)),
    totalTurnoverCount,
    classifiedAmount: parseFloat(classifiedAmount.toFixed(2)),
    classifiedCount,
    ok: Math.abs(totalTurnoverAmount - classifiedAmount) <= 1 && totalTurnoverCount === classifiedCount,
    unclassifiedCount: totalTurnoverCount - classifiedCount,
    unclassifiedAmount: parseFloat((totalTurnoverAmount - classifiedAmount).toFixed(2)),
  };

  return {
    asOf: new Date().toISOString().slice(0, 10),
    from,
    accounts,
    closure,
    categories: {
      trade: {
        label: 'تجاري بيني (فواتير)',
        matched: dirA.filter(r=>r.status==='matched').length + dirB.filter(r=>r.status==='matched').length,
        total: tradeCount,
        amount: parseFloat(tradeAmount.toFixed(2)),
        coverage: tradeCoverage,
        dirA: { label: 'أبعاد → وسام (بيع/شراء)', transactions: dirA },
        dirB: { label: 'وسام → أبعاد (بيع/شراء)', transactions: dirB },
        cancelledNoMirror,
      },
      cash: { label: 'نقد بيني (سندات)', ...cashCategory },
      sharedCost: { label: 'تكاليف مشتركة', count: sharedCostRows.length, total: sumAbs(sharedCostRows), transactions: sharedCostRows },
      ownerDraws: { label: 'مسحوبات مالك', count: ownerDrawRows.length, total: sumAbs(ownerDrawRows), transactions: ownerDrawRows },
      thirdPartyErrors: {
        label: 'أطراف ثالثة وأخطاء ترحيل', count: thirdPartyRows.length, total: sumAbs(thirdPartyRows),
        transactions: thirdPartyRows, asnTable, cancelledInvoiceVat, cancelledInvoiceVatTotal,
      },
    },
    vatCheck: { gapA, gapB, impliedInvoiceValueA: impliedInvoiceValue(gapA), impliedInvoiceValueB: impliedInvoiceValue(gapB) },
    cashFlowCheck,
    monthlyCurrentAccount,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Memo 2 — أبعاد تبيع لوسام (reconciliation-memo reference model, v2.1)
// Self-contained on purpose: a future Memo 1 (وسام→أبعاد) or Memo 3 should
// copy this shape, not depend on Design P's classifier internals above — the
// two features answer different questions ("where does each line land" vs.
// "how do we bridge net أبعاد to net وسام") and are allowed to diverge.
// See docs/spec_reconciliation_memo_v2.1.md for the four controls this must
// satisfy: (1) bridge from account totals, not from the document list; (2) an
// explicit diagnostic line for any gap between the two; (3) the timing item
// carries a live asOf stamp + per-document age-in-days; (4) the unexplained
// residual is its own line and is allowed to be non-zero.
// ═══════════════════════════════════════════════════════════════════════════
async function getMemo2(from) {
  const [pool1, pool2] = await Promise.all([getPool(DB1), getPool(DB2)]);
  const asOf = new Date().toISOString().slice(0, 10);

  const [d1SalesInv, d1SalesRet, d2PurchInv, d2PurchRet] = await Promise.all([
    pool1.request().query(`
      SELECT sih.ID AS docId, CAST(sih.TransactionDate AS DATE) AS txDate, sih.ManualID AS ref,
             ROUND(SUM(jd.Debit),2) AS amount
      FROM SalesInvoice_JournalVoucherHeader lnk
      JOIN JournalVoucherHeader jvh ON jvh.ID = lnk.JournalVoucherHeaderID
      JOIN JournalVoucherDetail jd  ON jd.HeaderID = jvh.ID
      JOIN SalesInvoiceHeader sih   ON sih.ID = lnk.SalesInvoiceHeaderID
      WHERE jd.AccountChart = 47 AND sih.Customer = ${DB1_CUST_WISSAM}
        AND CAST(sih.TransactionDate AS DATE) >= '${from}'
      GROUP BY sih.ID, sih.ManualID, sih.TransactionDate HAVING SUM(jd.Debit) > 0
    `),
    pool1.request().query(`
      SELECT srh.ID AS docId, srh.SalesInvoiceId, CAST(jvh.TransactionDate AS DATE) AS txDate,
             ROUND(SUM(jd.Credit),2) AS amount
      FROM SalesReturn_JournalVoucherHeader lnk
      JOIN JournalVoucherHeader jvh ON jvh.ID = lnk.JournalVoucherHeaderID
      JOIN JournalVoucherDetail jd  ON jd.HeaderID = jvh.ID
      JOIN SalesReturnHeader srh    ON srh.ID = lnk.SalesReturnHeaderID
      WHERE jd.AccountChart = 47 AND jd.Customer = ${DB1_CUST_WISSAM}
        AND CAST(jvh.TransactionDate AS DATE) >= '${from}'
      GROUP BY srh.ID, srh.SalesInvoiceId, jvh.TransactionDate
    `),
    pool2.request().query(`
      SELECT pih.ID AS docId, CAST(pih.TransactionDate AS DATE) AS txDate, pih.Refrence AS ref,
             ROUND(SUM(jd.Credit-jd.Debit),2) AS amount
      FROM PurchaseInvoice_JournalVoucherHeader lnk
      JOIN JournalVoucherHeader jvh ON jvh.ID = lnk.JournalVoucherHeaderID
      JOIN JournalVoucherDetail jd  ON jd.HeaderID = jvh.ID
      JOIN PurchaseInvoiceHeader pih ON pih.ID = lnk.PurchaseInvoiceHeaderID
      WHERE jd.AccountChart IN (77,78) AND pih.Supplier = ${DB2_SUPP_ABAAD}
        AND CAST(pih.TransactionDate AS DATE) >= '${from}'
      GROUP BY pih.ID, pih.Refrence, pih.TransactionDate HAVING SUM(jd.Credit-jd.Debit) > 0
    `),
    pool2.request().query(`
      SELECT jvh.ID AS hid, jd.Description AS hdrDesc, CAST(jvh.TransactionDate AS DATE) AS txDate,
             ROUND(SUM(jd.Debit),2) AS amount
      FROM PurchaseReturn_JournalVoucherHeader lnk
      JOIN JournalVoucherHeader jvh ON jvh.ID = lnk.JournalVoucherHeaderID
      JOIN JournalVoucherDetail jd  ON jd.HeaderID = jvh.ID
      WHERE jd.AccountChart IN (77,78) AND jd.Supplier = ${DB2_SUPP_ABAAD}
        AND CAST(jvh.TransactionDate AS DATE) >= '${from}'
      GROUP BY jvh.ID, jd.Description, jvh.TransactionDate
    `),
  ]);

  // ── Bridge, from account totals — control 1 ─────────────────────────────
  const sumAmt = rs => rs.reduce((s, r) => s + r.amount, 0);
  const salesInvTotal = parseFloat(sumAmt(d1SalesInv.recordset).toFixed(2));
  const salesRetTotal = parseFloat(sumAmt(d1SalesRet.recordset).toFixed(2));
  const purchInvTotal = parseFloat(sumAmt(d2PurchInv.recordset).toFixed(2));
  const purchRetTotal = parseFloat(sumAmt(d2PurchRet.recordset).toFixed(2));
  const netAbaad  = parseFloat((salesInvTotal - salesRetTotal).toFixed(2));
  const netWissam = parseFloat((purchInvTotal - purchRetTotal).toFixed(2));
  const totalGap  = parseFloat((netAbaad - netWissam).toFixed(2));

  // ── Invoice matching — same tradeTier rule as Design P (ref+amount first,
  // else amount+date) — kept identical so the two features never silently
  // disagree on what counts as "matched". ────────────────────────────────
  const sideA = d1SalesInv.recordset.map(r => ({ docId: r.docId, txDate: _dateStr(r.txDate), amount: r.amount, ref: _normRef(r.ref) }));
  const sideB = d2PurchInv.recordset.map(r => ({ docId: r.docId, txDate: _dateStr(r.txDate), amount: r.amount, ref: _normRef(r.ref) }));
  const tradeTier = (a, b) => {
    if (a.ref && b.ref && a.ref === b.ref && Math.abs(a.amount - b.amount) <= AMT_TOL) return 'confirmed';
    if (Math.abs(a.amount - b.amount) <= AMT_TOL) return 'probable';
    return null;
  };
  const invMatch = _match(sideA, sideB, tradeTier);
  const toDoc = r => ({ docId: r.docId, txDate: r.txDate, ref: r.ref, amount: r.amount, ageDays: _ageDays(r.txDate, asOf) });
  const timingDocs = invMatch.filter(r => r.status === 'aonly').map(toDoc).sort((a, b) => b.amount - a.amount);
  const mirrorDocs = invMatch.filter(r => r.status === 'bonly').map(toDoc).sort((a, b) => b.amount - a.amount);
  const timingTotal = parseFloat(timingDocs.reduce((s, r) => s + r.amount, 0).toFixed(2));
  const mirrorTotal = parseFloat(mirrorDocs.reduce((s, r) => s + r.amount, 0).toFixed(2));
  const invoiceOnlyNet = parseFloat((timingTotal - mirrorTotal).toFixed(2));

  // ── Return matching — unrestricted by date (see _matchUnrestricted) ─────
  const retA = d1SalesRet.recordset.map(r => ({ docId: r.docId, salesInvoiceId: r.SalesInvoiceId, txDate: _dateStr(r.txDate), amount: r.amount }));
  const retB = d2PurchRet.recordset.map(r => ({ hid: r.hid, hdrDesc: r.hdrDesc, txDate: _dateStr(r.txDate), amount: r.amount }));
  const retMatch = _matchUnrestricted(retA, retB);

  // Full-cancellation check (return amount ≈ its own original invoice amount,
  // ±1 SAR) — same rule as Design P's cancelledNoMirror population.
  const invAmountById = new Map(d1SalesInv.recordset.map(r => [r.docId, r.amount]));
  const errorDocs = [];
  const otherOrphanReturns = [];
  for (const r of retMatch.aOnly) {
    const origAmt = invAmountById.get(r.salesInvoiceId);
    const isFullCancellation = origAmt != null && Math.abs(r.amount - origAmt) <= 1;
    if (isFullCancellation) {
      errorDocs.push({ salesInvoiceId: r.salesInvoiceId, returnDocId: r.docId, returnDate: r.txDate, amount: origAmt, ageDays: _ageDays(r.txDate, asOf) });
    } else {
      otherOrphanReturns.push({ returnDocId: r.docId, returnDate: r.txDate, amount: r.amount, note: 'مرتجع بلا مقابل ولا يمثّل إلغاءً كاملاً لفاتورة معروفة' });
    }
  }
  errorDocs.sort((a, b) => b.amount - a.amount);
  const errorDocsSum = parseFloat(errorDocs.reduce((s, r) => s + r.amount, 0).toFixed(2));
  const errorTotal = parseFloat((salesRetTotal - purchRetTotal).toFixed(2));
  // Diagnostic line — control 2: never bury or zero this gap.
  const diagnosticGap = parseFloat((errorDocsSum - errorTotal).toFixed(2));
  const orphanWissamReturns = retMatch.bOnly.map(r => ({ txDate: r.txDate, amount: r.amount, description: r.hdrDesc, ageDays: _ageDays(r.txDate, asOf) }));

  // Unexplained residual — control 4: its own line, allowed to be non-zero.
  const unexplainedResidual = parseFloat((totalGap - (invoiceOnlyNet - errorTotal)).toFixed(2));

  return {
    memoId: 2,
    label: 'المذكرة 2 — أبعاد تبيع لوسام',
    asOf,
    from,
    bridge: {
      netAbaad:  { salesInvoices: salesInvTotal, salesReturns: salesRetTotal, net: netAbaad, invoiceCount: d1SalesInv.recordset.length, returnCount: d1SalesRet.recordset.length },
      netWissam: { purchaseInvoices: purchInvTotal, purchaseReturns: purchRetTotal, net: netWissam, invoiceCount: d2PurchInv.recordset.length, returnCount: d2PurchRet.recordset.length },
      totalGap,
    },
    timingItem: { label: 'فواتير أبعاد لم تسجّلها وسام (بند التوقيت)', asOf, total: timingTotal, count: timingDocs.length, documents: timingDocs },
    mirrorItem: { label: 'فواتير مسجَّلة لدى وسام دون مقابل لدى أبعاد', total: mirrorTotal, count: mirrorDocs.length, documents: mirrorDocs },
    invoiceOnlyNet,
    errorItem: {
      label: 'فواتير ملغاة بلا مرتجع مقابل لدى وسام (بند الخطأ، من الإجمالي)',
      total: errorTotal,
      documentsSum: errorDocsSum,
      documents: errorDocs,
      diagnostic: {
        label: 'فارق تشخيصي — مجموع المستندات المفردة مقابل بند الخطأ المشتق من الإجمالي',
        amount: diagnosticGap,
        orphanWissamReturns,
        otherOrphanReturns,
      },
    },
    unexplainedResidual: { label: 'الفرق غير المفسَّر', amount: unexplainedResidual, allowedNonZero: true },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Memo 3 — تسوية الحساب الجاري (نقد بيني) بعد ضم الأطراف البنكية/التمويلية
// Root cause (verified live, 2026-07-25, see docs/spec_reconciliation_memo_v2.1.md
// history / project memory): the plain "cash" population (category 2 in Design
// P, and the monthly current-account section) only follows ReceiptVoucher_/
// Paymentvoucher_JournalVoucherHeader link tables. When the SAME transfer is
// posted as a bare JournalVoucher on one book (e.g. Riyad Bank financing
// settling the Wissam payable directly, or a shared-cost pass-through) and as
// a receipt/payment voucher on the other, that leg silently drops out of one
// side's cash total — inflating the apparent current-account mirror gap by an
// amount that was never actually missing, just mis-tagged. This memo finds
// those legs by matching each book's *true* manual rows (same DOC_TYPE_CASE
// precedence as Design P, so trade invoices are correctly excluded) against
// the OTHER book's cash-tagged population, and reports the reconciled net
// alongside a permanent explicit line for the bank-financing subset.
// ═══════════════════════════════════════════════════════════════════════════
const MEMO3_RECON_DAY_TOL = 30; // wider than the trade-matching tolerance on
  // purpose — these are cash legs of the same transfer, not independently
  // timed trade documents, and quarterly/insurance-style pass-throughs have
  // been observed live up to ~28 days apart.
const MEMO3_BANK_FINANCING_RX = /قرض|تمويل|الرياض|راجحي/;

function _memo3MatchManualToCash(manualSide, cashOther) {
  const used = new Set();
  const matched = [];
  for (const m of manualSide) {
    let best = -1, bestDays = Infinity;
    for (let i = 0; i < cashOther.length; i++) {
      if (used.has(i)) continue;
      const c = cashOther[i];
      if (Math.abs(Math.abs(c.amount) - Math.abs(m.amount)) > AMT_TOL) continue;
      const dd = Math.abs(new Date(c.txDate) - new Date(m.txDate)) / 86400000;
      if (dd > MEMO3_RECON_DAY_TOL) continue;
      if (dd < bestDays) { bestDays = dd; best = i; }
    }
    if (best >= 0) {
      used.add(best);
      matched.push({ ...m, matchedWith: cashOther[best], matchDays: bestDays });
    }
  }
  return matched;
}

async function getMemo3(from) {
  const [pool1, pool2] = await Promise.all([getPool(DB1), getPool(DB2)]);
  const asOf = new Date().toISOString().slice(0, 10);

  const fetchBook = (pool, custId, suppId) => pool.request().query(`
    SELECT jd.HeaderID AS headerId, CAST(jvh.TransactionDate AS DATE) AS txDate, jd.Debit, jd.Credit,
           jd.Description AS lineDesc, jvh.Description AS hdrDesc, ${DOC_TYPE_CASE} AS docType
    FROM JournalVoucherDetail jd
    JOIN JournalVoucherHeader jvh ON jvh.ID = jd.HeaderID
    WHERE ((jd.AccountChart = 47 AND jd.Customer = ${custId}) OR (jd.AccountChart IN (77,78) AND jd.Supplier = ${suppId}))
      AND CAST(jvh.TransactionDate AS DATE) >= '${from}'
  `);
  const [r1, r2] = await Promise.all([
    fetchBook(pool1, DB1_CUST_WISSAM, DB1_SUPP_WISSAM),
    fetchBook(pool2, DB2_CUST_ABAAD, DB2_SUPP_ABAAD),
  ]);

  const mk = sign => r => ({
    headerId: r.headerId, txDate: _dateStr(r.txDate),
    amount: parseFloat((sign === 1 ? r.Debit - r.Credit : r.Credit - r.Debit).toFixed(2)),
    desc: `${r.lineDesc || ''} ${r.hdrDesc || ''}`.trim(), docType: r.docType,
  });
  const d1 = r1.recordset.map(mk(1));
  const d2 = r2.recordset.map(mk(-1));

  const cashD1 = d1.filter(r => r.docType === 'cash');
  const cashD2 = d2.filter(r => r.docType === 'cash');
  const manualD1 = d1.filter(r => r.docType === 'manual' && r.amount !== 0);
  const manualD2 = d2.filter(r => r.docType === 'manual' && r.amount !== 0);

  const sumAmt = arr => parseFloat(arr.reduce((s, r) => s + r.amount, 0).toFixed(2));
  const rawDb1Net = sumAmt(cashD1);
  const rawDb2Net = sumAmt(cashD2);
  const rawGap = parseFloat((rawDb1Net - rawDb2Net).toFixed(2));

  // reconD1 = manual rows in أبعاد's book with a same-amount cash-tagged
  // counterpart in وسام's book (i.e. legs missing from أبعاد's cash total).
  // reconD2 = the mirror check the other direction.
  const reconD1 = _memo3MatchManualToCash(manualD1, cashD2);
  const reconD2 = _memo3MatchManualToCash(manualD2, cashD1);

  const splitBankFinancing = arr => ({
    bankFinancing: arr.filter(r => MEMO3_BANK_FINANCING_RX.test(r.desc)),
    other: arr.filter(r => !MEMO3_BANK_FINANCING_RX.test(r.desc)),
  });
  const s1 = splitBankFinancing(reconD1);
  const s2 = splitBankFinancing(reconD2);

  const reconciledDb1Net = parseFloat((rawDb1Net + sumAmt(reconD1)).toFixed(2));
  const reconciledDb2Net = parseFloat((rawDb2Net + sumAmt(reconD2)).toFixed(2));
  const reconciledGap = parseFloat((reconciledDb1Net - reconciledDb2Net).toFixed(2));

  return {
    memoId: 3,
    label: 'المذكرة 3 — تسوية الحساب الجاري (نقد بيني) بعد ضم الأطراف البنكية/التمويلية',
    asOf,
    from,
    raw: { db1Net: rawDb1Net, db2Net: rawDb2Net, gap: rawGap },
    reconcilingItems: {
      bankFinancing: {
        label: 'تمويل بنكي مسجّل بحساب البنك في أبعاد وبحساب جارٍ في وسام — مطابَق، ليس فجوة',
        db1: s1.bankFinancing,
        db2: s2.bankFinancing,
        total: parseFloat((sumAmt(s1.bankFinancing) + sumAmt(s2.bankFinancing)).toFixed(2)),
      },
      other: {
        label: 'بنود أخرى مطابَقة عبر تصنيف مستند مختلف بين الدفترين (تكاليف مشتركة غالباً)',
        db1: s1.other,
        db2: s2.other,
        total: parseFloat((sumAmt(s1.other) + sumAmt(s2.other)).toFixed(2)),
      },
    },
    reconciled: { db1Net: reconciledDb1Net, db2Net: reconciledDb2Net, gap: reconciledGap },
    netFinancingBalance: {
      label: 'صافي رصيد الحساب الجاري الحقيقي (بعد التسوية، أساس دفتر أبعاد)',
      amount: reconciledDb1Net,
      crossCheckWissam: reconciledDb2Net,
      residual: reconciledGap,
      residualNote: 'فرق متبقٍّ بعد التسوية — لم يُغلق بالكامل، سطر مستقل يُسمح أن يكون غير صفري',
      allowedNonZero: true,
    },
  };
}

module.exports = { getIntercoRecon, getMemo2, getMemo3 };
