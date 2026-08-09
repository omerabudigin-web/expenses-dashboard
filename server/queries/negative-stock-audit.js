'use strict';
const sql      = require('mssql');
const { getPool } = require('../db');

const AR_MONTHS = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو',
                   'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

// Same intercompany party map as server/index.js's IC_MAP — kept in sync manually
// (DB1 أبعاد: وسام is Customer 109 / Supplier 3. DB2 وسام: أبعاد is Customer 3 / Supplier 2).
const IC_MAP = {
  MekSoftDb1: { icCustomerId: 109, icSupplierId: 3 },
  MekSoftDb2: { icCustomerId: 3,   icSupplierId: 2 },
};

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
 *
 * Already-resolved exclusion: some flagged invoices were already fully reversed by a
 * genuine customer SalesReturn (goods physically came back — both revenue and the bad
 * COGS get credited back together in the return's own JV, net effect already zero in
 * the ledger). These must NOT be corrected/excluded a second time — doing so double-
 * counts the same distortion (once via the original invoice, once via its own already-
 * self-canceling return) and badly skews the result, most visibly on the smaller-
 * revenue company where a couple of large reversed invoices can swing the margin by
 * dozens of points. Detected via the authoritative SalesReturnHeader.SalesInvoiceId
 * link (NOT amount-coincidence matching — verified live that two flagged invoices can
 * share an identical COGS distortion value by pure coincidence with an unrelated
 * return, so matching on amount alone produces false positives).
 *
 * Custody-transfer exclusion: confirmed with the owner that most large intercompany
 * invoices between أبعاد and وسام are not commercial sales at all — they're the same
 * physical steel moving between the two related entities' custody, recorded as a
 * matching sale/purchase pair at an identical price (no markup either direction).
 * ~78% of large (>50,000) intercompany invoices have an exact-amount matching
 * purchase in the other leg within days; the reciprocal "closing" purchase back in
 * the ORIGINATING company's own book can be dated weeks earlier than the sale it
 * closes out (verified: a July sale's matching buy-back purchase was dated late June).
 * These pairs carry no real profit or loss, so a flagged invoice that's part of one
 * is excluded here the same way an already-returned invoice is: matched by exact
 * revenue amount against a same-company purchase from the intercompany supplier,
 * within a 60-day window (wide enough to cover the observed lag, not exact-day only).
 */

async function getNegativeStockAudit(dbName, from, to) {
  const pool = await getPool(dbName);
  const ic = IC_MAP[dbName] || { icCustomerId: -1, icSupplierId: -1 };

  const [flaggedRes, resolvedRes, custodyRes, monthlyRes] = await Promise.all([
    pool.request()
      .input('from', sql.Date, from)
      .input('to',   sql.Date, to)
      .input('icCustomerId', sql.Int, ic.icCustomerId)
      .input('icSupplierId', sql.Int, ic.icSupplierId)
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
          SELECT i.* FROM Invoices i
          WHERE i.revenue <> 0 AND (i.reportedCogs < 0 OR i.reportedCogs > i.revenue * 2)
            AND NOT EXISTS (SELECT 1 FROM SalesReturnHeader srh WHERE srh.SalesInvoiceId = i.invId)
            AND NOT (
              i.customerId = @icCustomerId
              AND EXISTS (
                SELECT 1
                FROM PurchaseInvoiceHeader pih
                JOIN PurchaseInvoiceDetail pid ON pid.HeaderID = pih.ID
                WHERE pih.Supplier = @icSupplierId
                GROUP BY pih.ID, pih.TransactionDate
                HAVING ABS(SUM(pid.Net) - i.revenue) < 1
                   AND ABS(DATEDIFF(day, MIN(pih.TransactionDate), i.dt)) <= 60
              )
            )
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
        ),
        RankedLines AS (
          SELECT sid.HeaderID AS invId, i.NameAr AS itemName, sid.Item AS itemId,
                 ABS(sid.GroupQuantity) AS qty, iac.avgCostPerUnit AS refCostPerUnit,
                 ROW_NUMBER() OVER (PARTITION BY sid.HeaderID ORDER BY ABS(sid.GroupCostPrice) DESC) AS rn
          FROM SalesInvoiceDetail sid
          JOIN Item i ON i.Id = sid.Item
          JOIN Flagged f ON f.invId = sid.HeaderID
          LEFT JOIN ItemAvgCost iac ON iac.Item = sid.Item
        )
        SELECT
          f.invId, f.jvId, f.dt, f.revenue, f.reportedCogs,
          cl.correctedCogs, cl.unpricedLines,
          c.NameAr  AS customerName,
          sm.NameAr AS salesManName,
          rl.itemName AS dominantItem, rl.itemId AS dominantItemId,
          rl.qty AS dominantItemQty, rl.refCostPerUnit AS dominantItemRefCost
        FROM Flagged f
        JOIN CorrectedLines cl ON cl.invId = f.invId
        LEFT JOIN Customer c  ON c.Id  = f.customerId
        LEFT JOIN SalesMan sm ON sm.Id = f.salesManId
        LEFT JOIN RankedLines rl ON rl.invId = f.invId AND rl.rn = 1
        ORDER BY f.dt
      `),
    pool.request()
      .input('from', sql.Date, from)
      .input('to',   sql.Date, to)
      .query(`
        WITH Invoices AS (
          SELECT
            sih.ID              AS invId,
            sjv.JournalVoucherHeaderID AS jvId,
            sih.TransactionDate AS dt,
            SUM(CASE WHEN ac.Code LIKE '5%'       THEN jd.Credit - jd.Debit ELSE 0 END) AS revenue,
            SUM(CASE WHEN ac.Code LIKE '4010101%' THEN jd.Debit - jd.Credit ELSE 0 END) AS reportedCogs
          FROM SalesInvoice_JournalVoucherHeader sjv
          JOIN SalesInvoiceHeader   sih ON sih.ID = sjv.SalesInvoiceHeaderID
          JOIN JournalVoucherDetail jd  ON jd.HeaderID = sjv.JournalVoucherHeaderID
          JOIN AccountChart         ac  ON ac.ID = jd.AccountChart
          WHERE sih.TransactionDate >= @from AND sih.TransactionDate < DATEADD(day, 1, @to)
          GROUP BY sih.ID, sjv.JournalVoucherHeaderID, sih.TransactionDate
        )
        SELECT i.invId, i.jvId, i.dt, i.revenue, i.reportedCogs,
               srh.ID AS returnId, srh.TransactionDate AS returnDate
        FROM Invoices i
        JOIN SalesReturnHeader srh ON srh.SalesInvoiceId = i.invId
        WHERE i.revenue <> 0 AND (i.reportedCogs < 0 OR i.reportedCogs > i.revenue * 2)
        ORDER BY i.dt
      `),
    pool.request()
      .input('from', sql.Date, from)
      .input('to',   sql.Date, to)
      .input('icCustomerId', sql.Int, ic.icCustomerId)
      .input('icSupplierId', sql.Int, ic.icSupplierId)
      .query(`
        WITH Invoices AS (
          SELECT
            sih.ID              AS invId,
            sjv.JournalVoucherHeaderID AS jvId,
            sih.TransactionDate AS dt,
            sih.Customer        AS customerId,
            SUM(CASE WHEN ac.Code LIKE '5%'       THEN jd.Credit - jd.Debit ELSE 0 END) AS revenue,
            SUM(CASE WHEN ac.Code LIKE '4010101%' THEN jd.Debit - jd.Credit ELSE 0 END) AS reportedCogs
          FROM SalesInvoice_JournalVoucherHeader sjv
          JOIN SalesInvoiceHeader   sih ON sih.ID = sjv.SalesInvoiceHeaderID
          JOIN JournalVoucherDetail jd  ON jd.HeaderID = sjv.JournalVoucherHeaderID
          JOIN AccountChart         ac  ON ac.ID = jd.AccountChart
          WHERE sih.TransactionDate >= @from AND sih.TransactionDate < DATEADD(day, 1, @to)
          GROUP BY sih.ID, sjv.JournalVoucherHeaderID, sih.TransactionDate, sih.Customer
        ),
        Matches AS (
          SELECT i.invId, m.purId, m.purDate, m.purNet
          FROM Invoices i
          CROSS APPLY (
            SELECT TOP 1 pih.ID AS purId, MIN(pih.TransactionDate) AS purDate, SUM(pid.Net) AS purNet
            FROM PurchaseInvoiceHeader pih
            JOIN PurchaseInvoiceDetail pid ON pid.HeaderID = pih.ID
            WHERE pih.Supplier = @icSupplierId
            GROUP BY pih.ID, pih.TransactionDate
            HAVING ABS(SUM(pid.Net) - i.revenue) < 1
               AND ABS(DATEDIFF(day, MIN(pih.TransactionDate), i.dt)) <= 60
          ) m
          WHERE i.revenue <> 0 AND (i.reportedCogs < 0 OR i.reportedCogs > i.revenue * 2)
            AND i.customerId = @icCustomerId
            AND NOT EXISTS (SELECT 1 FROM SalesReturnHeader srh WHERE srh.SalesInvoiceId = i.invId)
        )
        SELECT i.invId, i.jvId, i.dt, i.revenue, i.reportedCogs, mt.purId, mt.purDate, mt.purNet
        FROM Invoices i
        JOIN Matches mt ON mt.invId = i.invId
        ORDER BY i.dt
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

  const resolvedByReturn = resolvedRes.recordset.map(r => ({
    invId:      r.invId,
    jvId:       r.jvId,
    date:       r.dt.toISOString().slice(0, 10),
    revenue:    +r.revenue || 0,
    reportedCogs: +r.reportedCogs || 0,
    returnId:   r.returnId,
    returnDate: r.returnDate.toISOString().slice(0, 10),
  }));

  const resolvedByCustodyTransfer = custodyRes.recordset.map(r => ({
    invId:        r.invId,
    jvId:         r.jvId,
    date:         r.dt.toISOString().slice(0, 10),
    revenue:      +r.revenue || 0,
    reportedCogs: +r.reportedCogs || 0,
    purId:        r.purId,
    purDate:      r.purDate.toISOString().slice(0, 10),
    purNet:       +r.purNet || 0,
  }));

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
      dominantItem:       r.dominantItem || null,   // the line with the largest |GroupCostPrice| — where to look first in MekSoft
      dominantItemQty:    r.dominantItemQty != null ? +r.dominantItemQty : null,
      dominantItemRefCost: r.dominantItemRefCost != null ? +r.dominantItemRefCost : null, // clean avg purchase cost/unit for that item
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
  totals.resolvedByReturnCount = resolvedByReturn.length;
  totals.resolvedByCustodyTransferCount = resolvedByCustodyTransfer.length;

  // Correction plan: group invoices by the item most responsible for the defect,
  // so the accountant can prioritize the few SKUs behind most of the distortion
  // instead of chasing invoices one by one.
  const byItem = new Map();
  invoices.forEach(inv => {
    const key = inv.dominantItem || 'غير محدَّد';
    if (!byItem.has(key)) byItem.set(key, {
      item: key, refCostPerUnit: inv.dominantItemRefCost, invoiceCount: 0,
      totalRevenue: 0, totalReportedCogs: 0, totalCorrectedCogs: 0, totalAbsDistortion: 0,
    });
    const g = byItem.get(key);
    g.invoiceCount++;
    g.totalRevenue      += inv.revenue;
    g.totalReportedCogs  += inv.reportedCogs;
    g.totalCorrectedCogs += inv.correctedCogs;
    g.totalAbsDistortion += Math.abs(inv.distortion);
    if (g.refCostPerUnit == null && inv.dominantItemRefCost != null) g.refCostPerUnit = inv.dominantItemRefCost;
  });
  const itemSummary = [...byItem.values()].sort((a, b) => b.totalAbsDistortion - a.totalAbsDistortion);

  return { db: dbName, from, to, invoices, monthly, totals, resolvedByReturn, resolvedByCustodyTransfer, itemSummary };
}

module.exports = { getNegativeStockAudit };
