'use strict';
const { getPool } = require('../db');

// I004 methodology:
//   - All ItemType=1 items, no category exclusions
//   - Minimum qty threshold: >= 1.0 base unit (matches I004 behaviour of hiding < 1 unit)
//   - Branch 1 view: items with any B1 stock, valued at TOTAL company qty × MAC
//     (matches I004 "الفرع الرئيسي" showing company-wide value per item)
//   - Branch 2 view: items with B2 stock, valued at B2 qty × MAC
const SQL = `
WITH ItemBase AS (
  SELECT i.Id, i.Code, i.NameAr, ic.NameAr AS category, ic.Id AS catId
  FROM Item i
  JOIN ItemCategory ic ON ic.Id = i.Category
  WHERE i.ItemType = 1
),
OnHand AS (
  SELECT v.Item,
    SUM(v.GroupQuantity)                                              AS totalQty,
    SUM(CASE WHEN v.Branch = 1 THEN v.GroupQuantity ELSE 0 END)      AS qtyBranch1,
    SUM(CASE WHEN v.Branch = 2 THEN v.GroupQuantity ELSE 0 END)      AS qtyBranch2
  FROM InventoryTransactionOnlyIncludedView v
  JOIN ItemBase f ON f.Id = v.Item
  GROUP BY v.Item
  HAVING SUM(v.GroupQuantity) >= 1.0
),
OpeningCost AS (
  SELECT Item, SUM(Amount) AS v FROM OpeningStockDetail
  WHERE Item IN (SELECT Item FROM OnHand) GROUP BY Item
),
ReceiptCost AS (
  SELECT Item, SUM(GroupCostPrice) AS v FROM ReceiptGoodsDetail
  WHERE Item IN (SELECT Item FROM OnHand) AND GroupQuantity > 0 GROUP BY Item
),
IncreaseCost AS (
  SELECT Item, SUM(GroupCostPrice) AS v FROM IncreaseStockDetail
  WHERE Item IN (SELECT Item FROM OnHand) GROUP BY Item
),
DeliverCost AS (
  SELECT Item, SUM(GroupCostPrice) AS v FROM DeliverGoodsDetail
  WHERE Item IN (SELECT Item FROM OnHand) GROUP BY Item
),
DecreaseCost AS (
  SELECT Item, SUM(GroupCostPrice) AS v FROM DecreaseStockDetail
  WHERE Item IN (SELECT Item FROM OnHand) GROUP BY Item
),
TransferInCost AS (
  SELECT Item, SUM(GroupCostPrice) AS v FROM TransferReceivingDetail
  WHERE Item IN (SELECT Item FROM OnHand) GROUP BY Item
),
TransferOutCost AS (
  SELECT Item, SUM(GroupCostPrice) AS v FROM TransferIssuedDetail
  WHERE Item IN (SELECT Item FROM OnHand) GROUP BY Item
),
Costs AS (
  SELECT oh.Item,
    ISNULL(oc.v,0)+ISNULL(rc.v,0)+ISNULL(ic.v,0)+ISNULL(dc.v,0)+ISNULL(dec.v,0)+ISNULL(tic.v,0)+ISNULL(toc.v,0) AS totalCost
  FROM OnHand oh
  LEFT JOIN OpeningCost   oc  ON oc.Item  = oh.Item
  LEFT JOIN ReceiptCost   rc  ON rc.Item  = oh.Item
  LEFT JOIN IncreaseCost  ic  ON ic.Item  = oh.Item
  LEFT JOIN DeliverCost   dc  ON dc.Item  = oh.Item
  LEFT JOIN DecreaseCost  dec ON dec.Item = oh.Item
  LEFT JOIN TransferInCost  tic ON tic.Item = oh.Item
  LEFT JOIN TransferOutCost toc ON toc.Item = oh.Item
),
LastSale AS (
  SELECT v.Item, MAX(v.TransactionDate) AS lastSaleDate
  FROM InventoryTransactionOnlyIncludedView v
  WHERE v.ScreenID = 61 AND v.Item IN (SELECT Item FROM OnHand)
  GROUP BY v.Item
),
LastInbound AS (
  SELECT v.Item, MAX(v.TransactionDate) AS lastInDate
  FROM InventoryTransactionOnlyIncludedView v
  WHERE v.ScreenID IN (62, 68, 71, 67) AND v.Item IN (SELECT Item FROM OnHand)
  GROUP BY v.Item
),
Result AS (
  SELECT
    f.Id AS itemId, f.Code, f.NameAr, f.category,
    oh.totalQty,
    oh.qtyBranch1,
    oh.qtyBranch2,
    CASE WHEN oh.totalQty > 0 THEN c.totalCost / oh.totalQty ELSE 0 END AS mac,
    c.totalCost AS costPool,
    ls.lastSaleDate, li.lastInDate,
    DATEDIFF(day, COALESCE(ls.lastSaleDate, li.lastInDate), GETDATE()) AS ageDays
  FROM OnHand oh
  JOIN ItemBase f ON f.Id = oh.Item
  JOIN Costs    c ON c.Item = oh.Item
  LEFT JOIN LastSale    ls ON ls.Item = oh.Item
  LEFT JOIN LastInbound li ON li.Item = oh.Item
)
SELECT *,
  CASE
    WHEN ageDays <= 30  THEN '0-30'
    WHEN ageDays <= 90  THEN '31-90'
    WHEN ageDays <= 180 THEN '91-180'
    WHEN ageDays <= 365 THEN '181-365'
    ELSE '>365'
  END AS bucket,
  totalQty * mac AS value
FROM Result
ORDER BY ISNULL(ageDays, 99999) DESC, (totalQty * mac) DESC
`;

async function getInventoryAging(dbName, branch) {
  const pool = await getPool(dbName);
  const res  = await pool.request().query(SQL);
  let rows   = res.recordset;

  // Branch filtering:
  //   branch=1 → items with any B1 stock; value = total company qty × MAC (I004 style)
  //   branch=2 → items with B2 stock; value = B2 qty × MAC (factory-only view)
  //   branch=all → all items; value = total company qty × MAC
  let displayField  = null;   // qty column to show in the table
  let valueOverride = null;   // 'b2' → use B2 qty for value calc; else use totalQty

  if (branch && branch !== 'all') {
    const b = parseInt(branch, 10);
    if (b === 1) {
      rows = rows.filter(r => (r.qtyBranch1 || 0) >= 1.0);
      displayField = 'qtyBranch1';
      // value stays as totalQty × MAC (company-wide, I004 methodology)
    } else if (b === 2) {
      rows = rows.filter(r => (r.qtyBranch2 || 0) >= 1.0);
      displayField  = 'qtyBranch2';
      valueOverride = 'b2';   // value = B2 qty × MAC
    }
  }

  const items = rows.map(r => {
    const dispQty = displayField ? (r[displayField] || 0) : r.totalQty;
    const valQty  = valueOverride === 'b2' ? (r.qtyBranch2 || 0) : r.totalQty;
    const mac     = r.mac || 0;
    return {
      itemId:       r.itemId,
      code:         r.Code,
      name:         r.NameAr,
      category:     r.category,
      qty:          parseFloat(dispQty.toFixed(3)),
      mac:          parseFloat(mac.toFixed(2)),
      value:        parseFloat((valQty * mac).toFixed(2)),
      lastSaleDate: r.lastSaleDate ? r.lastSaleDate.toISOString().slice(0, 10) : null,
      lastInDate:   r.lastInDate   ? r.lastInDate.toISOString().slice(0, 10)   : null,
      ageDays:      r.ageDays ?? null,
      bucket:       r.ageDays == null ? '>365' : r.bucket,
    };
  });

  const bucketOrder = ['0-30', '31-90', '91-180', '181-365', '>365'];
  const byBucket = {};
  bucketOrder.forEach(b => { byBucket[b] = { count: 0, value: 0 }; });
  let totalValue = 0;
  items.forEach(it => {
    byBucket[it.bucket].count++;
    byBucket[it.bucket].value += it.value;
    totalValue += it.value;
  });

  return {
    asOf:       new Date().toISOString().slice(0, 10),
    db:         dbName,
    branch,
    totalItems: items.length,
    totalValue: parseFloat(totalValue.toFixed(2)),
    byBucket,
    items,
  };
}

module.exports = { getInventoryAging };
