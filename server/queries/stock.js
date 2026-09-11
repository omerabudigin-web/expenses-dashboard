'use strict';
const sql = require('mssql');
const { getPool } = require('../db');

async function getWarehouses(dbName) {
  const pool = await getPool(dbName);
  const result = await pool.request().query(`
    SELECT Id AS id, NameAr AS name
    FROM Branch
    ORDER BY Id
  `);
  return result.recordset.map(r => ({
    id:     r.id,
    name:   (r.name || '').trim(),
    branch: (r.name || '').trim(),
  }));
}

async function getStockData(dbName, opts = {}) {
  const pool = await getPool(dbName);

  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(opts.asOf || '')
    ? opts.asOf
    : new Date().toISOString().slice(0, 10);
  const warehouseIds = Array.isArray(opts.warehouse)
    ? [...new Set(opts.warehouse.map(n => parseInt(n, 10)).filter(Number.isInteger))]
    : [];
  const negativeOnly = !!opts.negativeOnly;

  const req = pool.request().input('asOf', sql.Date, asOf);
  let branchFilterV  = '';
  let branchFilterD  = '';
  let branchFilterSid= '';
  if (warehouseIds.length) {
    const names = warehouseIds.map((id, idx) => {
      req.input(`wh${idx}`, sql.SmallInt, id);
      return `@wh${idx}`;
    }).join(',');
    branchFilterV   = `AND v.Branch IN (${names})`;
    branchFilterD   = `AND d.Branch IN (${names})`;
    branchFilterSid = `AND sid.Branch IN (${names})`;
  }

  const [stockResult, glResult] = await Promise.all([
    req.query(`
      WITH OnHand AS (
        SELECT v.Item, v.Branch,
               SUM(v.GroupQuantity) AS onHand
        FROM InventoryTransactionOnlyIncludedView v
        JOIN Item i ON i.Id = v.Item
        WHERE i.ItemType <> 2
          AND v.TransactionDate <= @asOf
          ${branchFilterV}
        GROUP BY v.Item, v.Branch
        HAVING SUM(v.GroupQuantity) <> 0
      ),
      Opening AS (
        SELECT d.Item, d.Branch, SUM(d.Amount) AS v
        FROM OpeningStockDetail d
        JOIN OpeningStockHeader h ON h.ID = d.HeaderID
        WHERE h.TransactionDate <= @asOf ${branchFilterD}
        GROUP BY d.Item, d.Branch
      ),
      Received AS (
        SELECT d.Item, d.Branch, SUM(d.GroupCostPrice) AS v
        FROM ReceiptGoodsDetail d
        JOIN ReceiptGoodsHeader h ON h.ID = d.HeaderID
        WHERE d.GroupQuantity > 0 AND h.TransactionDate <= @asOf ${branchFilterD}
        GROUP BY d.Item, d.Branch
      ),
      Increased AS (
        SELECT d.Item, d.Branch, SUM(d.GroupCostPrice) AS v
        FROM IncreaseStockDetail d
        JOIN IncreaseStockHeader h ON h.ID = d.HeaderID
        WHERE h.TransactionDate <= @asOf ${branchFilterD}
        GROUP BY d.Item, d.Branch
      ),
      Delivered AS (
        SELECT d.Item, d.Branch, SUM(d.GroupCostPrice) AS v
        FROM DeliverGoodsDetail d
        JOIN DeliverGoodsHeader h ON h.ID = d.HeaderID
        WHERE h.TransactionDate <= @asOf ${branchFilterD}
        GROUP BY d.Item, d.Branch
      ),
      Decreased AS (
        SELECT d.Item, d.Branch, SUM(d.GroupCostPrice) AS v
        FROM DecreaseStockDetail d
        JOIN DecreaseStockHeader h ON h.ID = d.HeaderID
        WHERE h.TransactionDate <= @asOf ${branchFilterD}
        GROUP BY d.Item, d.Branch
      ),
      TrOut AS (
        SELECT d.Item, d.Branch, SUM(d.GroupCostPrice) AS v
        FROM TransferIssuedDetail d
        JOIN TransferIssuedHeader h ON h.ID = d.HeaderID
        WHERE h.TransactionDate <= @asOf ${branchFilterD}
        GROUP BY d.Item, d.Branch
      ),
      TrIn AS (
        SELECT d.Item, d.Branch, SUM(d.GroupCostPrice) AS v
        FROM TransferReceivingDetail d
        JOIN TransferReceivingHeader h ON h.ID = d.HeaderID
        WHERE h.TransactionDate <= @asOf ${branchFilterD}
        GROUP BY d.Item, d.Branch
      ),
      Reserved AS (
        -- فقط فواتير المبيعات التي لم تُسلَّم بعد (لا رابط في SalesInvoice_DeliverGoodsDetail)
        SELECT sid.Item, sid.Branch,
               ABS(SUM(sid.GroupQuantity)) AS reservedQty
        FROM SalesInvoiceDetail sid
        JOIN SalesInvoiceHeader sih ON sih.ID = sid.HeaderID
        WHERE NOT EXISTS (
          SELECT 1 FROM SalesInvoice_DeliverGoodsDetail lnk
          WHERE lnk.SalesInvoiceDetailID = sid.ID
        )
        AND sih.TransactionDate <= @asOf ${branchFilterSid}
        GROUP BY sid.Item, sid.Branch
      )
      SELECT
        i.Id                                                          AS itemId,
        i.Code                                                        AS itemCode,
        i.NameAr                                                      AS nameAr,
        ic.NameAr                                                     AS categoryName,
        ic2.NameAr                                                    AS mainCategory,
        u.Name                                                        AS unitName,
        oh.Branch                                                     AS branchId,
        b.NameAr                                                      AS branchName,
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
      LEFT JOIN Branch b       ON b.Id = oh.Branch
      LEFT JOIN Opening   o    ON o.Item   = oh.Item AND o.Branch   = oh.Branch
      LEFT JOIN Received  rc   ON rc.Item  = oh.Item AND rc.Branch  = oh.Branch
      LEFT JOIN Increased inc  ON inc.Item = oh.Item AND inc.Branch = oh.Branch
      LEFT JOIN Delivered d    ON d.Item   = oh.Item AND d.Branch   = oh.Branch
      LEFT JOIN Decreased dec  ON dec.Item = oh.Item AND dec.Branch = oh.Branch
      LEFT JOIN TrOut     tro  ON tro.Item = oh.Item AND tro.Branch = oh.Branch
      LEFT JOIN TrIn      tri  ON tri.Item = oh.Item AND tri.Branch = oh.Branch
      LEFT JOIN Reserved  res  ON res.Item = oh.Item AND res.Branch = oh.Branch
      ORDER BY i.Id, oh.Branch
    `),
    pool.request().input('asOf', sql.Date, asOf).query(`
      SELECT ROUND(SUM(jd.Debit - jd.Credit), 2) AS glBalance
      FROM JournalVoucherDetail jd
      JOIN JournalVoucherHeader jh ON jh.ID = jd.HeaderID
      WHERE jd.AccountChart = 41 AND jh.TransactionDate <= @asOf
    `),
  ]);

  const glBalance = glResult.recordset[0]?.glBalance ?? null;

  // pivot per-branch rows into one row per item, keyed by warehouse
  const itemsMap = new Map();
  for (const r of stockResult.recordset) {
    const itemId = r.itemId;
    if (!itemsMap.has(itemId)) {
      itemsMap.set(itemId, {
        itemId,
        itemCode:     (r.itemCode || '').trim(),
        nameAr:       (r.nameAr || '').trim(),
        categoryName: (r.categoryName || '').trim(),
        mainCategory: (r.mainCategory || '').trim(),
        unitName:     (r.unitName || '').trim(),
        qty: 0, reservedQty: 0, availableQty: 0, value: 0,
        byWarehouse: {},
      });
    }
    const item = itemsMap.get(itemId);
    const qty         = +r.qty;
    const reservedQty = Math.max(0, +r.reservedQty || 0);
    const availableQty= +r.availableQty;
    const value        = +r.value;
    const mac          = +r.mac || 0;

    item.byWarehouse[r.branchId] = {
      warehouseId: r.branchId,
      warehouseName: (r.branchName || '').trim(),
      qty, reservedQty, availableQty, value, mac,
    };
    item.qty         += qty;
    item.reservedQty  += reservedQty;
    item.availableQty += availableQty;
    item.value        += value;
  }

  let items = [...itemsMap.values()].map(item => ({
    ...item,
    qty:          Math.round(item.qty * 1000) / 1000,
    reservedQty:  Math.round(item.reservedQty * 1000) / 1000,
    availableQty: Math.round(item.availableQty * 1000) / 1000,
    value:        Math.round(item.value * 100) / 100,
    mac:          item.qty ? Math.round((item.value / item.qty) * 10000) / 10000 : 0,
  }));

  if (negativeOnly) {
    items = items.filter(it => Object.values(it.byWarehouse).some(w => w.qty < 0));
  }

  items.sort((a, b) => b.value - a.value);

  return { items, glBalance, asOf, warehouseIds };
}

module.exports = { getStockData, getWarehouses };
