'use strict';
const { getPool } = require('../db');

async function getSafetyData(dbName) {
  const pool = await getPool(dbName);

  // Build 9 month labels dynamically
  const today = new Date();
  const months = [];
  for (let i = 8; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const [itemsResult, monthlySalesResult] = await Promise.all([
    // ── Main query: per-item analysis data ───────────────────────────────────
    pool.request().query(`
      WITH
      -- Safety category items only (مستلزمات أنظمة السلامة)
      SafetyItems AS (
        SELECT i.Id
        FROM Item i
        JOIN ItemCategory ic  ON ic.ID = i.Category
        LEFT JOIN ItemCategory ic2 ON ic2.ID = ic.ParentID
        WHERE i.ItemType <> 2
          AND (
            ic.NameAr  LIKE N'%سلامة%'
            OR ISNULL(ic2.NameAr, '') LIKE N'%سلامة%'
          )
      ),
      -- On-hand quantity (perpetual inventory)
      OnHand AS (
        SELECT v.Item, SUM(v.GroupQuantity) AS onHand
        FROM InventoryTransactionOnlyIncludedView v
        WHERE v.Item IN (SELECT Id FROM SafetyItems)
        GROUP BY v.Item
        HAVING SUM(v.GroupQuantity) <> 0
      ),
      -- MAC components
      Opening   AS (SELECT Item, SUM(Amount)        AS v FROM OpeningStockDetail        WHERE Item IN (SELECT Id FROM SafetyItems) GROUP BY Item),
      Received  AS (SELECT Item, SUM(GroupCostPrice) AS v FROM ReceiptGoodsDetail       WHERE Item IN (SELECT Id FROM SafetyItems) AND GroupQuantity > 0 GROUP BY Item),
      Increased AS (SELECT Item, SUM(GroupCostPrice) AS v FROM IncreaseStockDetail      WHERE Item IN (SELECT Id FROM SafetyItems) GROUP BY Item),
      Delivered AS (SELECT Item, SUM(GroupCostPrice) AS v FROM DeliverGoodsDetail       WHERE Item IN (SELECT Id FROM SafetyItems) GROUP BY Item),
      Decreased AS (SELECT Item, SUM(GroupCostPrice) AS v FROM DecreaseStockDetail      WHERE Item IN (SELECT Id FROM SafetyItems) GROUP BY Item),
      TrOut     AS (SELECT Item, SUM(GroupCostPrice) AS v FROM TransferIssuedDetail     WHERE Item IN (SELECT Id FROM SafetyItems) GROUP BY Item),
      TrIn      AS (SELECT Item, SUM(GroupCostPrice) AS v FROM TransferReceivingDetail  WHERE Item IN (SELECT Id FROM SafetyItems) GROUP BY Item),
      -- Reserved: undelivered sales invoice lines
      Reserved AS (
        SELECT sid.Item, ABS(SUM(sid.GroupQuantity)) AS reservedQty
        FROM SalesInvoiceDetail sid
        WHERE sid.Item IN (SELECT Id FROM SafetyItems)
          AND NOT EXISTS (
            SELECT 1 FROM SalesInvoice_DeliverGoodsDetail lnk
            WHERE lnk.SalesInvoiceDetailID = sid.ID
          )
        GROUP BY sid.Item
      ),
      -- Total lifetime purchases (cost basis)
      TotPurch AS (
        SELECT rgd.Item,
               ABS(SUM(rgd.GroupQuantity)) AS purchQty,
               SUM(rgd.GroupCostPrice)      AS purchCost
        FROM ReceiptGoodsDetail rgd
        WHERE rgd.Item IN (SELECT Id FROM SafetyItems) AND rgd.GroupQuantity > 0
        GROUP BY rgd.Item
      ),
      -- Total lifetime sales (gross, before returns)
      TotSales AS (
        SELECT sid.Item,
               ABS(SUM(sid.GroupQuantity)) AS soldQty,
               SUM(sid.Net)               AS salesNet
        FROM SalesInvoiceDetail sid
        WHERE sid.Item IN (SELECT Id FROM SafetyItems)
        GROUP BY sid.Item
      ),
      -- Total lifetime returns
      TotReturns AS (
        SELECT srd.Item,
               ABS(SUM(srd.GroupQuantity)) AS retQty,
               SUM(srd.Net)               AS retNet
        FROM SalesReturnDetail srd
        WHERE srd.Item IN (SELECT Id FROM SafetyItems)
        GROUP BY srd.Item
      ),
      -- Sales last 90 days (for DOH)
      Sales90 AS (
        SELECT sid.Item, ABS(SUM(sid.GroupQuantity)) AS qty90
        FROM SalesInvoiceDetail sid
        JOIN SalesInvoiceHeader sih ON sih.ID = sid.HeaderID
        WHERE sid.Item IN (SELECT Id FROM SafetyItems)
          AND sih.TransactionDate >= DATEADD(DAY, -90, CAST(GETDATE() AS DATE))
        GROUP BY sid.Item
      ),
      -- Last sale date
      LastSale AS (
        SELECT sid.Item, MAX(sih.TransactionDate) AS lastSaleDate
        FROM SalesInvoiceDetail sid
        JOIN SalesInvoiceHeader sih ON sih.ID = sid.HeaderID
        WHERE sid.Item IN (SELECT Id FROM SafetyItems)
        GROUP BY sid.Item
      ),
      -- Oldest receipt (approximation of FIFO age)
      OldestReceipt AS (
        SELECT rgd.Item, MIN(rgh.TransactionDate) AS oldestReceiptDate
        FROM ReceiptGoodsDetail rgd
        JOIN ReceiptGoodsHeader rgh ON rgh.ID = rgd.HeaderID
        WHERE rgd.Item IN (SELECT Id FROM SafetyItems) AND rgd.GroupQuantity > 0
        GROUP BY rgd.Item
      ),
      -- Average unit sale price (for avg_sell calculation)
      AvgSell AS (
        SELECT sid.Item,
               SUM(sid.Net) / NULLIF(ABS(SUM(sid.GroupQuantity)), 0) AS avgSellPrice
        FROM SalesInvoiceDetail sid
        WHERE sid.Item IN (SELECT Id FROM SafetyItems)
        GROUP BY sid.Item
      )
      SELECT
        i.Id                                                          AS itemId,
        i.Code                                                        AS itemCode,
        i.NameAr                                                      AS nameAr,
        ic.NameAr                                                     AS categoryName,
        ISNULL(ic2.NameAr, ic.NameAr)                                AS mainCategory,
        u.Name                                                        AS unitName,
        oh.onHand                                                     AS qty,
        CASE WHEN ISNULL(res.reservedQty,0) < 0 THEN 0
             ELSE ISNULL(res.reservedQty,0) END                       AS reservedQty,
        -- MAC
        ROUND((
          ISNULL(o.v,0)+ISNULL(rc.v,0)+ISNULL(inc.v,0)
          +ISNULL(d.v,0)+ISNULL(dec.v,0)
          +ISNULL(tri.v,0)+ISNULL(tro.v,0)
        ) / NULLIF(oh.onHand,0), 4)                                   AS mac,
        -- Total inventory value
        ROUND(
          ISNULL(o.v,0)+ISNULL(rc.v,0)+ISNULL(inc.v,0)
          +ISNULL(d.v,0)+ISNULL(dec.v,0)
          +ISNULL(tri.v,0)+ISNULL(tro.v,0)
        ,2)                                                           AS invValue,
        -- Purchase history
        ISNULL(tp.purchQty,  0)                                       AS purchQty,
        ISNULL(tp.purchCost, 0)                                       AS purchCost,
        -- Sales history
        ISNULL(ts.soldQty,  0)                                        AS soldQty,
        ISNULL(ts.salesNet, 0)                                        AS salesNet,
        -- Returns
        ISNULL(tr.retQty,  0)                                         AS retQty,
        ISNULL(tr.retNet,  0)                                         AS retNet,
        -- 90-day velocity
        ISNULL(s90.qty90, 0)                                          AS qty90,
        -- Dates
        ls.lastSaleDate,
        ore.oldestReceiptDate,
        -- Avg sell price
        ISNULL(av.avgSellPrice, 0)                                    AS avgSellPrice
      FROM OnHand oh
      JOIN Item i             ON i.Id  = oh.Item
      JOIN ItemCategory ic    ON ic.ID = i.Category
      LEFT JOIN ItemCategory ic2 ON ic2.ID = ic.ParentID
      LEFT JOIN UnitGroup ug     ON ug.RecordId = i.UnitGroupID
      LEFT JOIN UnitGroupDetail ugd ON ugd.UnitGroupID = ug.RecordId AND ugd.ConversionRate = 1
      LEFT JOIN Unit u           ON u.RecordId = ugd.Unit
      LEFT JOIN Opening   o      ON o.Item   = oh.Item
      LEFT JOIN Received  rc     ON rc.Item  = oh.Item
      LEFT JOIN Increased inc    ON inc.Item = oh.Item
      LEFT JOIN Delivered d      ON d.Item   = oh.Item
      LEFT JOIN Decreased dec    ON dec.Item = oh.Item
      LEFT JOIN TrOut     tro    ON tro.Item = oh.Item
      LEFT JOIN TrIn      tri    ON tri.Item = oh.Item
      LEFT JOIN Reserved  res    ON res.Item = oh.Item
      LEFT JOIN TotPurch  tp     ON tp.Item  = oh.Item
      LEFT JOIN TotSales  ts     ON ts.Item  = oh.Item
      LEFT JOIN TotReturns tr    ON tr.Item  = oh.Item
      LEFT JOIN Sales90   s90    ON s90.Item = oh.Item
      LEFT JOIN LastSale  ls     ON ls.Item  = oh.Item
      LEFT JOIN OldestReceipt ore ON ore.Item = oh.Item
      LEFT JOIN AvgSell   av     ON av.Item  = oh.Item
      ORDER BY invValue DESC
    `),

    // ── Monthly sales pivot (last 9 months) ──────────────────────────────────
    pool.request().query(`
      SELECT
        sid.Item                                                       AS itemId,
        FORMAT(sih.TransactionDate, 'yyyy-MM')                        AS ym,
        ABS(SUM(sid.GroupQuantity))                                    AS qty
      FROM SalesInvoiceDetail sid
      JOIN SalesInvoiceHeader sih ON sih.ID = sid.HeaderID
      WHERE sid.Item IN (
        SELECT i.Id FROM Item i
        JOIN ItemCategory ic  ON ic.ID = i.Category
        LEFT JOIN ItemCategory ic2 ON ic2.ID = ic.ParentID
        WHERE i.ItemType <> 2
          AND (ic.NameAr LIKE N'%سلامة%' OR ISNULL(ic2.NameAr,'') LIKE N'%سلامة%')
      )
      AND sih.TransactionDate >= DATEADD(MONTH, -9, DATEADD(DAY, 1-DAY(GETDATE()), CAST(GETDATE() AS DATE)))
      GROUP BY sid.Item, FORMAT(sih.TransactionDate, 'yyyy-MM')
    `),
  ]);

  // Build monthly sales map: { itemId: { 'yyyy-MM': qty } }
  const monthlyMap = {};
  monthlySalesResult.recordset.forEach(r => {
    if (!monthlyMap[r.itemId]) monthlyMap[r.itemId] = {};
    monthlyMap[r.itemId][r.ym] = +r.qty || 0;
  });

  const TODAY = new Date();
  const todayMs = TODAY.getTime();

  const items = itemsResult.recordset.map(r => {
    const qty        = +r.qty || 0;
    const invValue   = +r.invValue || 0;
    const mac        = +r.mac || 0;
    const qty90      = +r.qty90 || 0;
    const soldQty    = +r.soldQty || 0;
    const salesNet   = +r.salesNet || 0;
    const retQty     = +r.retQty || 0;
    const retNet     = +r.retNet || 0;
    const purchQty   = +r.purchQty || 0;
    const purchCost  = +r.purchCost || 0;
    const avgSell    = +r.avgSellPrice || 0;
    const reservedQty = Math.max(0, +r.reservedQty || 0);

    // Date calculations
    const lastSaleDate    = r.lastSaleDate ? new Date(r.lastSaleDate) : null;
    const oldestReceiptDate = r.oldestReceiptDate ? new Date(r.oldestReceiptDate) : null;
    const daysSinceLastSale = lastSaleDate
      ? Math.floor((todayMs - lastSaleDate.getTime()) / 86400000)
      : 9999;
    const oldestFifoDays = oldestReceiptDate
      ? Math.floor((todayMs - oldestReceiptDate.getTime()) / 86400000)
      : 0;

    // DOH & velocity
    const daily90 = qty90 / 90;
    const doh90   = daily90 > 0 ? Math.round(qty / daily90) : 9999;

    // Turnover (annualised over 365 days, using 90-day velocity)
    const annualSales = daily90 * 365;
    const avgStock    = (qty + soldQty) / 2 || 1;
    const turnover    = parseFloat((annualSales / avgStock).toFixed(2));

    // DSI (Days Sales of Inventory) based on all-time velocity
    const allTimeDailyAvg = soldQty > 0 ? soldQty / Math.max(oldestFifoDays, 1) : 0;
    const dsi = allTimeDailyAvg > 0 ? Math.round(qty / allTimeDailyAvg) : 9999;

    // Status
    let status, statusAr;
    if (doh90 < 30 && daily90 > 5) {
      status = 'critical'; statusAr = '🚨 نفاد وشيك';
    } else if (daysSinceLastSale > 30 || qty90 === 0) {
      status = 'dead'; statusAr = 'بضاعة راكدة';
    } else if (doh90 > 180) {
      status = 'red'; statusAr = 'تخزين مفرط';
    } else if (doh90 > 90) {
      status = 'yellow'; statusAr = 'مراقبة';
    } else {
      status = 'green'; statusAr = 'سليم';
    }

    // Monthly sales for this item
    const mthSales = months.map(ym => (monthlyMap[r.itemId] || {})[ym] || 0);

    return {
      itemId:      r.itemId,
      itemCode:    (r.itemCode || '').trim(),
      nameAr:      (r.nameAr   || '').trim(),
      categoryName:(r.categoryName || '').trim(),
      mainCategory:(r.mainCategory || '').trim(),
      unitName:    (r.unitName || '').trim(),
      qty,
      reservedQty,
      availableQty: qty - reservedQty,
      mac,
      invValue,
      purchQty,
      purchCost,
      soldQty,
      salesNet,
      retQty,
      retNet,
      avgSell,
      qty90,
      daily90: parseFloat(daily90.toFixed(2)),
      doh90,
      turnover,
      dsi,
      daysSinceLastSale,
      oldestFifoDays,
      lastSaleDate: lastSaleDate ? lastSaleDate.toISOString().slice(0,10) : null,
      status,
      statusAr,
      monthSales: mthSales,
    };
  });

  return { items, months };
}

module.exports = { getSafetyData };
