'use strict';
const sql      = require('mssql');
const { getPool } = require('../db');

const AR_MONTHS = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو',
                   'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

/*
 * Account groupings — match ERP P&L chart-of-accounts classification exactly:
 *
 *   COGS   4010101%  — all accounts under تكلفة البضاعة المباعة:
 *                      001 perpetual COGS, 002 allowed discounts, 006 sales disc,
 *                      007 agent commissions, etc.
 *
 *   OpEx   4010301%  — transport & freight (dist) — full group, no exclusions
 *   OpEx   4020106%  — fees, customs, clearance (adm) — full group, no exclusions
 *
 * Prior approach put 4010301001, 4020106008, 4020106010 into COGS as "landed costs".
 * That diverged from the ERP P&L which keeps all of these in OpEx. Removed.
 */
async function getPLMonthly(dbName, startDate, endDate = null) {
  const pool      = await getPool(dbName);
  // If no endDate supplied, use today so the upper bound is always explicit in SQL
  const endParam  = endDate || new Date().toISOString().slice(0, 10);
  const res  = await pool.request()
    .input('startDate', sql.Date, startDate)
    .input('endDate',   sql.Date, endParam)
    .query(`
      WITH

      /* ── Revenue, COGS, and OpEx from JVD ── */
      jv AS (
        SELECT
          YEAR(h.TransactionDate)  AS Yr,
          MONTH(h.TransactionDate) AS Mo,

          /* Revenue: net of sales returns */
          SUM(CASE WHEN ac.Code LIKE '5%'
                   THEN jd.Credit - jd.Debit ELSE 0 END)            AS revenue,

          /* COGS: full 4010101% group — matches ERP P&L grouping */
          SUM(CASE WHEN ac.Code LIKE '4010101%'
                   THEN jd.Debit - jd.Credit ELSE 0 END)            AS cogsBase,

          /* Other direct cost bucket (40101020%) */
          SUM(CASE WHEN ac.Code LIKE '40101020%'
                   THEN jd.Debit - jd.Credit ELSE 0 END)            AS otherCost,

          /* OpEx — salaries */
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

          /* dist: full 4010301% — transport & freight (ERP OpEx) */
          SUM(CASE WHEN ac.Code LIKE '4010301%'
                   THEN jd.Debit - jd.Credit ELSE 0 END)            AS dist,

          /* adm: full 4020106% (fees/customs/clearance) + other admin groups */
          SUM(CASE WHEN ac.Code LIKE '4020106%'
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
          AND h.TransactionDate < DATEADD(day, 1, CAST(@endDate AS date))
          AND (ac.Code LIKE '5%' OR ac.Code LIKE '4%')
        GROUP BY YEAR(h.TransactionDate), MONTH(h.TransactionDate)
      )

      SELECT
        jv.Yr, jv.Mo,
        jv.revenue,
        jv.cogsBase                                                  AS cogs,
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
