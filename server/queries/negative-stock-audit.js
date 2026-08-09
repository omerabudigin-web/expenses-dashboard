'use strict';
const sql      = require('mssql');
const { getPool } = require('../db');

const AR_MONTHS = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو',
                   'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

/*
 * Negative-stock costing defect audit.
 *
 * Root cause (verified live, per-invoice, against PurchaseInvoiceDetail history):
 * when an item's running stock (InventoryTransactionOnlyIncludedView) goes negative
 * at the moment of a SalesInvoice delivery, the ERP's weighted-average-cost engine
 * produces a corrupted COGS figure for that invoice — either wildly inflated or
 * negative — instead of the item's true purchase cost. This is a system data-integrity
 * defect, not a pricing decision.
 *
 * Detection heuristic (invoice-level, matches manual investigation):
 *   revenue <> 0 AND (reportedCogs < 0 OR reportedCogs > revenue * 2)
 * Every invoice flagged by this heuristic was independently confirmed to involve an
 * item with negative running stock at time of sale (100% match, checked across all
 * months Oct 2025–Aug 2026).
 *
 * Correction methodology: replace each flagged invoice's COGS with
 *   SUM(line qty × item's all-time weighted-average purchase cost from PurchaseInvoiceDetail)
 * This is an estimate (not a re-run of the ERP's perpetual-costing engine) but is
 * directly traceable to real purchase prices — the same method used to hand-verify
 * item #2081 (حديد مجدول راجحي 16مم×12م) against its October 2025 purchase history.
 */

async function getNegativeStockAudit(dbName, from, to) {
  const pool = await getPool(dbName);

  const [flaggedRes, monthlyRes] = await Promise.all([
    pool.request()
      .input('from', sql.Date, from)
      .input('to',   sql.Date, to)
      .query(`
        WITH Invoices AS (
          SELECT
            sih.ID                       AS invId,
            sjv.JournalVoucherHeaderID   AS jvId,
            sih.TransactionDate          AS dt,
            sih.Customer                 AS customerId,
            sih.SalesMan                 AS salesManId,
            SUM(CASE WHEN ac.Code LIKE '5%'      THEN jd.Credit - jd.Debit ELSE 0 END) AS revenue,
            SUM(CASE WHEN ac.Code LIKE '4010101%' THEN jd.Debit - jd.Credit ELSE 0 END) AS reportedCogs
          FROM SalesInvoice_JournalVoucherHeader sjv
          JOIN SalesInvoiceHeader   sih ON sih.ID = sjv.SalesInvoiceHeaderID
          JOIN JournalVoucherDetail jd  ON jd.HeaderID = sjv.JournalVoucherHeaderID
          JOIN AccountChart         ac  ON ac.ID = jd.AccountChart
          WHERE sih.TransactionDate >= @from AND sih.TransactionDate < DATEADD(day, 1, @to)
          GROUP BY sih.ID, sjv.JournalVoucherHeaderID, sih.TransactionDate, sih.Customer, sih.SalesMan
        ),
        Flagged AS (
          SELECT * FROM Invoices
          WHERE revenue <> 0 AND (reportedCogs < 0 OR reportedCogs > revenue * 2)
        ),
        ItemAvgCost AS (
          SELECT pid.Item,
                 SUM(pid.GroupCostPrice) / NULLIF(SUM(pid.GroupQuantity), 0) AS avgCostPerUnit
          FROM PurchaseInvoiceDetail pid
          GROUP BY pid.Item
        ),
        CorrectedLines AS (
          SELECT f.invId,
                 SUM(ABS(sid.GroupQuantity) * ISNULL(iac.avgCostPerUnit, 0)) AS correctedCogs,
                 SUM(CASE WHEN iac.avgCostPerUnit IS NULL THEN 1 ELSE 0 END) AS unpricedLines
          FROM Flagged f
          JOIN SalesInvoiceDetail sid ON sid.HeaderID = f.invId
          LEFT JOIN ItemAvgCost iac   ON iac.Item = sid.Item
          GROUP BY f.invId
        )
        SELECT
          f.invId, f.jvId, f.dt, f.revenue, f.reportedCogs,
          cl.correctedCogs, cl.unpricedLines,
          c.NameAr  AS customerName,
          sm.NameAr AS salesManName
        FROM Flagged f
        JOIN CorrectedLines cl ON cl.invId = f.invId
        LEFT JOIN Customer c  ON c.Id  = f.customerId
        LEFT JOIN SalesMan sm ON sm.Id = f.salesManId
        ORDER BY f.dt
      `),
    pool.request()
      .input('from', sql.Date, from)
      .input('to',   sql.Date, to)
      .query(`
        SELECT
          YEAR(h.TransactionDate)  AS Yr,
          MONTH(h.TransactionDate) AS Mo,
          SUM(CASE WHEN ac.Code LIKE '5%'       THEN jd.Credit - jd.Debit ELSE 0 END) AS revenue,
          SUM(CASE WHEN ac.Code LIKE '4010101%' THEN jd.Debit - jd.Credit ELSE 0 END) AS reportedCogs
        FROM JournalVoucherDetail jd
        JOIN JournalVoucherHeader h  ON h.ID = jd.HeaderID
        JOIN AccountChart         ac ON ac.ID = jd.AccountChart
        WHERE (ac.Code LIKE '5%' OR ac.Code LIKE '4010101%')
          AND h.TransactionDate >= @from AND h.TransactionDate < DATEADD(day, 1, @to)
        GROUP BY YEAR(h.TransactionDate), MONTH(h.TransactionDate)
        ORDER BY Yr, Mo
      `),
  ]);

  const invoices = flaggedRes.recordset.map(r => {
    const reportedCogs  = +r.reportedCogs  || 0;
    const correctedCogs = +r.correctedCogs || 0;
    return {
      invId:          r.invId,
      jvId:           r.jvId,
      date:           r.dt.toISOString().slice(0, 10),
      customer:       (r.customerName || '').trim(),
      salesMan:       (r.salesManName || '').trim(),
      revenue:        +r.revenue || 0,
      reportedCogs,
      correctedCogs,
      distortion:     reportedCogs - correctedCogs, // + = COGS overstated (profit understated), - = COGS understated (profit overstated)
      unpriced:       (r.unpricedLines || 0) > 0,   // item never appears in PurchaseInvoiceDetail — corrected estimate incomplete
    };
  });

  // Monthly correction deltas from flagged invoices
  const deltaByMonth = new Map(); // 'YYYY-MM' -> { reportedCogs, correctedCogs, count }
  invoices.forEach(inv => {
    const key = inv.date.slice(0, 7);
    if (!deltaByMonth.has(key)) deltaByMonth.set(key, { reportedCogs: 0, correctedCogs: 0, count: 0 });
    const d = deltaByMonth.get(key);
    d.reportedCogs  += inv.reportedCogs;
    d.correctedCogs += inv.correctedCogs;
    d.count++;
  });

  const monthly = monthlyRes.recordset.map(r => {
    const key      = `${r.Yr}-${String(r.Mo).padStart(2, '0')}`;
    const revenue  = +r.revenue || 0;
    const asReportedCogs = +r.reportedCogs || 0;
    const d = deltaByMonth.get(key) || { reportedCogs: 0, correctedCogs: 0, count: 0 };
    const correctedCogsTotal = asReportedCogs - d.reportedCogs + d.correctedCogs;

    const asReportedProfit = revenue - asReportedCogs;
    const correctedProfit  = revenue - correctedCogsTotal;

    return {
      month:            key,
      label:            AR_MONTHS[r.Mo] + ' ' + String(r.Yr).slice(2),
      revenue,
      asReportedCogs,
      asReportedProfit,
      asReportedMargin: revenue ? (asReportedProfit / revenue * 100) : 0,
      correctedCogs:    correctedCogsTotal,
      correctedProfit,
      correctedMargin:  revenue ? (correctedProfit / revenue * 100) : 0,
      distortion:       asReportedProfit - correctedProfit, // + = reported profit overstates truth, - = understates
      flaggedCount:     d.count,
    };
  });

  const totals = monthly.reduce((s, m) => {
    s.revenue           += m.revenue;
    s.asReportedCogs     += m.asReportedCogs;
    s.correctedCogs       += m.correctedCogs;
    s.asReportedProfit    += m.asReportedProfit;
    s.correctedProfit      += m.correctedProfit;
    return s;
  }, { revenue: 0, asReportedCogs: 0, correctedCogs: 0, asReportedProfit: 0, correctedProfit: 0 });
  totals.asReportedMargin = totals.revenue ? (totals.asReportedProfit / totals.revenue * 100) : 0;
  totals.correctedMargin  = totals.revenue ? (totals.correctedProfit  / totals.revenue * 100) : 0;
  totals.netDistortion    = totals.asReportedProfit - totals.correctedProfit;
  totals.invoiceCount     = invoices.length;
  totals.absDistortion    = invoices.reduce((s, i) => s + Math.abs(i.distortion), 0);

  return { db: dbName, from, to, invoices, monthly, totals };
}

module.exports = { getNegativeStockAudit };
