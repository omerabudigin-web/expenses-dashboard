'use strict';
// ── Inventory Analysis Tab — Live Data ────────────────────────────────────────
let _invData = null, _invAutoTimer = null, _invCountdown = 0;
let _invCharts = {}, _invActiveCat = 'tas';
const INV_REFRESH_SEC = 60;

function _invIsActive() { return !!document.querySelector('.tab.active[data-tab="inventory"]'); }
function _invStopAuto() { if (_invAutoTimer) { clearInterval(_invAutoTimer); _invAutoTimer = null; } }
function _invDestroyCharts() {
  Object.values(_invCharts).forEach(c => { try { c.destroy(); } catch(_){} });
  _invCharts = {};
}
function _invStartAuto() {
  _invStopAuto(); _invCountdown = INV_REFRESH_SEC;
  _invAutoTimer = setInterval(() => {
    if (!_invIsActive()) { _invStopAuto(); return; }
    _invCountdown--;
    const el = document.getElementById('inv-status');
    if (el) el.textContent = `تحديث تلقائي خلال ${_invCountdown}ث`;
    if (_invCountdown <= 0) { _invCountdown = INV_REFRESH_SEC; renderInventoryAnalysis(); }
  }, 1000);
}

async function renderInventoryAnalysis() {
  const wrap = document.getElementById('tab-inventory');
  if (!wrap) return;

  const db  = (typeof getSelectedDb === 'function') ? getSelectedDb() : '';
  const url = '/api/inventory' + (db ? `?db=${encodeURIComponent(db)}` : '');

  const statusEl = document.getElementById('inv-status');
  if (statusEl) statusEl.textContent = 'جارٍ التحميل…';

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    _invData = await res.json();
  } catch (e) {
    if (statusEl) statusEl.textContent = `خطأ: ${e.message}`;
    if (!_invData) { wrap.innerHTML = `<p style="color:#da4a4a;padding:20px">تعذّر تحميل البيانات: ${e.message}</p>`; return; }
  }

  _invDestroyCharts();
  _invBuildAll(_invData, wrap);
  _invStartAuto();
}

// ─────────────────────────────────────────────────────────────────────────────
function _invBuildAll(d, wrap) {
  // Inject styles once
  if (!document.getElementById('inv-style')) {
    const s = document.createElement('style'); s.id = 'inv-style';
    s.textContent = `
      .inv-kpi-row{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px}
      .inv-kpi{flex:1;min-width:190px;background:#0d1f2d;border-radius:8px;padding:14px 16px;border:1px solid #1a3040;border-top:3px solid var(--inv-c,#4a9eda)}
      .inv-kpi .lbl{font-size:.72rem;color:#708090;margin-bottom:3px}
      .inv-kpi .val{font-size:1.45rem;font-weight:700;color:#e0ecf8;line-height:1.1}
      .inv-kpi .sub{font-size:.71rem;color:#a0b8c8;margin-top:3px}
      .inv-kpi .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:.71rem;font-weight:600;margin-top:5px}
      .inv-sec{font-size:.8rem;font-weight:600;color:#4a9eda;letter-spacing:.04em;padding:14px 0 6px;border-bottom:1px solid #1a3040;margin-bottom:10px}
      .inv-tabs{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}
      .inv-tab-btn{padding:5px 12px;border-radius:4px;cursor:pointer;font-size:.77rem;border:1px solid #1a3040;background:#0a1825;color:#a0b8c8;transition:.15s}
      .inv-tab-btn.on{color:#0a1825;font-weight:600}
      .inv-tbl{width:100%;border-collapse:collapse;font-size:.77rem}
      .inv-tbl th{background:#0a1825;padding:6px 9px;text-align:right;font-weight:600;color:#4a9eda;border-bottom:1px solid #1a3040;white-space:nowrap}
      .inv-tbl td{padding:5px 9px;border-bottom:1px solid #111e2a;color:#c0d0e0;white-space:nowrap}
      .inv-tbl td.n{text-align:left;direction:ltr;font-variant-numeric:tabular-nums}
      .inv-tbl tr:hover td{background:#0e2030}
      .inv-tbl tr.tot td{font-weight:600;color:#e0ecf8;background:#0d1f2d}
      .inv-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px}
      .inv-card{background:#0a1825;border-radius:8px;padding:14px;border:1px solid #1a3040}
      .inv-cht{height:210px;position:relative}
      .inv-age-bar{display:flex;height:26px;border-radius:4px;overflow:hidden;margin-bottom:5px;gap:2px}
      .inv-age-seg{display:flex;align-items:center;justify-content:center;font-size:.64rem;font-weight:700;overflow:hidden;white-space:nowrap;color:#0a1825;transition:.3s}
      .inv-rec{list-style:none;padding:0;margin:0}
      .inv-rec li{padding:8px 12px;border-radius:5px;margin-bottom:6px;font-size:.78rem;line-height:1.65;border-left:4px solid transparent}
      .inv-buy{background:#021408;border-color:#4ada8e;border-left-color:#4ada8e}
      .inv-warn{background:#1a1100;border-color:#f5c842;border-left-color:#f5c842}
      .inv-sell{background:#140202;border-color:#da4a4a;border-left-color:#da4a4a}
      @media(max-width:680px){.inv-grid2{grid-template-columns:1fr}.inv-kpi{min-width:140px}}
    `;
    document.head.appendChild(s);
  }

  const fN   = v => Math.round(+v || 0).toLocaleString('ar-SA');
  const fN1  = v => (+v || 0).toLocaleString('ar-SA', { maximumFractionDigits: 1 });
  const fM   = v => ((+v || 0) / 1e6).toFixed(2) + ' م';
  const fK   = v => Math.abs(+v || 0) >= 1000 ? ((+v || 0) / 1000).toFixed(1) + 'K' : Math.round(+v || 0).toString();

  const CATS    = d.cats;
  const MONTHS  = d.months;
  const monthly = d.monthly;
  const summary = d.summary;
  const lastN   = monthly.length > 0 ? monthly[monthly.length - 1] : null;
  const shortLabels = monthly.map(m => m.shortLbl);

  function dohSt(doh) {
    if (doh < 45)  return { lbl: 'ممتاز',  c: '#4ada8e', bg: 'rgba(74,218,142,.14)' };
    if (doh < 90)  return { lbl: 'طبيعي',  c: '#a0d080', bg: 'rgba(160,208,128,.12)' };
    if (doh < 150) return { lbl: 'مراقبة', c: '#f5c842', bg: 'rgba(245,200,66,.14)' };
    if (doh < 270) return { lbl: 'مرتفع',  c: '#f5a623', bg: 'rgba(245,166,35,.14)' };
    return               { lbl: 'مفرط',   c: '#da4a4a', bg: 'rgba(218,74,74,.14)' };
  }

  // ── Header bar ────────────────────────────────────────────────────────────
  const headerBar = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
      <div style="font-size:.79rem;color:#708090">
        الفترة: ${monthly[0]?.label || ''} – ${lastN?.label || ''} · ${MONTHS.length} أشهر ·
        المصدر: ERP MekSoftDb1
        ${lastN?.partial ? ' <span style="color:#f5c842">(الشهر الجاري غير مكتمل)</span>' : ''}
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span id="inv-status" style="font-size:.72rem;color:#708090"></span>
        <button onclick="invExportExcel()" style="padding:5px 12px;border-radius:4px;border:1px solid #1a3040;background:#0a1825;color:#a0b8c8;cursor:pointer;font-size:.75rem">
          تصدير Excel
        </button>
      </div>
    </div>`;

  // ── Summary KPI row ───────────────────────────────────────────────────────
  const lastA41    = summary.lastA41;
  const cmpCogs    = summary.cmpCogs124;    // 8 complete months — same base as turnover
  const pTurn      = summary.periodTurnover;
  const dsi        = summary.dsi;
  const avgA41     = summary.avgA41;
  const pMonths    = summary.periodMonths;
  const pDays      = summary.periodDays;

  const sumHtml = `<div class="inv-kpi-row">
    <div class="inv-kpi" style="--inv-c:#e0c060">
      <div class="lbl">قيمة المخزون (حـ/41) — ${lastN?.label || ''}</div>
      <div class="val">${fM(lastA41)} ر.س</div>
      <div class="sub">من حساب البضاعة (حـ/41) · مُراجَع من ERP</div>
    </div>
    <div class="inv-kpi" style="--inv-c:#4ada8e">
      <div class="lbl">تكلفة المبيعات الصافية (حـ/124) — ${pMonths} أشهر مكتملة</div>
      <div class="val">${fM(cmpCogs)} ر.س</div>
      <div class="sub">بعد المردودات والتسويات · أساس حساب الدوران</div>
    </div>
    <div class="inv-kpi" style="--inv-c:#4a9eda">
      <div class="lbl">معدل دوران المخزون — ${pMonths} أشهر</div>
      <div class="val">${pTurn.toFixed(2)}×</div>
      <div class="sub">${fM(cmpCogs)} ر.س ÷ ${fM(avgA41)} ر.س (متوسط مخزون) · DSI ≈ ${dsi} يوم</div>
    </div>
  </div>`;

  // ── Category KPI cards ────────────────────────────────────────────────────
  let kpiHtml = `<div class="inv-kpi-row">`;
  CATS.forEach(c => {
    const cl  = d.lastClose[c.key] || 0;
    const doh = d.lastDoh[c.key] || 9999;
    const st  = dohSt(doh > 9000 ? 9999 : doh);
    const iv  = d.lastInvVal[c.key] || 0;
    kpiHtml += `<div class="inv-kpi" style="--inv-c:${c.color}">
      <div class="lbl">${c.name}</div>
      <div class="val">${fN1(cl)} <span style="font-size:.75rem;color:#708090">${c.unit}</span></div>
      <div class="sub">قيمة دفترية تقريبية: ${fM(iv)} ر.س</div>
      <div class="badge" style="background:${st.bg};color:${st.c}">DOH: ${doh > 999 ? '∞' : doh + ' يوم'} — ${st.lbl}</div>
    </div>`;
  });
  kpiHtml += `</div>`;

  // ── Movement Table ────────────────────────────────────────────────────────
  function buildMovTable(catKey) {
    const cat = CATS.find(x => x.key === catKey);
    let h = `<div style="overflow-x:auto"><table class="inv-tbl"><thead><tr>
      <th>الشهر</th>
      <th class="n">فتح (${cat.unit})</th>
      <th class="n">مشتريات (${cat.unit})</th>
      <th class="n">خروج COGS (${cat.unit})</th>
      <th class="n">مبيعات (ر.س)</th>
      <th class="n">إغلاق (${cat.unit})</th>
      <th class="n">قيمة الإغلاق</th>
      <th class="n">DOH</th>
      <th class="n">هامش %</th>
    </tr></thead><tbody>`;

    let tPQ = 0, tCQ = 0, tCV = 0, tSV = 0;
    monthly.forEach(m => {
      const mv  = m[catKey];
      const gm  = mv.salesVal > 0 ? (mv.salesVal - mv.delCost) / mv.salesVal * 100 : null;
      const doh = mv.doh;
      const st  = dohSt(doh > 9000 ? 9999 : doh);
      tPQ += mv.rcpQty; tCQ += mv.delQty; tCV += mv.delCost; tSV += mv.salesVal;
      h += `<tr${m.partial ? ' style="opacity:.75"' : ''}>
        <td style="color:#a0c0e0">${m.shortLbl}${m.partial ? ' *' : ''}</td>
        <td class="n">${fN1(mv.openQty)}</td>
        <td class="n" style="color:#90c8f0">${fN1(mv.rcpQty)}</td>
        <td class="n" style="color:#f09090">${fN1(mv.delQty)}</td>
        <td class="n">${fK(mv.salesVal)}</td>
        <td class="n" style="font-weight:600;color:#e0ecf8">${fN1(mv.closeQty)}</td>
        <td class="n">${fM(mv.invVal)}</td>
        <td class="n" style="color:${st.c};font-weight:600">${doh > 999 ? '∞' : doh}</td>
        <td class="n" style="color:${gm === null ? '#708090' : gm > 18 ? '#4ada8e' : gm > 5 ? '#f5c842' : '#da4a4a'}">${gm === null ? '—' : gm.toFixed(1) + '%'}</td>
      </tr>`;
    });
    const lastClose = d.lastClose[catKey] || 0;
    const lastIV    = d.lastInvVal[catKey] || 0;
    const tGM = tSV > 0 ? (tSV - tCV) / tSV * 100 : null;
    h += `<tr class="tot">
      <td>الإجمالي / الإغلاق</td><td class="n"></td>
      <td class="n">${fN1(tPQ)}</td><td class="n">${fN1(tCQ)}</td>
      <td class="n">${fM(tSV)}</td>
      <td class="n">${fN1(lastClose)}</td>
      <td class="n">${fM(lastIV)}</td>
      <td class="n">—</td>
      <td class="n" style="color:${tGM && tGM > 5 ? '#4ada8e' : '#f5a623'}">${tGM !== null ? tGM.toFixed(1) + '%' : '—'}</td>
    </tr>`;
    h += `</tbody></table></div>`;
    return h;
  }

  // ── FIFO Aging ────────────────────────────────────────────────────────────
  const AGE_LABELS = ['< 30 يوم', '30–60', '60–90', '90–180', '> 180 يوم'];
  const AGE_COLORS = ['#4ada8e', '#a0d080', '#f5c842', '#f5a623', '#da4a4a'];
  const lastLabel  = lastN?.label || '';
  let agingHtml = `<div class="inv-sec">تحليل عمر المخزون (FIFO تقريبي — ${lastLabel})</div>
  <div style="font-size:.71rem;color:#708090;margin-bottom:12px">الشرائح ممثَّلة بالأيام منذ استلام البضاعة · يُحسب بطريقة FIFO (الأقدم يخرج أولاً)</div>`;
  CATS.forEach(c => {
    const cl  = d.lastClose[c.key] || 0;
    const pct = d.aging[c.key] || [0, 0, 0, 0, 0];
    agingHtml += `<div style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:.77rem;margin-bottom:5px">
        <span style="color:${c.color};font-weight:600">${c.name}</span>
        <span style="color:#708090">${fN1(cl)} ${c.unit}</span>
      </div>
      <div class="inv-age-bar">
        ${pct.map((p, i) => p < 0.8 ? '' :
          `<div class="inv-age-seg" style="width:${p.toFixed(1)}%;background:${AGE_COLORS[i]}">${p > 8 ? Math.round(p) + '%' : ''}</div>`
        ).join('')}
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:3px">
        ${pct.map((p, i) => p < 1 ? '' :
          `<span style="font-size:.68rem;color:${AGE_COLORS[i]}">● ${AGE_LABELS[i]}: ${p.toFixed(0)}%</span>`
        ).join('')}
      </div>
    </div>`;
  });

  // ── Dynamic Recommendations ───────────────────────────────────────────────
  function buildRecs() {
    const recs = [];
    CATS.forEach(c => {
      const doh = d.lastDoh[c.key] || 0;
      const cl  = d.lastClose[c.key] || 0;
      const iv  = d.lastInvVal[c.key] || 0;
      const st  = dohSt(doh > 9000 ? 9999 : doh);
      const ag  = d.aging[c.key] || [0, 0, 0, 0, 0];
      const oldPct = (ag[3] || 0) + (ag[4] || 0); // >90 days old %

      let cssClass = 'inv-buy', icon = '✓';
      if (st.lbl === 'مراقبة' || st.lbl === 'مرتفع') { cssClass = 'inv-warn'; icon = '⚠'; }
      if (st.lbl === 'مفرط')                           { cssClass = 'inv-sell'; icon = '✗'; }

      let note = '';
      if (doh < 45) {
        note = `مخزون مثالي. الإغلاق ${fN1(cl)} ${c.unit} · DOH ${doh} يوم. حافظ على نمط الطلب الحالي.`;
      } else if (doh < 90) {
        note = `مستوى طبيعي. الإغلاق ${fN1(cl)} ${c.unit} · DOH ${doh} يوم. الوضع مستقر.`;
      } else if (doh < 150) {
        note = `DOH ${doh} يوم — راقب حركة المبيعات. الإغلاق ${fN1(cl)} ${c.unit}.${oldPct > 25 ? ` تنبه: ${Math.round(oldPct)}% من المخزون عمره >90 يوم.` : ''}`;
      } else if (doh < 270) {
        note = `DOH مرتفع (${doh} يوم) · قيمة مجمَّدة ${fM(iv)} ر.س. لا شراء إضافي حتى ينخفض المخزون.${oldPct > 30 ? ` ${Math.round(oldPct)}% من المخزون عمره >90 يوم — راجع التسعير.` : ''}`;
      } else {
        const inf = doh > 9000 ? '>999' : String(doh);
        note = `DOH مفرط (${inf} يوم) · قيمة مجمَّدة ${fM(iv)} ر.س.${oldPct > 50 ? ` ${Math.round(oldPct)}% من المخزون قديم (>90 يوم).` : ''} توقف فوري عن الشراء — راجع فرص التصفية أو إعادة التسعير.`;
      }

      recs.push(`<li class="${cssClass}"><strong>${icon} ${c.name} — ${st.lbl}:</strong> ${note}</li>`);
    });
    return `<div class="inv-sec">التوصيات بناءً على التحليل</div><ul class="inv-rec">${recs.join('')}</ul>`;
  }

  // ── Assemble HTML ─────────────────────────────────────────────────────────
  const tabHtml = `
    ${headerBar}
    <div class="inv-sec">ملخص المخزون الكلي</div>
    ${sumHtml}
    <div class="inv-sec">المخزون الختامي حسب المجموعة (${lastLabel})</div>
    ${kpiHtml}
    <div class="inv-sec">الحركة الشهرية</div>
    <div class="inv-tabs" id="inv-tabs">
      ${CATS.map(c => `<button class="inv-tab-btn${c.key === _invActiveCat ? ' on' : ''}"
        style="${c.key === _invActiveCat ? `background:${c.color}` : ''}"
        data-key="${c.key}">${c.name}</button>`).join('')}
    </div>
    <div id="inv-mov-tbl">${buildMovTable(_invActiveCat)}</div>
    <div class="inv-grid2" style="margin-top:18px">
      <div class="inv-card">
        <div style="font-size:.75rem;color:#708090;margin-bottom:8px">DOH الشهرية (أيام الاحتياط)</div>
        <div class="inv-cht"><canvas id="inv-c-doh"></canvas></div>
      </div>
      <div class="inv-card">
        <div style="font-size:.75rem;color:#708090;margin-bottom:8px">المخزون الختامي الشهري</div>
        <div class="inv-cht"><canvas id="inv-c-stock"></canvas></div>
      </div>
    </div>
    <div class="inv-grid2">
      <div class="inv-card" style="margin-bottom:18px">
        <div style="font-size:.75rem;color:#708090;margin-bottom:8px">تكلفة المبيعات الشهرية (COGS) حسب المجموعة</div>
        <div class="inv-cht" style="height:190px"><canvas id="inv-c-cogs"></canvas></div>
      </div>
      <div class="inv-card" style="margin-bottom:18px">
        <div style="font-size:.75rem;color:#708090;margin-bottom:8px">قيمة المخزون الشهرية — حساب 41 (ر.س)</div>
        <div class="inv-cht" style="height:190px"><canvas id="inv-c-acct41"></canvas></div>
      </div>
    </div>
    ${agingHtml}
    ${buildRecs()}
  `;

  wrap.innerHTML = `<div style="padding:16px 0;direction:rtl">${tabHtml}</div>`;

  // Tab switching
  document.querySelectorAll('#inv-tabs .inv-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _invActiveCat = btn.dataset.key;
      document.querySelectorAll('#inv-tabs .inv-tab-btn').forEach(b => {
        b.classList.remove('on'); b.style.background = '';
      });
      btn.classList.add('on');
      btn.style.background = CATS.find(c => c.key === _invActiveCat).color;
      document.getElementById('inv-mov-tbl').innerHTML = buildMovTable(_invActiveCat);
    });
  });

  _invBuildCharts(d, shortLabels);

  const st2 = document.getElementById('inv-status');
  if (st2) st2.textContent = `تحديث تلقائي خلال ${INV_REFRESH_SEC}ث`;
}

// ─────────────────────────────────────────────────────────────────────────────
function _invBuildCharts(d, labels) {
  const CO_BASE = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'top', labels: { color: '#a0b8c8', font: { size: 10 }, boxWidth: 12 } } },
    scales: {
      x: { ticks: { color: '#708090', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.04)' } },
      y: { ticks: { color: '#708090', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,.06)' } },
    }
  };
  const CATS = d.cats;

  // DOH — line chart capped at 400
  const dohCtx = document.getElementById('inv-c-doh');
  if (dohCtx) {
    _invCharts.doh = new Chart(dohCtx, {
      type: 'line',
      data: {
        labels,
        datasets: CATS.map(c => ({
          label: c.name,
          data: d.dohByCat[c.key].map(v => Math.min(v, 400)),
          borderColor: c.color, backgroundColor: c.colorA,
          borderWidth: 2, tension: 0.3, fill: false, pointRadius: 4,
        }))
      },
      options: { ...CO_BASE,
        plugins: { ...CO_BASE.plugins,
          tooltip: { callbacks: { label: i => `${i.dataset.label}: ${i.raw >= 400 ? '>400' : i.raw} يوم` } }
        },
        scales: { ...CO_BASE.scales, y: { ...CO_BASE.scales.y,
          max: 420,
          ticks: { ...CO_BASE.scales.y.ticks, callback: v => v >= 400 ? '+400' : v },
          title: { display: true, text: 'أيام', color: '#708090', font: { size: 10 } }
        } }
      }
    });
  }

  // Closing stock — bar chart
  const stCtx = document.getElementById('inv-c-stock');
  if (stCtx) {
    _invCharts.stock = new Chart(stCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'تسليح (طن)',      data: d.closingQty.tas, backgroundColor: 'rgba(74,158,218,0.75)', yAxisID: 'y' },
          { label: 'تسليح اخرى ÷10', data: d.closingQty.tao.map(v => v / 10), backgroundColor: 'rgba(245,166,35,0.55)', yAxisID: 'y' },
          { label: 'السلامة ÷100',   data: d.closingQty.sal.map(v => v / 100), backgroundColor: 'rgba(74,218,142,0.5)', yAxisID: 'y' },
        ]
      },
      options: { ...CO_BASE,
        plugins: { ...CO_BASE.plugins,
          tooltip: { callbacks: { label: i => {
            const sc = i.dataset.label.includes('÷10') ? 10 : i.dataset.label.includes('÷100') ? 100 : 1;
            return `${i.dataset.label}: ${Math.round(i.raw * sc).toLocaleString('ar-SA')}`;
          } } }
        }
      }
    });
  }

  // COGS — stacked bars + net P&L line
  const cogsCtx = document.getElementById('inv-c-cogs');
  if (cogsCtx) {
    _invCharts.cogs = new Chart(cogsCtx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'تسليح (إجمالي)', data: d.monthly.map(m => m.tas.delCost), backgroundColor: 'rgba(74,158,218,0.75)', stack: 'gross' },
          { label: 'تسليح اخرى',     data: d.monthly.map(m => m.tao.delCost), backgroundColor: 'rgba(245,166,35,0.75)', stack: 'gross' },
          { label: 'مستلزمات السلامة', data: d.monthly.map(m => m.sal.delCost), backgroundColor: 'rgba(74,218,142,0.65)', stack: 'gross' },
          { label: 'تجاري',           data: d.monthly.map(m => m.taj.delCost), backgroundColor: 'rgba(167,139,250,0.65)', stack: 'gross' },
          { label: 'صافي التكلفة (حـ/124)', data: d.monthly.map(m => m.a124), type: 'line',
            borderColor: '#ff6b6b', backgroundColor: 'transparent',
            borderWidth: 2.5, borderDash: [5, 3], pointRadius: 4, tension: 0.3, order: 0 },
        ]
      },
      options: { ...CO_BASE,
        plugins: { ...CO_BASE.plugins,
          tooltip: { callbacks: { label: i => `${i.dataset.label}: ${(i.raw / 1e6).toFixed(2)} م ر.س` } }
        },
        scales: { ...CO_BASE.scales,
          x: { ...CO_BASE.scales.x, stacked: true },
          y: { ...CO_BASE.scales.y, stacked: false, ticks: { ...CO_BASE.scales.y.ticks, callback: v => (v / 1e6).toFixed(0) + 'م' } }
        }
      }
    });
  }

  // Account 41 line
  const a41Ctx = document.getElementById('inv-c-acct41');
  if (a41Ctx) {
    const openLbl = d.monthly.length > 0 ? 'بداية' : '';
    const allVals = [d.a41OpenBal, ...d.a41Balances];
    const allLbls = [openLbl, ...labels];
    _invCharts.acct41 = new Chart(a41Ctx, {
      type: 'line',
      data: {
        labels: allLbls,
        datasets: [{ label: 'قيمة المخزون (حـ/41)', data: allVals,
          borderColor: '#e0c060', backgroundColor: 'rgba(224,192,96,0.12)',
          borderWidth: 2.5, tension: 0.3, fill: true, pointRadius: 5,
          pointBackgroundColor: allVals.map(v => v > 15000000 ? '#da4a4a' : '#e0c060'),
        }]
      },
      options: { ...CO_BASE,
        plugins: { ...CO_BASE.plugins,
          tooltip: { callbacks: { label: i => `${(i.raw / 1e6).toFixed(2)} م ر.س` } }
        },
        scales: { ...CO_BASE.scales,
          y: { ...CO_BASE.scales.y, ticks: { ...CO_BASE.scales.y.ticks, callback: v => (v / 1e6).toFixed(1) + 'م' } }
        }
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
async function invExportExcel() {
  if (!_invData) return;
  const d    = _invData;
  const CATS = d.cats;
  const wb   = new ExcelJS.Workbook();
  wb.creator  = 'Expenses Dashboard';
  wb.created  = new Date();

  // ── Sheet 1: Summary KPIs ──────────────────────────────────────────────────
  const ws1 = wb.addWorksheet('ملخص المخزون');
  ws1.views = [{ rightToLeft: true }];
  const hStyle = { font: { bold: true, color: { argb: 'FF4A9EDA' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A1825' } } };
  ws1.addRow(['البيان', 'القيمة']).eachCell(c => Object.assign(c, hStyle));
  const s = d.summary;
  [
    ['تاريخ البيانات', s.dataAsOf],
    ['بداية الفترة', s.startDate],
    ['إجمالي تكلفة المبيعات (حـ/124)', s.totalCogs124],
    ['رصيد المخزون الختامي (حـ/41)', s.lastA41],
    ['متوسط المخزون الشهري (حـ/41)', s.avgA41],
    ['معدل دوران المخزون (سنوي)', s.annTurnover],
    ['DSI (أيام)', s.dsi],
  ].forEach(r => ws1.addRow(r));
  ws1.addRow([]);
  ws1.addRow(['المجموعة', 'الإغلاق', 'الوحدة', 'DOH (يوم)', 'القيمة التقريبية (ر.س)']).eachCell(c => Object.assign(c, hStyle));
  CATS.forEach(c => ws1.addRow([c.name, d.lastClose[c.key], c.unit, d.lastDoh[c.key], d.lastInvVal[c.key]]));
  ws1.columns.forEach(col => { col.width = 28; col.alignment = { horizontal: 'right' }; });

  // ── Sheet 2: Monthly Movements ─────────────────────────────────────────────
  const ws2 = wb.addWorksheet('الحركة الشهرية');
  ws2.views = [{ rightToLeft: true }];
  const cols2 = ['الشهر', 'المجموعة', 'فتح', 'مشتريات (كمية)', 'مشتريات (قيمة)', 'خروج COGS (كمية)', 'تكلفة COGS', 'مبيعات (قيمة)', 'إغلاق', 'قيمة الإغلاق', 'DOH', 'هامش %'];
  ws2.addRow(cols2).eachCell(c => Object.assign(c, hStyle));
  d.monthly.forEach(m => {
    CATS.forEach(c => {
      const mv = m[c.key];
      const gm = mv.salesVal > 0 ? ((mv.salesVal - mv.delCost) / mv.salesVal * 100).toFixed(1) : '';
      ws2.addRow([m.label, c.name, mv.openQty, mv.rcpQty, mv.purchVal, mv.delQty, mv.delCost, mv.salesVal, mv.closeQty, mv.invVal, mv.doh > 999 ? '∞' : mv.doh, gm]);
    });
    ws2.addRow(['', '', '', '', '', '', '', '', '', m.a41Balance, '', '']).getCell(1).value = m.label + ' — حـ/41';
    ws2.addRow(['', '', '', '', '', '', '', '', '', '', '', '']).getCell(1).value = m.label + ' — حـ/124: ' + m.a124;
  });
  ws2.columns.forEach((col, i) => { col.width = i < 2 ? 22 : 16; col.alignment = { horizontal: 'right' }; });

  // ── Sheet 3: FIFO Aging ───────────────────────────────────────────────────
  const ws3 = wb.addWorksheet('عمر المخزون FIFO');
  ws3.views = [{ rightToLeft: true }];
  ws3.addRow(['المجموعة', '< 30 يوم %', '30–60 %', '60–90 %', '90–180 %', '> 180 يوم %']).eachCell(c => Object.assign(c, hStyle));
  CATS.forEach(c => {
    const ag = d.aging[c.key] || [0, 0, 0, 0, 0];
    ws3.addRow([c.name, ...ag.map(v => v.toFixed(1))]);
  });
  ws3.columns.forEach(col => { col.width = 18; col.alignment = { horizontal: 'right' }; });

  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `inventory_analysis_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}
// ═══════════════════════════════════════════════════════════════════════
