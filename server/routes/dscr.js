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

// ── Total debt service (أصل + فائدة) للفترة — DSCR الحقيقي حسب التعريف القياسي ──
// المصدرين المتاحين اثنين وموثوقيتهما تختلف:
//  1) schedule[] الفعلي (متاح لبعض القروض فقط) — نستخدمه حرفياً، هو الأدق.
//  2) لا يوجد schedule: نُقدّر بالتناسب: القسط الدوري (payment) × (12/عدد أشهر الدورة)
//     يعطي "قسط سنوي مكافئ"، ثم نوزّعه على نسبة أيام الفترة من السنة. هذا تقدير
//     صريح (annualized + prorated) وليس جدول إطفاء فعلي — أدق تقدير ممكن من بيانات
//     السجل الحالية دون افتراض تواريخ استحقاق غير موثوقة لكل قسط.
const CADENCE_MONTHS = { 'شهري': 1, 'ربع سنوي': 3, 'نصف سنوي': 6, 'سنوي': 12 };

function loanDebtServiceForPeriod(loan, fromDate, toDate) {
  if (Array.isArray(loan.schedule) && loan.schedule.length) {
    return loan.schedule
      .filter(s => s.date >= fromDate && s.date <= toDate)
      .reduce((sum, s) => sum + (+s.principal || 0) + (+s.profit || 0), 0);
  }

  const payment   = +loan.payment   || 0;
  const principal = +loan.principal || 0;

  // دفعة بالونية (bullet) — "payment" هنا = كامل الرصيد المتبقي، ليست قسطاً دورياً
  // متكرراً (شائع في تسهيلات "نصف سنوي" ذات installmentsTotal ≤ 1). تحسب مرة واحدة
  // فقط، ولو وقع استحقاقها داخل الفترة المطلوبة — وإلا فهي غير مستحقة هذه الفترة.
  const isBullet = principal > 0 && Math.abs(payment - principal) < 1;
  if (isBullet) {
    return (loan.dueDate && loan.dueDate >= fromDate && loan.dueDate <= toDate) ? payment : 0;
  }

  // قسط دوري متكرر فعلي (payment أصغر بكثير من الرصيد) — لا جدول تفصيلي متاح،
  // فنُقدّر: قسط سنوي مكافئ (payment × 12/أشهر الدورة) موزّع على نسبة أيام الفترة.
  const periodDays    = (new Date(toDate) - new Date(fromDate)) / 86400000 + 1;
  const cadenceMonths = CADENCE_MONTHS[loan.type] || 1;
  const annualService = payment * (12 / cadenceMonths);
  return annualService * (periodDays / 365);
}

function totalDebtServiceForPeriod(loans, fromDate, toDate) {
  return loans.reduce((sum, l) => sum + loanDebtServiceForPeriod(l, fromDate, toDate), 0);
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

// ── Monthly DSCR series (2025-10 → current month) — powers the Riyad Bank
// renewal paper's monthly curve. Same operatingProfit/debtService methodology
// as the period-aggregate route above, just grouped by calendar month. ──────
function monthRange(fromYm, toYm) {
  const out = [];
  let [y, m] = fromYm.split('-').map(Number);
  const [ty, tm] = toYm.split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
function monthBounds(ym) {
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(lastDay).padStart(2, '0')}` };
}

async function fetchMonthlyOperatingProfit(dbName) {
  const pool = await getPool(dbName);
  const q = `
    SELECT FORMAT(h.TransactionDate,'yyyy-MM') AS ym,
      SUM(CASE WHEN LEFT(ac.Code,1)='5' THEN d.Credit-d.Debit ELSE 0 END) AS revenue,
      SUM(CASE WHEN LEFT(ac.Code,1)='4' AND ac.Code NOT LIKE @financePrefix + '%' THEN d.Debit-d.Credit ELSE 0 END) AS opex
    FROM JournalVoucherDetail d
    JOIN AccountChart ac ON ac.ID = d.AccountChart
    JOIN JournalVoucherHeader h ON h.ID = d.HeaderID
    WHERE h.TransactionDate >= @from
    GROUP BY FORMAT(h.TransactionDate,'yyyy-MM')
  `;
  const req = pool.request();
  req.input('from', sql.Date, FROM_DATE);
  req.input('financePrefix', sql.NVarChar, FINANCE_ACC_PREFIX);
  const result = await req.query(q);
  const map = {};
  result.recordset.forEach(row => { map[row.ym] = (row.revenue || 0) - (row.opex || 0); });
  return map;
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
      const totalDebtService = totalDebtServiceForPeriod(loans, FROM_DATE, TO_DATE);

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

      // DSCR 3: الحقيقي — أصل + فائدة، حسب التعريف القياسي لتغطية خدمة الدين
      // (المؤشرَين أعلاه فوائد فقط، فعليًا نسبة تغطية فوائد لا DSCR)
      const dscrTrue = (operatingProfit && totalDebtService)
        ? +(operatingProfit / totalDebtService).toFixed(2) : null;

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

        // الحقيقي — أصل + فائدة
        totalDebtService: +totalDebtService.toFixed(2),
        dscrTrue,
        dscrTrueLabel: dscrLabel(dscrTrue),

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

// GET /api/dscr/monthly — نفس منهجية المسار الرئيسي، مجمَّعة شهرياً بدل فترة
// واحدة، من 2025-10 حتى الشهر الحالي (قد يكون جزئياً).
router.get('/monthly', async (req, res) => {
  try {
    const register = loadFinancingRegister();
    const nowYm = new Date().toISOString().slice(0, 7);
    const months = monthRange(FROM_DATE.slice(0, 7), nowYm);

    const [opAbaad, opWissam] = await Promise.all([
      fetchMonthlyOperatingProfit(COMPANIES.abaad.db),
      fetchMonthlyOperatingProfit(COMPANIES.wissam.db),
    ]);

    const abaadLoans  = companyLoans(register.loans || [], COMPANIES.abaad.companyKey);
    const wissamLoans = companyLoans(register.loans || [], COMPANIES.wissam.companyKey);

    const dscrOf = (op, ds) => (ds ? +(op / ds).toFixed(4) : null);

    const rows = months.map(ym => {
      const { from, to } = monthBounds(ym);
      const opA = opAbaad[ym] || 0;
      const opW = opWissam[ym] || 0;
      const dsA = totalDebtServiceForPeriod(abaadLoans, from, to);
      const dsW = totalDebtServiceForPeriod(wissamLoans, from, to);
      const opC = opA + opW;
      const dsC = dsA + dsW;
      return {
        month: ym,
        abaad:    { operatingProfit: +opA.toFixed(2), debtService: +dsA.toFixed(2), dscr: dscrOf(opA, dsA) },
        wissam:   { operatingProfit: +opW.toFixed(2), debtService: +dsW.toFixed(2), dscr: dscrOf(opW, dsW) },
        combined: { operatingProfit: +opC.toFixed(2), debtService: +dsC.toFixed(2), dscr: dscrOf(opC, dsC) },
      };
    });

    res.json({ generatedAt: new Date().toISOString(), from: FROM_DATE, months: rows });
  } catch (err) {
    console.error('[dscr/monthly] route error:', err);
    res.status(500).json({ error: 'تعذّر حساب DSCR الشهري', details: err.message });
  }
});

module.exports = router;
