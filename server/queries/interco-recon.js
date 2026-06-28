'use strict';
const { getPool } = require('../db');

const DB1 = process.env.DB1_NAME || 'MekSoftDb1';
const DB2 = process.env.DB2_NAME || 'MekSoftDb2';

// وسام identifiers
const WASAM_VATNO = '300925211200003';
// أبعاد identifiers in DB2 (hardcoded from investigation)
const ABEAD_CUST2 = 3;
const ABEAD_SUPP2 = 2;

const MATCH_AMT_TOL  = 0.5;   // SAR
const MATCH_DAY_TOL  = 30;    // days
const GAP_THRESHOLD  = 5000;  // SAR — below = "متطابق"

function _dateStr(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

// Greedy amount+date matching; sideA = "seller" side, sideB = "buyer" side
function _match(sideA, sideB) {
  const usedB  = new Set();
  const rows   = [];

  for (const a of sideA) {
    let best = -1, bestDays = Infinity;
    for (let i = 0; i < sideB.length; i++) {
      if (usedB.has(i)) continue;
      const b = sideB[i];
      if (Math.abs(a.amount - b.amount) > MATCH_AMT_TOL) continue;
      const dd = Math.abs(new Date(a.txDate) - new Date(b.txDate)) / 86400000;
      if (dd < bestDays) { bestDays = dd; best = i; }
    }
    if (best >= 0 && bestDays <= MATCH_DAY_TOL) {
      const b = sideB[best];
      usedB.add(best);
      rows.push({ txDateA: a.txDate, refA: a.ref, amtA: a.amount,
                  txDateB: b.txDate, refB: b.ref, amtB: b.amount,
                  diff: parseFloat((a.amount - b.amount).toFixed(2)),
                  status: 'matched' });
    } else {
      rows.push({ txDateA: a.txDate, refA: a.ref, amtA: a.amount,
                  txDateB: null, refB: null, amtB: null,
                  diff: a.amount, status: 'aonly' });
    }
  }
  for (let i = 0; i < sideB.length; i++) {
    if (usedB.has(i)) continue;
    const b = sideB[i];
    rows.push({ txDateA: null, refA: null, amtA: null,
                txDateB: b.txDate, refB: b.ref, amtB: b.amount,
                diff: -b.amount, status: 'bonly' });
  }

  rows.sort((x, y) => {
    const rank = { aonly: 0, bonly: 0, matched: 1 };
    if (rank[x.status] !== rank[y.status]) return rank[x.status] - rank[y.status];
    return Math.abs(y.diff || y.amtB || 0) - Math.abs(x.diff || x.amtA || 0);
  });
  return rows;
}

async function getIntercoRecon(from) {
  const [pool1, pool2] = await Promise.all([getPool(DB1), getPool(DB2)]);

  const [b1, b2, d1Ar, d2Ap, d2Ar, d1Ap, cf1, cf2] = await Promise.all([

    // ── DB1 balances vs وسام ──────────────────────────────────────────────────
    pool1.request().query(`
      WITH
        C AS (SELECT Id FROM Customer WHERE VatNo=N'${WASAM_VATNO}'),
        S AS (SELECT Id FROM Supplier WHERE VatNo=N'${WASAM_VATNO}')
      SELECT
        ISNULL((SELECT ROUND(SUM(jd.Debit-jd.Credit),2) FROM JournalVoucherDetail jd
                WHERE jd.AccountChart=47 AND jd.Customer IN (SELECT Id FROM C)),0) AS ar,
        ISNULL((SELECT ROUND(SUM(jd.Credit-jd.Debit),2) FROM JournalVoucherDetail jd
                WHERE jd.AccountChart IN (77,78) AND jd.Supplier IN (SELECT Id FROM S)),0) AS ap,
        ISNULL((SELECT ROUND(SUM(jd.Credit-jd.Debit),2) FROM JournalVoucherDetail jd
                WHERE jd.AccountChart=88 AND jd.Customer IN (SELECT Id FROM C)),0) AS vat88,
        ISNULL((SELECT ROUND(SUM(jd.Debit-jd.Credit),2) FROM JournalVoucherDetail jd
                WHERE jd.AccountChart=64 AND jd.Supplier IN (SELECT Id FROM S)),0) AS vat64
    `),

    // ── DB2 balances vs أبعاد ─────────────────────────────────────────────────
    pool2.request().query(`
      SELECT
        ISNULL((SELECT ROUND(SUM(jd.Debit-jd.Credit),2) FROM JournalVoucherDetail jd
                WHERE jd.AccountChart=47 AND jd.Customer=${ABEAD_CUST2}),0) AS ar,
        ISNULL((SELECT ROUND(SUM(jd.Credit-jd.Debit),2) FROM JournalVoucherDetail jd
                WHERE jd.AccountChart IN (77,78) AND jd.Supplier=${ABEAD_SUPP2}),0) AS ap,
        ISNULL((SELECT ROUND(SUM(jd.Credit-jd.Debit),2) FROM JournalVoucherDetail jd
                WHERE jd.AccountChart=88 AND jd.Customer=${ABEAD_CUST2}),0) AS vat88,
        ISNULL((SELECT ROUND(SUM(jd.Debit-jd.Credit),2) FROM JournalVoucherDetail jd
                WHERE jd.AccountChart=64 AND jd.Supplier=${ABEAD_SUPP2}),0) AS vat64
    `),

    // ── Dir A: DB1 sales invoices to وسام ────────────────────────────────────
    pool1.request().query(`
      SELECT TOP 300
        CAST(sih.TransactionDate AS DATE) AS txDate,
        sih.ManualID AS ref,
        ROUND(SUM(jd.Debit), 2) AS amount
      FROM SalesInvoice_JournalVoucherHeader lnk
      JOIN JournalVoucherHeader jvh ON jvh.ID = lnk.JournalVoucherHeaderID
      JOIN JournalVoucherDetail jd  ON jd.HeaderID = jvh.ID
      JOIN SalesInvoiceHeader sih   ON sih.ID = lnk.SalesInvoiceHeaderID
      WHERE jd.AccountChart = 47
        AND sih.Customer IN (SELECT Id FROM Customer WHERE VatNo=N'${WASAM_VATNO}')
        AND CAST(sih.TransactionDate AS DATE) >= '${from}'
      GROUP BY sih.ID, sih.ManualID, sih.TransactionDate
      HAVING SUM(jd.Debit) > 0
      ORDER BY sih.TransactionDate DESC
    `),

    // ── Dir A: DB2 purchase invoices from أبعاد ───────────────────────────────
    pool2.request().query(`
      SELECT TOP 300
        CAST(pih.TransactionDate AS DATE) AS txDate,
        pih.ManualID AS ref,
        ROUND(SUM(jd.Credit - jd.Debit), 2) AS amount
      FROM PurchaseInvoice_JournalVoucherHeader lnk
      JOIN JournalVoucherHeader jvh ON jvh.ID = lnk.JournalVoucherHeaderID
      JOIN JournalVoucherDetail jd  ON jd.HeaderID = jvh.ID
      JOIN PurchaseInvoiceHeader pih ON pih.ID = lnk.PurchaseInvoiceHeaderID
      WHERE jd.AccountChart IN (77, 78)
        AND pih.Supplier = ${ABEAD_SUPP2}
        AND CAST(pih.TransactionDate AS DATE) >= '${from}'
      GROUP BY pih.ID, pih.ManualID, pih.TransactionDate
      HAVING SUM(jd.Credit - jd.Debit) > 0
      ORDER BY pih.TransactionDate DESC
    `),

    // ── Dir B: DB2 sales invoices to أبعاد ────────────────────────────────────
    pool2.request().query(`
      SELECT TOP 300
        CAST(sih.TransactionDate AS DATE) AS txDate,
        sih.ManualID AS ref,
        ROUND(SUM(jd.Debit), 2) AS amount
      FROM SalesInvoice_JournalVoucherHeader lnk
      JOIN JournalVoucherHeader jvh ON jvh.ID = lnk.JournalVoucherHeaderID
      JOIN JournalVoucherDetail jd  ON jd.HeaderID = jvh.ID
      JOIN SalesInvoiceHeader sih   ON sih.ID = lnk.SalesInvoiceHeaderID
      WHERE jd.AccountChart = 47
        AND sih.Customer = ${ABEAD_CUST2}
        AND CAST(sih.TransactionDate AS DATE) >= '${from}'
      GROUP BY sih.ID, sih.ManualID, sih.TransactionDate
      HAVING SUM(jd.Debit) > 0
      ORDER BY sih.TransactionDate DESC
    `),

    // ── Dir B: DB1 purchase invoices from وسام ────────────────────────────────
    pool1.request().query(`
      SELECT TOP 300
        CAST(pih.TransactionDate AS DATE) AS txDate,
        pih.ManualID AS ref,
        ROUND(SUM(jd.Credit - jd.Debit), 2) AS amount
      FROM PurchaseInvoice_JournalVoucherHeader lnk
      JOIN JournalVoucherHeader jvh ON jvh.ID = lnk.JournalVoucherHeaderID
      JOIN JournalVoucherDetail jd  ON jd.HeaderID = jvh.ID
      JOIN PurchaseInvoiceHeader pih ON pih.ID = lnk.PurchaseInvoiceHeaderID
      WHERE jd.AccountChart IN (77, 78)
        AND pih.Supplier IN (SELECT Id FROM Supplier WHERE VatNo=N'${WASAM_VATNO}')
        AND CAST(pih.TransactionDate AS DATE) >= '${from}'
      GROUP BY pih.ID, pih.ManualID, pih.TransactionDate
      HAVING SUM(jd.Credit - jd.Debit) > 0
      ORDER BY pih.TransactionDate DESC
    `),

    // ── DB1 cash flows vs وسام ────────────────────────────────────────────────
    pool1.request().query(`
      WITH
        C AS (SELECT Id FROM Customer WHERE VatNo=N'${WASAM_VATNO}'),
        S AS (SELECT Id FROM Supplier WHERE VatNo=N'${WASAM_VATNO}')
      SELECT
        ISNULL((SELECT ROUND(SUM(rvd.Credit-rvd.Debit),2) FROM ReceiptVoucherDetail rvd
                WHERE rvd.AccountChart=47 AND rvd.Customer IN (SELECT Id FROM C)),0) AS receipts,
        ISNULL((SELECT ROUND(SUM(pvd.Debit-pvd.Credit),2) FROM PaymentvoucherDetail pvd
                WHERE pvd.AccountChart IN (77,78) AND pvd.Supplier IN (SELECT Id FROM S)),0) AS payments
    `),

    // ── DB2 cash flows vs أبعاد ───────────────────────────────────────────────
    pool2.request().query(`
      SELECT
        ISNULL((SELECT ROUND(SUM(rvd.Credit-rvd.Debit),2) FROM ReceiptVoucherDetail rvd
                WHERE rvd.AccountChart=47 AND rvd.Customer=${ABEAD_CUST2}),0) AS receipts,
        ISNULL((SELECT ROUND(SUM(pvd.Debit-pvd.Credit),2) FROM PaymentvoucherDetail pvd
                WHERE pvd.AccountChart IN (77,78) AND pvd.Supplier=${ABEAD_SUPP2}),0) AS payments
    `),
  ]);

  const r1  = b1.recordset[0];
  const r2  = b2.recordset[0];
  const rc1 = cf1.recordset[0];
  const rc2 = cf2.recordset[0];

  const db1Net = parseFloat((r1.ar - r1.ap).toFixed(2));
  const db2Net = parseFloat((r2.ar - r2.ap).toFixed(2));
  // Identity: db1Net + db2Net ≈ 0 when books are in sync
  const gap    = parseFloat((db1Net + db2Net).toFixed(2));

  const mkRow = r => ({ txDate: _dateStr(r.txDate), ref: r.ref, amount: r.amount });
  const dirA  = _match(d1Ar.recordset.map(mkRow), d2Ap.recordset.map(mkRow));
  const dirB  = _match(d2Ar.recordset.map(mkRow), d1Ap.recordset.map(mkRow));

  const unmatchedCount = [...dirA, ...dirB].filter(r => r.status !== 'matched').length;

  return {
    asOf: new Date().toISOString().slice(0, 10),
    from,
    gap,
    gapAbs:        Math.abs(gap),
    status:        Math.abs(gap) < GAP_THRESHOLD ? 'matched' : 'gap',
    db1: {
      name: 'أبعاد الحديد',
      ar:   r1.ar,  ap:  r1.ap,  net: db1Net,
      vat88: r1.vat88, vat64: r1.vat64,
      receipts: rc1.receipts, payments: rc1.payments,
    },
    db2: {
      name: 'وسام الفولاذ',
      ar:   r2.ar,  ap:  r2.ap,  net: db2Net,
      vat88: r2.vat88, vat64: r2.vat64,
      receipts: rc2.receipts, payments: rc2.payments,
    },
    dirA:          { label: 'أبعاد → وسام', transactions: dirA },
    dirB:          { label: 'وسام → أبعاد', transactions: dirB },
    unmatchedCount,
  };
}

module.exports = { getIntercoRecon };
