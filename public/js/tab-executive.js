// ── اللوحة التنفيذية — Executive Dashboard ───────────────────────────────────
// ملخّص قاطع لكل التابات في ثلاثة فصول: أين نحن؟ / ما المشكلة؟ / ماذا نفعل؟

const _EXEC = {
  db:        'MekSoftDb1',
  from:      '2025-10-01',
  to:        new Date().toISOString().slice(0, 10),
  data:      null,
  loading:   false,
  rendered:  false,
  countdown: 0,
  timer:     null,
};
const _EXEC_REFRESH = 300; // 5 minutes

// ── Formatters ────────────────────────────────────────────────────────────────
const _ef0  = new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 0 });
const _ef1  = new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const _efmt = v => {
  const n = +v || 0, a = Math.abs(n);
  const s = n < 0 ? '−' : '';
  if (a >= 1e9) return s + (a / 1e9).toFixed(2) + ' مليار';
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + ' م';
  if (a >= 1e3) return s + (a / 1e3).toFixed(1) + ' ألف';
  return _ef0.format(n);
};
const _efmtSAR = v => _ef0.format(Math.round(+v || 0));
const _efmtPct = v => _ef1.format(+v || 0) + '%';
const _efmtDay = v => _ef1.format(+v || 0);
const _efmtN   = v => (v == null || !isFinite(v)) ? '—' : _ef1.format(+v);

// ── Entry point ───────────────────────────────────────────────────────────────
function renderExecutiveTab() {
  const wrap = document.getElementById('tab-executive');
  if (!wrap) return;

  if (!_EXEC.rendered) {
    _EXEC.rendered = true;
    _EXEC.from = document.getElementById('data-start')?.textContent?.trim() || '2025-10-01';
    _execInjectCSS();
    wrap.innerHTML = _execBuildShell();
    _execBindEvents();
  }

  _execLoad();
}

// ── Shell HTML ────────────────────────────────────────────────────────────────
function _execBuildShell() {
  const today = new Date().toISOString().slice(0, 10);
  return `
<div class="ex-wrap">

  <!-- Status bar -->
  <div class="ex-status-bar">
    <div class="ex-status-left">
      <span class="ex-status-dot" id="ex-dot">●</span>
      <span id="ex-status-txt">جارٍ التحميل…</span>
    </div>
    <div class="ex-status-right">
      <span id="ex-sync-ts"></span>
      <button class="ex-btn-print" id="ex-btn-print">🖨 طباعة / PDF</button>
    </div>
  </div>

  <!-- Controls -->
  <div class="ex-controls">
    <div class="ex-co-btns">
      <button class="ex-co-btn active" data-db="MekSoftDb1">أبعاد الحديد</button>
      <button class="ex-co-btn" data-db="MekSoftDb2">وسام الفولاذ</button>
    </div>
    <div class="ex-ctrl-mid">
      <label class="ex-lbl">الفترة (CCC / المدينون):</label>
      <label class="ex-lbl">من</label>
      <input type="date" id="ex-from" class="ex-inp" value="${_EXEC.from}">
      <label class="ex-lbl">إلى</label>
      <input type="date" id="ex-to"   class="ex-inp" value="${today}">
    </div>
    <button class="ex-refresh-btn" id="ex-refresh">↺ تحديث</button>
  </div>

  <!-- ═══ الفصل الأول: أين نحن؟ ══════════════════════════════════════════════ -->
  <details class="ex-chapter" open id="ex-ch1">
    <summary class="ex-ch-hdr">
      <span class="ex-ch-num">①</span>
      <span class="ex-ch-title">أين نحن؟</span>
      <span class="ex-ch-sub">المؤشر الصحي العام والعلامات الحيوية</span>
    </summary>
    <div class="ex-ch-body">

      <!-- Gauge + Vitals row -->
      <div class="ex-top-row">

        <!-- Health gauge -->
        <div class="ex-gauge-card" id="ex-gauge-card">
          <div class="ex-gauge-title">مؤشر الصحة المالية</div>
          <svg class="ex-gauge-svg" viewBox="0 0 220 130" xmlns="http://www.w3.org/2000/svg">
            <!-- zones -->
            <path d="M16 110 A94 94 0 0 1 82 20"  stroke="#3a1010" stroke-width="18" fill="none" stroke-linecap="butt"/>
            <path d="M82 20 A94 94 0 0 1 138 20"  stroke="#3a2a00" stroke-width="18" fill="none" stroke-linecap="butt"/>
            <path d="M138 20 A94 94 0 0 1 204 110" stroke="#0a2a10" stroke-width="18" fill="none" stroke-linecap="butt"/>
            <!-- animated arc -->
            <path id="ex-gauge-arc"
              d="M16 110 A94 94 0 0 1 204 110"
              stroke="#C9A84C" stroke-width="18" fill="none"
              stroke-linecap="round"
              stroke-dasharray="0 295"/>
            <!-- score -->
            <text x="110" y="95" text-anchor="middle" fill="#e8f0ff"
              font-size="38" font-weight="700" font-family="Tajawal,Cairo,sans-serif">
              <tspan id="ex-gauge-num">—</tspan>
            </text>
            <text x="110" y="118" text-anchor="middle" fill="#4a6a8a"
              font-size="12" font-family="Tajawal,Cairo,sans-serif">/ 100</text>
          </svg>
          <div class="ex-gauge-verdict" id="ex-gauge-verdict">—</div>
          <div class="ex-gauge-breakdown" id="ex-gauge-breakdown"></div>
        </div>

        <!-- Vital signs (6 cards) -->
        <div class="ex-vitals-grid" id="ex-vitals"></div>
      </div>
    </div>
  </details>

  <!-- ═══ الفصل الثاني: ما المشكلة؟ ══════════════════════════════════════════ -->
  <details class="ex-chapter" open id="ex-ch2">
    <summary class="ex-ch-hdr">
      <span class="ex-ch-num">②</span>
      <span class="ex-ch-title">ما المشكلة الحقيقية؟</span>
      <span class="ex-ch-sub">التشخيص القاطع</span>
    </summary>
    <div class="ex-ch-body">
      <div id="ex-verdict"></div>
      <div class="ex-diag-grid" id="ex-diag"></div>
      <div id="ex-correction"></div>
    </div>
  </details>

  <!-- ═══ الفصل الثالث: ماذا نفعل؟ ════════════════════════════════════════════ -->
  <details class="ex-chapter" open id="ex-ch3">
    <summary class="ex-ch-hdr">
      <span class="ex-ch-num">③</span>
      <span class="ex-ch-title">ماذا نفعل؟</span>
      <span class="ex-ch-sub">خطة العمل المرتّبة بالأولوية</span>
    </summary>
    <div class="ex-ch-body">
      <div class="ex-actions-grid" id="ex-actions"></div>
    </div>
  </details>

  <!-- ═══ الإبداع: الخط الزمني + الميزان ══════════════════════════════════════ -->
  <details class="ex-chapter" open>
    <summary class="ex-ch-hdr">
      <span class="ex-ch-num">◈</span>
      <span class="ex-ch-title">البصريات التحليلية</span>
      <span class="ex-ch-sub">رحلة الريال · ميزان الربح والتمويل</span>
    </summary>
    <div class="ex-ch-body">
      <div class="ex-creative-row">
        <div class="ex-creative-card" id="ex-timeline-card">
          <div class="ex-creative-title">🔄 رحلة الريال — دورة التحويل النقدي</div>
          <div id="ex-timeline"></div>
        </div>
        <div class="ex-creative-card" id="ex-scale-card">
          <div class="ex-creative-title">⚖ ميزان: الربح مقابل كلفة التمويل</div>
          <div id="ex-scale"></div>
        </div>
      </div>
    </div>
  </details>

  <!-- ═══ التوثيق والشرح ════════════════════════════════════════════════════════ -->
  <details class="ex-chapter">
    <summary class="ex-ch-hdr">
      <span class="ex-ch-num">📋</span>
      <span class="ex-ch-title">التوثيق والمنهجية</span>
      <span class="ex-ch-sub">معادلة مؤشر الصحة · مصادر الأرقام</span>
    </summary>
    <div class="ex-ch-body">
      <div id="ex-methodology"></div>
    </div>
  </details>

  <!-- ═══ جدول المطابقة ══════════════════════════════════════════════════════════ -->
  <details class="ex-chapter">
    <summary class="ex-ch-hdr">
      <span class="ex-ch-num">✓</span>
      <span class="ex-ch-title">جدول المطابقة — اختبار القبول</span>
      <span class="ex-ch-sub">كل رقم في اللوحة مطابَق لمصدره</span>
    </summary>
    <div class="ex-ch-body">
      <div id="ex-match-table"></div>
    </div>
  </details>

  <div class="ex-footer">اللوحة التنفيذية — تحليل شامل · جميع الأرقام مُطابَقة لميك سوفت والدفاتر</div>
</div>`;
}

// ── Event binding ─────────────────────────────────────────────────────────────
function _execBindEvents() {
  document.getElementById('ex-refresh')?.addEventListener('click', _execLoad);
  document.getElementById('ex-btn-print')?.addEventListener('click', () => window.print());
  document.getElementById('ex-from')?.addEventListener('change', e => {
    _EXEC.from = e.target.value; _execLoad();
  });
  document.getElementById('ex-to')?.addEventListener('change', e => {
    _EXEC.to = e.target.value; _execLoad();
  });
  document.querySelectorAll('.ex-co-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ex-co-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _EXEC.db = btn.dataset.db;
      _execLoad();
    });
  });
  _execStartTimer();
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function _execStartTimer() {
  if (_EXEC.timer) clearInterval(_EXEC.timer);
  _EXEC.countdown = _EXEC_REFRESH;
  _EXEC.timer = setInterval(() => {
    if (!document.querySelector('.tab.active[data-tab="executive"]')) {
      clearInterval(_EXEC.timer); _EXEC.timer = null; return;
    }
    _EXEC.countdown--;
    if (_EXEC.countdown <= 0) { _EXEC.countdown = _EXEC_REFRESH; _execLoad(); }
    else _execUpdateStatus();
  }, 1000);
}

// ── Status bar ────────────────────────────────────────────────────────────────
function _execUpdateStatus(state) {
  const dot = document.getElementById('ex-dot');
  const txt = document.getElementById('ex-status-txt');
  const ts  = document.getElementById('ex-sync-ts');
  if (!txt) return;

  if (state === 'loading') {
    if (dot) { dot.style.color = '#da9a4a'; }
    txt.textContent = '⏳ جارٍ تحميل البيانات…';
    return;
  }
  if (state === 'error') {
    if (dot) dot.style.color = '#da4a4a';
    txt.textContent = '❌ فشل التحميل';
    return;
  }
  if (!_EXEC.data) return;
  if (dot) dot.style.color = '#4ada8e';
  const d = _EXEC.data;
  txt.textContent = `✓ ${d.companyName} · فترة التدفّق ${d.from} → ${d.to} · رصيد حتى ${d.balanceAsOf || d.to} · تحديث بعد ${_EXEC.countdown}ث`;
  if (ts) ts.textContent = `آخر تحديث: ${new Date().toLocaleTimeString('ar-SA')}`;
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function _execLoad() {
  if (_EXEC.loading) return;
  _EXEC.loading = true;
  _execUpdateStatus('loading');

  const from = document.getElementById('ex-from')?.value || _EXEC.from;
  const to   = document.getElementById('ex-to')?.value   || _EXEC.to;
  const today = new Date().toISOString().slice(0, 10);

  try {
    const url  = `/api/executive-summary?db=${encodeURIComponent(_EXEC.db)}&from=${from}&to=${to}&asOf=${today}`;
    const data = await fetch(url).then(r => r.json());
    if (data.error) throw new Error(data.error + ' — ' + (data.message || ''));
    _EXEC.data = data;
    _execRender(data);
    _EXEC.countdown = _EXEC_REFRESH;
    _execUpdateStatus('ok');
  } catch (err) {
    _execUpdateStatus('error');
    const dot = document.getElementById('ex-dot');
    if (dot) dot.style.color = '#da4a4a';
    const txt = document.getElementById('ex-status-txt');
    if (txt) txt.textContent = '❌ ' + err.message;
  } finally {
    _EXEC.loading = false;
  }
}

// ── Master render ─────────────────────────────────────────────────────────────
function _execRender(d) {
  _execRenderGauge(d);
  _execRenderVitals(d);
  _execRenderChapter2(d);
  _execRenderChapter3(d);
  _execRenderCreative(d);
  _execRenderMethodology(d);
  _execRenderMatchTable(d);
}

// ── Chapter 1: Gauge ──────────────────────────────────────────────────────────
function _execRenderGauge(d) {
  const score  = d.healthScore.total;
  const arcEl  = document.getElementById('ex-gauge-arc');
  const numEl  = document.getElementById('ex-gauge-num');
  const verdEl = document.getElementById('ex-gauge-verdict');
  const brkEl  = document.getElementById('ex-gauge-breakdown');
  if (!arcEl) return;

  // Gauge arc: full half-circle ≈ 295 (π × 94)
  const maxLen = 295;
  const color  = score < 40 ? '#da4a4a' : score < 70 ? '#da9a4a' : '#4ada8e';
  arcEl.setAttribute('stroke', color);

  // Animate
  let cur = 0;
  const target = (score / 100) * maxLen;
  const animStep = () => {
    cur = Math.min(cur + target / 45, target);
    arcEl.setAttribute('stroke-dasharray', `${cur.toFixed(1)} ${maxLen}`);
    if (numEl) numEl.textContent = Math.round((cur / maxLen) * 100);
    if (cur < target) requestAnimationFrame(animStep);
    else if (numEl) numEl.textContent = score;
  };
  requestAnimationFrame(animStep);

  const labels = score < 40  ? ['#da4a4a', 'وضع حرج — يستدعي تدخلاً فورياً']
               : score < 60  ? ['#da9a4a', 'تحت الضغط — يستدعي مراجعة']
               : score < 75  ? ['#daba4a', 'مقبول — يمكن تحسينه']
               :                ['#4ada8e', 'صحة جيدة — حافظ على المسار'];

  if (verdEl) {
    verdEl.style.color = labels[0];
    verdEl.textContent = labels[1];
  }

  if (brkEl) {
    const hs = d.healthScore;
    brkEl.innerHTML = `
      <div class="ex-gauge-bk-row">
        <span>الربحية</span><span style="color:#a0c8e8">${hs.profitability}/30</span>
        <span>السيولة</span><span style="color:#a0c8e8">${hs.liquidity}/25</span>
      </div>
      <div class="ex-gauge-bk-row">
        <span>التمويل</span><span style="color:#a0c8e8">${hs.financing}/25</span>
        <span>التحصيل</span><span style="color:#a0c8e8">${hs.collection}/20</span>
      </div>`;
  }
}

// ── Period helpers ────────────────────────────────────────────────────────────
function _execFmtDate(iso) {
  if (!iso) return '—';
  const [y, m, dm] = iso.split('-');
  const arMonth = ['','يناير','فبراير','مارس','أبريل','مايو','يونيو',
                   'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  return `${+dm} ${arMonth[+m]} ${y}`;
}
function _execPeriodLabel(from, to) {
  return `${_execFmtDate(from)} ← ${_execFmtDate(to)}`;
}

// ── Chapter 1: Vital Signs ────────────────────────────────────────────────────
function _execRenderVitals(d) {
  const el = document.getElementById('ex-vitals');
  if (!el) return;

  const intercoDir = d.interco.net < 0
    ? `${d.peerName} تموّلك` : `أنت تموّل ${d.peerName}`;
  const intercoVal = Math.abs(d.interco.net);
  const intercoColor = d.interco.net < 0 ? '#4ada8e' : '#da9a4a';

  // Period context labels
  const periodLabel = _execPeriodLabel(d.from, d.to);
  const stockLabel  = `رصيد حتى ${_execFmtDate(d.balanceAsOf || d.to)}`;
  const FLOW  = 'flow';   // مؤشر تدفّق — يخصّ الفترة
  const STOCK = 'stock';  // مؤشر رصيد — لحظة في التاريخ

  const vitals = [
    {
      type: FLOW,
      icon: '💰', label: 'الإيراد الإجمالي',
      val: _efmt(d.pl.revenue) + ' ر.س',
      arrow: '↑', arrowColor: '#4ada8e',
      sub: 'هامش إجمالي ' + _efmtPct(d.pl.grossMargin),
    },
    {
      type: FLOW,
      icon: '📈', label: 'صافي الربح | الهامش',
      val: _efmt(d.pl.netProfit) + ' | ' + _efmtPct(d.pl.netMargin),
      arrow: d.pl.netMargin > 5 ? '↑' : '↓',
      arrowColor: d.pl.netMargin > 5 ? '#4ada8e' : '#da4a4a',
      sub: 'كلفة تمويل ' + _efmt(d.pl.finCost) + ' ر.س · عبء ' + _efmtPct(d.pl.finBurden),
    },
    {
      type: FLOW,
      icon: '🔄', label: 'دورة التحويل النقدي',
      val: _efmtDay(d.ccc.ccc) + ' يوم',
      arrow: d.ccc.ccc < 45 ? '✓' : d.ccc.ccc < 75 ? '⚠' : '↑',
      arrowColor: d.ccc.ccc < 45 ? '#4ada8e' : d.ccc.ccc < 75 ? '#da9a4a' : '#da4a4a',
      sub: `DSO ${_efmtDay(d.ccc.dso)} · DIO ${_efmtDay(d.ccc.dio)} · DPO ${_efmtDay(d.ccc.dpo)}`,
    },
    {
      type: STOCK,
      icon: '🏦', label: 'إجمالي التمويل',
      val: _efmt(d.financing.total) + ' ر.س',
      arrow: '⚠', arrowColor: '#da9a4a',
      sub: `كلفة الفترة ${_efmt(d.financing.annualCost)} ر.س (${_efmtPct(d.financing.effectiveRate)})`,
    },
    {
      type: STOCK,
      icon: '👥', label: 'مدينو السوق (بعد المقاصة)',
      val: _efmt(d.ar.net) + ' ر.س',
      arrow: d.ar.overdueRatio < 10 ? '✓' : '⚠',
      arrowColor: d.ar.overdueRatio < 10 ? '#4ada8e' : '#da9a4a',
      sub: `متأخر >90 يوم: ${_efmt(d.ar.overdue90)} ر.س (${_efmtPct(d.ar.overdueRatio)})`,
    },
    {
      type: STOCK,
      icon: '🔗', label: `صافي وضع ${d.peerName}`,
      val: (d.interco.net < 0 ? '−' : '+') + _efmt(intercoVal) + ' ر.س',
      arrow: d.interco.net < 0 ? '✓' : '⚠',
      arrowColor: intercoColor,
      sub: intercoDir + ' — ' + (d.interco.status === 'matched' ? 'مطابق ✓' : `فجوة ${_efmt(d.interco.gap)} ر.س`),
    },
  ];

  el.innerHTML = vitals.map(v => {
    const isFlow  = v.type === FLOW;
    const badge   = isFlow
      ? `<span class="ex-vital-badge ex-vital-badge-flow">📅 فترة</span>`
      : `<span class="ex-vital-badge ex-vital-badge-stock">📊 رصيد</span>`;
    const ctxLine = isFlow
      ? `<div class="ex-vital-ctx ex-vital-ctx-flow">${periodLabel}</div>`
      : `<div class="ex-vital-ctx ex-vital-ctx-stock">${stockLabel}</div>`;
    return `
    <div class="ex-vital-card ex-vital-card-${v.type}">
      <div class="ex-vital-top-row">
        <span class="ex-vital-icon">${v.icon}</span>${badge}
      </div>
      <div class="ex-vital-label">${v.label}</div>
      <div class="ex-vital-val">${v.val} <span style="color:${v.arrowColor};font-size:1rem">${v.arrow}</span></div>
      <div class="ex-vital-sub">${v.sub}</div>
      ${ctxLine}
    </div>`;
  }).join('');
}

// ── Chapter 2: Diagnosis ──────────────────────────────────────────────────────
function _execRenderChapter2(d) {
  const pl  = d.pl;
  const fin = d.financing;
  const ar  = d.ar;

  // ── Verdict card ────────────────────────────────────────────────────────────
  const verdEl = document.getElementById('ex-verdict');
  if (verdEl) {
    const ratio = pl.finBurden;
    const verdict = ratio > 100
      ? `كلفة التمويل (${_efmtSAR(fin.annualCost)} ر.س) تفوق صافي الربح (${_efmtSAR(pl.netProfit)} ر.س) — ${ratio.toFixed(0)}%. العبء تمويلي هيكلي، لا تشغيلي.`
      : ratio > 50
      ? `كلفة التمويل (${_efmtSAR(fin.annualCost)} ر.س) تستهلك ${ratio.toFixed(0)}% من صافي الربح. ضغط تمويلي ملحوظ.`
      : `كلفة التمويل (${_efmtSAR(fin.annualCost)} ر.س) في حدود مقبولة — ${ratio.toFixed(0)}% من الربح الصافي.`;
    const vColor = ratio > 100 ? '#da4a4a' : ratio > 50 ? '#da9a4a' : '#4ada8e';
    verdEl.innerHTML = `
      <div class="ex-verdict-card" style="border-color:${vColor}44">
        <div class="ex-verdict-icon" style="color:${vColor}">⚡</div>
        <div class="ex-verdict-text">${verdict}</div>
      </div>`;
  }

  // ── Diagnosis cards ──────────────────────────────────────────────────────────
  const diagEl = document.getElementById('ex-diag');
  if (diagEl) {
    const dio = d.ccc.dio;
    const invStatus = dio < 30
      ? { icon: '✅', color: '#4ada8e', title: 'المخزون سليم', body: `DIO ${_efmtDay(dio)} يوم — دوران جيد، تسليح الحديد لا يبيت طويلاً في المستودع. ليست أولويتك.` }
      : dio < 60
      ? { icon: '⚠️', color: '#da9a4a', title: 'المخزون يستحق مراجعة', body: `DIO ${_efmtDay(dio)} يوم — البضاعة تبيت ${_efmtDay(dio)} يوم قبل البيع. راجع الأصناف الراكدة.` }
      : { icon: '🔴', color: '#da4a4a', title: 'مخزون راكد — مشكلة', body: `DIO ${_efmtDay(dio)} يوم — نقد محبوس مع مخاطرة تقلب أسعار الحديد. أولوية عاجلة.` };

    const gm = pl.grossMargin;
    const gpStatus = gm > 15
      ? { icon: '✅', color: '#4ada8e', title: 'الربحية الإجمالية صحيحة', body: `هامش إجمالي ${_efmtPct(gm)} — قوي لتجارة الحديد. الضغط من أعباء التمويل، لا من التشغيل.` }
      : gm > 8
      ? { icon: '⚠️', color: '#da9a4a', title: 'الهامش الإجمالي متوسط', body: `هامش إجمالي ${_efmtPct(gm)} — مقبول لكنه تحت ضغط. تحسين تسعير الأصناف ذات الهامش الضعيف مطلوب.` }
      : { icon: '🔴', color: '#da4a4a', title: 'ضغط على الهامش الإجمالي', body: `هامش إجمالي ${_efmtPct(gm)} — منخفض. راجع التسعير وتكاليف الشراء بشكل عاجل.` };

    const fb = pl.finBurden;
    const finStatus = fb > 100
      ? { icon: '🔴', color: '#da4a4a', title: 'التمويل عبء هيكلي', body: `${_efmtPct(fin.effectiveRate)} كلفة فعلية · ${_efmt(fin.total)} ر.س إجمالي تمويل · ${_efmtPct(fb)} من الربح. إعادة الهيكلة ضرورة.` }
      : fb > 50
      ? { icon: '⚠️', color: '#da9a4a', title: 'التمويل ثقيل', body: `${_efmtPct(fb)} من صافي الربح يذهب للتمويل. تخفيض الدين أو تمديد الآجال مطلوب.` }
      : { icon: '✅', color: '#4ada8e', title: 'التمويل في حدود المقبول', body: `كلفة التمويل ${_efmtPct(fb)} من الربح — الهيكل التمويلي مستدام حالياً.` };

    diagEl.innerHTML = [invStatus, gpStatus, finStatus].map(s => `
      <div class="ex-diag-card" style="border-top-color:${s.color}">
        <div class="ex-diag-icon" style="color:${s.color}">${s.icon}</div>
        <div class="ex-diag-title" style="color:${s.color}">${s.title}</div>
        <div class="ex-diag-body">${s.body}</div>
      </div>`).join('');
  }

  // ── Cognitive correction banner ──────────────────────────────────────────────
  const corrEl = document.getElementById('ex-correction');
  if (corrEl && ar) {
    const diff = ar.gross - ar.net;
    const peerNet = Math.abs(d.interco.net);
    corrEl.innerHTML = `
      <div class="ex-correction-banner">
        <div class="ex-correction-icon">🔍</div>
        <div class="ex-correction-body">
          <div class="ex-correction-title">تصحيح إدراكي مهم</div>
          <ul class="ex-correction-list">
            <li>مدينوك <strong style="color:#4ada8e">الحقيقيون ${_efmt(ar.net)} ر.س</strong> لا ${_efmt(ar.gross)} ر.س — الفرق (${_efmt(diff)} ر.س) مقاصّة بينية وسُلفة موردين.</li>
            <li>${d.peerName} <strong style="color:#4ada8e">تموّلك صافياً ${_efmt(peerNet)} ر.س</strong>${d.interco.net < 0 ? '، لا العكس' : ''}.</li>
            <li>حالة التطابق البيني: <strong style="color:${d.interco.status === 'matched' ? '#4ada8e' : '#da9a4a'}">${d.interco.status === 'matched' ? 'متطابق ✓' : 'فجوة ' + _efmt(d.interco.gap) + ' ر.س'}</strong></li>
          </ul>
        </div>
      </div>`;
  }
}

// ── Chapter 3: Action Plan ────────────────────────────────────────────────────
function _execRenderChapter3(d) {
  const el = document.getElementById('ex-actions');
  if (!el) return;

  const dso = d.ccc.dso;
  const dpo = d.ccc.dpo;
  const lev = d.cccLevers;

  const actions = [
    {
      num: '①', priority: 'عاجل جداً',
      title: 'سرّع التحصيل وصفِّ الراكد',
      impact: `تقليل DSO بـ 5 أيام ≈ ${_efmt(lev.salesPerDay * 5)} ر.س سيولة فورية`,
      body:   `DSO حالياً ${_efmtDay(dso)} يوم. كل يوم تحسين = ${_efmt(lev.salesPerDay)} ر.س نقدية. قائمة المتأخرين >90 يوم.`,
      tab:    'aging',
      tabLabel: 'تاب المدينين',
      color:  '#da4a4a',
    },
    {
      num: '②', priority: 'عاجل',
      title: 'تفاوض آجال سداد أطول مع الموردين',
      impact: `تمديد DPO من ${_efmtDay(dpo)} إلى 30 يوماً ≈ ${_efmt(lev.purchPerDay * (30 - dpo))} ر.س تمويل مجاني`,
      body:   `DPO حالياً ${_efmtDay(dpo)} يوم — منخفض جداً لتجارة الحديد. تمديده يقلّل الحاجة للاقتراض مباشرة.`,
      tab:    'liabilities',
      tabLabel: 'تاب الالتزامات',
      color:  '#da9a4a',
    },
    {
      num: '③', priority: 'مهم',
      title: 'أعد هيكلة الدفعات البنكية المتكتّلة',
      impact: `تقليل كلفة التمويل بـ 10–15% ≈ ${_efmt(d.financing.annualCost * 0.12)} ر.س سنوياً`,
      body:   `التمويل ${_efmt(d.financing.total)} ر.س بكلفة ${_efmtPct(d.financing.effectiveRate)}. توزيع الدفعات يُزيل أزمات السيولة الشهرية.`,
      tab:    'liabilities',
      tabLabel: 'تاب التمويلات',
      color:  '#4a9eda',
    },
    {
      num: '④', priority: 'استراتيجي',
      title: 'أوقف بيع ما هامشه < 7%',
      impact: `رفع الهامش الإجمالي من ${_efmtPct(d.pl.grossMargin)} إلى > 12% يحرّر ${_efmt(d.pl.revenue * 0.05)} ر.س إضافية`,
      body:   `ليس كل بيع مربح. الأصناف ذات الهامش < 7% تولّد إيراداً وتستهلك تمويلاً بلا ربح حقيقي.`,
      tab:    'item-profit',
      tabLabel: 'تاب ربحية الصنف',
      color:  '#a07aff',
    },
  ];

  el.innerHTML = actions.map(a => `
    <div class="ex-action-card" style="--acol:${a.color}">
      <div class="ex-action-num" style="color:${a.color}">${a.num}</div>
      <div class="ex-action-priority" style="background:${a.color}22;color:${a.color}">${a.priority}</div>
      <div class="ex-action-title">${a.title}</div>
      <div class="ex-action-impact">📊 الأثر: ${a.impact}</div>
      <div class="ex-action-body">${a.body}</div>
      <button class="ex-action-link" data-tab="${a.tab}">← انتقل: ${a.tabLabel}</button>
    </div>`).join('');

  // Wire action link buttons
  el.querySelectorAll('.ex-action-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabBtn = document.querySelector(`.tab[data-tab="${btn.dataset.tab}"]`);
      if (tabBtn) tabBtn.click();
    });
  });
}

// ── Creative: CCC Timeline + Balance ─────────────────────────────────────────
function _execRenderCreative(d) {
  _execRenderTimeline(d);
  _execRenderScale(d);
}

function _execRenderTimeline(d) {
  const el = document.getElementById('ex-timeline');
  if (!el) return;

  const { dso, dio, dpo, ccc } = d.ccc;
  const total = dio + dso; // x-axis span
  if (!total) { el.innerHTML = '<div class="ex-tl-empty">—</div>'; return; }

  const pct  = v => (v / total * 100).toFixed(1) + '%';
  const days = v => _efmtDay(v) + ' يوم';

  el.innerHTML = `
    <div class="ex-tl-legend">
      <span class="ex-tl-leg-item" style="--lc:#da9a4a">DPO — سداد للموردين</span>
      <span class="ex-tl-leg-item" style="--lc:#4a9eda">DIO — تخزين</span>
      <span class="ex-tl-leg-item" style="--lc:#a07aff">DSO — تحصيل</span>
      <span class="ex-tl-leg-item" style="--lc:#C9A84C">CCC — الريال محبوس</span>
    </div>
    <div class="ex-tl-gantt">

      <!-- Row: DPO -->
      <div class="ex-tl-row">
        <div class="ex-tl-row-lbl">DPO</div>
        <div class="ex-tl-row-track">
          <div class="ex-tl-bar" style="left:0;width:${pct(dpo)};background:#da9a4a22;border:1px solid #da9a4a">
            <span>${days(dpo)}</span>
          </div>
        </div>
      </div>

      <!-- Row: DIO -->
      <div class="ex-tl-row">
        <div class="ex-tl-row-lbl">DIO</div>
        <div class="ex-tl-row-track">
          <div class="ex-tl-bar" style="left:0;width:${pct(dio)};background:#4a9eda22;border:1px solid #4a9eda">
            <span>${days(dio)}</span>
          </div>
        </div>
      </div>

      <!-- Row: DSO -->
      <div class="ex-tl-row">
        <div class="ex-tl-row-lbl">DSO</div>
        <div class="ex-tl-row-track">
          <div class="ex-tl-bar" style="left:${pct(dio)};width:${pct(dso)};background:#a07aff22;border:1px solid #a07aff">
            <span>${days(dso)}</span>
          </div>
        </div>
      </div>

      <!-- Row: CCC -->
      <div class="ex-tl-row ex-tl-ccc-row">
        <div class="ex-tl-row-lbl" style="color:#C9A84C">CCC</div>
        <div class="ex-tl-row-track">
          <div class="ex-tl-bar" style="left:${pct(dpo)};width:${pct(ccc)};background:#C9A84C33;border:2px solid #C9A84C">
            <span style="color:#C9A84C;font-weight:700">${days(ccc)} ← محبوس</span>
          </div>
        </div>
      </div>

    </div>
    <div class="ex-tl-axis">
      <span>اليوم 0 — الشراء</span>
      <span>اليوم ${_efmtDay(dpo)} — سداد للموردين</span>
      <span>اليوم ${_efmtDay(dio)} — البيع</span>
      <span>اليوم ${_efmtDay(total)} — استلام النقد</span>
    </div>
    <div class="ex-tl-note">
      كل ريال تشتريه يبقى محبوساً <strong style="color:#C9A84C">${days(ccc)}</strong>
      قبل أن يعود إليك. تقليل هذه المدة = تقليل الحاجة للاقتراض.
    </div>`;
}

function _execRenderScale(d) {
  const el = document.getElementById('ex-scale');
  if (!el) return;

  const profit  = d.pl.netProfit;
  const finCost = d.pl.finCost;
  const maxVal  = Math.max(Math.abs(profit), finCost, 1);
  const pH = Math.round(Math.abs(profit) / maxVal * 90);
  const fH = Math.round(finCost / maxVal * 90);
  const ratio = finCost > 0 && profit > 0 ? (finCost / profit * 100).toFixed(0) + '%' : '—';

  // Tilt angle: finance heavier → tips right (positive angle)
  const tilt = finCost > profit
    ? Math.min(12, ((finCost - profit) / maxVal) * 20)
    : -Math.min(12, ((profit - finCost) / maxVal) * 20);

  const profitColor = profit > 0 ? '#4ada8e' : '#da4a4a';

  el.innerHTML = `
    <div class="ex-scale-wrap">
      <div class="ex-scale-beam" style="transform:rotate(${tilt}deg)">
        <div class="ex-scale-arm">
          <!-- Profit side -->
          <div class="ex-scale-side">
            <div class="ex-scale-bar-wrap">
              <div class="ex-scale-bar" style="height:${pH}px;background:${profitColor}44;border-color:${profitColor}">
                <span class="ex-scale-bar-val" style="color:${profitColor}">${_efmt(profit)}</span>
              </div>
            </div>
            <div class="ex-scale-side-label">صافي الربح</div>
          </div>

          <!-- Pivot -->
          <div class="ex-scale-pivot">⚖</div>

          <!-- Finance side -->
          <div class="ex-scale-side">
            <div class="ex-scale-bar-wrap">
              <div class="ex-scale-bar" style="height:${fH}px;background:#da4a4a44;border-color:#da4a4a">
                <span class="ex-scale-bar-val" style="color:#da4a4a">${_efmt(finCost)}</span>
              </div>
            </div>
            <div class="ex-scale-side-label">كلفة التمويل</div>
          </div>
        </div>
      </div>
      <div class="ex-scale-verdict" style="color:${finCost > profit ? '#da4a4a' : '#4ada8e'}">
        ${finCost > profit
          ? `التمويل أثقل من الربح بنسبة ${ratio} — عبء هيكلي يستدعي المعالجة`
          : `الربح أعلى من كلفة التمويل — وضع مستدام`}
      </div>
    </div>`;
}

// ── Methodology ───────────────────────────────────────────────────────────────
function _execRenderMethodology(d) {
  const el = document.getElementById('ex-methodology');
  if (!el) return;
  el.innerHTML = `
    <div class="ex-method-box">
      <div class="ex-method-title">معادلة مؤشر الصحة المالية (0–100)</div>
      <table class="ex-method-tbl">
        <tr><th>المكوّن</th><th>النطاق</th><th>الحساب</th><th>قيمتك الآن</th></tr>
        <tr>
          <td>الربحية</td><td>0–30</td>
          <td>هامش صافٍ > 10% = 30 · 5-10% = 20 · 0-5% = 10 · سلبي = 0</td>
          <td style="color:#a0c8e8">${d.healthScore.profitability}/30 (هامش ${_efmtPct(d.pl.netMargin)})</td>
        </tr>
        <tr>
          <td>السيولة / CCC</td><td>0–25</td>
          <td>CCC < 30 يوم = 25 · 30-60 = 15 · 60-90 = 8 · > 90 = 2</td>
          <td style="color:#a0c8e8">${d.healthScore.liquidity}/25 (CCC ${_efmtDay(d.ccc.ccc)} يوم)</td>
        </tr>
        <tr>
          <td>عبء التمويل</td><td>0–25</td>
          <td>كلفة ÷ ربح < 50% = 25 · 50-100% = 15 · 100-150% = 8 · > 150% = 2</td>
          <td style="color:#a0c8e8">${d.healthScore.financing}/25 (${_efmtPct(d.pl.finBurden)})</td>
        </tr>
        <tr>
          <td>جودة التحصيل</td><td>0–20</td>
          <td>متأخر >90 / AR < 10% = 20 · 10-25% = 12 · 25-50% = 6 · > 50% = 2</td>
          <td style="color:#a0c8e8">${d.healthScore.collection}/20 (${_efmtPct(d.ar.overdueRatio)} متأخر)</td>
        </tr>
        <tr style="font-weight:700;border-top:2px solid #1e3a5f">
          <td>المجموع</td><td>100</td><td>—</td>
          <td style="color:#C9A84C">${d.healthScore.total}/100</td>
        </tr>
      </table>
      <div class="ex-method-note">
        هذه اللوحة ملخّص؛ التفاصيل والمطابقة في التابات المعنية.
        الأرقام كلها مُطابَقة لميك سوفت والدفاتر تلقائياً مع كل تحديث.
      </div>
    </div>`;
}

// ── Match Table ───────────────────────────────────────────────────────────────
function _execRenderMatchTable(d) {
  const el = document.getElementById('ex-match-table');
  if (!el) return;

  const periodLabel = `${d.from} → ${d.to}`;
  const stockLabel  = `رصيد حتى ${d.balanceAsOf || d.to}`;
  const F = `<span style="color:#da9a4a;font-size:.7rem">📅 فترة</span>`;
  const S = `<span style="color:#4a9eda;font-size:.7rem">📊 رصيد</span>`;

  // [label, source, value, tab-ref, type-badge, period-context]
  const rows = [
    ['CCC — دورة التحويل النقدي', 'getCCCData', _efmtDay(d.ccc.ccc) + ' يوم', 'تاب CCC', F, periodLabel],
    ['DSO — أيام التحصيل',        'getCCCData', _efmtDay(d.ccc.dso) + ' يوم', 'تاب CCC', F, periodLabel],
    ['DIO — أيام المخزون',         'getCCCData', _efmtDay(d.ccc.dio) + ' يوم', 'تاب CCC', F, periodLabel],
    ['DPO — أيام السداد',          'getCCCData', _efmtDay(d.ccc.dpo) + ' يوم', 'تاب CCC', F, periodLabel],
    ['الإيراد الإجمالي',           'getPLMonthly', _efmtSAR(d.pl.revenue) + ' ر.س',     'تاب قائمة الدخل', F, periodLabel],
    ['الربح الإجمالي / الهامش',    'getPLMonthly', _efmtSAR(d.pl.grossProfit) + ' | ' + _efmtPct(d.pl.grossMargin), 'تاب قائمة الدخل', F, periodLabel],
    ['صافي الربح / الهامش الصافي', 'getPLMonthly', _efmtSAR(d.pl.netProfit) + ' | ' + _efmtPct(d.pl.netMargin),    'تاب قائمة الدخل', F, periodLabel],
    ['كلفة التمويل (fin)',          'getPLMonthly', _efmtSAR(d.pl.finCost) + ' ر.س',     'تاب قائمة الدخل', F, periodLabel],
    ['إجمالي التمويل البنكي',       'getLiabilitiesData', _efmtSAR(d.financing.total) + ' ر.س',  'تاب الالتزامات', S, stockLabel],
    ['مدينو السوق (بعد المقاصة)',   'getAgingData (FIFO)', _efmtSAR(d.ar.net) + ' ر.س',           'تاب المدينين', S, stockLabel],
    ['متأخر >90 يوم',              'getAgingData',        _efmtSAR(d.ar.overdue90) + ' ر.س',       'تاب المدينين', S, stockLabel],
    ['صافي وضع ' + d.peerName,     'getIntercoRecon',     (d.interco.net < 0 ? '−' : '+') + _efmtSAR(Math.abs(d.interco.net)) + ' ر.س', 'تاب التسوية البينية', S, 'رصيد GL كامل'],
    ['مؤشر الصحة المالية',          'محسوب',               d.healthScore.total + '/100', 'اللوحة التنفيذية', F, periodLabel],
  ];

  el.innerHTML = `
    <div class="ex-match-legend">
      <span>${F} مؤشر تدفّق — يخصّ الفترة ${periodLabel}</span>
      <span>${S} مؤشر رصيد — ${stockLabel}</span>
    </div>
    <table class="ex-match-tbl">
      <thead>
        <tr>
          <th>النوع</th>
          <th>المؤشر / الرقم</th>
          <th>المصدر</th>
          <th>القيمة الحالية</th>
          <th>مرجع التاب</th>
          <th>السياق الزمني</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r, i) => `
          <tr style="${i % 2 === 0 ? '' : 'background:#060e18'}">
            <td>${r[4]}</td>
            <td style="color:#c0d0e0">${r[0]}</td>
            <td style="color:#5a7a9a;font-size:.77rem;font-family:monospace">${r[1]}</td>
            <td style="color:#C9A84C;font-weight:600">${r[2]}</td>
            <td style="color:#4a8aaa;font-size:.79rem">${r[3]}</td>
            <td style="color:#3a6a6a;font-size:.73rem">${r[5]}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    <div style="margin-top:10px;color:#3a5a7a;font-size:.77rem">
      ★ جميع الأرقام تُحسَب من نفس قواعد البيانات التي تتغذى منها التابات — لا ترميز، لا أرقام يدوية.
      التحديث التلقائي كل ${_EXEC_REFRESH / 60} دقائق.
    </div>`;
}

// ── CSS Injection ─────────────────────────────────────────────────────────────
function _execInjectCSS() {
  if (document.getElementById('exec-style')) return;
  const s = document.createElement('style');
  s.id = 'exec-style';
  s.textContent = `
/* ── Base ──────────────────────────────────────────────────────────────────── */
#tab-executive { padding:0; }
.ex-wrap { font-family:Tajawal,Cairo,sans-serif; direction:rtl; }

/* ── Status bar ─────────────────────────────────────────────────────────────── */
.ex-status-bar {
  display:flex; justify-content:space-between; align-items:center;
  padding:8px 18px; background:#060e18; border-bottom:1px solid #1a2e50;
  font-size:.78rem; gap:12px;
}
.ex-status-left  { display:flex; align-items:center; gap:8px; color:#8aacca; }
.ex-status-right { display:flex; align-items:center; gap:12px; color:#4a6a8a; }
.ex-status-dot   { font-size:.7rem; color:#4ada8e; }
.ex-btn-print {
  background:#1a2e50; color:#C9A84C; border:1px solid #C9A84C55;
  border-radius:4px; padding:4px 12px; cursor:pointer; font-size:.78rem;
  font-family:Tajawal,Cairo,sans-serif;
}
.ex-btn-print:hover { background:#2a3e60; }

/* ── Controls ───────────────────────────────────────────────────────────────── */
.ex-controls {
  display:flex; align-items:center; gap:14px; padding:10px 18px;
  background:#07111c; border-bottom:1px solid #1a2e50; flex-wrap:wrap;
}
.ex-co-btns   { display:flex; gap:6px; }
.ex-co-btn {
  background:#0d1e30; color:#6a9ab8; border:1px solid #1e3a5f;
  border-radius:20px; padding:5px 16px; cursor:pointer; font-size:.82rem;
  font-family:Tajawal,Cairo,sans-serif; transition:all .2s;
}
.ex-co-btn.active {
  background:#C9A84C; color:#07111c; border-color:#C9A84C; font-weight:700;
}
.ex-co-btn:not(.active):hover { background:#1a2e50; color:#a0c8e8; }
.ex-ctrl-mid  { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.ex-lbl       { color:#5a8aaa; font-size:.79rem; }
.ex-inp {
  background:#0d1e30; border:1px solid #1e3a5f; color:#c0d8f0;
  border-radius:4px; padding:4px 8px; font-size:.79rem;
}
.ex-refresh-btn {
  background:#1a2e50; color:#8aaac8; border:1px solid #2a4a7a;
  border-radius:4px; padding:5px 14px; cursor:pointer; font-size:.82rem;
  font-family:Tajawal,Cairo,sans-serif; margin-right:auto;
}
.ex-refresh-btn:hover { background:#2a4a6a; }

/* ── Chapters ───────────────────────────────────────────────────────────────── */
.ex-chapter { border:none; margin:14px 18px; }
.ex-chapter summary { list-style:none; }
.ex-chapter summary::-webkit-details-marker { display:none; }
.ex-ch-hdr {
  display:flex; align-items:center; gap:10px;
  background:#0a1828; border:1px solid #1a2e50; border-radius:8px;
  padding:12px 16px; cursor:pointer; user-select:none;
}
.ex-chapter[open] .ex-ch-hdr { border-radius:8px 8px 0 0; }
.ex-ch-num   { font-size:1.1rem; color:#C9A84C; font-weight:800; }
.ex-ch-title { color:#e0f0ff; font-size:.95rem; font-weight:700; }
.ex-ch-sub   { color:#5a7a9a; font-size:.78rem; margin-right:auto; }
.ex-ch-body  {
  background:#060e18; border:1px solid #1a2e50; border-top:none;
  border-radius:0 0 8px 8px; padding:18px;
}

/* ── Chapter 1: Gauge + Vitals ──────────────────────────────────────────────── */
.ex-top-row {
  display:flex; gap:20px; align-items:flex-start; flex-wrap:wrap;
}
.ex-gauge-card {
  background:#0a1828; border:1px solid #1a2e50; border-radius:10px;
  padding:18px; min-width:220px; text-align:center; flex-shrink:0;
}
.ex-gauge-title { color:#8aacca; font-size:.79rem; font-weight:600; margin-bottom:8px; }
.ex-gauge-svg   { width:100%; max-width:220px; }
.ex-gauge-verdict { font-size:.84rem; font-weight:700; margin-top:8px; }
.ex-gauge-breakdown { margin-top:10px; font-size:.76rem; }
.ex-gauge-bk-row {
  display:grid; grid-template-columns:1fr auto 1fr auto; gap:4px 10px;
  align-items:center; color:#5a7a9a; margin:3px 0;
}

/* ── Vitals grid ─────────────────────────────────────────────────────────────── */
.ex-vitals-grid {
  display:grid; grid-template-columns:repeat(3,1fr); gap:10px; flex:1; min-width:300px;
}
@media(max-width:900px) { .ex-vitals-grid { grid-template-columns:repeat(2,1fr); } }
@media(max-width:580px) { .ex-vitals-grid { grid-template-columns:1fr; } }
.ex-vital-card {
  background:#0a1828; border:1px solid #1a2e50; border-radius:8px;
  padding:14px; position:relative; display:flex; flex-direction:column; gap:4px;
}
.ex-vital-card-flow  { border-bottom:2px solid #da9a4a44; }
.ex-vital-card-stock { border-bottom:2px solid #4a9eda44; }
.ex-vital-top-row { display:flex; align-items:center; justify-content:space-between; gap:6px; }
.ex-vital-icon  { font-size:1.05rem; }
.ex-vital-badge {
  border-radius:3px; padding:1px 6px; font-size:.68rem; font-weight:700;
}
.ex-vital-badge-flow  { background:#da9a4a22; color:#da9a4a; border:1px solid #da9a4a44; }
.ex-vital-badge-stock { background:#4a9eda22; color:#4a9eda; border:1px solid #4a9eda44; }
.ex-vital-label { color:#5a7a9a; font-size:.74rem; font-weight:600; }
.ex-vital-val   { color:#e0f0ff; font-size:1rem; font-weight:700; }
.ex-vital-sub   { color:#4a6a7a; font-size:.72rem; line-height:1.4; }
.ex-vital-ctx   { font-size:.68rem; margin-top:2px; }
.ex-vital-ctx-flow  { color:#7a5a2a; }
.ex-vital-ctx-stock { color:#2a5a7a; }

/* ── Chapter 2 ───────────────────────────────────────────────────────────────── */
.ex-verdict-card {
  background:#0d1420; border:1px solid; border-radius:8px;
  padding:18px 20px; margin-bottom:16px; display:flex; align-items:flex-start; gap:14px;
}
.ex-verdict-icon { font-size:1.5rem; flex-shrink:0; }
.ex-verdict-text { color:#c0d8f0; font-size:.9rem; line-height:1.65; font-weight:600; }

.ex-diag-grid {
  display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:16px;
}
@media(max-width:800px) { .ex-diag-grid { grid-template-columns:1fr; } }
.ex-diag-card {
  background:#0a1828; border:1px solid #1a2e50; border-top:3px solid;
  border-radius:0 0 8px 8px; padding:14px;
}
.ex-diag-icon  { font-size:1.2rem; margin-bottom:6px; }
.ex-diag-title { font-size:.85rem; font-weight:700; margin-bottom:6px; }
.ex-diag-body  { color:#7a9ab8; font-size:.78rem; line-height:1.55; }

.ex-correction-banner {
  background:#06101a; border:1px solid #1a3050; border-right:4px solid #C9A84C;
  border-radius:0 8px 8px 0; padding:14px 18px; display:flex; gap:14px;
}
.ex-correction-icon { font-size:1.2rem; flex-shrink:0; padding-top:2px; }
.ex-correction-title { color:#C9A84C; font-size:.84rem; font-weight:700; margin-bottom:6px; }
.ex-correction-list  {
  margin:0; padding-right:16px; display:flex; flex-direction:column; gap:5px;
  color:#8aaac8; font-size:.80rem; line-height:1.5;
}
.ex-correction-list strong { color:#c0d8f0; }

/* ── Chapter 3: Actions ──────────────────────────────────────────────────────── */
.ex-actions-grid {
  display:grid; grid-template-columns:repeat(4,1fr); gap:12px;
}
@media(max-width:1100px) { .ex-actions-grid { grid-template-columns:repeat(2,1fr); } }
@media(max-width:600px)  { .ex-actions-grid { grid-template-columns:1fr; } }
.ex-action-card {
  background:#0a1828; border:1px solid #1a2e50; border-top:3px solid var(--acol);
  border-radius:0 0 8px 8px; padding:14px; display:flex; flex-direction:column; gap:8px;
}
.ex-action-num    { font-size:1.4rem; font-weight:800; }
.ex-action-priority {
  display:inline-block; border-radius:4px; padding:2px 10px;
  font-size:.72rem; font-weight:700;
}
.ex-action-title  { color:#e0f0ff; font-size:.86rem; font-weight:700; line-height:1.4; }
.ex-action-impact { background:#06101a; border-radius:4px; padding:6px 10px;
  color:#8aaac8; font-size:.77rem; line-height:1.45; }
.ex-action-body   { color:#5a7a9a; font-size:.77rem; line-height:1.5; flex:1; }
.ex-action-link {
  background:#0d1e30; color:#4a9eda; border:1px solid #1e3a5f;
  border-radius:4px; padding:6px 10px; cursor:pointer; font-size:.78rem;
  font-family:Tajawal,Cairo,sans-serif; text-align:right; margin-top:auto;
}
.ex-action-link:hover { background:#1a2e50; }

/* ── Creative row ────────────────────────────────────────────────────────────── */
.ex-creative-row {
  display:grid; grid-template-columns:1fr 1fr; gap:16px;
}
@media(max-width:900px) { .ex-creative-row { grid-template-columns:1fr; } }
.ex-creative-card {
  background:#0a1828; border:1px solid #1a2e50; border-radius:8px; padding:16px;
}
.ex-creative-title { color:#8aacca; font-size:.82rem; font-weight:700; margin-bottom:14px; }

/* ── CCC Timeline ────────────────────────────────────────────────────────────── */
.ex-tl-legend {
  display:flex; gap:12px; flex-wrap:wrap; margin-bottom:12px;
}
.ex-tl-leg-item {
  display:flex; align-items:center; gap:5px; font-size:.74rem; color:#8aacca;
}
.ex-tl-leg-item::before {
  content:''; display:inline-block; width:14px; height:10px;
  background:var(--lc,#fff); border-radius:2px; opacity:.6;
}
.ex-tl-gantt { display:flex; flex-direction:column; gap:6px; }
.ex-tl-row   { display:flex; align-items:center; gap:8px; height:32px; }
.ex-tl-ccc-row { height:36px; }
.ex-tl-row-lbl  { width:36px; text-align:left; color:#5a7a9a; font-size:.73rem; flex-shrink:0; }
.ex-tl-row-track { flex:1; position:relative; height:100%; }
.ex-tl-bar {
  position:absolute; height:100%; border-radius:4px;
  display:flex; align-items:center; padding:0 8px;
  font-size:.74rem; white-space:nowrap; color:#c0d8f0;
  min-width:60px; box-sizing:border-box;
}
.ex-tl-axis {
  display:flex; justify-content:space-between;
  color:#3a5a7a; font-size:.71rem; margin-top:8px; flex-wrap:wrap; gap:4px;
}
.ex-tl-note {
  margin-top:10px; padding:8px 12px; background:#06101a;
  border-right:3px solid #C9A84C; color:#7a9ab8; font-size:.78rem; line-height:1.55;
  border-radius:0 4px 4px 0;
}
.ex-tl-empty { color:#3a5a7a; text-align:center; padding:20px; }

/* ── Balance scale ───────────────────────────────────────────────────────────── */
.ex-scale-wrap { text-align:center; }
.ex-scale-beam { transition:transform .6s ease; display:inline-block; width:100%; }
.ex-scale-arm  {
  display:flex; align-items:flex-end; justify-content:center; gap:30px;
  height:120px; padding-bottom:8px;
}
.ex-scale-side { display:flex; flex-direction:column; align-items:center; gap:6px; }
.ex-scale-bar-wrap { display:flex; align-items:flex-end; height:100px; }
.ex-scale-bar {
  width:70px; border:2px solid; border-radius:6px 6px 0 0;
  display:flex; align-items:flex-start; justify-content:center;
  padding-top:6px; position:relative;
}
.ex-scale-bar-val { font-size:.77rem; font-weight:700; }
.ex-scale-pivot   { font-size:2rem; align-self:flex-end; padding-bottom:4px; }
.ex-scale-side-label { color:#6a8aaa; font-size:.77rem; }
.ex-scale-verdict {
  margin-top:12px; font-size:.82rem; font-weight:600;
  background:#06101a; border-radius:4px; padding:8px 14px; display:inline-block;
}

/* ── Methodology ─────────────────────────────────────────────────────────────── */
.ex-method-box {
  background:#0a1828; border:1px solid #1a2e50; border-radius:8px; padding:16px;
}
.ex-method-title { color:#C9A84C; font-size:.85rem; font-weight:700; margin-bottom:12px; }
.ex-method-tbl { width:100%; border-collapse:collapse; font-size:.78rem; direction:rtl; }
.ex-method-tbl th {
  background:#112233; color:#6a9ab8; padding:7px 12px; text-align:right;
  border-bottom:2px solid #1e3a5f;
}
.ex-method-tbl td { padding:7px 12px; border-bottom:1px solid #0d1e2e; color:#7a9ab8; }
.ex-method-note {
  margin-top:12px; padding:8px 12px; background:#06101a;
  border:1px solid #1a2e50; border-radius:4px; color:#4a6a7a; font-size:.76rem;
  line-height:1.55;
}

/* ── Match table ─────────────────────────────────────────────────────────────── */
.ex-match-legend {
  display:flex; gap:20px; flex-wrap:wrap; margin-bottom:10px;
  font-size:.76rem; color:#6a9ab8;
}
.ex-match-tbl { width:100%; border-collapse:collapse; font-size:.79rem; direction:rtl; }
.ex-match-tbl th {
  background:#112233; color:#6a9ab8; padding:8px 12px; text-align:right;
  border-bottom:2px solid #1e3a5f; white-space:nowrap;
}
.ex-match-tbl td { padding:7px 12px; border-bottom:1px solid #06101a; }

/* ── Footer ──────────────────────────────────────────────────────────────────── */
.ex-footer {
  padding:14px 18px; color:#2a4a6a; font-size:.73rem;
  border-top:1px solid #0d1e2e; margin:18px 0 0;
}

/* ── Print styles ────────────────────────────────────────────────────────────── */
@media print {
  .hdr, .tabs, .ex-controls, .ex-status-bar, .ex-btn-print,
  .ex-refresh-btn, .ex-co-btns, #conn-banner,
  #verify-overlay { display:none !important; }
  #tab-executive { display:block !important; }
  .ex-chapter { margin:8px 0; }
  .ex-ch-body { background:#fff; border:1px solid #ccc; }
  .ex-vitals-grid { grid-template-columns:repeat(3,1fr); }
  .ex-actions-grid { grid-template-columns:repeat(2,1fr); }
  body { background:#fff; color:#000; }
}
  `;
  document.head.appendChild(s);
}
