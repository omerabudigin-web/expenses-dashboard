'use strict';
const { getPool } = require('../db');

const SQL = `
WITH ItemBase AS (
  SELECT i.Id, i.Code, i.NameAr, ic.NameAr AS category, ic.Id AS catId
  FROM Item i
  JOIN ItemCategory ic ON ic.Id = i.Category
  WHERE i.ItemType = 1
    AND ic.NameAr NOT LIKE N'%سلامة%'
),
OnHand AS (
  SELECT v.Item,
    SUM(v.GroupQuantity) AS totalQty,
    SUM(CASE WHEN v.Branch = 1 THEN v.GroupQuantity ELSE 0 END) AS qtyBranch1,
    SUM(CASE WHEN v.Branch = 2 THEN v.GroupQuantity ELSE 0 END) AS qtyBranch2
  FROM InventoryTransactionOnlyIncludedView v
  JOIN ItemBase f ON f.Id = v.Item
  GROUP BY v.Item
  HAVING SUM(v.GroupQuantity) > 0.001
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
  LEFT JOIN OpeningCost oc ON oc.Item = oh.Item
  LEFT JOIN ReceiptCost rc ON rc.Item = oh.Item
  LEFT JOIN IncreaseCost ic ON ic.Item = oh.Item
  LEFT JOIN DeliverCost dc ON dc.Item = oh.Item
  LEFT JOIN DecreaseCost dec ON dec.Item = oh.Item
  LEFT JOIN TransferInCost tic ON tic.Item = oh.Item
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
  JOIN Costs c ON c.Item = oh.Item
  LEFT JOIN LastSale ls ON ls.Item = oh.Item
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
ORDER BY ISNULL(ageDays, 99999) DESC, value DESC
`;

async function getInventoryAging(dbName, branch) {
  const pool = await getPool(dbName);
  const res = await pool.request().query(SQL);
  let rows = res.recordset;

  if (branch && branch !== 'all') {
    const b = parseInt(branch, 10);
    const field = b === 1 ? 'qtyBranch1' : b === 2 ? 'qtyBranch2' : null;
    if (field) {
      rows = rows
        .filter(r => (r[field] || 0) > 0.001)
        .map(r => ({ ...r, displayQty: r[field] }));
    }
  }

  const items = rows.map(r => ({
    itemId:       r.itemId,
    code:         r.Code,
    name:         r.NameAr,
    category:     r.category,
    qty:          parseFloat((r.displayQty ?? r.totalQty).toFixed(3)),
    mac:          parseFloat((r.mac || 0).toFixed(2)),
    value:        parseFloat(((r.displayQty ?? r.totalQty) * r.mac).toFixed(2)),
    lastSaleDate: r.lastSaleDate ? r.lastSaleDate.toISOString().slice(0, 10) : null,
    lastInDate:   r.lastInDate   ? r.lastInDate.toISOString().slice(0, 10)   : null,
    ageDays:      r.ageDays ?? null,
    bucket:       r.ageDays == null ? '>365' : r.bucket,
  }));

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
