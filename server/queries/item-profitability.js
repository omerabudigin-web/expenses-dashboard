'use strict';
const { getPool } = require('../db');

// Cost strategy: JV-proportional allocation, globally rescaled to reconcile to GL COGS.
//
// Step 1 — per-invoice COGS allocation:
//   For each invoice with JV-linked account-124 debit (jvCogs > 0):
//     item_cost = jvCogs × (itemLineRev / invoiceTotalRev)
//   rawGrossTotal = sum of these allocations for all qualified invoices.
//
// Step 2 — global scale factor:
//   sf = (glCogs + retCost) / rawGrossTotal
//   This ensures: grossCost_total - retCost_total = glCogs exactly.
//
//   Why rawGrossTotal ≠ jvTot:
//     InvJvCogs has some invoices with jvCogs ≤ 0 (correction JVs that net-credit 124).
//     These are excluded by the jvCogs > 0 guard, so they reduce jvTot but not rawGrossTotal.
//     DB1: rawGrossTotal≈85M, jvTot≈80M, glCogs≈76M → sf≈0.924
//
// Returns cost: SalesReturnDetail.GroupCostPrice (WAC at time of return).

function buildSQL(from, to, glCogs) {
  return `
WITH
InvJvCogs AS (
  SELECT sih.ID AS sihId,
    SUM(CASE WHEN jvd.AccountChart = 124 THEN jvd.Debit - jvd.Credit ELSE 0 END) AS jvCogs
  FROM SalesInvoiceHeader sih
  JOIN SalesInvoice_JournalVoucherHeader lnk ON lnk.SalesInvoiceHeaderID = sih.ID
  JOIN JournalVoucherHeader jvh ON jvh.ID = lnk.JournalVoucherHeaderID
  JOIN JournalVoucherDetail jvd ON jvd.HeaderID = jvh.ID
  WHERE CAST(sih.TransactionDate AS DATE) BETWEEN '${from}' AND '${to}'
  GROUP BY sih.ID
),
InvTotRev AS (
  SELECT sih.ID AS sihId, SUM(sid.AmountBVat) AS totalRev
  FROM SalesInvoiceHeader sih
  JOIN SalesInvoiceDetail sid ON sid.HeaderID = sih.ID
  JOIN Item i ON i.Id = sid.Item AND i.ItemType = 1
  WHERE CAST(sih.TransactionDate AS DATE) BETWEEN '${from}' AND '${to}'
  GROUP BY sih.ID
),
ItemLines AS (
  SELECT sid.Item, sih.ID AS sihId,
    SUM(sid.AmountBVat)         AS lineRev,
    SUM(ABS(sid.GroupQuantity)) AS lineQty
  FROM SalesInvoiceHeader sih
  JOIN SalesInvoiceDetail sid ON sid.HeaderID = sih.ID
  JOIN Item i ON i.Id = sid.Item AND i.ItemType = 1
  WHERE CAST(sih.TransactionDate AS DATE) BETWEEN '${from}' AND '${to}'
  GROUP BY sid.Item, sih.ID
),
ReturnTotal AS (
  -- Total return cost for the period — needed by GlobalScale before Returns CTE is defined.
  SELECT ISNULL(SUM(ABS(srd.GroupCostPrice)), 0) AS retCost
  FROM SalesReturnHeader srh
  JOIN SalesReturnDetail srd ON srd.HeaderID = srh.ID
  JOIN Item i ON i.Id = srd.Item AND i.ItemType = 1
  WHERE CAST(srh.TransactionDate AS DATE) BETWEEN '${from}' AND '${to}'
),
RawGrossTotal AS (
  -- Sum of JV allocations for qualified invoices (jvCogs > 0 AND totalRev > 0).
  SELECT ISNULL(SUM(
    CASE WHEN ijc.jvCogs > 0 AND ISNULL(itr.totalRev, 0) > 0
      THEN ijc.jvCogs * (l.lineRev / itr.totalRev)
      ELSE 0
    END
  ), 0) AS rawTotal
  FROM ItemLines l
  LEFT JOIN InvJvCogs ijc ON ijc.sihId = l.sihId
  LEFT JOIN InvTotRev itr ON itr.sihId = l.sihId
),
GlobalScale AS (
  -- sf = (glCogs + retCost) / rawGrossTotal
  -- → grossCost_total × sf = glCogs + retCost
  -- → (grossCost - retCost)_total = glCogs  ✓
  SELECT CASE WHEN rg.rawTotal > 0
    THEN (CAST(${glCogs} AS FLOAT) + rt.retCost) / rg.rawTotal
    ELSE 0
  END AS sf
  FROM RawGrossTotal rg, ReturnTotal rt
),
ItemSales AS (
  SELECT l.Item,
    SUM(l.lineRev) AS grossRev,
    SUM(l.lineQty) AS grossQty,
    SUM(
      CASE
        WHEN ijc.jvCogs > 0 AND ISNULL(itr.totalRev, 0) > 0
          THEN ijc.jvCogs * (l.lineRev / itr.totalRev) * gs.sf
        ELSE 0
      END
    ) AS grossCost
  FROM ItemLines l
  LEFT JOIN InvJvCogs  ijc ON ijc.sihId = l.sihId
  LEFT JOIN InvTotRev  itr ON itr.sihId = l.sihId
  CROSS JOIN GlobalScale gs
  GROUP BY l.Item
),
Returns AS (
  SELECT srd.Item,
    SUM(srd.AmountBVat)          AS retRev,
    SUM(ABS(srd.GroupCostPrice)) AS retCost,
    SUM(ABS(srd.GroupQuantity))  AS retQty
  FROM SalesReturnHeader srh
  JOIN SalesReturnDetail srd ON srd.HeaderID = srh.ID
  JOIN Item i ON i.Id = srd.Item AND i.ItemType = 1
  WHERE CAST(srh.TransactionDate AS DATE) BETWEEN '${from}' AND '${to}'
  GROUP BY srd.Item
)
SELECT
  i.Id  AS itemId,
  i.Code,
  i.NameAr,
  ic.NameAr AS category,
  ic.Id     AS catId,
  ROUND(s.grossQty  - ISNULL(r.retQty,  0), 3) AS qtySold,
  ROUND(s.grossRev  - ISNULL(r.retRev,  0), 2) AS revenue,
  ROUND(s.grossCost - ISNULL(r.retCost, 0), 2) AS cost,
  ROUND((s.grossRev  - ISNULL(r.retRev,  0)) - (s.grossCost - ISNULL(r.retCost, 0)), 2) AS profit,
  ROUND(
    CASE WHEN (s.grossRev - ISNULL(r.retRev, 0)) > 0
      THEN ((s.grossRev  - ISNULL(r.retRev,  0)) - (s.grossCost - ISNULL(r.retCost, 0)))
           / (s.grossRev - ISNULL(r.retRev,  0)) * 100
      ELSE 0
    END, 2) AS marginPct
FROM ItemSales s
JOIN Item i           ON i.Id  = s.Item
JOIN ItemCategory ic  ON ic.Id = i.Category
LEFT JOIN Returns r   ON r.Item = s.Item
WHERE (s.grossRev - ISNULL(r.retRev, 0)) > 0
ORDER BY profit DESC
`;
}

async function getItemProfitability(dbName, from, to) {
  const pool = await getPool(dbName);

  const glRow = await pool.request().query(`
    SELECT
      SUM(CASE WHEN jd.AccountChart IN (199,202) THEN jd.Credit - jd.Debit ELSE 0 END)
      - SUM(CASE WHEN jd.AccountChart IN (200,203) THEN jd.Debit - jd.Credit ELSE 0 END) AS glRevenue,
      SUM(CASE WHEN jd.AccountChart = 124         THEN jd.Debit - jd.Credit ELSE 0 END)  AS glCogs
    FROM JournalVoucherHeader jh
    JOIN JournalVoucherDetail jd ON jd.HeaderID = jh.ID
    WHERE jd.AccountChart IN (199,200,202,203,124)
      AND CAST(jh.TransactionDate AS DATE) BETWEEN '${from}' AND '${to}'
  `);
  const glRevenue = glRow.recordset[0]?.glRevenue || 0;
  const glCogs    = glRow.recordset[0]?.glCogs    || 0;

  const res  = await pool.request().query(buildSQL(from, to, glCogs));
  const rows = res.recordset;

  let totalRevenue = 0, totalCost = 0, totalProfit = 0;
  let lossCount = 0, lossValue = 0, lowMarginCount = 0;

  const FIN_PCT = 7;
  const items = rows.map(r => {
    const rev    = r.revenue   || 0;
    const cost   = r.cost      || 0;
    const profit = r.profit    || 0;
    const margin = r.marginPct || 0;
    totalRevenue += rev;
    totalCost    += cost;
    totalProfit  += profit;
    if (margin < 0)                      { lossCount++;     lossValue += rev; }
    if (margin >= 0 && margin < FIN_PCT)   lowMarginCount++;
    return {
      itemId:   r.itemId,
      code:     r.Code,
      name:     r.NameAr,
      category: r.category,
      catId:    r.catId,
      qtySold:  parseFloat((r.qtySold || 0).toFixed(3)),
      revenue:  parseFloat(rev.toFixed(2)),
      cost:     parseFloat(cost.toFixed(2)),
      profit:   parseFloat(profit.toFixed(2)),
      margin:   parseFloat(margin.toFixed(2)),
    };
  });

  const totalMargin = totalRevenue > 0 ? (totalProfit / totalRevenue * 100) : 0;

  return {
    db: dbName, from, to,
    asOf: new Date().toISOString().slice(0, 10),
    totals: {
      revenue:        parseFloat(totalRevenue.toFixed(2)),
      cost:           parseFloat(totalCost.toFixed(2)),
      profit:         parseFloat(totalProfit.toFixed(2)),
      margin:         parseFloat(totalMargin.toFixed(2)),
      itemCount:      items.length,
      lossCount,
      lossRevenue:    parseFloat(lossValue.toFixed(2)),
      lowMarginCount,
    },
    reconciliation: {
      glRevenue:     parseFloat(glRevenue.toFixed(2)),
      glCogs:        parseFloat(glCogs.toFixed(2)),
      glGrossProfit: parseFloat((glRevenue - glCogs).toFixed(2)),
      glMargin:      glRevenue > 0 ? parseFloat(((glRevenue - glCogs) / glRevenue * 100).toFixed(2)) : 0,
      tabRevenue:    parseFloat(totalRevenue.toFixed(2)),
      tabCost:       parseFloat(totalCost.toFixed(2)),
      note: 'التكلفة تساوي GL COGS بعد تطبيق معامل الضبط (تكلفة التسليم × نسبة تصحيح GL)',
    },
    items,
  };
}

module.exports = { getItemProfitability };
