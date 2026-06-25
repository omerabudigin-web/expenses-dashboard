'use strict';
const { getPool } = require('../db');

// Account IDs — identical across all MekSoft DB instances
const A = {
  REV_CASH:    199,
  REV_CREDIT:  202,
  RET_CASH:    200,
  RET_CREDIT:  203,
  COGS:        124,
  AR_LOCAL:    47,
  AR_FOREIGN:  48,
  INV_GOODS:   41,
  INV_TRANSIT: 305,
  AP_LOCAL:    77,
  AP_FOREIGN:  78,
};

async function _q1(pool, sql) {
  const r = await pool.request().query(sql);
  return r.recordset[0] || {};
}

async function getCCCForDb(dbName, from, to) {
  const pool = await getPool(dbName);
  // Use strict inequality (< from) to avoid timezone day-shift bugs.
  // Equivalent to (<= day-before-from) but safe regardless of server TZ.
  const openLt = from;

  // ── Days in period ────────────────────────────────────────────────────────
  const dRow = await _q1(pool, `SELECT DATEDIFF(day,'${from}','${to}') AS d`);
  const days = dRow.d || 1;

  // ── Period P&L from JV (VAT-exclusive by design) ──────────────────────────
  const plRow = await _q1(pool, `
    SELECT
      SUM(CASE WHEN jd.AccountChart IN (${A.REV_CASH},${A.REV_CREDIT})
               THEN jd.Credit - jd.Debit ELSE 0 END) AS grossSales,
      SUM(CASE WHEN jd.AccountChart IN (${A.RET_CASH},${A.RET_CREDIT})
               THEN jd.Debit - jd.Credit ELSE 0 END) AS salesReturns,
      SUM(CASE WHEN jd.AccountChart = ${A.COGS}
               THEN jd.Debit - jd.Credit ELSE 0 END) AS cogs
    FROM JournalVoucherHeader jh
    JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
    WHERE CAST(jh.TransactionDate AS DATE) BETWEEN '${from}' AND '${to}'
      AND jd.AccountChart IN (${A.REV_CASH},${A.REV_CREDIT},${A.RET_CASH},${A.RET_CREDIT},${A.COGS})
  `);
  const netSales = (plRow.grossSales || 0) - (plRow.salesReturns || 0);
  const cogs     = plRow.cogs || 0;

  // ── Purchases incl. VAT (consistent with AP balance which includes VAT) ──
  const piRow = await _q1(pool, `
    SELECT SUM(d.Net + d.VatValue) AS purchasesGross
    FROM PurchaseInvoiceHeader h
    JOIN PurchaseInvoiceDetail d ON d.HeaderID = h.ID
    WHERE CAST(h.TransactionDate AS DATE) BETWEEN '${from}' AND '${to}'
  `);
  const prRow = await _q1(pool, `
    SELECT SUM(d.Net + d.VatValue) AS returnsGross
    FROM PurchaseReturnHeader h
    JOIN PurchaseReturnDetail d ON d.HeaderID = h.ID
    WHERE CAST(h.TransactionDate AS DATE) BETWEEN '${from}' AND '${to}'
  `);
  const purchases = (piRow.purchasesGross || 0) - (prRow.returnsGross || 0);

  // ── AR balances (raw) at opening and closing ──────────────────────────────
  const arRow = await _q1(pool, `
    SELECT
      SUM(CASE WHEN CAST(jh.TransactionDate AS DATE) < '${openLt}'
               THEN jd.Debit - jd.Credit ELSE 0 END) AS arOpen,
      SUM(CASE WHEN CAST(jh.TransactionDate AS DATE) <= '${to}'
               THEN jd.Debit - jd.Credit ELSE 0 END) AS arClose
    FROM JournalVoucherHeader jh
    JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
    WHERE jd.AccountChart IN (${A.AR_LOCAL},${A.AR_FOREIGN})
  `);

  // ── AR netting: customers who are also suppliers (same VatNo) ────────────
  const netRow = await _q1(pool, `
    WITH CustomerAR AS (
      SELECT jd.Customer,
        SUM(CASE WHEN CAST(jh.TransactionDate AS DATE) < '${openLt}'
                 THEN jd.Debit - jd.Credit ELSE 0 END) AS arOpen,
        SUM(CASE WHEN CAST(jh.TransactionDate AS DATE) <= '${to}'
                 THEN jd.Debit - jd.Credit ELSE 0 END) AS arClose
      FROM JournalVoucherHeader jh
      JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
      WHERE jd.AccountChart IN (${A.AR_LOCAL},${A.AR_FOREIGN})
        AND jd.Customer IS NOT NULL
      GROUP BY jd.Customer
    ),
    SupplierAP AS (
      SELECT jd.Supplier,
        SUM(CASE WHEN CAST(jh.TransactionDate AS DATE) < '${openLt}'
                 THEN jd.Credit - jd.Debit ELSE 0 END) AS apOpen,
        SUM(CASE WHEN CAST(jh.TransactionDate AS DATE) <= '${to}'
                 THEN jd.Credit - jd.Debit ELSE 0 END) AS apClose
      FROM JournalVoucherHeader jh
      JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
      WHERE jd.AccountChart IN (${A.AP_LOCAL},${A.AP_FOREIGN})
        AND jd.Supplier IS NOT NULL
      GROUP BY jd.Supplier
    ),
    Matched AS (
      SELECT
        ISNULL(ca.arOpen,0)  AS arOpen,
        ISNULL(ca.arClose,0) AS arClose,
        ISNULL(ca.arOpen,0)  - ISNULL(sa.apOpen,0)  AS netOpen,
        ISNULL(ca.arClose,0) - ISNULL(sa.apClose,0) AS netClose
      FROM Customer c
      JOIN Supplier s ON s.VatNo = c.VatNo AND NULLIF(s.VatNo,'') IS NOT NULL
      LEFT JOIN CustomerAR ca ON ca.Customer = c.Id
      LEFT JOIN SupplierAP sa ON sa.Supplier = s.Id
    )
    SELECT
      SUM(arOpen)                                        AS grossArOpen,
      SUM(arClose)                                       AS grossArClose,
      SUM(CASE WHEN netOpen  > 0 THEN netOpen  ELSE 0 END) AS netArOpen_pos,
      SUM(CASE WHEN netClose > 0 THEN netClose ELSE 0 END) AS netArClose_pos,
      COUNT(*)                                           AS matchedCount
    FROM Matched
  `);

  const arOpenRaw  = arRow.arOpen  || 0;
  const arCloseRaw = arRow.arClose || 0;
  const netArOpen  = arOpenRaw  - (netRow.grossArOpen  || 0) + (netRow.netArOpen_pos  || 0);
  const netArClose = arCloseRaw - (netRow.grossArClose || 0) + (netRow.netArClose_pos || 0);
  const avgAR      = (netArOpen + netArClose) / 2;

  // ── Inventory balances (goods + transit accounts) ─────────────────────────
  const invRow = await _q1(pool, `
    SELECT
      SUM(CASE WHEN CAST(jh.TransactionDate AS DATE) < '${openLt}'
               THEN jd.Debit - jd.Credit ELSE 0 END) AS invOpen,
      SUM(CASE WHEN CAST(jh.TransactionDate AS DATE) <= '${to}'
               THEN jd.Debit - jd.Credit ELSE 0 END) AS invClose
    FROM JournalVoucherHeader jh
    JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
    WHERE jd.AccountChart IN (${A.INV_GOODS},${A.INV_TRANSIT})
  `);
  const invOpen  = invRow.invOpen  || 0;
  const invClose = invRow.invClose || 0;
  const avgInv   = (invOpen + invClose) / 2;

  // ── AP balances full (ح.77+78) — kept for reconciliation display ────────────
  const apRow = await _q1(pool, `
    SELECT
      SUM(CASE WHEN CAST(jh.TransactionDate AS DATE) < '${openLt}'
               THEN jd.Credit - jd.Debit ELSE 0 END) AS apOpen,
      SUM(CASE WHEN CAST(jh.TransactionDate AS DATE) <= '${to}'
               THEN jd.Credit - jd.Debit ELSE 0 END) AS apClose
    FROM JournalVoucherHeader jh
    JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
    WHERE jd.AccountChart IN (${A.AP_LOCAL},${A.AP_FOREIGN})
  `);
  const apOpen  = apRow.apOpen  || 0;
  const apClose = apRow.apClose || 0;
  const avgAP   = (apOpen + apClose) / 2;

  // ── AP classification: trade vs. dual-entity vs. advances ────────────────────
  // Trade = suppliers with NO matching customer (same VatNo) — pure commercial
  // Dual  = suppliers who also appear as customers (intercompany / related party)
  // Advances = debit balances in AP (overpayments / prepayments) — excluded from both
  const apClassRow = await _q1(pool, `
    WITH SupplierAP AS (
      SELECT
        s.Id, s.VatNo,
        SUM(CASE WHEN CAST(jh.TransactionDate AS DATE) < '${openLt}'
                 THEN jd.Credit - jd.Debit ELSE 0 END) AS apOpen,
        SUM(CASE WHEN CAST(jh.TransactionDate AS DATE) <= '${to}'
                 THEN jd.Credit - jd.Debit ELSE 0 END) AS apClose
      FROM JournalVoucherHeader jh
      JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
      JOIN Supplier s ON s.Id = jd.Supplier
      WHERE jd.AccountChart IN (${A.AP_LOCAL},${A.AP_FOREIGN})
        AND jd.Supplier IS NOT NULL
      GROUP BY s.Id, s.VatNo
    ),
    Classified AS (
      SELECT sa.*,
        CASE WHEN EXISTS(
          SELECT 1 FROM Customer c WHERE c.VatNo = sa.VatNo AND NULLIF(sa.VatNo,'') IS NOT NULL
        ) THEN 1 ELSE 0 END AS isDual
      FROM SupplierAP sa
    )
    SELECT
      SUM(CASE WHEN isDual=0 AND apOpen >0 THEN apOpen  ELSE 0 END) AS tradeOpen,
      SUM(CASE WHEN isDual=0 AND apClose>0 THEN apClose ELSE 0 END) AS tradeClose,
      SUM(CASE WHEN isDual=1 AND apOpen >0 THEN apOpen  ELSE 0 END) AS dualOpen,
      SUM(CASE WHEN isDual=1 AND apClose>0 THEN apClose ELSE 0 END) AS dualClose,
      SUM(CASE WHEN apClose < 0 THEN ABS(apClose) ELSE 0 END)       AS advancesClose,
      SUM(CASE WHEN isDual=1 THEN 1 ELSE 0 END)                     AS dualCount
    FROM Classified
  `);
  const tradeOpen  = apClassRow.tradeOpen  || 0;
  const tradeClose = apClassRow.tradeClose || 0;
  const dualOpen   = apClassRow.dualOpen   || 0;
  const dualClose  = apClassRow.dualClose  || 0;
  // avgAPTrade: used for DPO الرسمي (trade-only, the primary metric)
  const avgAPTrade = (tradeOpen + tradeClose) / 2;
  // avgAPIncl: trade + intercompany credit positions (for secondary indicator)
  const avgAPIncl  = (tradeOpen + dualOpen + tradeClose + dualClose) / 2;

  // ── Ratios ────────────────────────────────────────────────────────────────
  const safe = (n, d) => (d && isFinite(n / d)) ? n / d : null;
  const dso         = safe(avgAR      * days, netSales);
  const dio         = safe(avgInv     * days, cogs);
  const dpo         = safe(avgAPTrade * days, purchases);   // primary: trade-only
  const dpoIncl     = safe(avgAPIncl  * days, purchases);   // secondary: + intercompany
  const ccc         = (dso !== null && dio !== null && dpo     !== null) ? dso + dio - dpo     : null;
  const cccIncl     = (dso !== null && dio !== null && dpoIncl !== null) ? dso + dio - dpoIncl : null;

  return {
    db: dbName,
    from, to, days,
    components: {
      netSales, cogs, purchases,
      arOpen: netArOpen, arClose: netArClose, avgAR,
      invOpen, invClose, avgInv,
      apOpen, apClose, avgAP,
      tradeOpen, tradeClose, avgAPTrade,
      dualOpen,  dualClose,  avgAPIncl,
      advancesClose: apClassRow.advancesClose || 0,
      dualCount:     apClassRow.dualCount     || 0,
    },
    metrics: { dso, dio, dpo, dpoIncl, ccc, cccIncl },
    reconciliation: {
      grossSales:      plRow.grossSales      || 0,
      salesReturns:    plRow.salesReturns    || 0,
      purchasesGross:  piRow.purchasesGross  || 0,
      purchaseReturns: prRow.returnsGross    || 0,
      arRaw:           arCloseRaw,
      arNettingOffset: arCloseRaw - netArClose,
      arNettingCount:  netRow.matchedCount   || 0,
      invRaw:          invClose,
      apRaw:           apClose,
    },
  };
}

async function getCCCData(db1Name, db2Name, from, to) {
  const [r1, r2] = await Promise.all([
    getCCCForDb(db1Name, from, to),
    getCCCForDb(db2Name, from, to),
  ]);
  return { companies: [r1, r2] };
}

module.exports = { getCCCData };
