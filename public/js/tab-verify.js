// ── VERIFY — ERP sync check + financial health ─────────────────────────────────
const VERIFY_EPS = 1;
const CAT_NAMES_V = { sal:'رواتب وأجور', rent:'إيجار', maint:'صيانة وتشغيل', sell:'مبيعات وتسويق',
                      dist:'نقل وتوزيع', adm:'مصروفات إدارية', fin:'مصروفات مالية',
                      char:'مصروفات خيرية', oth:'مصروفات أخرى' };

async function runVerify() {
  const dbName = State.get('activeDb');
  if (!dbName) return;
  const btn = document.getElementById('verify-btn');
  if (btn) { btn.textContent = '⟳ جارٍ الفحص…'; btn.className = 'verify-btn vchk'; }
  try {
    const fresh = await fetch(`/api/verify?db=${encodeURIComponent(dbName)}`).then(r => r.json());
    if (fresh.error) throw new Error(fresh.error);

    const diffs  = _buildDiffs(fresh);
    const health = _buildHealth(fresh);
    const allOk  = diffs.length === 0 && health.every(h => h.pass);
    const ts     = new Date(fresh.timestamp).toLocaleTimeString('ar-SA');

    if (btn) {
      const failCount = diffs.length + health.filter(h => !h.pass).length;
      btn.textContent = failCount === 0 ? '✓ متطابق مع ERP' : `⚠ ${failCount} تنبيه`;
      btn.className   = failCount === 0 ? 'verify-btn vok' : 'verify-btn vwarn';
    }
    const meta = document.getElementById('verify-meta');
    if (meta) meta.textContent = `آخر فحص: ${ts} · ${fresh.accounts.count} حساب · ${fresh.bs.items.length} مجموعة · ${fresh.pl.months} شهر`;
    const body = document.getElementById('verify-body');
    if (body) body.innerHTML = _renderVerifyBody(diffs, health, fresh);
  } catch (e) {
    if (btn) { btn.textContent = '⚠ خطأ في الفحص'; btn.className = 'verify-btn verr'; }
    console.error('[verify]', e);
  }
}

function _buildDiffs(fresh) {
  const diffs = [];
  const add = (sec, name, dash, erp) => {
    const d = dash - erp;
    if (Math.abs(d) > VERIFY_EPS) diffs.push({ sec, name, dash, erp, d });
  };

  // ── قائمة الدخل ──
  const pa = aggregatePL(State.get('pl') || []);
  add('قائمة الدخل', 'الإيرادات',       pa.revenue,     fresh.pl.revenue);
  add('قائمة الدخل', 'تكلفة المبيعات',  pa.cogs,        fresh.pl.cogs);
  add('قائمة الدخل', 'مجمل الربح',      pa.grossProfit, fresh.pl.grossProfit);
  add('قائمة الدخل', 'رواتب وأجور',     pa.sal,         fresh.pl.sal);
  add('قائمة الدخل', 'إيجار',           pa.rent,        fresh.pl.rent);
  add('قائمة الدخل', 'صيانة وتشغيل',   pa.maint,       fresh.pl.maint);
  add('قائمة الدخل', 'مبيعات وتسويق',  pa.sell,        fresh.pl.sell);
  add('قائمة الدخل', 'نقل وتوزيع',     pa.dist,        fresh.pl.dist);
  add('قائمة الدخل', 'مصروفات إدارية', pa.adm,         fresh.pl.adm);
  add('قائمة الدخل', 'مصروفات مالية',  pa.fin,         fresh.pl.fin);
  add('قائمة الدخل', 'صافي الربح',      pa.netProfit,   fresh.pl.netProfit);

  // ── حسابات المصروفات — match by code+name (handles duplicate codes in ERP) ──
  const sa    = State.get('accounts') || [];
  const saKey = a => a.code + '|' + a.name;
  const saMap = new Map(sa.map(a => [saKey(a), a]));
  fresh.accounts.items.forEach(f => {
    const s = saMap.get(saKey(f));
    add('حسابات المصروفات', f.name, s ? s.total : 0, f.total);
  });
  const freshKeys = new Set(fresh.accounts.items.map(saKey));
  sa.forEach(s => {
    if (!freshKeys.has(saKey(s)) && s.total > VERIFY_EPS)
      diffs.push({ sec:'حسابات المصروفات', name:s.name, dash:s.total, erp:0, d:s.total });
  });

  // ── المركز المالي — match by grpCode (codes are unique at level-3) ──
  const sb    = State.get('bs') || [];
  const lastMo = [...new Set(sb.map(r => r.month))].sort().pop();
  if (lastMo && fresh.bs.items.length) {
    const slat   = sb.filter(r => r.month === lastMo);
    const slatMap = new Map(slat.map(r => [r.grpCode, r]));
    fresh.bs.items.forEach(f => {
      const s = slatMap.get(f.grpCode);
      add('المركز المالي', f.grpName, s ? s.balance : 0, f.balance);
    });
  }

  // ── الإيضاحات — بيانات الشهري حسب الفئة ──
  if (fresh.monthly) {
    const sm = State.get('monthly') || [];
    Object.keys(CAT_NAMES_V).forEach(k => {
      const dashVal = sm.reduce((s, m) => s + (m[k] || 0), 0);
      add('الإيضاحات (الشهري حسب الفئة)', CAT_NAMES_V[k], dashVal, fresh.monthly[k] || 0);
    });
  }

  return diffs;
}

function _buildHealth(fresh) {
  // Backend health checks
  const hcs = [...(fresh.healthChecks || [])];

  // ── Frontend: CF internal consistency ──
  const bsState  = State.get('bs')             || [];
  const plState  = State.get('pl')             || [];
  const bfState  = State.get('bankFacilities') || [];
  const cfAll    = cfMonthly(bsState, plState, bfState);
  const cfAgg    = aggregateCF(cfAll);
  if (cfAgg) {
    const cfSum   = cfAgg.operatingCF + cfAgg.investingCF + cfAgg.financingCF;
    const diff1   = Math.abs(cfSum - cfAgg.netCashChange);
    hcs.push({
      id: 'cf_reconcile',
      name: 'تسوية التدفقات النقدية (تشغيلي + استثماري + تمويلي = صافي التغيير)',
      pass: diff1 < 1,
      detail: `تشغيلي: ${fmtPlNum(cfAgg.operatingCF)} + استثماري: ${fmtPlNum(cfAgg.investingCF)} + تمويلي: ${fmtPlNum(cfAgg.financingCF)} = ${fmtPlNum(cfSum)} | صافي التغيير: ${fmtPlNum(cfAgg.netCashChange)} | الفرق: ${diff1.toFixed(2)}`
    });
    const diff2 = Math.abs(cfAgg.openingCash + cfAgg.netCashChange - cfAgg.closingCash);
    hcs.push({
      id: 'cf_cash_check',
      name: 'رصيد النقدية (أول الفترة + صافي التغيير = آخر الفترة)',
      pass: diff2 < 1,
      detail: `أول الفترة: ${fmt(cfAgg.openingCash)} + صافي: ${fmtPlNum(cfAgg.netCashChange)} = ${fmt(cfAgg.openingCash + cfAgg.netCashChange)} | آخر الفترة: ${fmt(cfAgg.closingCash)} | الفرق: ${diff2.toFixed(2)}`
    });
  }

  // ── Frontend: Ratios derived-data check ──
  const bsMths = [...new Set(bsState.map(r => r.month))].sort();
  const lastBsMo = bsMths[bsMths.length - 1];
  if (lastBsMo) {
    const r = computeRatios(bsState, plState, lastBsMo);
    if (r) {
      hcs.push({
        id: 'ratios_data_ok',
        name: 'بيانات النسب المالية مكتملة (BS + P&L متوفران)',
        pass: r.totalA > 0 && r.annRev > 0,
        detail: `إجمالي الأصول: ${fmt(r.totalA)} | الإيراد السنوي المُعدَّل: ${fmt(r.annRev)}`
      });
    }
  }

  return hcs;
}

function _renderVerifyBody(diffs, health, fresh) {
  const failHc  = health.filter(h => !h.pass);
  const passHc  = health.filter(h =>  h.pass);
  const hasDiff = diffs.length > 0;
  const hasFailHc = failHc.length > 0;

  let html = '';

  // ── Health check section ──────────────────────────────────────────────────
  html += `<div class="v-section">صحة القوائم المالية</div>`;
  html += `<table class="v-tbl" style="margin-bottom:18px">
    <thead><tr><th>الفحص</th><th style="width:70px;text-align:center">النتيجة</th><th>التفاصيل</th></tr></thead>
    <tbody>`;
  health.forEach(h => {
    const badge = h.pass
      ? `<span style="color:#4ada8e;font-weight:600">✓ ناجح</span>`
      : `<span style="color:#da4a4a;font-weight:600;animation:vpulse 1.5s infinite">✗ فشل</span>`;
    html += `<tr style="${h.pass ? '' : 'background:#120808'}">
      <td>${esc(h.name)}</td>
      <td style="text-align:center">${badge}</td>
      <td style="font-size:.74rem;color:#708090;font-family:monospace;direction:ltr;text-align:left">${esc(h.detail || '')}</td>
    </tr>`;
  });
  html += `</tbody></table>`;

  // ── Derived tabs notice ───────────────────────────────────────────────────
  html += `<div class="v-section">التبويبات المشتقة (تلقائياً من البيانات المُحقَّقة)</div>
  <div style="font-size:.79rem;padding:10px 12px;background:#06121e;border-radius:6px;margin-bottom:16px;line-height:2">
    <span style="color:#4ada8e">✓</span> <strong style="color:#a0c0e0">التدفقات النقدية</strong> — مشتقة من المركز المالي وقائمة الدخل<br>
    <span style="color:#4ada8e">✓</span> <strong style="color:#a0c0e0">النسب المالية</strong> — مشتقة من المركز المالي وقائمة الدخل<br>
    <span style="color:#4ada8e">✓</span> <strong style="color:#a0c0e0">الإيضاحات والتوجيهات</strong> — مشتقة من الشهري والمركز المالي والنسب
  </div>`;

  // ── ERP diff section ──────────────────────────────────────────────────────
  if (!hasDiff) {
    html += `<div class="v-ok" style="padding:20px 0">✓ جميع البيانات المباشرة متطابقة مع ERP</div>`;
  } else {
    const secs = {};
    diffs.forEach(d => { (secs[d.sec] = secs[d.sec] || []).push(d); });
    html += `<div class="v-section">فروق مقابل ERP</div>`;
    html += `<div style="padding:9px 12px;background:#1a0808;border-radius:6px;font-size:.78rem;color:#da7070;margin-bottom:12px">
      ⚠ يوجد ${diffs.length} فرق — قد يكون سببه تغيير قيود في ERP بعد آخر تحديث. اضغط الزر مجدداً للتحقق.
    </div>`;
    Object.entries(secs).forEach(([sec, rows]) => {
      html += `<div style="color:#7090b0;font-size:.73rem;font-weight:600;padding:6px 0 3px">${esc(sec)}</div>
      <table class="v-tbl">
        <thead><tr><th>البند</th><th class="num">الداشبورد</th><th class="num">ERP</th><th class="num">الفرق</th></tr></thead>
        <tbody>${rows.map(d => {
          const col  = Math.abs(d.d) > 10000 ? 'v-diff-hi' : 'v-diff-lo';
          const sign = d.d > 0 ? '+' : '';
          return `<tr><td>${esc(d.name)}</td>
            <td class="num">${fmt(d.dash)}</td>
            <td class="num">${fmt(d.erp)}</td>
            <td class="num ${col}">${sign}${fmt(d.d)}</td></tr>`;
        }).join('')}</tbody>
      </table>`;
    });
  }

  return html;
}
