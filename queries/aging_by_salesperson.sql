-- ============================================================
-- تقرير إعمار أرصدة العملاء حسب البائع — MekSoftDb1
-- Report ID: A022-Enhanced  |  Read-Only
-- ============================================================
-- المنهجية: FIFO — تُطبَّق الدفعات على أقدم المديونيات أولاً
-- مصدر البيانات: قيود اليومية (JournalVoucherDetail) حسابات 10303x
-- البائع: مرتبط بحقل Customer.SalesMan (بائع شاشة العميل)
-- ============================================================

DECLARE @AsOfDate DATE = CAST(GETDATE() AS DATE);  -- عدّل هنا حسب الحاجة
-- DECLARE @AsOfDate DATE = '2026-06-07';

-- ─────────────────────────────────────────────────────────────
-- 1) قائمة البائعين
-- ─────────────────────────────────────────────────────────────
SELECT
    sm.Id           AS SellerId,
    sm.NameAr       AS SellerName,
    sm.Branch,
    sm.Employee
FROM dbo.SalesMan sm
ORDER BY sm.Id;

-- ─────────────────────────────────────────────────────────────
-- 2) معلومات العملاء مع البائع المرتبط
-- ─────────────────────────────────────────────────────────────
SELECT
    c.Id            AS CustomerId,
    c.NameAr        AS CustomerName,
    ISNULL(c.SalesMan, 0)   AS SellerId,
    ISNULL(sm.NameAr, N'—') AS SellerName,
    c.LimitDays     AS CreditDays,
    c.BalanceLimit  AS CreditLimit,
    c.Account       AS AccountChartId
FROM dbo.Customer c
LEFT JOIN dbo.SalesMan sm ON sm.Id = c.SalesMan
ORDER BY c.Id;

-- ─────────────────────────────────────────────────────────────
-- 3) حركات الذمم المدينة لكل عميل (حتى تاريخ الإعمار)
--    الحسابان: 47 (عملاء محليون 1030301001)
--              48 (عملاء خارجيون 1030301002)
-- ─────────────────────────────────────────────────────────────
SELECT
    jvd.Customer                                AS CustomerId,
    CAST(jvh.TransactionDate AS DATE)           AS TxDate,
    jvd.Debit,
    jvd.Credit,
    jvd.Description,
    jvd.HeaderID                                AS JVHeaderId
FROM dbo.JournalVoucherDetail  jvd
JOIN dbo.JournalVoucherHeader  jvh ON jvh.ID = jvd.HeaderID
WHERE jvd.AccountChart IN (47, 48)
  AND jvd.Customer IS NOT NULL
  AND jvd.Customer > 0
  AND CAST(jvh.TransactionDate AS DATE) <= @AsOfDate
ORDER BY jvd.Customer, jvh.TransactionDate ASC, jvd.ID ASC;

-- ─────────────────────────────────────────────────────────────
-- 4) تحقق سريع: رصيد إجمالي كل عميل بالطريقة المباشرة
--    (للمقارنة مع نتيجة FIFO)
-- ─────────────────────────────────────────────────────────────
SELECT
    jvd.Customer                                AS CustomerId,
    c.NameAr                                    AS CustomerName,
    ISNULL(c.SalesMan, 0)                       AS SellerId,
    SUM(jvd.Debit - jvd.Credit)                 AS NetBalance
FROM dbo.JournalVoucherDetail  jvd
JOIN dbo.JournalVoucherHeader  jvh ON jvh.ID = jvd.HeaderID
JOIN dbo.Customer              c   ON c.Id = jvd.Customer
WHERE jvd.AccountChart IN (47, 48)
  AND jvd.Customer IS NOT NULL AND jvd.Customer > 0
  AND CAST(jvh.TransactionDate AS DATE) <= @AsOfDate
GROUP BY jvd.Customer, c.NameAr, c.SalesMan
HAVING SUM(jvd.Debit - jvd.Credit) > 0.01
ORDER BY NetBalance DESC;
