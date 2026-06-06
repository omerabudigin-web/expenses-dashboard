'use strict';
const sql      = require('mssql');
const { getPool } = require('../db');

/*
 * Returns monthly intercompany revenue and COGS from entries in dbName
 * that are tagged to the given IC customer (the counterparty).
 * Used to eliminate seller-side revenue and corresponding COGS.
 */
async function getICPLElimination(dbName, startDate, icCustomerId) {
  const pool = await getPool(dbName);
  const res  = await pool.request()
    .input('startDate',   sql.Date,     startDate)
    .input('customerId',  sql.SmallInt, icCustomerId)
    .query(`
      SELECT
        YEAR(h.TransactionDate)  AS Yr,
        MONTH(h.TransactionDate) AS Mo,
        SUM(CASE WHEN ac.Code LIKE '5%'
                 THEN jd.Credit - jd.Debit ELSE 0 END)   AS icRevenue,
        SUM(CASE WHEN ac.Code = '4010101001'
                      OR ac.Code LIKE '40101020%'
                      OR ac.Code IN ('4010101002','4010101006','4010101007')
                 THEN jd.Debit - jd.Credit ELSE 0 END)   AS icCOGS
      FROM JournalVoucherDetail  jd
      JOIN JournalVoucherHeader   h  ON h.ID = jd.HeaderID
      JOIN AccountChart           ac ON ac.ID = jd.AccountChart
      WHERE jd.Customer = @customerId
        AND h.TransactionDate >= @startDate
      GROUP BY YEAR(h.TransactionDate), MONTH(h.TransactionDate)
      ORDER BY Yr, Mo
    `);

  return res.recordset.map(r => ({
    month:     `${r.Yr}-${String(r.Mo).padStart(2,'0')}`,
    icRevenue: +r.icRevenue || 0,
    icCOGS:    +r.icCOGS    || 0,
  }));
}

/*
 * Returns the monthly cumulative IC net position for dbName toward its counterparty.
 * Net position = AR (Debit−Credit on group-1 accounts tagged to IC customer)
 *              − AP (Credit−Debit on group-2 accounts tagged to IC supplier)
 *
 * A positive net means the counterparty owes this company on balance.
 * A negative net means this company owes the counterparty on balance.
 *
 * Both AR and AP are tracked separately so the caller can eliminate each
 * against the correct combined-BS account, but the net is the authoritative
 * intercompany reconciliation figure.
 */
async function getICBSElimination(dbName, icCustomerId, icSupplierId) {
  const pool = await getPool(dbName);
  const res  = await pool.request()
    .input('customerId', sql.SmallInt, icCustomerId)
    .input('supplierId', sql.SmallInt, icSupplierId)
    .query(`
      WITH monthly_ic AS (
        SELECT
          YEAR(h.TransactionDate)  AS Yr,
          MONTH(h.TransactionDate) AS Mo,
          -- AR: what the IC partner owes this company (group-1 debit balance)
          SUM(CASE WHEN jd.Customer = @customerId AND ac.Code LIKE '1030301%'
                   THEN jd.Debit - jd.Credit ELSE 0 END) AS icARMonthly,
          -- AP: what this company owes the IC partner (group-2 credit balance)
          SUM(CASE WHEN jd.Supplier = @supplierId AND ac.Code LIKE '2010101%'
                   THEN jd.Credit - jd.Debit ELSE 0 END) AS icAPMonthly
        FROM JournalVoucherDetail  jd
        JOIN JournalVoucherHeader   h  ON h.ID = jd.HeaderID
        JOIN AccountChart           ac ON ac.ID = jd.AccountChart
        WHERE (jd.Customer = @customerId OR jd.Supplier = @supplierId)
        GROUP BY YEAR(h.TransactionDate), MONTH(h.TransactionDate)
      ),
      all_months AS (SELECT DISTINCT Yr, Mo FROM monthly_ic),
      running    AS (
        SELECT am.Yr, am.Mo,
          CAST(SUM(ISNULL(mic.icARMonthly,0)) OVER (
            ORDER BY am.Yr, am.Mo ROWS UNBOUNDED PRECEDING) AS DECIMAL(18,2)) AS icARBalance,
          CAST(SUM(ISNULL(mic.icAPMonthly,0)) OVER (
            ORDER BY am.Yr, am.Mo ROWS UNBOUNDED PRECEDING) AS DECIMAL(18,2)) AS icAPBalance
        FROM all_months am
        LEFT JOIN monthly_ic mic ON mic.Yr = am.Yr AND mic.Mo = am.Mo
      )
      SELECT Yr, Mo, icARBalance, icAPBalance,
             icARBalance - icAPBalance AS icNetBalance
      FROM running ORDER BY Yr, Mo
    `);

  return res.recordset.map(r => ({
    month:        `${r.Yr}-${String(r.Mo).padStart(2,'0')}`,
    icARBalance:  +r.icARBalance  || 0,
    icAPBalance:  +r.icAPBalance  || 0,
    icNetBalance: +r.icNetBalance || 0,
  }));
}

module.exports = { getICPLElimination, getICBSElimination };
