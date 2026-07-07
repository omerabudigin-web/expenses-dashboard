// ── التدفق النقدي التنبؤي (13/26 أسبوعاً) ────────────────────────────────────
// Own-API pattern — مطابق لـ tab-ccc.js
// العمود الفقري (backbone) يُحدَّث تلقائياً؛ الافتراضات محفوظة بـlocalStorage

'use strict';

// ── State ─────────────────────────────────────────────────────────────────────
let _fcBackbone   = null;     // آخر backbone من API
let _fcDb         = 'MekSoftDb1';
let _fcTimer      = null;
let _fcCountdown  = 0;
let _fcRendered   = false;
let _fcTableBuilt = false;    // الجدول يُبنى مرة واحدة؛ الخلايا المحسوبة تُحدَّث in-place
const FC_REFRESH_SEC = 600;   // 10 دقائق — التنبؤ ليس لحظياً

// ── Default assumptions per company ──────────────────────────────────────────
const FC_DEFAULTS = {
  MekSoftDb1: {
    collectWeeks:3, collectLag:1, payWeeks:2, payLag:1,
    salary:0, salaryWeek:4, rent:0, rentWeek:1,
    opex:0,   opexWeek:2,
    tax:0,    taxWeek:13,   safetyLine:2000000, horizon:13,
    facilityDraws: Array(26).fill(0),
    otherIn:       Array(26).fill(0),
    otherOut:      Array(26).fill(0),
  },
  MekSoftDb2: {
    collectWeeks:8, collectLag:1, payWeeks:2, payLag:1,
    salary:0, salaryWeek:4, rent:0, rentWeek:1,
    opex:0,   opexWeek:2,
    tax:0,    taxWeek:13,   safetyLine:500000, horizon:13,
    facilityDraws: Array(26).fill(0),
    otherIn:       Array(26).fill(0),
    otherOut:      Array(26).fill(0),
  },
};

// ── Loan schedule: sourced LIVE from the financing register (سجل التمويلات) ──
// Single source of truth = server/data/financing-data.json via /api/financing
// (same file DSCR reads). No local editing here — manage loans in the register tab.
const FC_COMPANY_KEY = { MekSoftDb1: 'أبعاد الحديد', MekSoftDb2: 'وسام الفولاذ' };
const FC_TYPE_FREQ    = { 'شهري': 'monthly', 'ربع سنوي': 'quarterly', 'نصف سنوي': 'semi-annual' };

let _fcRegisterLoans = [];   // cached, already filtered+mapped for the active company

function _fcMapRegisterLoan(l) {
  return {
    name:        l.name || '',
    installment: +l.payment || 0,
    frequency:   FC_TYPE_FREQ[l.type] || 'monthly',
    nextDue:     l.dueDate || '',
    // Real bank amortization schedule (when available) overrides the flat
    // installment/frequency roll-forward — more accurate, irregular amounts.
    schedule:    Array.isArray(l.schedule) && l.schedule.length ? l.schedule : null,
  };
}

async function _fcLoadRegisterLoans(db) {
  try {
    const res = await fetch('/api/financing');
    if (!res.ok) return [];
    const data = await res.json();
    const key  = FC_COMPANY_KEY[db];
    return (data.loans || []).filter(l => l.company === key).map(_fcMapRegisterLoan);
  } catch (e) { return []; }
}

// ── Formatting ────────────────────────────────────────────────────────────────
const _FC_FMT0 = new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 0 });
const _FC_FMT1 = new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fcFmt  = v => (v == null || !isFinite(v)) ? '—' : _FC_FMT0.format(Math.round(+v || 0));
const fcFmtK = v => { const k = Math.round((+v||0)/1000); return k >= 0 ? `${_FC_FMT0.format(k)}K` : `(${_FC_FMT0.format(-k)}K)`; };

// ── Params: localStorage per company ─────────────────────────────────────────
function _fcLoadParams(db) {
  try {
    const raw = localStorage.getItem('fc_p_' + db);
    if (raw) {
      const saved = JSON.parse(raw);
      const def   = { ...FC_DEFAULTS[db] };
      // Merge saved over defaults; arrays need explicit handling
      // safetyLine=0 means it was never intentionally set (old default) → use new default
      return {
        ...def, ...saved,
        safetyLine: (saved.safetyLine > 0) ? saved.safetyLine : def.safetyLine,
        facilityDraws: _padArr(saved.facilityDraws || [], 26),
        otherIn:       _padArr(saved.otherIn       || [], 26),
        otherOut:      _padArr(saved.otherOut      || [], 26),
      };
    }
  } catch (e) { /* ignore */ }
  return { ...FC_DEFAULTS[db],
    facilityDraws: [...FC_DEFAULTS[db].facilityDraws],
    otherIn:       [...FC_DEFAULTS[db].otherIn],
    otherOut:      [...FC_DEFAULTS[db].otherOut],
  };
}
function _fcSaveParams(db, p) {
  try { localStorage.setItem('fc_p_' + db, JSON.stringify(p)); } catch (e) { /* ignore */ }
}
function _padArr(arr, n) {
  const r = Array(n).fill(0);
  arr.forEach((v, i) => { if (i < n) r[i] = +v || 0; });
  return r;
}
function _fcGetParams() { return _fcLoadParams(_fcDb); }

// ── Loan roll-forward engine ──────────────────────────────────────────────────
// Advances dueDate by frequency until first occurrence >= forecastStart
function _fcRollForward(dueDateStr, freq, forecastStart) {
  if (!dueDateStr) return null;
  let d = new Date(dueDateStr + 'T00:00:00');
  const start = new Date(forecastStart + 'T00:00:00');
  let safety = 0;
  while (d < start && safety++ < 500) {
    if      (freq === 'monthly')     d.setMonth(d.getMonth() + 1);
    else if (freq === 'quarterly')   d.setMonth(d.getMonth() + 3);
    else if (freq === 'semi-annual') d.setMonth(d.getMonth() + 6);
    else break;
  }
  return d;
}

// Returns array[H] of financing outflows (0-based week indices)
function _fcFinancingForWeeks(loans, forecastStart, H) {
  const arr = new Array(H).fill(0);
  if (!loans || !loans.length || !forecastStart) return arr;
  const start = new Date(forecastStart + 'T00:00:00');
  for (const loan of loans) {
    // Real bank amortization schedule (from the financing register) — use the
    // actual dated installments instead of assuming a flat repeating amount.
    if (loan.schedule) {
      for (const row of loan.schedule) {
        if (!row.date) continue;
        const d = new Date(row.date + 'T00:00:00');
        const dayOffset = Math.round((d - start) / (24 * 3600 * 1000));
        const weekIdx   = Math.floor(dayOffset / 7);
        if (weekIdx >= 0 && weekIdx < H) arr[weekIdx] += (+row.principal || 0) + (+row.profit || 0);
      }
      continue;
    }

    const inst = Math.abs(+(loan.installment) || 0);
    if (!inst || !loan.nextDue || !loan.frequency) continue;
    let due = _fcRollForward(loan.nextDue, loan.frequency, forecastStart);
    if (!due) continue;
    let safety = 0;
    while (safety++ < 500) {
      const dayOffset = Math.round((due - start) / (24 * 3600 * 1000));
      const weekIdx   = Math.floor(dayOffset / 7);
      if (weekIdx >= H) break;
      if (weekIdx >= 0) arr[weekIdx] += inst;
      const next = new Date(due);
      if      (loan.frequency === 'monthly')     next.setMonth(next.getMonth() + 1);
      else if (loan.frequency === 'quarterly')   next.setMonth(next.getMonth() + 3);
      else if (loan.frequency === 'semi-annual') next.setMonth(next.getMonth() + 6);
      else break;
      due = next;
    }
  }
  return arr;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function _fcIsActive() { return !!document.querySelector('.tab.active[data-tab="forecast"]'); }
function _fcStopTimer() { if (_fcTimer) { clearInterval(_fcTimer); _fcTimer = null; } }
function _fcDbLabel(db) {
  if (db === 'MekSoftDb1') return 'أبعاد الحديد';
  if (db === 'MekSoftDb2') return 'وسام الفولاذ';
  return db;
}

// ── Entry point ───────────────────────────────────────────────────────────────
function renderForecastTab() {
  const wrap = document.getElementById('tab-forecast');
  if (!wrap) return;

  if (!_fcRendered) {
    _fcRendered = true;
    wrap.innerHTML = _fcBuildShell();
    _fcInjectCSS();
    _fcWireControls(wrap);
    _fcStartTimer();
  }

  _fcLoad();
}

// ── Shell HTML ────────────────────────────────────────────────────────────────
function _fcBuildShell() {
  const today = new Date().toISOString().slice(0, 10);
  return `
  <div class="fc-header">
    <div>
      <div class="fc-title">📅 التدفق النقدي التنبؤي</div>
      <div class="fc-sub">13 · 26 أسبوعاً — العمود الفقري حيّ من ميك سوفت · الافتراضات ثابتة حتى تغيّرها</div>
    </div>
    <div id="fc-status" class="fc-status">جارٍ التحميل…</div>
  </div>

  <div class="fc-bar">
    <div class="fc-co-switcher">
      <button id="fc-btn-db1" class="fc-co-btn active" data-db="MekSoftDb1">🏭 أبعاد الحديد</button>
      <button id="fc-btn-db2" class="fc-co-btn"        data-db="MekSoftDb2">🏗 وسام الفولاذ</button>
    </div>
    <label class="fc-lbl">من:</label>
    <input id="fc-from" type="date" class="fc-inp" value="2025-10-01">
    <label class="fc-lbl">إلى:</label>
    <input id="fc-to"   type="date" class="fc-inp" value="${today}">
    <button id="fc-refresh-btn" class="fc-btn">↺ تحديث العمود الفقري</button>
  </div>

  <div id="fc-kpis"   class="fc-kpis-row"></div>
  <div id="fc-chart"  class="fc-section"></div>
  <div id="fc-assump" class="fc-section"></div>
  <div id="fc-table"  class="fc-section"></div>
  <div id="fc-risk"   class="fc-section"></div>
  <div id="fc-recon"  class="fc-section"></div>
  <div id="fc-explain" class="fc-section"></div>
  <div class="fc-footer">إعداد وتقديم: عمر أبو دقن — خبير مالي وإداري</div>
  `;
}

// ── Wire controls ─────────────────────────────────────────────────────────────
function _fcWireControls(wrap) {
  wrap.querySelector('#fc-refresh-btn')?.addEventListener('click', _fcLoad);
  wrap.querySelector('#fc-btn-db1')?.addEventListener('click', () => _fcSwitchDb('MekSoftDb1'));
  wrap.querySelector('#fc-btn-db2')?.addEventListener('click', () => _fcSwitchDb('MekSoftDb2'));
  ['fc-from','fc-to'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', _fcLoad)
  );
}

function _fcSwitchDb(db) {
  if (db === _fcDb) return;
  _fcDb = db;
  _fcTableBuilt = false;   // force table rebuild for new company
  document.getElementById('fc-btn-db1')?.classList.toggle('active', db === 'MekSoftDb1');
  document.getElementById('fc-btn-db2')?.classList.toggle('active', db === 'MekSoftDb2');
  _fcLoad();
}

// ── Timer (Own-API countdown) ─────────────────────────────────────────────────
function _fcStartTimer() {
  _fcStopTimer();
  _fcCountdown = FC_REFRESH_SEC;
  _fcTimer = setInterval(() => {
    if (!_fcIsActive()) { _fcStopTimer(); return; }
    _fcCountdown--;
    if (_fcCountdown > 0) _fcSetStatus();
    else { _fcCountdown = FC_REFRESH_SEC; _fcLoad(); }
  }, 1000);
}

function _fcSetStatus(loading) {
  const el = document.getElementById('fc-status');
  if (!el) return;
  if (loading) {
    el.textContent = '⏳ جارٍ تحديث العمود الفقري…';
    el.style.color = '#a87d00';
    return;
  }
  if (!_fcBackbone) return;
  const from = document.getElementById('fc-from')?.value || '';
  const to   = document.getElementById('fc-to')?.value   || '';
  el.textContent = `✅ ${_fcDbLabel(_fcDb)} · ${from}←${to} · ${new Date().toLocaleTimeString('ar-SA')} · تحديث بعد ${_fcCountdown}ث`;
  el.style.color = '#1a7a3c';
}

// ── Fetch backbone ────────────────────────────────────────────────────────────
async function _fcLoad() {
  _fcSetStatus(true);
  const from = document.getElementById('fc-from')?.value || '2025-10-01';
  const to   = document.getElementById('fc-to')?.value   || new Date().toISOString().slice(0, 10);
  try {
    const url  = `/api/forecast?db=${encodeURIComponent(_fcDb)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const [data, regLoans] = await Promise.all([
      fetch(url).then(r => r.json()),
      _fcLoadRegisterLoans(_fcDb),
    ]);
    if (data.error) throw new Error(data.message || data.error);
    _fcBackbone      = data;
    _fcRegisterLoans = regLoans;
    _fcCountdown  = FC_REFRESH_SEC;
    _fcTableBuilt = false;   // backbone changed → rebuild table
    _fcComputeAndRender();
    _fcSetStatus(false);
  } catch (err) {
    const el = document.getElementById('fc-status');
    if (el) { el.textContent = '❌ ' + err.message; el.style.color = '#da4a4a'; }
  }
}

// ── Engine: compute weekly rows ───────────────────────────────────────────────
function _fcEngine(backbone, p, financingArr) {
  const { openingCash, openAR, openAP, weeklySales, weeklyPurchases } = backbone;
  const H = +p.horizon || 13;
  const rows = [];
  let prevClose = openingCash;

  for (let w = 1; w <= H; w++) {
    // Opening AR: distributed uniformly over collectWeeks
    const arIn  = (p.collectWeeks > 0 && w <= +p.collectWeeks)
      ? openAR / +p.collectWeeks : 0;
    // New sales collected after collectLag weeks
    const salesIn = (w > +p.collectLag) ? weeklySales : 0;

    // Opening AP (trade-only): distributed uniformly over payWeeks
    const apOut  = (p.payWeeks > 0 && w <= +p.payWeeks)
      ? openAP / +p.payWeeks : 0;
    // New purchases paid after payLag weeks
    const purOut = (w > +p.payLag) ? weeklyPurchases : 0;

    // Monthly fixed costs: which week-of-month (1-4)
    const wInMonth = ((w - 1) % 4) + 1;
    const salOut  = (wInMonth === +p.salaryWeek) ? +p.salary : 0;
    const rentOut = (wInMonth === +p.rentWeek)   ? +p.rent   : 0;
    const opexOut = (wInMonth === +p.opexWeek)   ? +p.opex   : 0;

    // Financing: driven by loan schedule (financingArr), 0 if no loans configured
    const finOut  = financingArr ? (financingArr[w - 1] || 0) : 0;

    // Tax: once in specified week
    const taxOut  = (w === +p.taxWeek) ? +p.tax : 0;

    // Per-week user inputs
    const drawIn = +(p.facilityDraws[w - 1] || 0);
    const oIn    = +(p.otherIn[w - 1]       || 0);
    const oOut   = +(p.otherOut[w - 1]      || 0);

    const totalIn  = arIn + salesIn + drawIn + oIn;
    const totalOut = apOut + purOut + salOut + rentOut + opexOut + finOut + taxOut + oOut;
    const net      = totalIn - totalOut;
    const closing  = prevClose + net;

    rows.push({ w, arIn, salesIn, drawIn, oIn, totalIn,
                apOut, purOut, salOut, rentOut, opexOut, finOut, taxOut, oOut, totalOut,
                net, opening: prevClose, closing });
    prevClose = closing;
  }
  return rows;
}

// ── Compute + render all sections ─────────────────────────────────────────────
function _fcComputeAndRender() {
  if (!_fcBackbone) return;
  const p    = _fcGetParams();
  const loans = _fcRegisterLoans || [];
  const forecastStart = document.getElementById('fc-to')?.value || new Date().toISOString().slice(0, 10);
  const financingArr  = _fcFinancingForWeeks(loans, forecastStart, +p.horizon || 13);
  const rows = _fcEngine(_fcBackbone.backbone, p, financingArr);
  _fcRenderKPIs(rows, p);
  _fcRenderChart(rows, p);
  _fcRenderAssumptions(p, loans);
  _fcRenderTable(rows, p);
  _fcRenderRisk(rows, p, _fcBackbone.backbone);
  _fcRenderRecon(_fcBackbone);
  _fcRenderExplain(p);
}

// ── KPI cards ─────────────────────────────────────────────────────────────────
function _fcRenderKPIs(rows, p) {
  const el = document.getElementById('fc-kpis');
  if (!el || !rows.length) return;

  const closings   = rows.map(r => r.closing);
  const minClose   = Math.min(...closings);
  const minWeek    = rows[closings.indexOf(minClose)].w;
  const lastClose  = rows[rows.length - 1].closing;
  const netFlow    = rows.reduce((s, r) => s + r.net, 0);
  const safe       = +p.safetyLine || 0;
  const weeksBlow  = closings.filter(c => c < safe).length;

  const minColor = minClose < 0 ? '#da4a4a' : minClose < safe ? '#da9a4a' : '#4ada8e';
  const blowColor = weeksBlow === 0 ? '#4ada8e' : weeksBlow <= 2 ? '#da9a4a' : '#da4a4a';
  const netColor  = netFlow >= 0 ? '#4ada8e' : '#da4a4a';

  el.innerHTML = `
  <div class="fc-kpi" style="--acc:${minColor}">
    <div class="fc-kpi-lbl">⬇ أدنى رصيد</div>
    <div class="fc-kpi-val" style="color:${minColor}">${fcFmt(minClose)} <span class="fc-kpi-u">ر.س</span></div>
    <div class="fc-kpi-hint">أسبوع ${minWeek}</div>
  </div>
  <div class="fc-kpi" style="--acc:${blowColor}">
    <div class="fc-kpi-lbl">⚠ أسابيع تحت حدّ الأمان</div>
    <div class="fc-kpi-val" style="color:${blowColor}">${weeksBlow} <span class="fc-kpi-u">أسبوع</span></div>
    <div class="fc-kpi-hint">حدّ الأمان: ${fcFmt(safe)} ر.س</div>
  </div>
  <div class="fc-kpi" style="--acc:#4a9eda">
    <div class="fc-kpi-lbl">🏁 الرصيد الختامي</div>
    <div class="fc-kpi-val" style="color:#a0c8e8">${fcFmt(lastClose)} <span class="fc-kpi-u">ر.س</span></div>
    <div class="fc-kpi-hint">نهاية أسبوع ${rows.length}</div>
  </div>
  <div class="fc-kpi" style="--acc:${netColor}">
    <div class="fc-kpi-lbl">📊 صافي التدفق الكلي</div>
    <div class="fc-kpi-val" style="color:${netColor}">${fcFmt(netFlow)} <span class="fc-kpi-u">ر.س</span></div>
    <div class="fc-kpi-hint">${rows.length} أسبوع</div>
  </div>`;
}

// ── SVG Chart ─────────────────────────────────────────────────────────────────
function _fcRenderChart(rows, p) {
  const el = document.getElementById('fc-chart');
  if (!el || !rows.length) return;
  const safe = +p.safetyLine || 0;
  el.innerHTML = '<div class="fc-sec-title">📈 منحنى الرصيد الأسبوعي</div>' + _fcSVG(rows, safe);
}

function _fcSVG(rows, safetyLine) {
  const W = 820, H = 230, PL = 72, PR = 20, PT = 22, PB = 32;
  const iW = W - PL - PR, iH = H - PT - PB;
  const closings = rows.map(r => r.closing);
  const allV = [...closings, safetyLine, 0];
  const rawMin = Math.min(...allV), rawMax = Math.max(...allV);
  const pad = (rawMax - rawMin) * 0.12 || 50000;
  const minV = rawMin - pad, maxV = rawMax + pad, range = maxV - minV;

  const xS = i => PL + (i / (rows.length - 1 || 1)) * iW;
  const yS = v => PT + (1 - (v - minV) / range) * iH;

  const pts = rows.map((r, i) => `${xS(i).toFixed(1)},${yS(r.closing).toFixed(1)}`).join(' ');
  const polyline = `<polyline points="${pts}" fill="none" stroke="#4a9eda" stroke-width="2.5" stroke-linejoin="round"/>`;
  // Area fill
  const areaPath = `M${xS(0)},${yS(0)} ` + rows.map((r, i) => `L${xS(i)},${yS(r.closing)}`).join(' ')
    + ` L${xS(rows.length-1)},${yS(minV)} L${xS(0)},${yS(minV)} Z`;
  const areaFill = `<path d="${areaPath}" fill="#4a9eda" fill-opacity="0.06"/>`;

  const safeY  = yS(safetyLine).toFixed(1);
  const zeroY  = yS(0).toFixed(1);
  const safeL  = safetyLine !== 0 ? `<line x1="${PL}" y1="${safeY}" x2="${W-PR}" y2="${safeY}" stroke="#da9a4a" stroke-width="1.5" stroke-dasharray="7,4" opacity="0.9"/>` : '';
  const zeroL  = `<line x1="${PL}" y1="${zeroY}" x2="${W-PR}" y2="${zeroY}" stroke="#da4a4a" stroke-width="1" opacity="0.45"/>`;

  // Axes
  const xAxis = `<line x1="${PL}" y1="${PT+iH}" x2="${W-PR}" y2="${PT+iH}" stroke="#1e3a5f" stroke-width="1"/>`;
  const yAxis = `<line x1="${PL}" y1="${PT}"    x2="${PL}"   y2="${PT+iH}" stroke="#1e3a5f" stroke-width="1"/>`;

  // X labels (every 2 weeks for 26, every 1 for 13)
  const step = rows.length > 13 ? 2 : 1;
  const xLabels = rows
    .filter((r, i) => i === 0 || r.w % step === 0)
    .map(r => {
      const i = r.w - 1;
      return `<text x="${xS(i).toFixed(1)}" y="${PT+iH+14}" text-anchor="middle" fill="#4a6a8a" font-size="10">أ${r.w}</text>`;
    }).join('');

  // Y labels (4 ticks)
  const yTicks = [0, 0.33, 0.67, 1].map(frac => {
    const v = minV + frac * range;
    const y = yS(v).toFixed(1);
    return `<text x="${PL-4}" y="${+y+3}" text-anchor="end" fill="#4a6a8a" font-size="9">${fcFmtK(v)}</text>
            <line x1="${PL}" y1="${y}" x2="${PL-3}" y2="${y}" stroke="#4a6a8a" stroke-width="1"/>`;
  }).join('');

  // Dots: red if below safety line, blue otherwise
  const dots = rows.map((r, i) => {
    const col = r.closing < safetyLine ? '#da4a4a' : '#4a9eda';
    const rad = r.closing < safetyLine ? 4.5 : 3;
    return `<circle cx="${xS(i).toFixed(1)}" cy="${yS(r.closing).toFixed(1)}" r="${rad}" fill="${col}" stroke="${col}" stroke-width="0.5"/>`;
  }).join('');

  // Tooltip guide (hover info via data-fc-tip on SVG — simplified)
  const legend = [
    `<rect x="${PL+8}" y="${PT+4}" width="18" height="4" fill="#4a9eda" rx="2"/>`,
    `<text x="${PL+30}" y="${PT+9}" fill="#4a8aaa" font-size="10">الرصيد</text>`,
    safetyLine !== 0 ? `<line x1="${PL+75}" y1="${PT+7}" x2="${PL+93}" y2="${PT+7}" stroke="#da9a4a" stroke-width="1.5" stroke-dasharray="5,3"/>
    <text x="${PL+97}" y="${PT+10}" fill="#8a6a3a" font-size="10">حدّ الأمان</text>` : '',
    `<line x1="${PL+160}" y1="${PT+7}" x2="${PL+178}" y2="${PT+7}" stroke="#da4a4a" stroke-width="1" opacity="0.5"/>
    <text x="${PL+182}" y="${PT+10}" fill="#7a3a3a" font-size="10">صفر</text>`,
  ].join('');

  return `<div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;display:block;margin:0 auto">
    ${areaFill}${zeroL}${safeL}${polyline}${dots}${xAxis}${yAxis}${xLabels}${yTicks}${legend}
  </svg></div>`;
}

// ── Assumptions panel ─────────────────────────────────────────────────────────
function _fcRenderAssumptions(p, loans) {
  const el = document.getElementById('fc-assump');
  if (!el) return;
  if (!loans) loans = _fcRegisterLoans || [];

  const inp = (id, val, min, max, step=1, extra='') =>
    `<input id="fca-${id}" type="number" class="fc-ainp" value="${+val||0}" min="${min}" max="${max}" step="${step}" ${extra}>`;
  const row = (lbl, content) =>
    `<div class="fc-arow"><label class="fc-albl">${lbl}</label><div class="fc-acon">${content}</div></div>`;
  const wkSel = (id, val) => {
    const opts = [1,2,3,4].map(w => `<option value="${w}" ${+val===w?'selected':''}>${w}</option>`).join('');
    return `<select id="fca-${id}" class="fc-ainp" style="width:56px">${opts}</select>`;
  };
  const h13     = p.horizon === 13 || +p.horizon === 13;
  const loanRows = loans.map(l => _fcLoanRowHtmlReadonly(l)).join('')
    || `<tr><td colspan="4" style="text-align:center;color:#4a6a8a;padding:14px">لا توجد تسهيلات مسجَّلة لهذه الشركة في سجل التمويلات</td></tr>`;

  el.innerHTML = `
  <details id="fc-assump-details" class="fc-assump-wrap" open>
    <summary class="fc-sec-title">⚙ الافتراضات — <span style="color:#da9a4a;font-size:.78rem">تُحفظ لكل شركة · لا تُعاد إلا بتغيير يدوي</span></summary>
    <div class="fc-assump-body">
      <div class="fc-assump-cols">
        <div class="fc-assump-col">
          <div class="fc-assump-group-title">↕ التحصيل والسداد</div>
          ${row('أسابيع تحصيل المدينين الافتتاحي', inp('collectWeeks', p.collectWeeks, 1, 26))}
          ${row('مهلة التحصيل (أسابيع بعد البيع)', inp('collectLag',   p.collectLag,   0, 12))}
          ${row('أسابيع سداد الدائنين الافتتاحي',   inp('payWeeks',    p.payWeeks,     1, 26))}
          ${row('مهلة السداد (أسابيع بعد الشراء)',   inp('payLag',      p.payLag,       0, 12))}
        </div>
        <div class="fc-assump-col">
          <div class="fc-assump-group-title">💼 التزامات الثابتة (شهرية)</div>
          ${row('الرواتب الشهرية (ر.س)', inp('salary', p.salary, 0, 1e9, 1000) + ' ' + wkSel('salaryWeek', p.salaryWeek) + '<span class="fc-aw-hint">أسبوع/شهر</span>')}
          ${row('الإيجار الشهري (ر.س)',  inp('rent',   p.rent,   0, 1e9, 1000) + ' ' + wkSel('rentWeek',   p.rentWeek)   + '<span class="fc-aw-hint">أسبوع/شهر</span>')}
          ${row('التشغيلية الشهرية (ر.س)',inp('opex',   p.opex,   0, 1e9, 1000) + ' ' + wkSel('opexWeek',  p.opexWeek)   + '<span class="fc-aw-hint">أسبوع/شهر</span>')}
        </div>
        <div class="fc-assump-col">
          <div class="fc-assump-group-title">📋 إعدادات التنبؤ</div>
          ${row('ضريبة/دفعة دورية (ر.س)',   inp('tax',     p.tax,     0, 1e9, 1000))}
          ${row('أسبوع سداد الضريبة',        inp('taxWeek', p.taxWeek, 1, 26))}
          <div class="fc-arow">
            <label class="fc-albl">الأفق الزمني</label>
            <div class="fc-acon">
              <button id="fca-h13" class="fc-h-btn ${h13?'active':''}" data-h="13">13 أسبوع</button>
              <button id="fca-h26" class="fc-h-btn ${!h13?'active':''}" data-h="26">26 أسبوع ⚠</button>
            </div>
          </div>
        </div>
      </div>

      <div class="fc-loans-section">
        <div class="fc-assump-group-title" style="margin-top:14px;border-top:1px solid #0d1e2e;padding-top:10px">
          🏦 جدول التمويلات — صفّ «خدمة التمويل» يُحسب تلقائياً من سجل التمويلات (حيّ)
        </div>
        <div class="fc-loans-scroll">
          <table class="fc-loans-tbl" id="fc-loans-tbl">
            <thead><tr>
              <th>اسم القرض / التمويل</th>
              <th>القسط (ر.س)</th>
              <th>الدورية</th>
              <th>آخر استحقاق مسجّل</th>
            </tr></thead>
            <tbody id="fc-loans-tbody">${loanRows}</tbody>
          </table>
        </div>
        <div class="fc-loans-note">
          🔗 هذا الجدول للعرض فقط ويُقرأ حيّاً من <a href="/financing.html" target="_blank" rel="noopener">سجل التمويلات</a> —
          أي تعديل (قسط، تاريخ استحقاق، إضافة/حذف تسهيل) يتم هناك وينعكس هنا تلقائياً.
        </div>
      </div>

      <div class="fc-safety-row">
        <label class="fc-safety-lbl">🛡 حدّ الأمان النقدي (ر.س) — عتبة مفردة، لا تكرار أسبوعي</label>
        <input id="fca-safetyLine" type="number" class="fc-ainp fc-safety-inp"
          value="${+p.safetyLine||0}" min="0" max="1000000000" step="1000">
        <span class="fc-safety-hint">الرصيد دون هذه القيمة = تحذير برتقالي · الرسم البياني يعرض الخط دائماً</span>
      </div>
      <div class="fc-assump-footer">
        <button id="fc-save-btn" class="fc-btn fc-save-btn">💾 حفظ وإعادة الحساب</button>
        <span id="fc-save-msg" class="fc-save-msg"></span>
        <span class="fc-assump-note">⚠ الرصيد بعد انتهاء أسابيع السداد يرتفع اصطناعياً إن اخترت 26 أسبوعاً وكان الدائنون صغيراً</span>
      </div>
    </div>
  </details>`;

  // Wire assumption events
  document.getElementById('fc-save-btn')?.addEventListener('click', _fcSaveAndRecompute);
  document.getElementById('fca-h13')?.addEventListener('click', () => _fcSetHorizon(13));
  document.getElementById('fca-h26')?.addEventListener('click', () => _fcSetHorizon(26));
  // Auto-save on Enter in any assumption input
  el.querySelectorAll('.fc-ainp').forEach(inp => {
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') _fcSaveAndRecompute(); });
  });
}

function _fcSetHorizon(h) {
  document.getElementById('fca-h13')?.classList.toggle('active', h === 13);
  document.getElementById('fca-h26')?.classList.toggle('active', h === 26);
  _fcSaveAndRecompute();
}

function _fcReadAssumptions() {
  const v = id => {
    const el = document.getElementById('fca-' + id);
    return el ? (el.tagName === 'SELECT' ? +el.value : +(el.value || 0)) : 0;
  };
  const hBtn = document.querySelector('.fc-h-btn.active');
  const h    = hBtn ? +hBtn.dataset.h : 13;
  const prev = _fcGetParams();
  return {
    collectWeeks: v('collectWeeks'), collectLag: v('collectLag'),
    payWeeks:     v('payWeeks'),     payLag:     v('payLag'),
    salary:       v('salary'),       salaryWeek: v('salaryWeek'),
    rent:         v('rent'),         rentWeek:   v('rentWeek'),
    opex:         v('opex'),         opexWeek:   v('opexWeek'),
    tax:          v('tax'),          taxWeek:    v('taxWeek'),
    safetyLine:   v('safetyLine'),
    horizon: h,
    // Preserve per-week arrays — updated via table input events, not here
    facilityDraws: prev.facilityDraws,
    otherIn:       prev.otherIn,
    otherOut:      prev.otherOut,
  };
}

function _fcSaveAndRecompute() {
  const p     = _fcReadAssumptions();
  const loans = _fcRegisterLoans || [];
  _fcSaveParams(_fcDb, p);
  _fcTableBuilt = false;
  if (_fcBackbone) {
    const forecastStart = document.getElementById('fc-to')?.value || new Date().toISOString().slice(0, 10);
    const financingArr  = _fcFinancingForWeeks(loans, forecastStart, +p.horizon || 13);
    const rows = _fcEngine(_fcBackbone.backbone, p, financingArr);
    _fcRenderKPIs(rows, p);
    _fcRenderChart(rows, p);
    _fcRenderAssumptions(p, loans);
    _fcRenderTable(rows, p);
    _fcRenderRisk(rows, p, _fcBackbone.backbone);
  }
  const msg = document.getElementById('fc-save-msg');
  if (msg) { msg.textContent = '✓ حُفظ'; setTimeout(() => { msg.textContent = ''; }, 2000); }
}

// ── Cash flow table ────────────────────────────────────────────────────────────
function _fcRenderTable(rows, p) {
  const el = document.getElementById('fc-table');
  if (!el || !rows.length) return;

  const H = rows.length;
  const wCols = rows.map(r => `<th class="fc-tw">أ${r.w}</th>`).join('');

  // Helper: render a data row
  const drow = (label, cls, vals, fmt=fcFmt, extra='') => {
    const cells = vals.map((v, i) => {
      const color = +v < 0 ? 'color:#da4a4a' : +v > 0 ? '' : 'color:#3a5a7a';
      return `<td class="fc-td ${cls}" style="${color}" data-fc-val="${cls}-${i+1}">${fmt(+v||0)}</td>`;
    }).join('');
    return `<tr ${extra}><td class="fc-tl">${label}</td>${cells}</tr>`;
  };

  // Editable row: returns input cells
  const editRow = (label, cls, arr, rowKey) => {
    const cells = Array.from({length: H}, (_, i) => {
      const v = +(arr[i] || 0);
      return `<td class="fc-td fc-te"><input type="number" class="fc-cell-inp" data-row="${rowKey}" data-w="${i+1}" value="${v||''}" placeholder="0" min="0"></td>`;
    }).join('');
    return `<tr><td class="fc-tl">${label}</td>${cells}</tr>`;
  };

  const closing = rows.map(r => r.closing);

  el.innerHTML = `
  <div class="fc-sec-title">📋 جدول التدفق الأسبوعي</div>
  <div style="overflow-x:auto">
  <table class="fc-tbl" id="fc-grid">
    <thead>
      <tr><th class="fc-tl">البند</th>${wCols}</tr>
    </thead>
    <tbody>
      <tr class="fc-tr-hd"><td class="fc-tl" colspan="${H+1}">الوارد (تدفقات داخلة)</td></tr>
      ${drow('تحصيل المدينين الافتتاحي', 'arIn',    rows.map(r=>r.arIn))}
      ${drow('تحصيل مبيعات الفترة',      'salesIn', rows.map(r=>r.salesIn))}
      ${editRow('سحب من التسهيلات ↙',  'drawIn',  p.facilityDraws, 'draws')}
      ${editRow('أخرى (وارد) ↙',         'oIn',     p.otherIn,       'otherIn')}
      ${drow('إجمالي الوارد',             'totalIn', rows.map(r=>r.totalIn), fcFmt, 'class="fc-tr-sub"')}

      <tr class="fc-tr-hd"><td class="fc-tl" colspan="${H+1}">الصادر (تدفقات خارجة)</td></tr>
      ${drow('سداد الدائنين الافتتاحي',  'apOut',   rows.map(r=>r.apOut))}
      ${drow('سداد مشتريات الفترة',      'purOut',  rows.map(r=>r.purOut))}
      ${drow('الرواتب',                   'salOut',  rows.map(r=>r.salOut))}
      ${drow('الإيجار',                   'rentOut', rows.map(r=>r.rentOut))}
      ${drow('التشغيلية',                 'opexOut', rows.map(r=>r.opexOut))}
      ${drow('خدمة التمويل (جدول القروض)','finOut',  rows.map(r=>r.finOut))}
      ${drow('ضريبة/دفعة دورية',         'taxOut',  rows.map(r=>r.taxOut))}
      ${editRow('أخرى (صادر) ↙',          'oOut',    p.otherOut, 'otherOut')}
      ${drow('إجمالي الصادر',             'totalOut',rows.map(r=>r.totalOut), fcFmt, 'class="fc-tr-sub"')}

      <tr class="fc-tr-hd"><td class="fc-tl" colspan="${H+1}">الملخص</td></tr>
      ${drow('صافي التدفق الأسبوعي',    'net',     rows.map(r=>r.net))}
      ${drow('الرصيد الافتتاحي',        'opening', rows.map(r=>r.opening))}
      ${drow('الرصيد الختامي',           'closing', closing, v => {
        const safe = +p.safetyLine || 0;
        return `<span style="color:${+v<0?'#da4a4a':+v<safe?'#da9a4a':'#4ada8e'}">${fcFmt(+v)}</span>`;
      }, 'class="fc-tr-total"')}
    </tbody>
  </table>
  </div>`;

  _fcTableBuilt = true;
  _fcWireTableInputs(rows, p);
}

function _fcWireTableInputs(rows, p) {
  const grid = document.getElementById('fc-grid');
  if (!grid) return;
  grid.querySelectorAll('.fc-cell-inp').forEach(inp => {
    inp.addEventListener('change', () => {
      const row = inp.dataset.row;
      const w   = +inp.dataset.w - 1;
      const val = +(inp.value) || 0;
      const cp = _fcGetParams();
      if (row === 'draws')   cp.facilityDraws[w] = val;
      if (row === 'otherIn') cp.otherIn[w]       = val;
      if (row === 'otherOut')cp.otherOut[w]       = val;
      _fcSaveParams(_fcDb, cp);
      // Recompute without rebuilding table — just update computed cells
      if (_fcBackbone) {
        const forecastStart = document.getElementById('fc-to')?.value || new Date().toISOString().slice(0, 10);
        const financingArr  = _fcFinancingForWeeks(_fcRegisterLoans || [], forecastStart, +cp.horizon || 13);
        const newRows = _fcEngine(_fcBackbone.backbone, cp, financingArr);
        _fcUpdateComputedCells(newRows, cp);
      }
    });
  });
}

function _fcUpdateComputedCells(rows, p) {
  const safe = +p.safetyLine || 0;
  const keys = ['arIn','salesIn','totalIn','apOut','purOut','salOut','rentOut','opexOut','finOut','taxOut','totalOut','net','opening','closing'];
  rows.forEach((r, i) => {
    keys.forEach(k => {
      const cell = document.querySelector(`[data-fc-val="${k}-${i+1}"]`);
      if (!cell) return;
      const v = r[k];
      if (k === 'closing') {
        cell.innerHTML = `<span style="color:${+v<0?'#da4a4a':+v<safe?'#da9a4a':'#4ada8e'}">${fcFmt(+v)}</span>`;
      } else {
        cell.textContent = fcFmt(+v || 0);
        cell.style.color = +v < 0 ? '#da4a4a' : +v > 0 ? '' : '#3a5a7a';
      }
    });
  });
  _fcRenderKPIs(rows, p);
  _fcRenderChart(rows, p);
  _fcRenderRisk(rows, p, _fcBackbone?.backbone);
}

// ── Risk analysis (dynamic) ───────────────────────────────────────────────────
function _fcRenderRisk(rows, p, backbone) {
  const el = document.getElementById('fc-risk');
  if (!el || !rows.length) return;
  const safe       = +p.safetyLine || 0;
  const closings   = rows.map(r => r.closing);
  const minClose   = Math.min(...closings);
  const minWeek    = rows[closings.indexOf(minClose)].w;
  const weeksBlow  = closings.filter(c => c < safe).length;
  const firstGap   = rows.find(r => r.closing < safe);
  const ns         = backbone?.weeklySales || 0;

  const items = [];

  // Overall status
  if (minClose < 0) {
    items.push({ icon:'🚨', col:'#da4a4a', text:`فجوة نقدية: الرصيد يسقط إلى (${fcFmt(-minClose)}) ر.س في أسبوع ${minWeek}. التغطية المطلوبة من التسهيلات: ${fcFmt(-minClose)} ر.س على الأقل.` });
  } else if (weeksBlow > 0) {
    items.push({ icon:'⚠', col:'#da9a4a', text:`${weeksBlow} أسبوع تحت حدّ الأمان (${fcFmt(safe)} ر.س). أعمق نقطة: ${fcFmt(minClose)} ر.س أسبوع ${minWeek}. الفجوة: ${fcFmt(safe - minClose)} ر.س.` });
  } else {
    items.push({ icon:'✅', col:'#4ada8e', text:`الرصيد فوق حدّ الأمان طوال الأفق (${rows.length} أسبوع). أدنى رصيد: ${fcFmt(minClose)} ر.س في أسبوع ${minWeek}.` });
  }

  // First gap week
  if (firstGap) {
    items.push({ icon:'📅', col:'#da9a4a', text:`أول أسبوع خطر: أسبوع ${firstGap.w} — الرصيد ${fcFmt(firstGap.closing)} ر.س (دون ${fcFmt(safe)} ر.س).` });
  }

  // Lever analysis (if there's a gap)
  if (minClose < safe && ns > 0) {
    const gap      = safe - minClose;
    const weeksNeeded = Math.ceil(gap / ns);
    items.push({ icon:'🔧', col:'#4a9eda', text:`لسدّ الفجوة: تسريع التحصيل بـ${weeksNeeded} أسبوع، أو زيادة سحب التسهيلات بـ${fcFmt(gap)} ر.س، أو تأجيل مصروف واحد بالقيمة ذاتها.` });
  }

  // AP payment spread warning (after payWeeks cash rises artificially)
  if (+p.horizon > +p.payWeeks) {
    const switchWeek = +p.payWeeks + 1;
    items.push({ icon:'📌', col:'#5a7a9a', text:`تنبيه: بعد أسبوع ${p.payWeeks} يتوقف سداد الدائنين الافتتاحي — الرصيد يرتفع اصطناعياً ابتداءً من أسبوع ${switchWeek}. قارن مع التزامات الموردين الفعلية.` });
  }

  // Part C note — supplier vs. financing methodology
  items.push({ icon:'💡', col:'#2a5a4a', text:'سداد الموردين = التجاري الفعلي فقط؛ التمويلات في صفّها بجدولها. دفعات Bullet الكبيرة تُجدَّد عادةً لا تُسدَّد نقداً — مثّل التجديد بسحب مقابل في صفّ سحب التسهيلات بنفس الأسبوع.' });

  // Structural note
  items.push({ icon:'📖', col:'#3a5a7a', text:'هذا التدفق تنبؤي مبني على افتراضاتك. السيولة الفعلية قد تختلف بسبب تأخر التحصيل، مشتريات طارئة، أو مخزون غير مخطط. راجع الأرقام أسبوعياً مع الحركات الفعلية.' });

  el.innerHTML = `
  <div class="fc-sec-title">🔍 قراءة المخاطر والتوصيات</div>
  <div class="fc-risk-list">
    ${items.map(it => `<div class="fc-risk-item" style="border-right-color:${it.col}">
      <span class="fc-risk-icon">${it.icon}</span>
      <span class="fc-risk-txt" style="color:${it.col === '#3a5a7a' ? '#4a6a7a' : '#c0d4e8'}">${it.text}</span>
    </div>`).join('')}
  </div>`;
}

// ── Reconciliation ────────────────────────────────────────────────────────────
function _fcRenderRecon(data) {
  const el = document.getElementById('fc-recon');
  if (!el || !data) return;
  const b  = data.backbone;
  const rc = data.reconciliation;
  const row = (lbl, v, hint='') => `<tr>
    <td style="color:#c0d0e0;font-size:.82rem">${lbl}</td>
    <td class="fc-num" style="color:#8aaac8;font-size:.82rem">${fcFmt(v)} ر.س</td>
    <td style="color:#4a6a7a;font-size:.75rem">${hint}</td>
  </tr>`;

  el.innerHTML = `
  <div class="fc-sec-title">🔍 التسوية مع ميزان المراجعة — العمود الفقري</div>
  <div style="overflow-x:auto">
  <table class="fc-tbl" style="max-width:680px">
    <thead><tr><th>البند</th><th>المبلغ</th><th>مصدر / ملاحظة</th></tr></thead>
    <tbody>
    ${row('💰 النقد + البنوك (الرصيد الحالي)',      b.openingCash,       'Code LIKE 10301%')}
    ${row('👤 المدينون الخام',                     rc.arRaw,            'ح. 47+48')}
    ${row('↙ خصم مقاصّة الكيانات المزدوجة',       rc.arNettingOffset,  `${rc.arNettingCount} كيان`)}
    ${row('✅ المدينون صافٍ (openAR)',              b.openAR,            'المستخدَم في التنبؤ')}
    ${row('🏢 دائنون تجاريون (openAP)',             b.openAP,            'موردون غير مزدوجين، رصيد دائن — مستخدَم في التنبؤ')}
    ${(rc.apDual    > 0) ? row('↙ بيني/مزدوج (مستبعَد)',          rc.apDual,   'نفس رقم ضريبي في العملاء') : ''}
    ${(rc.apAdvances> 0) ? row('↙ دفعات مقدَّمة (مستبعَدة)',       rc.apAdvances,'رصيد مدين في ح.77+78') : ''}
    ${(rc.apFull    > 0) ? row('📊 إجمالي ح.77+78 (الكامل)',        rc.apFull,   'الرصيد قبل التصفية') : ''}
    ${row('📈 متوسط مبيعات أسبوعي',                b.weeklySales,       `صافي مبيعات ${fcFmt(rc.netSales)} ÷ ${_FC_FMT1.format(data.weeks)} أسبوع`)}
    ${row('📉 متوسط مشتريات أسبوعي (COGS)',         b.weeklyPurchases,   `COGS ${fcFmt(rc.cogs)} ÷ ${_FC_FMT1.format(data.weeks)} أسبوع`)}
    </tbody>
  </table>
  </div>`;
}

// ── Explain (static, collapsible) ────────────────────────────────────────────
function _fcRenderExplain(p) {
  const el = document.getElementById('fc-explain');
  if (!el) return;
  el.innerHTML = `
  <details class="fc-explain-wrap">
    <summary class="fc-sec-title">▶ كيف يعمل هذا التنبؤ؟ (منهجية)</summary>
    <div class="fc-explain-body">
      <ul class="fc-method-list">
        <li><strong>العمود الفقري</strong> (openingCash · openAR · openAP · weeklySales · weeklyPurchases) يُسحب من ميك سوفت ويُحدَّث تلقائياً كل 10 دقائق — لا تمسّه الافتراضات.</li>
        <li><strong>المدينون صافٍ</strong> بعد مقاصّة الكيانات المزدوجة (مورّد+عميل بنفس الرقم الضريبي) — نفس منهجية تاب CCC.</li>
        <li><strong>المشتريات الأسبوعية = COGS ÷ الأسابيع</strong>: لأن COGS يعكس تكلفة ما يُباع فعلاً وهو المحرّك الرئيسي للمشتريات. ليس فواتير الشراء الإجمالية.</li>
        <li><strong>تحصيل المدينين الافتتاحي</strong>: الرصيد مُوزَّع بالتساوي على "أسابيع التحصيل" المُدخَلة. مثال: رصيد 6M ÷ 3 أسابيع = 2M/أسبوع.</li>
        <li><strong>تحصيل مبيعات الفترة</strong>: يبدأ بعد مهلة التحصيل. مثال: مهلة 2 أسبوع → الأسبوع الأول ذو مبيعات يُحصَّل في الأسبوع الثالث.</li>
        <li><strong>تكاليف ثابتة شهرية</strong>: تُصرف في "أسبوع/شهر" المُحدَّد (أسابيع 1·5·9·... للأسبوع الأول، إلخ).</li>
        <li><strong>الأفق 26 أسبوعاً</strong>: بعد انتهاء مدة السداد (payWeeks)، يتوقف سداد الدائنين الافتتاحي ويرتفع الرصيد اصطناعياً. هذا تحذير — الالتزامات الفعلية للموردين مستمرة.</li>
        <li><strong>الأرقام تنبؤية</strong> مبنية على افتراضاتك وعلى متوسطات تاريخية. لا تستخدمها وحدها لقرارات تمويلية كبيرة دون مراجعة التدفق الفعلي.</li>
      </ul>
    </div>
  </details>`;
}

// ── Loan table (read-only — sourced from the financing register) ─────────────
function _fcLoanRowHtmlReadonly(l) {
  const freqLabel = { monthly:'شهري', quarterly:'ربع سنوي', 'semi-annual':'نصف سنوي' }[l.frequency] || l.frequency;
  const schedTag  = l.schedule
    ? ` <span style="color:#4ada8e;font-size:.7rem" title="جدول إطفاء فعلي من البنك — يُستخدم بدل الدورية الثابتة">📅 جدول فعلي</span>`
    : '';
  return `<tr>
    <td>${esc(l.name)}${schedTag}</td>
    <td>${fcFmt(l.installment)}</td>
    <td>${esc(freqLabel)}</td>
    <td>${esc(l.nextDue || '—')}</td>
  </tr>`;
}

// ── CSS ───────────────────────────────────────────────────────────────────────
function _fcInjectCSS() {
  if (document.getElementById('fc-style')) return;
  const s = document.createElement('style');
  s.id = 'fc-style';
  s.textContent = `
  #tab-forecast { padding:0 0 24px; }
  .fc-header { display:flex; justify-content:space-between; align-items:flex-start;
    background:#0a1e30; padding:14px 18px; border-bottom:2px solid #1e3a5f; }
  .fc-title  { color:#e0f0ff; font-size:1.1rem; font-weight:700; }
  .fc-sub    { color:#5a8aaa; font-size:.78rem; margin-top:3px; }
  .fc-status { color:#1a7a3c; font-size:.78rem; white-space:nowrap; padding-top:4px; }
  .fc-bar { display:flex; align-items:center; gap:10px; padding:10px 18px;
    background:#06121e; border-bottom:1px solid #0d1e2e; flex-wrap:wrap; }
  .fc-co-switcher { display:flex; gap:4px; }
  .fc-co-btn { background:#0d1e30; color:#5a7a9a; border:1px solid #1e3a5f;
    border-radius:4px; padding:5px 14px; cursor:pointer; font-size:.82rem; transition:all .15s; }
  .fc-co-btn.active { background:#1e3a5f; color:#a0d0f8; border-color:#2a5a8a; }
  .fc-lbl { color:#8aaac8; font-size:.82rem; }
  .fc-inp { background:#0d1e30; border:1px solid #1e3a5f; color:#c0d8f0;
    border-radius:4px; padding:5px 8px; font-size:.82rem; }
  .fc-btn { background:#1e3a5f; color:#a0d0f8; border:1px solid #2a5a8a;
    border-radius:4px; padding:5px 14px; cursor:pointer; font-size:.82rem; }
  .fc-btn:hover { background:#2a4a6a; }
  .fc-save-btn { background:#0a2a0a; color:#4ada8e; border-color:#1a5a1a; padding:6px 18px; }
  .fc-save-btn:hover { background:#0f3a0f; }
  .fc-save-msg { color:#4ada8e; font-size:.8rem; margin-right:8px; }

  /* KPIs */
  .fc-kpis-row { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; padding:12px 18px; }
  @media(max-width:800px){ .fc-kpis-row { grid-template-columns:repeat(2,1fr); } }
  .fc-kpi { background:#0d1e30; border:1px solid #1e3a5f; border-top:3px solid var(--acc);
    border-radius:8px; padding:12px; }
  .fc-kpi-lbl  { color:#5a8aaa; font-size:.78rem; font-weight:600; margin-bottom:4px; }
  .fc-kpi-val  { font-size:1.45rem; font-weight:700; }
  .fc-kpi-u    { font-size:.68rem; color:#3a5a7a; }
  .fc-kpi-hint { color:#3a5a7a; font-size:.72rem; margin-top:3px; }

  /* Sections */
  .fc-section { margin:10px 18px; }
  .fc-sec-title { color:#4a8aaa; font-size:.85rem; font-weight:700; padding:8px 12px;
    background:#0d1e30; border-radius:4px; margin-bottom:8px; cursor:pointer; list-style:none; }
  .fc-sec-title::-webkit-details-marker { display:none; }

  /* Assumptions */
  .fc-assump-wrap { border:1px solid #1e3a5f; border-radius:6px; background:#0a1828; }
  .fc-assump-body { padding:14px 16px; }
  .fc-assump-cols { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
  @media(max-width:860px){ .fc-assump-cols { grid-template-columns:1fr; } }
  .fc-assump-col  { display:flex; flex-direction:column; gap:6px; }
  .fc-assump-group-title { color:#4a8aaa; font-size:.76rem; font-weight:700; padding-bottom:4px;
    border-bottom:1px solid #0d1e2e; margin-bottom:4px; }
  .fc-arow { display:flex; align-items:center; gap:8px; min-height:28px; }
  .fc-albl { color:#6a8aaa; font-size:.79rem; flex:1; min-width:140px; }
  .fc-acon { display:flex; align-items:center; gap:5px; }
  .fc-ainp { background:#0d1e30; border:1px solid #1e3a5f; color:#c0d8f0;
    border-radius:3px; padding:3px 6px; font-size:.79rem; width:80px; text-align:left; }
  .fc-aw-hint { color:#3a5a7a; font-size:.72rem; }
  .fc-h-btn { background:#0d1e30; color:#5a7a9a; border:1px solid #1e3a5f; border-radius:4px;
    padding:4px 10px; cursor:pointer; font-size:.78rem; }
  .fc-h-btn.active { background:#1e3a5f; color:#a0d0f8; }
  .fc-safety-row { display:flex; align-items:center; gap:10px; margin-top:14px;
    padding:10px 12px; background:#06101e; border:1px solid #1e4a1e; border-radius:6px;
    border-right:3px solid #da9a4a; flex-wrap:wrap; }
  .fc-safety-lbl { color:#da9a4a; font-size:.8rem; font-weight:700; flex:0 0 auto; }
  .fc-safety-inp { width:120px !important; border-color:#3a5a2a !important; color:#e0c060 !important; }
  .fc-safety-hint { color:#5a6a3a; font-size:.74rem; flex:1; min-width:200px; }
  .fc-assump-footer { display:flex; align-items:center; gap:10px; margin-top:14px;
    padding-top:12px; border-top:1px solid #0d1e2e; flex-wrap:wrap; }
  .fc-assump-note { color:#4a5a3a; font-size:.74rem; flex:1; min-width:200px; }

  /* Table */
  .fc-tbl { width:100%; border-collapse:collapse; direction:rtl; font-size:.78rem; white-space:nowrap; }
  .fc-tbl th { background:#112233; color:#6a8aaa; padding:6px 10px; text-align:right;
    border-bottom:2px solid #1e3a5f; position:sticky; top:0; z-index:1; }
  .fc-tl { padding:5px 10px; color:#8aaac8; font-size:.77rem; white-space:nowrap;
    background:#091520; border-bottom:1px solid #061018; min-width:160px; position:sticky; right:0; z-index:1; }
  .fc-td { padding:4px 8px; border-bottom:1px solid #061018; text-align:left; direction:ltr; }
  .fc-tw { min-width:72px; text-align:center; font-size:.75rem; }
  .fc-tr-hd td { background:#081828; color:#3a6a8a; font-size:.74rem; font-style:italic;
    padding:3px 10px; border-top:2px solid #0d1e2e; }
  .fc-tr-sub td { background:#06101a; font-weight:600; border-top:1px solid #1e3a5f; }
  .fc-tr-total td { background:#061018; font-weight:700; border-top:2px solid #1e3a5f; }
  .fc-te { padding:2px 4px; }
  .fc-cell-inp { background:#0a1828; border:1px solid #1e3a5f; color:#c0d8f0;
    width:62px; border-radius:3px; padding:2px 4px; font-size:.75rem; text-align:right; }
  .fc-num { text-align:left; direction:ltr; }

  /* Risk */
  .fc-risk-list { display:flex; flex-direction:column; gap:8px; }
  .fc-risk-item { display:flex; gap:10px; align-items:flex-start; padding:9px 12px;
    background:#0a1828; border-right:3px solid; border-radius:0 4px 4px 0; }
  .fc-risk-icon { flex-shrink:0; font-size:.95rem; }
  .fc-risk-txt  { font-size:.81rem; line-height:1.55; }

  /* Explain */
  .fc-explain-wrap { border:1px solid #1e3a5f; border-radius:6px; background:#0a1828; }
  .fc-explain-body { padding:12px 16px; }
  .fc-method-list { margin:0; padding-right:16px; display:flex; flex-direction:column; gap:7px;
    color:#5a7a9a; font-size:.79rem; line-height:1.6; }
  .fc-method-list strong { color:#8aaa9a; }

  /* Loan table */
  .fc-loans-section { margin-top:0; }
  .fc-loans-scroll  { overflow-x:auto; margin-bottom:6px; }
  .fc-loans-tbl     { border-collapse:collapse; font-size:.78rem; direction:rtl; white-space:nowrap; width:100%; }
  .fc-loans-tbl th  { background:#0d1e30; color:#6a8aaa; padding:5px 10px;
    border-bottom:2px solid #1e3a5f; text-align:right; font-weight:600; font-size:.77rem; }
  .fc-loans-tbl td  { padding:3px 6px; border-bottom:1px solid #0d1e2e; }
  .fc-loans-tbl tr:hover td { background:#091828; }
  .fc-loans-note    { font-size:.76rem; color:#5a7a9a; margin-top:6px; line-height:1.6; }
  .fc-loans-note a  { color:#5baef0; }

  .fc-footer { padding:14px 18px; color:#3a5a7a; font-size:.75rem; border-top:1px solid #0d1e2e; margin-top:20px; }
  `;
  document.head.appendChild(s);
}
