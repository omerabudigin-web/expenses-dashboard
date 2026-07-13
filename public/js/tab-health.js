// ── HEALTH SCORE tab — الصحة المالية والإنذار المبكر ────────────────────────
// تاب مستقل: يجمّع بيانات حيّة من تابات النسب المالية (client-side)، DSCR،
// إعمار العملاء، سلامة الدفاتر، والتسوية البينية — بدون لمس أي منها.

const _HLT = {
  db:       'MekSoftDb1',
  data:     null,
  loading:  false,
  rendered: false,
  countdown: 0,
  timer:    null,
  chartInst: null,
};
const _HLT_REFRESH = 120; // seconds

// ── Metric definitions — نفس عتبات RATIO_DEFS في tab-ratios.js حتى لا يتناقض
// لون/عتبة أي مؤشر هنا مع ما يظهر في تاب النسب المالية ─────────────────────────
const HLT_METRICS = [
  { key:'netMargin',   lbl:'هامش الربح الصافي', pillar:'profit', w:8, lo:3,   hi:8,   hb:true,  dec:1, sfx:'%' },
  { key:'grossMargin', lbl:'هامش الربح الإجمالي',pillar:'profit', w:6, lo:10,  hi:20,  hb:true,  dec:1, sfx:'%' },
  { key:'roe',         lbl:'العائد على الملكية', pillar:'profit', w:6, lo:8,   hi:15,  hb:true,  dec:1, sfx:'%' },

  { key:'currentRatio',lbl:'النسبة الجارية',     pillar:'liq',    w:6, lo:1,   hi:1.5, hb:true,  dec:2, sfx:'×' },
  { key:'quickRatio',  lbl:'النسبة السريعة',     pillar:'liq',    w:5, lo:0.7, hi:1,   hb:true,  dec:2, sfx:'×' },
  { key:'cashRatio',   lbl:'نسبة النقدية',       pillar:'liq',    w:4, lo:0.2, hi:0.5, hb:true,  dec:2, sfx:'×' },

  { key:'debtRatio',   lbl:'الديون من الأصول',   pillar:'lev',    w:5, lo:50,  hi:70,  hb:false, dec:1, sfx:'%' },
  { key:'debtEquity',  lbl:'الدين / الملكية',    pillar:'lev',    w:5, lo:1,   hi:2,   hb:false, dec:2, sfx:'×' },
  { key:'intCoverage', lbl:'تغطية الفوائد',      pillar:'lev',    w:5, lo:1.5, hi:3,   hb:true,  dec:1, sfx:'×' },
];
const HLT_PILLAR_MAX = { profit:20, liq:15, lev:15, dscr:20, collect:20, integrity:10 };
const HLT_PILLAR_LBL = {
  profit:'الربحية', liq:'السيولة', lev:'الرفع المالي',
  dscr:'تغطية خدمة الدين (DSCR)', collect:'جودة التحصيل وتركز العملاء', integrity:'سلامة البيانات',
};

// ── Band helpers — نفس منطق clr() في tab-ratios.js لكن يُعيد تسمية بدل لون ──────
function _hltBand(val, lo, hi, hb) {
  if (val === null || val === undefined || !isFinite(val)) return 'na';
  return hb ? (val >= hi ? 'good' : val >= lo ? 'warn' : 'bad')
            : (val <= lo ? 'good' : val <= hi ? 'warn' : 'bad');
}
function _hltBandScore(band, max) {
  return band === 'good' ? max : band === 'warn' ? max * 0.5 : band === 'bad' ? 0 : max * 0.4;
}
function _hltBandColor(band) {
  return band === 'good' ? '#4ada8e' : band === 'warn' ? '#da9a4a' : band === 'bad' ? '#da4a4a' : '#5a7a9a';
}
function _hltFmtVal(v, dec, sfx) {
  return (v === null || v === undefined || !isFinite(v)) ? '—' : v.toFixed(dec) + sfx;
}

// ── Entry point ───────────────────────────────────────────────────────────────
function renderHealthTab() {
  const wrap = document.getElementById('tab-health');
  if (!wrap) return;
  if (!_HLT.rendered) {
    _HLT.rendered = true;
    _hltInjectCSS();
    wrap.innerHTML = _hltBuildShell();
    _hltBindEvents();
  }
  _hltLoad();
}

// ── Shell HTML ────────────────────────────────────────────────────────────────
function _hltBuildShell() {
  return `
<div class="hlt-wrap">

  <div class="hlt-status-bar">
    <div class="hlt-status-left">
      <span class="hlt-status-dot" id="hlt-dot">●</span>
      <span id="hlt-status-txt">جارٍ التحميل…</span>
    </div>
    <div class="hlt-status-right"><span id="hlt-sync-ts"></span></div>
  </div>

  <div class="hlt-controls">
    <div class="hlt-co-btns">
      <button class="hlt-co-btn active" data-db="MekSoftDb1">أبعاد الحديد</button>
      <button class="hlt-co-btn" data-db="MekSoftDb2">وسام الفولاذ</button>
    </div>
    <button class="hlt-refresh-btn" id="hlt-refresh">↺ تحديث</button>
  </div>

  <div class="hlt-top-row">
    <div class="hlt-gauge-card">
      <div class="hlt-gauge-title">الدرجة الإجمالية للصحة المالية</div>
      <svg class="hlt-gauge-svg" viewBox="0 0 220 130" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 110 A94 94 0 0 1 82 20"  stroke="#3a1010" stroke-width="18" fill="none" stroke-linecap="butt"/>
        <path d="M82 20 A94 94 0 0 1 138 20"  stroke="#3a2a00" stroke-width="18" fill="none" stroke-linecap="butt"/>
        <path d="M138 20 A94 94 0 0 1 204 110" stroke="#0a2a10" stroke-width="18" fill="none" stroke-linecap="butt"/>
        <path id="hlt-gauge-arc"
          d="M16 110 A94 94 0 0 1 204 110"
          stroke="#C9A84C" stroke-width="18" fill="none"
          stroke-linecap="round" stroke-dasharray="0 295"/>
        <text x="110" y="95" text-anchor="middle" fill="#e8f0ff"
          font-size="38" font-weight="700" font-family="Tajawal,Cairo,sans-serif">
          <tspan id="hlt-gauge-num">—</tspan>
        </text>
        <text x="110" y="118" text-anchor="middle" fill="#4a6a8a"
          font-size="12" font-family="Tajawal,Cairo,sans-serif">/ 100</text>
      </svg>
      <div class="hlt-gauge-verdict" id="hlt-gauge-verdict">—</div>
    </div>
    <div class="hlt-pillars" id="hlt-pillars"></div>
  </div>

  <details class="hlt-explain">
    <summary class="hlt-explain-summary">ℹ️ شرح المنهجية وكيفية قراءة الأرقام — اضغط للتوسيع</summary>
    <div class="hlt-explain-body">
      <p>هذا التاب لا يجمع بيانات جديدة — هو طبقة تفسير فوق أرقام موجودة أصلاً في تابات أخرى (النسب المالية، DSCR، إعمار العملاء، ميزان المراجعة، التسوية البينية)، مجمّعة في درجة واحدة وقائمة تنبيهات موحّدة حتى لا تُراجع كل تاب على حدة لتكوين صورة شاملة.</p>

      <div class="hlt-explain-sub">كيف تُحسب الدرجة (100 نقطة على 6 محاور)</div>
      <table class="hlt-explain-tbl">
        <thead><tr><th>المحور</th><th>الوزن</th><th>ماذا يقيس</th></tr></thead>
        <tbody>
          <tr><td>الربحية</td><td>20</td><td>هامش الربح الصافي والإجمالي، العائد على الملكية</td></tr>
          <tr><td>السيولة</td><td>15</td><td>القدرة على سداد الالتزامات قصيرة الأجل (النسبة الجارية، السريعة، النقدية)</td></tr>
          <tr><td>الرفع المالي</td><td>15</td><td>حجم الدين مقارنة بالأصول وحقوق الملكية، وتغطية الفوائد</td></tr>
          <tr><td>تغطية خدمة الدين (DSCR)</td><td>20</td><td>هل الربح التشغيلي يكفي لتغطية كلفة التمويل الاقتصادية الفعلية؟</td></tr>
          <tr><td>جودة التحصيل وتركز العملاء</td><td>20</td><td>نسبة المتأخر أكثر من 90 يوماً، ومدى اعتماد المبيعات على عدد محدود من العملاء</td></tr>
          <tr><td>سلامة البيانات</td><td>10</td><td>توازن ميزان المراجعة على كامل الدفاتر، وتطابق التسوية البينية بين الشركتين</td></tr>
        </tbody>
      </table>

      <div class="hlt-explain-sub">دلالة الألوان</div>
      <ul class="hlt-explain-list">
        <li><span style="color:#4ada8e">● أخضر</span> — المؤشر ضمن أو أفضل من المستهدف، يمنح المحور نقاطه كاملة.</li>
        <li><span style="color:#da9a4a">● كهرماني</span> — بين الحد الأدنى المقبول والمستهدف، يمنح نصف النقاط ويحتاج متابعة.</li>
        <li><span style="color:#da4a4a">● أحمر</span> — دون الحد الأدنى المقبول، صفر نقاط ويحتاج تدخلاً.</li>
      </ul>
      <p class="hlt-explain-note">عتبات المحاور 1-3 (الربحية/السيولة/الرفع المالي) هي نفسها العتبات الظاهرة في تاب النسب المالية تماماً — لا تناقض بين التابين.</p>

      <div class="hlt-explain-sub">حدود المؤشر — اقرأها قبل اتخاذ قرار</div>
      <ul class="hlt-explain-list">
        <li>الاتجاه التاريخي (الرسم البياني) يشمل محاور الربحية/السيولة/الرفع المالي فقط (من أصل 50) — DSCR والتحصيل وسلامة البيانات لحظية ولا تاريخ لها هنا.</li>
        <li>فحص سلامة البيانات يقارن إجمالي المدين بالدائن على مستوى الدفاتر <strong>كاملة</strong> (كل التاريخ)، وليس للفترة المعروضة فقط.</li>
        <li>DSCR الاقتصادي يعتمد على سجل التمويلات اليدوي (مصروفات وأرصدة قروض مُدخلة يدوياً) — إن لم يكن محدّثاً فالرقم قد لا يعكس الوضع الفعلي.</li>
        <li>هذا تاب تشخيصي للمساعدة على اتخاذ القرار، وليس بديلاً عن مراجعة مالية أو محاسبية رسمية.</li>
      </ul>
    </div>
  </details>

  <div class="hlt-card">
    <div class="hlt-card-title">💡 أهم التوصيات — الأولويات الثلاث الأكثر إلحاحاً</div>
    <div id="hlt-advice"></div>
  </div>

  <div class="hlt-card">
    <div class="hlt-card-title">📈 الاتجاه التاريخي — الربحية + السيولة + الرفع المالي (من أصل 50)</div>
    <div class="hlt-trend-note">مؤشر جزئي محسوب شهريًا من الميزانية العمومية وقائمة الدخل فقط — محاور DSCR والتحصيل وسلامة البيانات لحظية (أسفل) ولا تُدرج في هذا الاتجاه.</div>
    <div class="hlt-chart-wrap"><canvas id="hlt-trend-chart"></canvas></div>
  </div>

  <div class="hlt-card">
    <div class="hlt-card-title">🚨 الإنذار المبكر — كل التنبيهات في مكان واحد</div>
    <div id="hlt-alerts"></div>
  </div>

  <div class="hlt-card">
    <div class="hlt-card-title">🔎 مصادر البيانات</div>
    <div id="hlt-sources"></div>
  </div>

  <div class="hlt-footer">الصحة المالية والإنذار المبكر — يُجمّع فقط من بيانات حيّة موجودة أصلاً في تابات أخرى؛ لا يُعدّل أو يستبدل أيًا منها.</div>
</div>`;
}

// ── Events ────────────────────────────────────────────────────────────────────
function _hltBindEvents() {
  document.getElementById('hlt-refresh')?.addEventListener('click', _hltLoad);
  document.querySelectorAll('.hlt-co-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.hlt-co-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _HLT.db = btn.dataset.db;
      _hltLoad();
    });
  });
  _hltStartTimer();
}

function _hltStartTimer() {
  if (_HLT.timer) clearInterval(_HLT.timer);
  _HLT.countdown = _HLT_REFRESH;
  _HLT.timer = setInterval(() => {
    if (!document.querySelector('.tab.active[data-tab="health"]')) {
      clearInterval(_HLT.timer); _HLT.timer = null; return;
    }
    _HLT.countdown--;
    if (_HLT.countdown <= 0) { _HLT.countdown = _HLT_REFRESH; _hltLoad(); }
    else _hltUpdateStatus('ok');
  }, 1000);
}

function _hltUpdateStatus(state, errMsg) {
  const dot = document.getElementById('hlt-dot');
  const txt = document.getElementById('hlt-status-txt');
  const ts  = document.getElementById('hlt-sync-ts');
  if (!txt) return;
  if (state === 'loading') { if (dot) dot.style.color = '#da9a4a'; txt.textContent = '⏳ جارٍ التحميل…'; return; }
  if (state === 'error')   { if (dot) dot.style.color = '#da4a4a'; txt.textContent = '❌ ' + (errMsg || 'فشل التحميل'); return; }
  if (dot) dot.style.color = '#4ada8e';
  const d = _HLT.data;
  txt.textContent = d
    ? `✓ الدرجة ${d.score.total}/100 · كما في ${d.asOf || '—'} · تحديث بعد ${_HLT.countdown}ث`
    : '✓';
  if (ts) ts.textContent = `آخر تحديث: ${new Date().toLocaleTimeString('ar-SA')}`;
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function _hltLoad() {
  if (_HLT.loading) return;
  _HLT.loading = true;
  _hltUpdateStatus('loading');

  const today       = new Date().toISOString().slice(0, 10);
  const companyKey  = _HLT.db === 'MekSoftDb2' ? 'wissam' : 'abaad';

  try {
    const [dscrRes, agingRes, intercoRes, integrityRes] = await Promise.all([
      fetch('/api/dscr').then(r => r.json()),
      fetch(`/api/aging?db=${encodeURIComponent(_HLT.db)}&asOf=${today}`).then(r => r.json()),
      fetch('/api/interco-recon').then(r => r.json()),
      fetch(`/api/data-integrity?db=${encodeURIComponent(_HLT.db)}`).then(r => r.json()),
    ]);
    if (dscrRes.error)      throw new Error(dscrRes.error);
    if (agingRes.error)     throw new Error(agingRes.error);
    if (intercoRes.error)   throw new Error(intercoRes.error);
    if (integrityRes.error) throw new Error(integrityRes.error);

    const bs     = State.get('bs') || [];
    const pl     = State.get('pl') || [];
    const months = [...new Set(bs.map(r => r.month))].sort();
    const asOf   = months[months.length - 1] || null;
    const ratios = asOf ? computeRatios(bs, pl, asOf, null) : null;

    const bundle = {
      ratios,
      dscrCo:       dscrRes.companies ? dscrRes.companies[companyKey] : null,
      agingData:    agingRes,
      intercoData:  intercoRes,
      integrityData: integrityRes,
    };

    const score  = _hltComputeScore(bundle);
    const hist   = _hltMonthlyHistory(bs, pl);
    const alerts = _hltBuildAlerts(score, bundle, hist);

    _HLT.data = { score, hist, alerts, bundle, asOf };

    _hltRenderGauge(score);
    _hltRenderPillars(score);
    _hltRenderAdvice(score, bundle);
    _hltRenderTrend(hist);
    _hltRenderAlerts(alerts);
    _hltRenderSources();

    _HLT.countdown = _HLT_REFRESH;
    _hltUpdateStatus('ok');
  } catch (err) {
    _hltUpdateStatus('error', err.message);
  } finally {
    _HLT.loading = false;
  }
}

// ── Score computation — 6 محاور، 100 نقطة ───────────────────────────────────────
function _hltComputeScore(d) {
  const pillars = { profit: 0, liq: 0, lev: 0, dscr: 0, collect: 0, integrity: 0 };
  const metricResults = [];

  HLT_METRICS.forEach(m => {
    const val  = d.ratios ? d.ratios[m.key] : null;
    const band = _hltBand(val, m.lo, m.hi, m.hb);
    const pts  = _hltBandScore(band, m.w);
    pillars[m.pillar] += pts;
    metricResults.push({ ...m, val, band, pts });
  });

  // ── DSCR (20) — نفس عتبات dscrLabel() في server/routes/dscr.js ───────────────
  const dscrVal  = d.dscrCo ? d.dscrCo.dscrEconomic : null;
  const dscrBand = dscrVal === null || dscrVal === undefined ? 'na'
                 : dscrVal >= 1.5 ? 'good' : dscrVal >= 1.0 ? 'warn' : 'bad';
  pillars.dscr = _hltBandScore(dscrBand, HLT_PILLAR_MAX.dscr);

  // ── التحصيل وتركز العملاء (20) ────────────────────────────────────────────────
  const agT = d.agingData ? d.agingData.totals : null;
  const overdueRatio = agT && agT.balance > 0
    ? (agT.b91_120 + agT.bOver120) / agT.balance * 100 : null;
  const overdueBand  = _hltBand(overdueRatio, 25, 50, false);

  const custs   = (d.agingData && d.agingData.customers) ? d.agingData.customers.slice(0, 3) : [];
  const top3Sum = custs.reduce((s, c) => s + (c.balance || 0), 0);
  const concPct = agT && agT.balance > 0 ? top3Sum / agT.balance * 100 : null;
  const concBand = _hltBand(concPct, 40, 60, false);

  pillars.collect = _hltBandScore(overdueBand, 12) + _hltBandScore(concBand, 8);

  // ── سلامة البيانات (10) ──────────────────────────────────────────────────────
  const integBand   = d.integrityData ? (d.integrityData.balanced ? 'good' : 'bad') : 'na';
  const intercoBand = d.intercoData   ? (d.intercoData.status === 'matched' ? 'good' : 'bad') : 'na';
  pillars.integrity = _hltBandScore(integBand, 6) + _hltBandScore(intercoBand, 4);

  const total = Math.round(Object.values(pillars).reduce((a, b) => a + b, 0));

  return {
    total, pillars, maxes: HLT_PILLAR_MAX, metricResults,
    overdueRatio, overdueBand, concPct, concBand,
    dscrVal, dscrBand, integBand, intercoBand,
  };
}

// ── Monthly history — للاتجاه التاريخي (محاور 1-3 فقط، من computeRatios) ────────
function _hltMonthlyHistory(bs, pl) {
  if (!bs || !bs.length) return [];
  const months = [...new Set(bs.map(r => r.month))].sort();
  return months.map(mo => {
    const r = computeRatios(bs, pl, mo, null);
    if (!r) return null;
    let score = 0;
    HLT_METRICS.forEach(m => { score += _hltBandScore(_hltBand(r[m.key], m.lo, m.hi, m.hb), m.w); });
    return { month: mo, label: r.label, score: +score.toFixed(1), netMargin: r.netMargin };
  }).filter(Boolean);
}

// ── Alerts engine — محرك تنبيهات موحّد ───────────────────────────────────────────
function _hltBuildAlerts(score, d, hist) {
  const alerts = [];
  const add = (severity, title, detail, gotoTab) => alerts.push({ severity, title, detail, gotoTab });

  score.metricResults.forEach(m => {
    if (m.band === 'bad' || m.band === 'warn') {
      add(m.band === 'bad' ? 'red' : 'amber', m.lbl,
        `القيمة الحالية ${_hltFmtVal(m.val, m.dec, m.sfx)} — المستهدف ${m.hb ? '≥' : '≤'} ${m.hi}${m.sfx}`,
        'ratios');
    }
  });

  if (score.dscrBand === 'bad') {
    add('red', 'تغطية خدمة الدين (DSCR) غير كافية',
      `DSCR الاقتصادي ${_hltFmtVal(score.dscrVal, 2, '×')} — أقل من 1.0×، الربح التشغيلي لا يغطي كلفة التمويل الاقتصادية`, 'dscr');
  } else if (score.dscrBand === 'warn') {
    add('amber', 'تغطية خدمة الدين ضيقة',
      `DSCR الاقتصادي ${_hltFmtVal(score.dscrVal, 2, '×')} — تغطية كافية لكن هامشها ضيق`, 'dscr');
  }

  if (d.dscrCo && d.dscrCo.economicFinancingCost) {
    const gapPct = (d.dscrCo.unrecordedGap || 0) / d.dscrCo.economicFinancingCost * 100;
    if (gapPct > 15) {
      add('amber', 'فجوة تمويل غير مسجلة محاسبياً',
        `${fmt(d.dscrCo.unrecordedGap, 0)} ر.س (${gapPct.toFixed(0)}%) من الكلفة الاقتصادية غير مقيّدة في الدفاتر بعد`, 'dscr');
    }
  }

  if (score.overdueRatio !== null) {
    if (score.overdueRatio > 50) {
      add('red', 'تأخر شديد في تحصيل المدينين',
        `${score.overdueRatio.toFixed(0)}% من رصيد المدينين متأخر أكثر من 90 يوماً`, 'aging');
    } else if (score.overdueRatio > 25) {
      add('amber', 'تأخر ملحوظ في تحصيل المدينين',
        `${score.overdueRatio.toFixed(0)}% من رصيد المدينين متأخر أكثر من 90 يوماً`, 'aging');
    }
  }

  if (score.concPct !== null) {
    if (score.concPct > 60) {
      add('red', 'تركز عالٍ في أكبر 3 عملاء',
        `${score.concPct.toFixed(0)}% من إجمالي المدينين مركّز في 3 عملاء فقط`, 'aging');
    } else if (score.concPct > 40) {
      add('amber', 'تركز متوسط في أكبر 3 عملاء',
        `${score.concPct.toFixed(0)}% من إجمالي المدينين مركّز في 3 عملاء فقط`, 'aging');
    }
  }

  if (d.integrityData && !d.integrityData.balanced) {
    add('red', 'عدم توازن ميزان المراجعة',
      `فارق ${fmt(d.integrityData.diff, 2)} ر.س بين إجمالي المدين والدائن على مستوى الدفاتر بالكامل`, 'trial');
  }

  if (d.intercoData && d.intercoData.status === 'gap') {
    add('amber', 'فجوة في التسوية البينية',
      `فجوة ${fmt(d.intercoData.gapAbs, 0)} ر.س بين دفاتر أبعاد ووسام`, 'interco-recon');
  }

  if (hist.length >= 3) {
    const last3 = hist.slice(-3);
    const nm    = last3.map(h => h.netMargin);
    if (nm.every(v => v !== null && isFinite(v))) {
      if (nm[0] > nm[1] && nm[1] > nm[2]) {
        add('amber', 'تراجع هامش الربح الصافي 3 أشهر متتالية',
          `من ${nm[0].toFixed(1)}% إلى ${nm[2].toFixed(1)}% خلال ${last3[0].label} ← ${last3[2].label}`, 'ratios');
      }
    }
    const latest = nm[nm.length - 1];
    if (latest !== null && isFinite(latest) && latest < 0) {
      add('red', 'خسارة صافية في آخر فترة',
        `هامش الربح الصافي الحالي ${latest.toFixed(1)}%`, 'ratios');
    }
  }

  return alerts;
}

// ── Render: gauge ─────────────────────────────────────────────────────────────
function _hltRenderGauge(score) {
  const arcEl  = document.getElementById('hlt-gauge-arc');
  const numEl  = document.getElementById('hlt-gauge-num');
  const verdEl = document.getElementById('hlt-gauge-verdict');
  if (!arcEl) return;

  const maxLen = 295;
  const s      = score.total;
  const color  = s < 40 ? '#da4a4a' : s < 70 ? '#da9a4a' : '#4ada8e';
  arcEl.setAttribute('stroke', color);

  let cur = 0;
  const target = (s / 100) * maxLen;
  const step = () => {
    cur = Math.min(cur + target / 45, target);
    arcEl.setAttribute('stroke-dasharray', `${cur.toFixed(1)} ${maxLen}`);
    if (numEl) numEl.textContent = Math.round((cur / maxLen) * 100);
    if (cur < target) requestAnimationFrame(step);
    else if (numEl) numEl.textContent = s;
  };
  requestAnimationFrame(step);

  const [vc, vt] = s < 40 ? ['#da4a4a', 'وضع حرج — يستدعي تدخلاً فورياً']
                 : s < 60 ? ['#da9a4a', 'تحت الضغط — يستدعي مراجعة']
                 : s < 75 ? ['#daba4a', 'مقبول — يمكن تحسينه']
                 :          ['#4ada8e', 'صحة جيدة — حافظ على المسار'];
  if (verdEl) { verdEl.style.color = vc; verdEl.textContent = vt; }
}

// ── Render: pillar bars ───────────────────────────────────────────────────────
function _hltRenderPillars(score) {
  const el = document.getElementById('hlt-pillars');
  if (!el) return;
  el.innerHTML = Object.keys(HLT_PILLAR_MAX).map(key => {
    const val = score.pillars[key], max = HLT_PILLAR_MAX[key];
    const pct = max ? (val / max * 100) : 0;
    const col = pct >= 75 ? '#4ada8e' : pct >= 45 ? '#da9a4a' : '#da4a4a';
    return `<div class="hlt-pillar-row">
      <div class="hlt-pillar-top">
        <span>${HLT_PILLAR_LBL[key]}</span>
        <span style="color:${col};font-weight:700">${val.toFixed(0)}/${max}</span>
      </div>
      <div class="hlt-pillar-bar-track"><div class="hlt-pillar-bar-fill" style="width:${pct.toFixed(0)}%;background:${col}"></div></div>
    </div>`;
  }).join('');
}

// ── Advice engine — توصيات مُشتقة من أضعف المحاور، بدون أي جلب بيانات إضافي ─────
const HLT_ADVICE = {
  profit: (b) => {
    const r = b.ratios || {};
    return {
      title: 'تحسين الربحية',
      body: `هامش الربح الصافي الحالي ${_hltFmtVal(r.netMargin, 1, '%')} والإجمالي ${_hltFmtVal(r.grossMargin, 1, '%')}. راجع تسعير الأصناف ضعيفة الهامش، واضبط المصروفات التشغيلية والتمويلية قبل التوسع في حجم المبيعات.`,
    };
  },
  liq: (b) => {
    const r = b.ratios || {};
    return {
      title: 'تعزيز السيولة',
      body: `النسبة الجارية ${_hltFmtVal(r.currentRatio, 2, '×')} ونسبة النقدية ${_hltFmtVal(r.cashRatio, 2, '×')} دون المستوى المريح. سرّع تحصيل المدينين المتأخرين وأجّل أي التزامات قصيرة الأجل غير ضرورية.`,
    };
  },
  lev: (b) => {
    const r = b.ratios || {};
    return {
      title: 'خفض الرفع المالي',
      body: `الدين/الملكية ${_hltFmtVal(r.debtEquity, 2, '×')}، والديون تمثل ${_hltFmtVal(r.debtRatio, 1, '%')} من الأصول. أعطِ الأولوية لسداد التمويل القائم قبل أي التزام تمويلي جديد.`,
    };
  },
  dscr: (b, s) => ({
    title: 'معالجة تغطية خدمة الدين',
    body: `DSCR الاقتصادي ${_hltFmtVal(s.dscrVal, 2, '×')}. فاوض على إعادة جدولة التمويل أو خفض كلفته، وتجنّب أي تمويل إضافي حتى تتجاوز التغطية 1.5×.`,
  }),
  collect: (b, s) => ({
    title: 'تحسين جودة التحصيل وتوزيع مخاطر العملاء',
    body: `${_hltFmtVal(s.overdueRatio, 0, '%')} من المدينين متأخر أكثر من 90 يوماً، وأكبر 3 عملاء يمثلون ${_hltFmtVal(s.concPct, 0, '%')} من الرصيد. شدّد سياسة الائتمان لكبار العملاء المتأخرين ووسّع قاعدة العملاء.`,
  }),
  integrity: (b) => ({
    title: 'تصحيح سلامة البيانات أولاً',
    body: `${!b.integrityData?.balanced ? 'ميزان المراجعة غير متوازن حالياً. ' : ''}${b.intercoData?.status === 'gap' ? 'وهناك فجوة غير مُسوّاة بين دفاتر الشركتين. ' : ''}لا تُبنَ قرارات على تقارير أخرى قبل تصحيح هذه النقطة — فهي أساس صحة كل الأرقام الباقية.`,
  }),
};

function _hltRenderAdvice(score, bundle) {
  const el = document.getElementById('hlt-advice');
  if (!el) return;

  const ranked = Object.keys(HLT_PILLAR_MAX)
    .map(key => ({ key, pct: HLT_PILLAR_MAX[key] ? score.pillars[key] / HLT_PILLAR_MAX[key] : 1 }))
    .filter(p => p.pct < 0.75)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 3);

  if (!ranked.length) {
    el.innerHTML = `<div class="hlt-allclear">✓ كل المحاور فوق العتبة الجيدة حالياً — استمر بالمراقبة الدورية، لا إجراء عاجل مطلوب</div>`;
    return;
  }

  const nums = ['①', '②', '③'];
  el.innerHTML = `<div class="hlt-advice-list">${ranked.map((p, i) => {
    const adv = HLT_ADVICE[p.key](bundle, score);
    const col = p.pct < 0.3 ? '#da4a4a' : '#da9a4a';
    return `<div class="hlt-advice-card" style="border-top-color:${col}">
      <div class="hlt-advice-num" style="color:${col}">${nums[i] || '•'}</div>
      <div class="hlt-advice-body">
        <div class="hlt-advice-title">${adv.title}</div>
        <div class="hlt-advice-text">${adv.body}</div>
      </div>
    </div>`;
  }).join('')}</div>`;
}

// ── Render: trend chart ────────────────────────────────────────────────────────
function _hltRenderTrend(hist) {
  const canvas = document.getElementById('hlt-trend-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (_HLT.chartInst) { _HLT.chartInst.destroy(); _HLT.chartInst = null; }
  if (!hist.length) return;

  _HLT.chartInst = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: hist.map(h => h.label),
      datasets: [{
        data: hist.map(h => h.score),
        borderColor: '#C9A84C',
        backgroundColor: '#C9A84C22',
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        pointBackgroundColor: '#C9A84C',
        tension: 0.25,
        fill: true,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `  ${ctx.raw.toFixed(1)} / 50` } },
      },
      scales: {
        y: { min: 0, max: 50, ticks: { color: '#5a80a0' }, grid: { color: '#0f2035' } },
        x: { ticks: { color: '#5a80a0', font: { family: 'Tajawal,sans-serif', size: 10 } }, grid: { display: false } },
      },
    },
  });
}

// ── Render: alerts feed ────────────────────────────────────────────────────────
function _hltRenderAlerts(alerts) {
  const el = document.getElementById('hlt-alerts');
  if (!el) return;

  const reds   = alerts.filter(a => a.severity === 'red');
  const ambers = alerts.filter(a => a.severity === 'amber');

  if (!reds.length && !ambers.length) {
    el.innerHTML = `<div class="hlt-allclear">✓ لا توجد تنبيهات — كل المؤشرات المراقبة ضمن النطاق المقبول</div>`;
    return;
  }

  const group = (icon, col, items, title) => !items.length ? '' : `
    <div class="hlt-alert-group" style="border-color:${col}55">
      <div class="hlt-alert-group-title" style="color:${col}">${icon} ${title} (${items.length})</div>
      ${items.map(a => `
        <div class="hlt-alert-card" data-goto="${a.gotoTab}">
          <div class="hlt-alert-card-title">${a.title}</div>
          <div class="hlt-alert-card-detail">${a.detail}</div>
          <div class="hlt-alert-card-link">عرض التفاصيل ←</div>
        </div>`).join('')}
    </div>`;

  el.innerHTML = `<div class="hlt-alert-groups">
    ${group('❌', '#da4a4a', reds,   'تحتاج تدخلاً عاجلاً')}
    ${group('⚠',  '#da9a4a', ambers, 'تحتاج متابعة')}
  </div>`;

  el.querySelectorAll('[data-goto]').forEach(card => {
    card.addEventListener('click', () => {
      const tabBtn = document.querySelector(`.tab[data-tab="${card.dataset.goto}"]`);
      if (tabBtn) tabBtn.click();
    });
  });
}

// ── Render: data-sources transparency table ─────────────────────────────────────
function _hltRenderSources() {
  const el = document.getElementById('hlt-sources');
  if (!el) return;
  const rows = [
    ['الربحية / السيولة / الرفع المالي (45 نقطة)', 'computeRatios() — نفس دالة تاب النسب المالية', 'تاب النسب المالية'],
    ['تغطية خدمة الدين DSCR (20 نقطة)',           'GET /api/dscr',            'تاب تغطية خدمة الدين'],
    ['جودة التحصيل وتركز العملاء (20 نقطة)',       'GET /api/aging',           'تاب إعمار العملاء'],
    ['سلامة ميزان المراجعة (6 نقاط)',              'GET /api/data-integrity',  'تاب ميزان المراجعة'],
    ['التسوية البينية (4 نقاط)',                   'GET /api/interco-recon',   'تاب التسوية البينية'],
  ];
  el.innerHTML = `<table class="hlt-src-tbl">
    <thead><tr><th>المحور</th><th>المصدر</th><th>التاب المرجعي</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody>
  </table>`;
}

// ── CSS ───────────────────────────────────────────────────────────────────────
function _hltInjectCSS() {
  if (document.getElementById('hlt-style')) return;
  const s = document.createElement('style');
  s.id = 'hlt-style';
  s.textContent = `
#tab-health { padding:0; }
.hlt-wrap { font-family:Tajawal,Cairo,sans-serif; direction:rtl; }

.hlt-status-bar {
  display:flex; justify-content:space-between; align-items:center;
  padding:8px 18px; background:#060e18; border-bottom:1px solid #1a2e50;
  font-size:.78rem; gap:12px;
}
.hlt-status-left  { display:flex; align-items:center; gap:8px; color:#8aacca; }
.hlt-status-right { display:flex; align-items:center; gap:12px; color:#4a6a8a; }
.hlt-status-dot   { font-size:.7rem; color:#4ada8e; }

.hlt-controls {
  display:flex; align-items:center; gap:14px; padding:10px 18px;
  background:#07111c; border-bottom:1px solid #1a2e50; flex-wrap:wrap;
}
.hlt-co-btns { display:flex; gap:6px; }
.hlt-co-btn {
  background:#0d1e30; color:#6a9ab8; border:1px solid #1e3a5f;
  border-radius:20px; padding:5px 16px; cursor:pointer; font-size:.82rem;
  font-family:Tajawal,Cairo,sans-serif; transition:all .2s;
}
.hlt-co-btn.active { background:#C9A84C; color:#07111c; border-color:#C9A84C; font-weight:700; }
.hlt-co-btn:not(.active):hover { background:#1a2e50; color:#a0c8e8; }
.hlt-refresh-btn {
  background:#1a2e50; color:#8aaac8; border:1px solid #2a4a7a;
  border-radius:4px; padding:5px 14px; cursor:pointer; font-size:.82rem;
  font-family:Tajawal,Cairo,sans-serif; margin-right:auto;
}
.hlt-refresh-btn:hover { background:#2a4a6a; }

.hlt-top-row { display:flex; gap:20px; align-items:stretch; flex-wrap:wrap; padding:18px; }
.hlt-gauge-card {
  background:#0a1828; border:1px solid #1a2e50; border-radius:10px;
  padding:18px; min-width:220px; text-align:center; flex-shrink:0;
}
.hlt-gauge-title { color:#8aacca; font-size:.79rem; font-weight:600; margin-bottom:8px; }
.hlt-gauge-svg   { width:100%; max-width:220px; }
.hlt-gauge-verdict { font-size:.84rem; font-weight:700; margin-top:8px; }

.hlt-pillars {
  flex:1; min-width:320px; background:#0a1828; border:1px solid #1a2e50;
  border-radius:10px; padding:18px; display:flex; flex-direction:column; gap:12px; justify-content:center;
}
.hlt-pillar-row {}
.hlt-pillar-top { display:flex; justify-content:space-between; margin-bottom:4px; font-size:.83rem; color:#c0d8f0; }
.hlt-pillar-bar-track { height:8px; border-radius:4px; background:#06121e; overflow:hidden; }
.hlt-pillar-bar-fill  { height:100%; border-radius:4px; transition:width .4s; }

.hlt-card {
  background:#0a1828; border:1px solid #1a2e50; border-radius:10px;
  margin:0 18px 18px; padding:16px 18px;
}
.hlt-card-title { color:#e0f0ff; font-size:.92rem; font-weight:700; margin-bottom:6px; }
.hlt-trend-note { color:#4a6a8a; font-size:.72rem; margin-bottom:10px; line-height:1.5; }
.hlt-chart-wrap { position:relative; height:220px; }

.hlt-explain {
  background:#0a1828; border:1px solid #1a2e50; border-radius:10px;
  margin:0 18px 18px; padding:0;
}
.hlt-explain summary::-webkit-details-marker { display:none; }
.hlt-explain-summary {
  list-style:none; cursor:pointer; user-select:none; padding:14px 18px;
  color:#a0c8e8; font-size:.86rem; font-weight:700;
}
.hlt-explain[open] .hlt-explain-summary { border-bottom:1px solid #1a2e50; }
.hlt-explain-body { padding:14px 18px 18px; color:#a0c0dc; font-size:.82rem; line-height:1.7; }
.hlt-explain-body p { margin-bottom:10px; }
.hlt-explain-sub { color:#c9a84c; font-size:.83rem; font-weight:700; margin:14px 0 8px; }
.hlt-explain-tbl { width:100%; border-collapse:collapse; font-size:.78rem; margin-bottom:6px; }
.hlt-explain-tbl th { text-align:right; color:#5a7a9a; font-weight:600; padding:6px 8px; border-bottom:1px solid #1a2e50; }
.hlt-explain-tbl td { color:#a0c0dc; padding:6px 8px; border-bottom:1px solid #12233a; }
.hlt-explain-list { padding-right:18px; margin-bottom:8px; }
.hlt-explain-list li { margin-bottom:6px; }
.hlt-explain-note { color:#5a7a9a; font-size:.76rem; font-style:italic; }

.hlt-advice-list { display:flex; flex-wrap:wrap; gap:12px; }
.hlt-advice-card {
  flex:1; min-width:260px; background:#0d1b2a; border-top:3px solid;
  border-radius:0 0 8px 8px; padding:14px; display:flex; gap:10px; align-items:flex-start;
}
.hlt-advice-num { font-size:1.2rem; font-weight:800; flex-shrink:0; }
.hlt-advice-title { color:#e0f0ff; font-size:.85rem; font-weight:700; margin-bottom:4px; }
.hlt-advice-text  { color:#8aa8c4; font-size:.78rem; line-height:1.55; }

.hlt-allclear {
  padding:12px 16px; color:#4ada8e; background:#0a1a0a;
  border:1px solid #4ada8e33; border-radius:8px; font-size:.88rem;
}
.hlt-alert-groups { display:flex; flex-wrap:wrap; gap:12px; }
.hlt-alert-group {
  flex:1; min-width:280px; background:#0d1b2a; border:1px solid; border-radius:8px; padding:12px;
}
.hlt-alert-group-title { font-size:.8rem; font-weight:700; margin-bottom:8px; }
.hlt-alert-card {
  padding:8px 4px; border-bottom:1px solid #1e2e40; cursor:pointer; transition:background .15s;
}
.hlt-alert-card:last-child { border-bottom:none; }
.hlt-alert-card:hover { background:#132238; border-radius:4px; }
.hlt-alert-card-title  { color:#c0d0e0; font-size:.83rem; font-weight:600; }
.hlt-alert-card-detail { color:#5a7a9a; font-size:.73rem; margin-top:2px; line-height:1.4; }
.hlt-alert-card-link   { color:#6a9ab8; font-size:.71rem; margin-top:4px; }

.hlt-src-tbl { width:100%; border-collapse:collapse; font-size:.78rem; }
.hlt-src-tbl th { text-align:right; color:#5a7a9a; font-weight:600; padding:6px 8px; border-bottom:1px solid #1a2e50; }
.hlt-src-tbl td { color:#a0c0dc; padding:6px 8px; border-bottom:1px solid #12233a; }

.hlt-footer { text-align:center; color:#3a5a7a; font-size:.74rem; padding:8px 18px 20px; }

@media(max-width:760px) { .hlt-top-row { flex-direction:column; } }
`;
  document.head.appendChild(s);
}
