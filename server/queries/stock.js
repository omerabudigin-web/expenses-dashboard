'use strict';
const { getPool } = require('../db');

async function getStockData(dbName) {
  const pool = await getPool(dbName);

  const [stockResult, glResult] = await Promise.all([
    pool.request().query(`
      WITH PurchaseCosts AS (
        SELECT
          pid.Item,
          ROUND(SUM(pid.Net) / NULLIF(SUM(pid.GroupQuantity), 0), 2) AS avgCost
        FROM PurchaseInvoiceDetail pid
        WHERE pid.GroupQuantity > 0 AND pid.Net > 0
        GROUP BY pid.Item
      ),
      OpeningCosts AS (
        SELECT
          osd.Item,
          ROUND(SUM(osd.Amount) / NULLIF(SUM(osd.GroupQuantity), 0), 2) AS avgCost
        FROM OpeningStockDetail osd
        WHERE osd.GroupQuantity > 0 AND osd.Amount > 0
        GROUP BY osd.Item
      )
      SELECT
        i.Id                                                    AS itemId,
        i.NameAr                                               AS nameAr,
        ic.NameAr                                              AS categoryName,
        u.Name                                                 AS unitName,
        v.Branch                                               AS branch,
        b.NameAr                                               AS branchName,
        ROUND(SUM(v.GroupQuantity), 4)                         AS qty,
        COALESCE(
          NULLIF(i.FallbackCostInBase, 0),
          oc.avgCost,
          pc.avgCost,
          0
        )                                                      AS costPrice,
        ROUND(SUM(v.GroupQuantity) * COALESCE(
          NULLIF(i.FallbackCostInBase, 0),
          oc.avgCost,
          pc.avgCost,
          0
        ), 2)                                                  AS value,
        MAX(CONVERT(varchar(10), v.TransactionDate, 23))       AS lastMovement
      FROM InventoryTransactionOnlyIncludedView v
      JOIN Item i          ON i.Id  = v.Item
      JOIN ItemCategory ic ON ic.ID = i.Category
      JOIN UnitGroup ug    ON ug.RecordId = i.UnitGroupID
      JOIN UnitGroupDetail ugd ON ugd.UnitGroupID = ug.RecordId AND ugd.ConversionRate = 1
      JOIN Unit u          ON u.RecordId = ugd.Unit
      JOIN Branch b        ON b.Id = v.Branch
      LEFT JOIN PurchaseCosts pc ON pc.Item = i.Id
      LEFT JOIN OpeningCosts  oc ON oc.Item = i.Id
      GROUP BY
        i.Id, i.NameAr, ic.NameAr, u.Name,
        v.Branch, b.NameAr, i.FallbackCostInBase,
        pc.avgCost, oc.avgCost
      HAVING SUM(v.GroupQuantity) > 0
      ORDER BY value DESC
    `),
    // GL balance for account 41 (مخزون السلع الجاهزة) — authoritative accounting total
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
      nameAr:       (r.nameAr || '').trim(),
      categoryName: (r.categoryName || '').trim(),
      unitName:     (r.unitName || '').trim(),
      branch:       r.branch,
      branchName:   (r.branchName || '').trim(),
      qty:          +r.qty,
      costPrice:    +r.costPrice,
      value:        +r.value,
      lastMovement: r.lastMovement || null,
    })),
    glBalance,
  };
}

module.exports = { getStockData };
