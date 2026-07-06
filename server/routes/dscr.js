'use strict';
/* ============================================================
   server/routes/dscr.js
   مسار حساب مؤشر تغطية خدمة الدين (DSCR) — حيّ من MekSoft
   يُعيد مؤشرَين منفصلَين لكل شركة:
     1. dscrAccounting  — المسجَّل محاسبياً  (MekSoft حيّ)
     2. dscrEconomic    — المستحق اقتصادياً (من سجل التمويلات)
   ============================================================ */

const express = require('express');
const router  = express.Router();
const sql     = require('mssql');
const fs      = require('fs');
const path    = require('path');
const { getPool } = require('../db');

// كود حساب مصروفات الفوائد البنكية — مؤكَّد من MekSoft (4020118003)
const FINANCE_ACC_PREFIX = '4020118003';

const COMPANIES = {
  abaad: {
    label:      'مؤسسة أبعاد الحديد التجارية',
    db:         process.env.DB1_NAME || 'MekSoftDb1',
    companyKey: 'أبعاد الحديد',   // يطابق حقل "company" في financing-data.json
  },
  wissam: {
    label:      'مؤسسة وسام الفولاذ التجارية',
    db:         process.env.DB2_NAME || 'MekSoftDb2',
    companyKey: 'وسام الفولاذ',
  },
};

const FROM_DATE = '2025-10-01';
const TO_DATE   = '2026-06-30';

async function fetchOperatingProfit(dbName) {
  const pool = await getPool(dbName);
  const q = `
    SELECT
      (SELECT SUM(d.Credit)-SUM(d.Debit)
         FROM JournalVoucherDetail d
         JOIN AccountChart ac ON ac.ID = d.AccountChart
         JOIN JournalVoucherHeader h ON h.ID = d.HeaderID
         WHERE h.TransactionDate BETWEEN @from AND @to
           AND LEFT(ac.Code,1)='5') AS revenue,

      (SELECT SUM(d.Debit)-SUM(d.Credit)
         FROM JournalVoucherDetail d
         JOIN AccountChart ac ON ac.ID = d.AccountChart
         JOIN JournalVoucherHeader h ON h.ID = d.HeaderID
         WHERE h.TransactionDate BETWEEN @from AND @to
           AND LEFT(ac.Code,1)='4') AS totalExpenses,

      (SELECT SUM(d.Debit)-SUM(d.Credit)
         FROM JournalVoucherDetail d
         JOIN AccountChart ac ON ac.ID = d.AccountChart
         JOIN JournalVoucherHeader h ON h.ID = d.HeaderID
         WHERE h.TransactionDate BETWEEN @from AND @to
           AND ac.Code LIKE @financePrefix + '%') AS financingCost,

      (SELECT SUM(d.Credit)-SUM(d.Debit)
         FROM JournalVoucherDetail d
         JOIN AccountChart ac ON ac.ID = d.AccountChart
         JOIN JournalVoucherHeader h ON h.ID = d.HeaderID
         WHERE h.TransactionDate BETWEEN @from AND @to
           AND LEFT(ac.Code,1)='5')
      -
      (SELECT SUM(d.Debit)-SUM(d.Credit)
         FROM JournalVoucherDetail d
         JOIN AccountChart ac ON ac.ID = d.AccountChart
         JOIN JournalVoucherHeader h ON h.ID = d.HeaderID
         WHERE h.TransactionDate BETWEEN @from AND @to
           AND LEFT(ac.Code,1)='4'
           AND ac.Code NOT LIKE @financePrefix + '%') AS operatingProfit;
  `;
  const req = pool.request();
  req.input('from',          sql.Date,    FROM_DATE);
  req.input('to',            sql.Date,    TO_DATE);
  req.input('financePrefix', sql.NVarChar, FINANCE_ACC_PREFIX);
  const result = await req.query(q);
  return result.recordset[0];
}

function loadFinancingRegister() {
  const filePath = path.join(__dirname, '..', 'data', 'financing-data.json');
  if (!fs.existsSync(filePath)) return { loans: [], mandatedCosts: {} };
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function companyLoans(allLoans, companyKey) {
  return allLoans.filter(l => l.company === companyKey);
}

function remainingInterest(loans) {
  return loans.reduce((sum, l) => {
    const orig     = +l.originalPrincipal || 0;
    if (orig <= 0) return sum;
    const totalInt = (l.principal || 0) - orig;
    const paid     = l.paid || 0;
    const paidRatio = l.principal > 0 ? Math.min(paid / l.principal, 1) : 0;
    return sum + Math.max(totalInt * (1 - paidRatio), 0);
  }, 0);
}

function dscrLabel(dscr) {
  if (dscr === null) return 'غير متاح';
  if (dscr >= 1.5)  return 'تغطية قوية';
  if (dscr >= 1.0)  return 'تغطية كافية لكن ضيقة';
  return 'تغطية غير كافية — خطر';
}

router.get('/', async (req, res) => {
  try {
    const register      = loadFinancingRegister();
    const mandatedCosts = register.mandatedCosts || {};
    const out = {};

    for (const [key, meta] of Object.entries(COMPANIES)) {
      let fin;
      try {
        fin = await fetchOperatingProfit(meta.db);
      } catch (dbErr) {
        console.error(`[dscr] فشل الاتصال بـ ${meta.db}:`, dbErr.message);
        fin = { revenue: null, totalExpenses: null, financingCost: null,
                operatingProfit: null, error: dbErr.message };
      }

      const loans            = companyLoans(register.loans || [], meta.companyKey);
      const lifetimeInterest = remainingInterest(loans);
      const operatingProfit  = fin.operatingProfit;

      // DSCR 1: المسجَّل محاسبياً (MekSoft حيّ)
      const accountingCost  = fin.financingCost;
      const dscrAccounting  = (operatingProfit && accountingCost)
        ? +(operatingProfit / accountingCost).toFixed(2) : null;

      // DSCR 2: المستحق اقتصادياً (من سجل التمويلات — الرقم اليدوي المعتمد)
      const economicCost   = mandatedCosts[meta.companyKey] || null;
      const dscrEconomic   = (operatingProfit && economicCost)
        ? +(operatingProfit / economicCost).toFixed(2) : null;

      // الفجوة = فوائد اقتصادية لم تُقيَّد بعد
      const unrecordedGap = (economicCost !== null && accountingCost !== null)
        ? +(economicCost - accountingCost).toFixed(2) : null;

      out[key] = {
        label:  meta.label,
        period: `${FROM_DATE} → ${TO_DATE}`,

        revenue:        fin.revenue,
        totalExpenses:  fin.totalExpenses,
        operatingProfit,

        // المسجَّل محاسبياً
        accountingFinancingCost: accountingCost,
        dscrAccounting,
        dscrAccountingLabel: dscrLabel(dscrAccounting),

        // المستحق اقتصادياً
        economicFinancingCost: economicCost,
        dscrEconomic,
        dscrEconomicLabel: dscrLabel(dscrEconomic),

        // الفجوة
        unrecordedGap,

        lifetimeRemainingInterest: +lifetimeInterest.toFixed(2),
        loansCount: loans.length,
        error: fin.error || null,
      };
    }

    res.json({ generatedAt: new Date().toISOString(), companies: out });
  } catch (err) {
    console.error('[dscr] route error:', err);
    res.status(500).json({ error: 'تعذّر حساب المؤشر', details: err.message });
  }
});

module.exports = router;
