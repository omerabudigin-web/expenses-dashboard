'use strict';
const sql      = require('mssql');
const { getPool } = require('../db');

const AR_MONTHS = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو',
                   'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

/*
 * COGS method: net debit on perpetual COGS account (4010101001).
 *
 * Using the perpetual account directly (Debit − Credit) gives correct results
 * because it automatically captures:
 *   - Cat6 entries: actual sales COGS (debit 4010101001, credit inventory)
 *   - Cat14 entries: cost corrections/reinstatements (net adjustment)
 *   - Cat7 entries: sales return reversals (credit 4010101001)
 *
 * The periodic formula (Purchases − Returns + Landed − InventoryNetChange) was
 * distorted by:
 *   1. CategoryID=2 "فاتورة مشتريات" receipts that have no JVD inventory entry,
 *      inflating purchases without an offsetting inventory change.
 *   2. Large Cat14 reclassification entries in some months inflating inv net change.
 *
 * Landed costs (transport 4010301001 + customs 4020106008 + clearance 4020106010)
 * are added separately as they are not reflected in 4010101001.
 *
 * Direct cost additions folded into COGS:
 *   4010101006 (خصم مبيعات) and 4010101007 (عمولات المناديب) sit under the
 *   تكلفة المبيعات parent but are not in 4010101001 — added here so gross profit
 *   matches the ERP chart of accounts cost-of-sales grouping.
 *
 * OpEx: all categories use net (Debit − Credit) to capture reversals correctly.
 * OpEx adjustments:
 *   dist: excludes 4010301001 (moved to landed costs inside COGS)
 *   adm:  excludes 4020106008 and 4020106010 (moved to landed costs inside COGS)
 */
async function getPLMonthly(dbName, startDate) {
  const pool = await getPool(dbName);
  const res  = await pool.request()
    .input('startDate', sql.Date, startDate)
    .query(`
      WITH

      /* ── Revenue, COGS, landed costs, and OpEx from JVD ── */
      jv AS (
        SELECT
          YEAR(h.TransactionDate)  AS Yr,
          MONTH(h.TransactionDate) AS Mo,

          /* Revenue: net of sales returns */
          SUM(CASE WHEN ac.Code LIKE '5%'
                   THEN jd.Credit - jd.Debit ELSE 0 END)            AS revenue,

          /* COGS: net debit on perpetual account — includes all corrections */
          SUM(CASE WHEN ac.Code = '4010101001'
                   THEN jd.Debit - jd.Credit ELSE 0 END)            AS cogsBase,

          /* Other direct cost bucket (40101020%) */
          SUM(CASE WHEN ac.Code LIKE '40101020%'
                   THEN jd.Debit - jd.Credit ELSE 0 END)            AS otherCost,

          /* Landed costs: transport (net) + customs + clearance */
          SUM(CASE WHEN ac.Code = '4010301001'
                    OR ac.Code = '4020106008'
                    OR ac.Code = '4020106010'
                   THEN jd.Debit - jd.Credit ELSE 0 END)            AS landed,

          /* Direct cost additions: allowed discount + sales discounts + agent commissions */
          SUM(CASE WHEN ac.Code IN ('4010101002','4010101006','4010101007')
                   THEN jd.Debit - jd.Credit ELSE 0 END)            AS directCosts,

          /* OpEx — transport removed from dist; customs/clearance removed from adm */
          SUM(CASE WHEN ac.Code LIKE '4020101%'
                            OR ac.Code LIKE '4020102%'
                            OR ac.Code LIKE '4020104%'
                   THEN jd.Debit - jd.Credit ELSE 0 END)            AS sal,

          SUM(CASE WHEN ac.Code LIKE '4020105%'
                   THEN jd.Debit - jd.Credit ELSE 0 END)            AS rent,

          SUM(CASE WHEN ac.Code LIKE '4020109%'
                            OR ac.Code LIKE '4020110%'
                   THEN jd.Debit - jd.Credit ELSE 0 END)            AS maint,

          SUM(CASE WHEN ac.Code LIKE '4010201%'
                   THEN jd.Debit - jd.Credit ELSE 0 END)            AS sell,

          /* dist: 4010301% minus 4010301001 (moved to landed) */
          SUM(CASE WHEN ac.Code LIKE '4010301%'
                            AND ac.Code != '4010301001'
                   THEN jd.Debit - jd.Credit ELSE 0 END)            AS dist,

          /* adm: 4020106% minus customs/clearance (moved to landed) */
          SUM(CASE WHEN (ac.Code LIKE '4020106%'
                         AND ac.Code NOT IN ('4020106008','4020106010'))
                            OR ac.Code LIKE '4020107%'
                            OR ac.Code LIKE '4020108%'
                            OR ac.Code LIKE '4020111%'
                   THEN jd.Debit - jd.Credit ELSE 0 END)            AS adm,

          SUM(CASE WHEN ac.Code LIKE '4020115%'
                   THEN jd.Debit - jd.Credit ELSE 0 END)            AS char_,

          SUM(CASE WHEN ac.Code LIKE '4020118%'
                   THEN jd.Debit - jd.Credit ELSE 0 END)            AS fin,

          SUM(CASE WHEN ac.Code LIKE '4020117%'
                   THEN jd.Debit - jd.Credit ELSE 0 END)            AS oth

        FROM JournalVoucherHeader  h
        JOIN JournalVoucherDetail  jd ON jd.HeaderID = h.ID
        JOIN AccountChart          ac ON ac.ID = jd.AccountChart
        WHERE h.TransactionDate >= @startDate
          AND (ac.Code LIKE '5%' OR ac.Code LIKE '4%')
        GROUP BY YEAR(h.TransactionDate), MONTH(h.TransactionDate)
      )

      SELECT
        jv.Yr, jv.Mo,
        jv.revenue,
        jv.cogsBase + jv.landed + jv.directCosts                    AS cogs,
        jv.otherCost,
        jv.sal,   jv.rent,  jv.maint, jv.sell,
        jv.dist,  jv.adm,   jv.char_, jv.fin,   jv.oth
      FROM jv
      ORDER BY jv.Yr, jv.Mo
    `);

  return res.recordset.map(r => ({
    month:     `${r.Yr}-${String(r.Mo).padStart(2, '0')}`,
    label:     AR_MONTHS[r.Mo] + ' ' + String(r.Yr).slice(2),
    revenue:   +r.revenue   || 0,
    cogs:      +r.cogs      || 0,
    otherCost: +r.otherCost || 0,
    sal:       +r.sal       || 0,
    rent:      +r.rent      || 0,
    maint:     +r.maint     || 0,
    sell:      +r.sell      || 0,
    dist:      +r.dist      || 0,
    adm:       +r.adm       || 0,
    char:      +r.char_     || 0,
    fin:       +r.fin       || 0,
    oth:       +r.oth       || 0,
  }));
}

module.exports = { getPLMonthly };
