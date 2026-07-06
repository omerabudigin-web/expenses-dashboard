'use strict';
/* ============================================================
   server/routes/financing.js
   مسار سجل التمويلات — مصدر البيانات الموحّد (Single Source of Truth)
   يقرأ ويكتب data/financing-data.json على الخادم
   نفس الملف يقرأ منه تاب DSCR (routes/dscr.js) للمقارنة الحيّة
   ============================================================ */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'financing-data.json');

function ensureFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ lastSync: null, loans: [] }, null, 2), 'utf8');
  }
}

// GET /api/financing — قراءة كل التمويلات
router.get('/', (req, res) => {
  try {
    ensureFile();
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    res.json(data);
  } catch (err) {
    console.error('financing GET error:', err);
    res.status(500).json({ error: 'تعذّر قراءة بيانات التمويلات', details: err.message });
  }
});

// PUT /api/financing — حفظ كامل القائمة (يُستدعى عند كل تعديل يدوي)
router.put('/', (req, res) => {
  try {
    ensureFile();
    const loans = Array.isArray(req.body.loans) ? req.body.loans : null;
    if (!loans) return res.status(400).json({ error: 'صيغة غير صحيحة: يجب إرسال { loans: [...] }' });

    // نسخة احتياطية قبل الكتابة (أمان إضافي)
    try {
      const backupDir = path.join(__dirname, '..', 'data', 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.copyFileSync(DATA_FILE, path.join(backupDir, `financing-${stamp}.json`));
    } catch (bErr) { console.warn('تعذّر إنشاء نسخة احتياطية:', bErr.message); }

    // نحافظ على أي حقول أخرى موجودة بالملف (مثل mandatedCosts التي يعتمد عليها تاب DSCR)
    // بدل استبدال الملف بالكامل، حتى لا يُفقد أي إعداد يدوي عند حفظ من واجهة سجل التمويلات
    let existing = {};
    try { existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (_) { /* ignore */ }

    const payload = { ...existing, lastSync: new Date().toISOString(), loans };
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
    res.json({ ok: true, saved: loans.length, lastSync: payload.lastSync });
  } catch (err) {
    console.error('financing PUT error:', err);
    res.status(500).json({ error: 'تعذّر حفظ بيانات التمويلات', details: err.message });
  }
});

module.exports = router;
