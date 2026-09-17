'use strict';
const { getPool } = require('../db');

async function getFixedAssets(dbName) {
  const pool = await getPool(dbName);
  const result = await pool.request().query(`
    SELECT
      fa.Id,
      fa.NameAr,
      fa.Category,
      fac.NameAr       AS CategoryName,
      CONVERT(varchar(10), fa.AcquisitionDate, 23) AS AcquisitionDate,
      jd.Branch,
      b.NameAr         AS BranchName,
      SUM(ISNULL(jd.Debit,  0)) AS TotalDebit,
      -- إهلاك متراكم حقيقي: فقط ما رُحِّل على حساب الإهلاك المخصص لهذا الأصل
      -- (FixedAsset.DepreciationAccount). أي رصيد دائن آخر على حساب أصل (1%)
      -- — كمرتجع مشتريات أو تصحيح تكلفة — ليس إهلاكاً ويُصنَّف منفصلاً.
      SUM(CASE WHEN jd.AccountChart = fa.DepreciationAccount THEN ISNULL(jd.Credit, 0) ELSE 0 END) AS DeprCredit,
      SUM(CASE WHEN jd.AccountChart <> fa.DepreciationAccount OR fa.DepreciationAccount IS NULL THEN ISNULL(jd.Credit, 0) ELSE 0 END) AS AdjCredit,
      COUNT(jd.ID)              AS JVLines
    FROM FixedAsset fa
    LEFT JOIN FixedAssetCategory fac ON fac.ID = fa.Category
    LEFT JOIN JournalVoucherDetail jd ON jd.FixedAsset = fa.Id
    LEFT JOIN AccountChart ac ON ac.ID = jd.AccountChart
    LEFT JOIN Branch b ON b.Id = jd.Branch
    -- فقط حسابات الأصول (كود يبدأ بـ 1) — يستثني المصروفات والإهلاك كمصروف
    WHERE jd.ID IS NULL OR ac.Code LIKE '1%'
    GROUP BY
      fa.Id, fa.NameAr, fa.Category, fac.NameAr,
      fa.AcquisitionDate, jd.Branch, b.NameAr, fa.DepreciationAccount
    ORDER BY jd.Branch, fa.NameAr
  `);

  // Flatten: assets with no JV still appear (Branch=null)
  return result.recordset.map(r => ({
    id:              r.Id,
    nameAr:          (r.NameAr || '').trim(),
    category:        r.Category,
    categoryName:    (r.CategoryName || '').trim(),
    acquisitionDate: r.AcquisitionDate || null,
    branch:          r.Branch,
    branchName:      r.BranchName || null,
    bookValue:       +(r.TotalDebit  || 0),
    accumDepr:       +(r.DeprCredit  || 0),
    adjustments:     +(r.AdjCredit   || 0),
    netBookValue:    +((r.TotalDebit || 0) - (r.DeprCredit || 0) - (r.AdjCredit || 0)),
    jvLines:         r.JVLines || 0,
  }));
}

// ── حركة الأصول الثابتة (تكلفة فقط) — رصيد أول المدة / إضافات / استبعادات /
// رصيد آخر المدة، بأسلوب إيضاح القوائم المالية. الاستبعادات هنا هي فقط
// الدائن على حساب غير حساب الإهلاك المخصص (مرتجعات/تصحيحات تكلفة) — لا تشمل
// الإهلاك، تماماً كتصنيف accumDepr/adjustments في getFixedAssets أعلاه.
async function getFixedAssetsMovement(dbName, periodStart, asOf) {
  const pool = await getPool(dbName);
  const result = await pool.request().query(`
    SELECT
      fa.Id,
      fa.NameAr,
      fac.NameAr AS CategoryName,
      CONVERT(varchar(10), fa.AcquisitionDate, 23) AS AcquisitionDate,
      jd.Branch,
      b.NameAr AS BranchName,
      SUM(CASE WHEN CAST(jvh.TransactionDate AS DATE) < '${periodStart}'
               THEN ISNULL(jd.Debit, 0) ELSE 0 END) AS OpeningDebit,
      SUM(CASE WHEN CAST(jvh.TransactionDate AS DATE) < '${periodStart}'
                 AND (jd.AccountChart <> fa.DepreciationAccount OR fa.DepreciationAccount IS NULL)
               THEN ISNULL(jd.Credit, 0) ELSE 0 END) AS OpeningCostCredit,
      SUM(CASE WHEN CAST(jvh.TransactionDate AS DATE) BETWEEN '${periodStart}' AND '${asOf}'
               THEN ISNULL(jd.Debit, 0) ELSE 0 END) AS Additions,
      SUM(CASE WHEN CAST(jvh.TransactionDate AS DATE) BETWEEN '${periodStart}' AND '${asOf}'
                 AND (jd.AccountChart <> fa.DepreciationAccount OR fa.DepreciationAccount IS NULL)
               THEN ISNULL(jd.Credit, 0) ELSE 0 END) AS Disposals,
      COUNT(jd.ID) AS JVLines
    FROM FixedAsset fa
    LEFT JOIN FixedAssetCategory fac ON fac.ID = fa.Category
    LEFT JOIN JournalVoucherDetail jd ON jd.FixedAsset = fa.Id
    LEFT JOIN AccountChart ac ON ac.ID = jd.AccountChart
    LEFT JOIN JournalVoucherHeader jvh ON jvh.ID = jd.HeaderID
      AND CAST(jvh.TransactionDate AS DATE) <= '${asOf}'
    LEFT JOIN Branch b ON b.Id = jd.Branch
    WHERE jd.ID IS NULL OR ac.Code LIKE '1%'
    GROUP BY fa.Id, fa.NameAr, fac.NameAr, fa.AcquisitionDate, jd.Branch, b.NameAr
    ORDER BY jd.Branch, fa.NameAr
  `);

  return result.recordset.map(r => {
    const opening  = +(r.OpeningDebit || 0) - +(r.OpeningCostCredit || 0);
    const additions = +(r.Additions || 0);
    const disposals = +(r.Disposals || 0);
    return {
      id:              r.Id,
      nameAr:          (r.NameAr || '').trim(),
      categoryName:    (r.CategoryName || '').trim(),
      acquisitionDate: r.AcquisitionDate || null,
      branch:          r.Branch,
      branchName:      r.BranchName || null,
      opening,
      additions,
      disposals,
      closing: opening + additions - disposals,
      jvLines: r.JVLines || 0,
    };
  });
}

module.exports = { getFixedAssets, getFixedAssetsMovement };
