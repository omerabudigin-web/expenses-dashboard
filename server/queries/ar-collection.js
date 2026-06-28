'use strict';
const { getPool } = require('../db');

const FIN_RATE = 0.07; // 7% annual financing cost

function _buildSQL(from) {
  return `
WITH
CustGL AS (
  SELECT jd.Customer, SUM(jd.Debit - jd.Credit) AS glBalance
  FROM JournalVoucherDetail jd
  WHERE jd.AccountChart = 47 AND jd.Customer > 0
  GROUP BY jd.Customer
  HAVING SUM(jd.Debit - jd.Credit) > 0
),
MatchedAP AS (
  -- AP balance for customers who share a VatNo with a local/foreign supplier (related-party netting)
  SELECT c.Id AS custId, SUM(jd.Credit - jd.Debit) AS apBalance
  FROM Customer c
  JOIN Supplier s ON s.VatNo = c.VatNo AND NULLIF(c.VatNo, N'') IS NOT NULL
  JOIN JournalVoucherDetail jd ON jd.Supplier = s.Id
  WHERE jd.AccountChart IN (77, 78)
  GROUP BY c.Id
  HAVING SUM(jd.Credit - jd.Debit) > 0
),
InvAR AS (
  SELECT sih.Customer,
    ISNULL(DATEDIFF(DAY, sih.DueDate, GETDATE()), 999) AS daysOverdue,
    SUM(jd.Debit) AS invAmt
  FROM SalesInvoice_JournalVoucherHeader lnk
  JOIN JournalVoucherHeader jvh ON jvh.ID = lnk.JournalVoucherHeaderID
  JOIN JournalVoucherDetail jd  ON jd.HeaderID = jvh.ID
  JOIN SalesInvoiceHeader sih   ON sih.ID = lnk.SalesInvoiceHeaderID
  WHERE jd.AccountChart = 47
  GROUP BY sih.Customer, sih.ID, sih.DueDate
  HAVING SUM(jd.Debit) > 0
),
CustInv AS (
  SELECT Customer,
    SUM(invAmt) AS totalInv,
    SUM(CASE WHEN daysOverdue <= 0              THEN invAmt ELSE 0 END) AS bCurrent,
    SUM(CASE WHEN daysOverdue BETWEEN  1 AND 30  THEN invAmt ELSE 0 END) AS b1_30,
    SUM(CASE WHEN daysOverdue BETWEEN 31 AND 60  THEN invAmt ELSE 0 END) AS b31_60,
    SUM(CASE WHEN daysOverdue BETWEEN 61 AND 90  THEN invAmt ELSE 0 END) AS b61_90,
    SUM(CASE WHEN daysOverdue BETWEEN 91 AND 120 THEN invAmt ELSE 0 END) AS b91_120,
    SUM(CASE WHEN daysOverdue > 120              THEN invAmt ELSE 0 END) AS bPlus120,
    CASE WHEN SUM(invAmt) > 0
      THEN SUM(CAST(invAmt AS FLOAT) *
               CASE WHEN daysOverdue > 0 THEN CAST(daysOverdue AS FLOAT) ELSE 0.0 END)
           / SUM(invAmt)
      ELSE 0 END AS wtdOverdue
  FROM InvAR
  GROUP BY Customer
),
PeriodRev AS (
  SELECT
    SUM(jd.Credit - jd.Debit)                         AS totRev,
    DATEDIFF(DAY, '${from}', CAST(GETDATE() AS DATE)) AS periodDays
  FROM JournalVoucherDetail jd
  JOIN JournalVoucherHeader jvh ON jvh.ID = jd.HeaderID
  WHERE jd.AccountChart IN (202, 199)
    AND CAST(jvh.TransactionDate AS DATE) >= '${from}'
)
SELECT
  cg.Customer AS custId,
  c.NameAr    AS custName,
  ROUND(cg.glBalance,            2) AS glBalance,
  ROUND(ISNULL(ma.apBalance, 0), 2) AS apBalance,
  ROUND(ISNULL(ci.totalInv,  0), 2) AS totalInv,
  ROUND(ISNULL(ci.bCurrent,  0), 2) AS bCurrent,
  ROUND(ISNULL(ci.b1_30,     0), 2) AS b1_30,
  ROUND(ISNULL(ci.b31_60,    0), 2) AS b31_60,
  ROUND(ISNULL(ci.b61_90,    0), 2) AS b61_90,
  ROUND(ISNULL(ci.b91_120,   0), 2) AS b91_120,
  ROUND(ISNULL(ci.bPlus120,  0), 2) AS bPlus120,
  ROUND(ISNULL(ci.wtdOverdue,0), 1) AS wtdOverdue,
  pr.totRev    AS periodRev,
  pr.periodDays
FROM CustGL cg
JOIN Customer c ON c.Id = cg.Customer
LEFT JOIN MatchedAP ma ON ma.custId = cg.Customer
LEFT JOIN CustInv ci ON ci.Customer = cg.Customer
CROSS JOIN PeriodRev pr
ORDER BY cg.glBalance DESC
`;
}

function _scaleCustomer(r) {
  const glBalance = r.glBalance || 0;
  const totalInv  = r.totalInv  || 0;

  if (totalInv <= 0) {
    return { bCurrent: 0, b1_30: 0, b31_60: 0, b61_90: 0, b91_120: 0, bPlus120: glBalance };
  }

  const sf     = glBalance <= totalInv ? glBalance / totalInv : 1.0;
  const excess = glBalance > totalInv  ? glBalance - totalInv : 0;

  return {
    bCurrent: (r.bCurrent  || 0) * sf,
    b1_30:    (r.b1_30     || 0) * sf,
    b31_60:   (r.b31_60    || 0) * sf,
    b61_90:   (r.b61_90    || 0) * sf,
    b91_120:  (r.b91_120   || 0) * sf,
    bPlus120: (r.bPlus120  || 0) * sf + excess,
  };
}

function _action(avgDays) {
  if (avgDays > 90) return 'عاجل';
  if (avgDays > 30) return 'متابعة';
  if (avgDays > 0)  return 'تنبيه';
  return 'عادي';
}

async function getARCollection(dbName, from) {
  const pool = await getPool(dbName);
  const res  = await pool.request().query(_buildSQL(from));
  const rows = res.recordset;

  const periodRev  = rows[0]?.periodRev  || 0;
  const periodDays = rows[0]?.periodDays || 1;
  const dailyRev   = periodRev / Math.max(periodDays, 1);

  let totBalance = 0, totCurrent = 0, tot1_30 = 0, tot31_60 = 0;
  let tot61_90 = 0, tot91_120 = 0, totPlus120 = 0, wtdSum = 0;

  // Market segment (non-intercompany)
  let totMarketBalance = 0, totMarketWtdSum = 0, totMarketFinCost = 0, marketCount = 0;
  // Intercompany segment
  let totIntercoBalance = 0, totIntercoAP = 0, intercoCount = 0;

  const customers = rows.map(r => {
    const bal       = r.glBalance || 0;
    const apBalance = Math.max(r.apBalance || 0, 0);
    const isInterco = apBalance > 0;    // dual-party: show AP column
    const netExposure = parseFloat((bal - apBalance).toFixed(2));
    const avgDays   = r.wtdOverdue || 0;
    const scaled    = _scaleCustomer(r);
    // Only exclude from collection plan if net exposure is negative (we owe them more than they owe us)
    const action    = (isInterco && netExposure < 0) ? 'تسوية مجموعة' : _action(avgDays);
    const finCost   = (action === 'تسوية مجموعة') ? 0 : parseFloat((bal * FIN_RATE).toFixed(2));

    totBalance  += bal;
    totCurrent  += scaled.bCurrent;
    tot1_30     += scaled.b1_30;
    tot31_60    += scaled.b31_60;
    tot61_90    += scaled.b61_90;
    tot91_120   += scaled.b91_120;
    totPlus120  += scaled.bPlus120;
    wtdSum      += bal * avgDays;

    if (action === 'تسوية مجموعة') {
      totIntercoBalance += bal;
      totIntercoAP      += apBalance;
      intercoCount++;
    } else {
      totMarketBalance += bal;
      totMarketWtdSum  += bal * avgDays;
      totMarketFinCost += finCost;
      marketCount++;
    }

    return {
      custId:         r.custId,
      custName:       r.custName,
      balance:        parseFloat(bal.toFixed(2)),
      apBalance:      parseFloat(apBalance.toFixed(2)),
      netExposure,
      isInterco,
      bCurrent:       parseFloat(scaled.bCurrent.toFixed(2)),
      b1_30:          parseFloat(scaled.b1_30.toFixed(2)),
      b31_60:         parseFloat(scaled.b31_60.toFixed(2)),
      b61_90:         parseFloat(scaled.b61_90.toFixed(2)),
      b91_120:        parseFloat(scaled.b91_120.toFixed(2)),
      bPlus120:       parseFloat(scaled.bPlus120.toFixed(2)),
      avgDaysOverdue: parseFloat(avgDays.toFixed(1)),
      financingCost:  finCost,
      action,
    };
  });

  const avgDaysTotal  = totBalance > 0 ? wtdSum / totBalance : 0;
  const dso           = dailyRev > 0 ? totBalance / dailyRev : 0;
  const marketDso     = dailyRev > 0 ? totMarketBalance / dailyRev : 0;
  const marketAvgDays = totMarketBalance > 0 ? totMarketWtdSum / totMarketBalance : 0;

  return {
    db:          dbName,
    from,
    asOf:        new Date().toISOString().slice(0, 10),
    periodDays,
    periodRev:   parseFloat(periodRev.toFixed(2)),
    customers,
    totals: {
      balance:            parseFloat(totBalance.toFixed(2)),
      bCurrent:           parseFloat(totCurrent.toFixed(2)),
      b1_30:              parseFloat(tot1_30.toFixed(2)),
      b31_60:             parseFloat(tot31_60.toFixed(2)),
      b61_90:             parseFloat(tot61_90.toFixed(2)),
      b91_120:            parseFloat(tot91_120.toFixed(2)),
      bPlus120:           parseFloat(totPlus120.toFixed(2)),
      avgDaysOverdue:     parseFloat(avgDaysTotal.toFixed(1)),
      dso:                parseFloat(dso.toFixed(1)),
      financingCostTotal: parseFloat((totBalance * FIN_RATE).toFixed(2)),
      customerCount:      customers.length,
      // Market segment
      marketBalance:      parseFloat(totMarketBalance.toFixed(2)),
      marketCount,
      marketDso:          parseFloat(marketDso.toFixed(1)),
      marketAvgDays:      parseFloat(marketAvgDays.toFixed(1)),
      marketFinCostTotal: parseFloat(totMarketFinCost.toFixed(2)),
      // Intercompany segment
      intercoBalance:     parseFloat(totIntercoBalance.toFixed(2)),
      intercoAP:          parseFloat(totIntercoAP.toFixed(2)),
      intercoNet:         parseFloat((totIntercoBalance - totIntercoAP).toFixed(2)),
      intercoCount,
    },
  };
}

module.exports = { getARCollection };
