'use strict';
const { getPool } = require('../db');

async function getStockData(dbName) {
  const pool = await getPool(dbName);

  const [stockResult, glResult] = await Promise.all([
    pool.request().query(`
      WITH OnHand AS (
        SELECT v.Item,
               SUM(v.GroupQuantity) AS onHand
        FROM InventoryTransactionOnlyIncludedView v
        JOIN Item i ON i.Id = v.Item
        WHERE i.ItemType <> 2
        GROUP BY v.Item
        HAVING SUM(v.GroupQuantity) <> 0
      ),
      Opening   AS (SELECT Item, SUM(Amount)       AS v FROM OpeningStockDetail     GROUP BY Item),
      Received  AS (SELECT Item, SUM(GroupCostPrice) AS v FROM ReceiptGoodsDetail   WHERE GroupQuantity > 0 GROUP BY Item),
      Increased AS (SELECT Item, SUM(GroupCostPrice) AS v FROM IncreaseStockDetail   GROUP BY Item),
      Delivered AS (SELECT Item, SUM(GroupCostPrice) AS v FROM DeliverGoodsDetail    GROUP BY Item),
      Decreased AS (SELECT Item, SUM(GroupCostPrice) AS v FROM DecreaseStockDetail   GROUP BY Item),
      TrOut     AS (SELECT Item, SUM(GroupCostPrice) AS v FROM TransferIssuedDetail   GROUP BY Item),
      TrIn      AS (SELECT Item, SUM(GroupCostPrice) AS v FROM TransferReceivingDetail GROUP BY Item),
      Reserved AS (
        -- فقط فواتير المبيعات التي لم تُسلَّم بعد (لا رابط في SalesInvoice_DeliverGoodsDetail)
        SELECT sid.Item,
               ABS(SUM(sid.GroupQuantity)) AS reservedQty
        FROM SalesInvoiceDetail sid
        WHERE NOT EXISTS (
          SELECT 1 FROM SalesInvoice_DeliverGoodsDetail lnk
          WHERE lnk.SalesInvoiceDetailID = sid.ID
        )
        GROUP BY sid.Item
      )
      SELECT
        i.Id                                                          AS itemId,
        i.Code                                                        AS itemCode,
        i.NameAr                                                      AS nameAr,
        ic.NameAr                                                     AS categoryName,
        ic2.NameAr                                                    AS mainCategory,
        u.Name                                                        AS unitName,
        oh.onHand                                                     AS qty,
        ISNULL(NULLIF(res.reservedQty, 0), 0)                        AS reservedQty,
        oh.onHand - ISNULL(NULLIF(res.reservedQty, 0), 0)            AS availableQty,
        ROUND(
          ISNULL(o.v,0)+ISNULL(rc.v,0)+ISNULL(inc.v,0)
          +ISNULL(d.v,0)+ISNULL(dec.v,0)
          +ISNULL(tri.v,0)+ISNULL(tro.v,0)
        ,2)                                                           AS value,
        ROUND((
          ISNULL(o.v,0)+ISNULL(rc.v,0)+ISNULL(inc.v,0)
          +ISNULL(d.v,0)+ISNULL(dec.v,0)
          +ISNULL(tri.v,0)+ISNULL(tro.v,0)
        ) / NULLIF(oh.onHand, 0), 4)                                 AS mac
      FROM OnHand oh
      JOIN Item i          ON i.Id  = oh.Item
      JOIN ItemCategory ic  ON ic.ID = i.Category
      LEFT JOIN ItemCategory ic2 ON ic2.ID = ic.ParentID
      LEFT JOIN UnitGroup ug   ON ug.RecordId = i.UnitGroupID
      LEFT JOIN UnitGroupDetail ugd ON ugd.UnitGroupID = ug.RecordId AND ugd.ConversionRate = 1
      LEFT JOIN Unit u         ON u.RecordId = ugd.Unit
      LEFT JOIN Opening   o    ON o.Item   = oh.Item
      LEFT JOIN Received  rc   ON rc.Item  = oh.Item
      LEFT JOIN Increased inc  ON inc.Item = oh.Item
      LEFT JOIN Delivered d    ON d.Item   = oh.Item
      LEFT JOIN Decreased dec  ON dec.Item = oh.Item
      LEFT JOIN TrOut     tro  ON tro.Item = oh.Item
      LEFT JOIN TrIn      tri  ON tri.Item = oh.Item
      LEFT JOIN Reserved  res  ON res.Item = oh.Item
      ORDER BY value DESC
    `),
    pool.request().query(`
      SELECT ROUND(SUM(Debit - Credit), 2) AS glBalance
      FROM JournalVoucherDetail
      WHERE AccountChart = 41
    `),
  ]);

  const glBalance = glResult.recordset[0]?.glBalance ?? null;

  return {
    items: stockResult.recordset.map(r => ({
      itemId:       r.itemId,
      itemCode:     (r.itemCode || '').trim(),
      nameAr:       (r.nameAr || '').trim(),
      categoryName: (r.categoryName || '').trim(),
      mainCategory: (r.mainCategory || '').trim(),
      unitName:     (r.unitName || '').trim(),
      qty:          +r.qty,
      reservedQty:  Math.max(0, +r.reservedQty || 0),
      availableQty: +r.availableQty,
      value:        +r.value,
      mac:          +r.mac || 0,
    })),
    glBalance,
  };
}

module.exports = { getStockData };
