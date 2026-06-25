'use strict';
const { getPool } = require('../db');

const A = {
  REV_CASH:   199, REV_CREDIT: 202,
  RET_CASH:   200, RET_CREDIT: 203,
  COGS:       124,
  AR_LOCAL:    47, AR_FOREIGN:  48,
  AP_LOCAL:    77, AP_FOREIGN:  78,
};

async function _q1(pool, sql) {
  const r = await pool.request().query(sql);
  return r.recordset[0] || {};
}

async function getForecastData(dbName, from, to) {
  const pool = await getPool(dbName);

  // ── Days / weeks ──────────────────────────────────────────────────────────────
  const dRow = await _q1(pool, `SELECT DATEDIFF(day,'${from}','${to}') AS d`);
  const days  = Math.max(dRow.d || 1, 1);
  const weeks = days / 7;

  // ── Cash + bank balance as of `to` ───────────────────────────────────────────
  // Code LIKE '10301%': all leaf accounts under the Cash group (level-3 code 10301)
  const cashRow = await _q1(pool, `
    SELECT SUM(jd.Debit - jd.Credit) AS cashBal
    FROM JournalVoucherHeader jh
    JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
    JOIN AccountChart ac ON ac.ID = jd.AccountChart AND ac.HasChild = 0
    WHERE ac.Code LIKE '10301%'
      AND CAST(jh.TransactionDate AS DATE) <= '${to}'
  `);
  const openingCash = cashRow.cashBal || 0;

  // ── Net Sales and COGS for period ─────────────────────────────────────────────
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
      AND jd.AccountChart IN (${A.REV_CASH},${A.REV_CREDIT},
                              ${A.RET_CASH},${A.RET_CREDIT},${A.COGS})
  `);
  const grossSales   = plRow.grossSales   || 0;
  const salesReturns = plRow.salesReturns || 0;
  const netSales     = grossSales - salesReturns;
  const cogs         = plRow.cogs || 0;
  const weeklySales     = netSales / weeks;
  const weeklyPurchases = cogs     / weeks;

  // ── AR closing balance (raw) ──────────────────────────────────────────────────
  const arRow = await _q1(pool, `
    SELECT SUM(jd.Debit - jd.Credit) AS arClose
    FROM JournalVoucherHeader jh
    JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
    WHERE jd.AccountChart IN (${A.AR_LOCAL},${A.AR_FOREIGN})
      AND CAST(jh.TransactionDate AS DATE) <= '${to}'
  `);
  const arCloseRaw = arRow.arClose || 0;

  // ── AR netting: same logic as ccc.js, closing only ───────────────────────────
  const netRow = await _q1(pool, `
    WITH CustomerAR AS (
      SELECT jd.Customer,
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
        ISNULL(ca.arClose,0)                                AS arClose,
        ISNULL(ca.arClose,0) - ISNULL(sa.apClose,0)        AS netClose
      FROM Customer c
      JOIN Supplier s ON s.VatNo = c.VatNo AND NULLIF(s.VatNo,'') IS NOT NULL
      LEFT JOIN CustomerAR ca ON ca.Customer = c.Id
      LEFT JOIN SupplierAP sa ON sa.Supplier = s.Id
    )
    SELECT
      SUM(arClose)                                          AS grossArClose,
      SUM(CASE WHEN netClose > 0 THEN netClose ELSE 0 END) AS netArClose_pos,
      COUNT(*)                                              AS matchedCount
    FROM Matched
  `);
  const openAR = arCloseRaw
    - (netRow.grossArClose   || 0)
    + (netRow.netArClose_pos || 0);

  // ── AP closing: trade-only (موردون تجاريون فقط — same CTE as CCC tab) ─────────
  const apTradeRow = await _q1(pool, `
    WITH SupplierAP AS (
      SELECT s.Id, s.VatNo,
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
      SUM(CASE WHEN isDual=0 AND apClose>0 THEN apClose ELSE 0 END) AS tradeClose,
      SUM(CASE WHEN isDual=1 AND apClose>0 THEN apClose ELSE 0 END) AS dualClose,
      SUM(CASE WHEN apClose<0 THEN ABS(apClose) ELSE 0 END)         AS advancesClose,
      SUM(apClose)                                                   AS fullClose
    FROM Classified
  `);
  const openAP = apTradeRow.tradeClose || 0;

  return {
    db: dbName,
    from, to, days,
    weeks: +weeks.toFixed(2),
    backbone: { openingCash, openAR, openAP, weeklySales, weeklyPurchases },
    reconciliation: {
      grossSales, salesReturns, netSales, cogs,
      arRaw:           arCloseRaw,
      arNettingOffset: arCloseRaw - openAR,
      arNettingCount:  netRow.matchedCount || 0,
      apTrade:         openAP,
      apDual:          apTradeRow.dualClose     || 0,
      apAdvances:      apTradeRow.advancesClose || 0,
      apFull:          apTradeRow.fullClose     || 0,
      cashBal:         openingCash,
    },
  };
}

module.exports = { getForecastData };
