'use strict';
const { getPool } = require('../db');

async function getStockData(dbName) {
  const pool = await getPool(dbName);
  const result = await pool.request().query(`
    SELECT
      i.Id                                                    AS itemId,
      i.NameAr                                               AS nameAr,
      ic.NameAr                                              AS categoryName,
      u.Name                                                 AS unitName,
      v.Branch                                               AS branch,
      b.NameAr                                               AS branchName,
      ROUND(SUM(v.GroupQuantity), 4)                         AS qty,
      ISNULL(i.FallbackCostInBase, 0)                        AS costPrice,
      ROUND(SUM(v.GroupQuantity) * ISNULL(i.FallbackCostInBase,0), 2) AS value,
      MAX(CONVERT(varchar(10), v.TransactionDate, 23))       AS lastMovement
    FROM InventoryTransactionOnlyIncludedView v
    JOIN Item i        ON i.Id  = v.Item
    JOIN ItemCategory  ic ON ic.ID = i.Category
    JOIN UnitGroup     ug  ON ug.RecordId  = i.UnitGroupID
    JOIN UnitGroupDetail ugd ON ugd.UnitGroupID = ug.RecordId AND ugd.ConversionRate = 1
    JOIN Unit          u   ON u.RecordId   = ugd.Unit
    JOIN Branch        b   ON b.Id         = v.Branch
    GROUP BY
      i.Id, i.NameAr, ic.NameAr, u.Name,
      v.Branch, b.NameAr, i.FallbackCostInBase
    HAVING SUM(v.GroupQuantity) > 0
    ORDER BY value DESC
  `);

  return result.recordset.map(r => ({
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
  }));
}

module.exports = { getStockData };
