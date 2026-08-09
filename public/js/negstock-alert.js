'use strict';

// ── NEGATIVE-STOCK DEFECT — LIVE ALERT ────────────────────────────────────────
// Polls both companies periodically for NEW invoices hit by the negative-stock
// costing defect (see tab-negative-stock.js) and surfaces a banner + sidebar
// badge the moment one appears. First run only baselines what's already known
// (everything reviewed so far) — it never alerts retroactively, only for
// invoices that show up from this point forward.

(function () {
  const CHECK_DBS  = ['MekSoftDb1', 'MekSoftDb2']; // أبعاد ووسام
  const POLL_MS     = 5 * 60 * 1000;                // كل 5 دقائق
  const START_DATE  = '2025-10-01';

  const seenKey = db => `negstockSeen_${db}`;
  const today   = () => new Date().toISOString().slice(0, 10);
  const companyLabel = db => db === 'MekSoftDb1' ? 'أبعاد' : db === 'MekSoftDb2' ? 'وسام' : db;

  let running = false;

  async function checkOneDb(db) {
    const res = await fetch(`/api/negative-stock-audit?db=${encodeURIComponent(db)}&from=${START_DATE}&to=${today()}`);
    if (!res.ok) return null;
    const data = await res.json();
    const currentIds = data.invoices.map(i => i.jvId);
    const stored = localStorage.getItem(seenKey(db));

    if (stored === null) {
      // أول تشغيل لهذه القاعدة — الحالات الحالية معروفة/مراجَعة، لا تنبيه رجعي
      localStorage.setItem(seenKey(db), JSON.stringify(currentIds));
      return { db, newInvoices: [] };
    }

    const seenIds = new Set(JSON.parse(stored));
    const newInvoices = data.invoices.filter(i => !seenIds.has(i.jvId));
    localStorage.setItem(seenKey(db), JSON.stringify(currentIds));
    return { db, newInvoices };
  }

  function showBanner(results) {
    const totalNew = results.reduce((s, r) => s + r.newInvoices.length, 0);
    if (!totalNew) return;

    const parts = results.filter(r => r.newInvoices.length)
      .map(r => `${companyLabel(r.db)}: ${r.newInvoices.length}`);
    const textEl = document.getElementById('ns-banner-text');
    const banner = document.getElementById('negstock-banner');
    if (textEl) textEl.textContent = `تنبيه: ${totalNew} فاتورة جديدة بعيب تكلفة المخزون السالب — ${parts.join(' | ')}`;
    if (banner) banner.style.display = 'flex';

    const badge = document.getElementById('ns-nav-badge');
    if (badge) { badge.textContent = totalNew; badge.style.display = 'inline-block'; }
  }

  async function runCheck() {
    if (running) return;
    running = true;
    try {
      const config = await fetch('/api/config').then(r => r.json()).catch(() => null);
      const dbs = config ? CHECK_DBS.filter(db => config.databases.includes(db)) : CHECK_DBS;
      const results = (await Promise.all(dbs.map(db => checkOneDb(db).catch(() => null)))).filter(Boolean);
      showBanner(results);
    } finally {
      running = false;
    }
  }

  function clearAlertUI() {
    const banner = document.getElementById('negstock-banner');
    const badge  = document.getElementById('ns-nav-badge');
    if (banner) banner.style.display = 'none';
    if (badge)  badge.style.display  = 'none';
  }

  document.addEventListener('DOMContentLoaded', () => {
    const dismissBtn = document.getElementById('ns-banner-dismiss');
    const viewBtn     = document.getElementById('ns-banner-view');
    const tabEl       = document.querySelector('.tab[data-tab="negstock"]');

    if (dismissBtn) dismissBtn.addEventListener('click', clearAlertUI);
    if (viewBtn && tabEl) viewBtn.addEventListener('click', () => tabEl.click());
    if (tabEl) tabEl.addEventListener('click', clearAlertUI);

    setTimeout(runCheck, 8000); // اترك تحميل الصفحة الأساسي يكتمل أولاً
    setInterval(runCheck, POLL_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') runCheck();
    });
  });
})();
