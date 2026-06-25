// ── تحليل فواتير المبيعات — Tab ──────────────────────────────────────────────

let _siDb        = 'MekSoftDb1';
let _siData      = null;
let _siTimer     = null;
let _siRendered  = false;
let _siCountdown = 0;
let _siChartSm   = null;
let _siChartPay  = null;
let _siChartDay  = null;

const SI_REFRESH_SEC = 60;
const SI_FMT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const siFmt  = v => SI_FMT.format(+v || 0);
const siEsc  = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function _siIsActive()  { return !!document.querySelector('.tab.active[data-tab="sales-inv"]'); }
function _siStopTimer() { if (_siTimer) { clearInterval(_siTimer); _siTimer = null; } }

/* ── Entry point ── */
function renderSalesInvoicesTab() {
  const wrap = document.getElementById('tab-sales-inv');
  if (!wrap) return;

  if (!_siRendered) {
    _siRendered = true;
    _injectSICSS();
    wrap.innerHTML = _siBuildShell();
    _siWireControls(wrap);
  }

  _siLoad();
}

/* ── HTML shell ── */
function _siBuildShell() {
  const today = new Date().toISOString().slice(0, 10);
  return `
  <div class="si-header">
    <div>
      <div class="si-title">🧾 تحليل فواتير المبيعات</div>
      <div class="si-sub">تفاصيل يومية · تحديث تلقائي كل دقيقة · بنود قابلة للطي</div>
    </div>
    <div id="si-status" class="si-status-bar">جارٍ التحميل…</div>
  </div>

  <div class="si-bar">
    <div class="si-db-group">
      <button class="si-db-btn active" data-sidb="MekSoftDb1">أبعاد الحديد</button>
      <button class="si-db-btn"        data-sidb="MekSoftDb2">وسام الفولاذ</button>
    </div>
    <div class="si-date-group">
      <label class="si-lbl">من:</label>
      <input  type="date" id="si-from" class="si-inp-date" value="${today}">
      <label class="si-lbl">إلى:</label>
      <input  type="date" id="si-to"   class="si-inp-date" value="${today}">
    </div>
    <div class="si-presets">
      <button class="si-preset-btn" data-preset="today">اليوم</button>
      <button class="si-preset-btn" data-preset="week">أسبوع</button>
      <button class="si-preset-btn" data-preset="month">شهر</button>
    </div>
    <input type="text" id="si-search" class="si-inp-search" placeholder="🔍 عميل / رقم فاتورة…">
    <select id="si-sm-sel"  class="si-sel"><option value="">كل البائعين</option></select>
    <select id="si-pay-sel" class="si-sel"><option value="">كل الأنواع</option></select>
    <button id="si-refresh" class="si-btn si-btn-blue">↺ تحديث</button>
    <button id="si-excel"   class="si-btn si-btn-excel">📊 Excel</button>
  </div>

  <!-- KPI cards -->
  <div class="si-kpis" id="si-kpis"></div>

  <!-- Charts row -->
  <div class="si-charts-row">
    <div class="si-chart-card" id="si-chart-sm-wrap" style="display:none">
      <canvas id="si-chart-sm"></canvas>
    </div>
    <div class="si-chart-card" id="si-chart-pay-wrap" style="display:none">
      <canvas id="si-chart-pay"></canvas>
    </div>
  </div>

  <!-- Daily trend (multi-day only) -->
  <div class="si-chart-day-wrap" id="si-chart-day-wrap" style="display:none">
    <canvas id="si-chart-day"></canvas>
  </div>

  <!-- Top customers -->
  <div id="si-top-custs" class="si-top-custs"></div>

  <!-- Invoice table -->
  <div class="si-tbl-wrap" id="si-tbl-wrap">
    <div class="si-loading">⏳ جارٍ تحميل الفواتير…</div>
  </div>
  `;
}

/* ── Wire controls ── */
function _siWireControls(wrap) {
  wrap.querySelectorAll('.si-db-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.sidb === _siDb) return;
      _siDb = btn.dataset.sidb;
      wrap.querySelectorAll('.si-db-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _siLoad();
    });
  });

  document.getElementById('si-from')?.addEventListener('change', _siLoad);
  document.getElementById('si-to')?.addEventListener('change', _siLoad);
  document.getElementById('si-refresh')?.addEventListener('click', () => { _siStopTimer(); _siLoad(); });

  const applyFilter = () => { if (_siData) _siRender(_siData); };
  ['si-sm-sel', 'si-pay-sel'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', applyFilter);
  });
  let _siSearchDebounce;
  document.getElementById('si-search')?.addEventListener('input', () => {
    clearTimeout(_siSearchDebounce);
    _siSearchDebounce = setTimeout(applyFilter, 220);
  });

  wrap.querySelectorAll('.si-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('.si-preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _siSetPreset(btn.dataset.preset);
    });
  });

  document.getElementById('si-excel')?.addEventListener('click', () => {
    const btn = document.getElementById('si-excel');
    if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
    siExportExcel().catch(e => { console.error(e); alert('خطأ في التصدير'); })
      .finally(() => { if (btn) { btn.disabled = false; btn.textContent = '📊 Excel'; } });
  });
}

/* ── Quick date presets ── */
function _siSetPreset(preset) {
  const today = new Date();
  const toStr = today.toISOString().slice(0, 10);
  let fromStr;
  if (preset === 'today') {
    fromStr = toStr;
  } else if (preset === 'week') {
    const d = new Date(today); d.setDate(d.getDate() - 6);
    fromStr = d.toISOString().slice(0, 10);
  } else {
    const d = new Date(today); d.setDate(1);
    fromStr = d.toISOString().slice(0, 10);
  }
  const fe = document.getElementById('si-from');
  const te = document.getElementById('si-to');
  if (fe) fe.value = fromStr;
  if (te) te.value = toStr;
  _siLoad();
}

/* ── Load data ── */
async function _siLoad() {
  const from = document.getElementById('si-from')?.value;
  const to   = document.getElementById('si-to')?.value;
  if (!from || !to) return;

  const statusEl = document.getElementById('si-status');
  if (statusEl) { statusEl.textContent = '⏳ جارٍ التحميل…'; statusEl.style.color = '#a87d00'; }

  try {
    const url  = `/api/sales-invoices?db=${encodeURIComponent(_siDb)}&from=${from}&to=${to}`;
    const data = await fetch(url).then(r => r.json());
    if (data.error) throw new Error(data.error + (data.message ? ': ' + data.message : ''));

    _siData = data;
    _siPopulateFilters(data);
    _siRender(data);
    _siStartCountdown(data.totals.count, data.totals.net);
  } catch (err) {
    if (statusEl) { statusEl.textContent = '❌ ' + err.message; statusEl.style.color = '#c0392b'; }
    const wrap = document.getElementById('si-tbl-wrap');
    if (wrap) wrap.innerHTML = `<div class="si-empty">❌ ${siEsc(err.message)}</div>`;
    console.error('[tab-sales-inv]', err);
  }
}

/* ── Populate filter dropdowns ── */
function _siPopulateFilters(data) {
  const smSel  = document.getElementById('si-sm-sel');
  const paySel = document.getElementById('si-pay-sel');
  if (smSel) {
    const prev = smSel.value;
    smSel.innerHTML = '<option value="">كل البائعين</option>';
    (data.bySalesman || []).forEach(s => {
      const o = document.createElement('option');
      o.value = s.name; o.textContent = `${s.name} (${s.count})`;
      smSel.appendChild(o);
    });
    if (prev && [...smSel.options].some(o => o.value === prev)) smSel.value = prev;
  }
  if (paySel) {
    const prev = paySel.value;
    paySel.innerHTML = '<option value="">كل الأنواع</option>';
    (data.byPayment || []).forEach(p => {
      const o = document.createElement('option');
      o.value = p.label; o.textContent = `${p.label} (${p.count})`;
      paySel.appendChild(o);
    });
    if (prev && [...paySel.options].some(o => o.value === prev)) paySel.value = prev;
  }
}

/* ── Client-side filter ── */
function _siFiltered(data) {
  if (!data?.invoices) return [];
  const search   = (document.getElementById('si-search')?.value  || '').trim().toLowerCase();
  const smFilter = (document.getElementById('si-sm-sel')?.value  || '');
  const payFilter = (document.getElementById('si-pay-sel')?.value || '');
  return data.invoices.filter(inv => {
    if (search && !inv.customer.toLowerCase().includes(search) &&
        !String(inv.manualId).toLowerCase().includes(search)) return false;
    if (smFilter  && inv.salesman !== smFilter)  return false;
    if (payFilter && inv.payLabel !== payFilter) return false;
    return true;
  });
}

/* ── Main render ── */
function _siRender(data) {
  if (!data) return;
  const filtered = _siFiltered(data);
  _siRenderKPIs(filtered);
  _siRenderCharts(filtered, data);
  _siRenderTopCustomers(filtered);
  _siRenderTable(filtered);
}

/* ── KPI cards ── */
function _siRenderKPIs(invoices) {
  const el = document.getElementById('si-kpis');
  if (!el) return;
  const count = invoices.length;
  const gross = invoices.reduce((s, i) => s + i.gross, 0);
  const disc  = invoices.reduce((s, i) => s + i.disc,  0);
  const net   = invoices.reduce((s, i) => s + i.net,   0);
  const vat   = invoices.reduce((s, i) => s + i.vat,   0);
  const total = invoices.reduce((s, i) => s + i.total, 0);
  const avg   = count > 0 ? net / count : 0;
  const max   = count > 0 ? Math.max(...invoices.map(i => i.net)) : 0;
  const discPct = gross > 0 ? (disc / gross * 100).toFixed(1) : '0';
  const vatPct  = net   > 0 ? (vat  / net  * 100).toFixed(1) : '0';

  const kpi = (lbl, val, unit, accent, sub) =>
    `<div class="si-kpi" style="--si-ac:${accent}">
      <div class="si-kpi-lbl">${lbl}</div>
      <div class="si-kpi-val">${val}</div>
      ${unit ? `<div class="si-kpi-unit">${unit}</div>` : ''}
      ${sub  ? `<div class="si-kpi-sub">${sub}</div>`  : ''}
    </div>`;

  el.innerHTML = `
    ${kpi('عدد الفواتير',    count + ' فاتورة',   '',    '#5baef0', '')}
    ${kpi('قبل الخصم',       siFmt(gross),         'ر.س', '#a0b8d0', '')}
    ${kpi('الخصم',           siFmt(disc),          'ر.س', '#f5a623', discPct + '% من الإجمالي')}
    ${kpi('قبل الضريبة',     siFmt(net),           'ر.س', '#4ada8e', 'صافي المبيعات')}
    ${kpi('ضريبة 15%',       siFmt(vat),           'ر.س', '#a0c8e0', vatPct + '% من القبل')}
    ${kpi('بعد الضريبة',     siFmt(total),         'ر.س', '#C9A84C', 'الإجمالي الكامل')}
    ${kpi('متوسط الفاتورة',  siFmt(avg),           'ر.س', '#7090b0', '')}
    ${kpi('أعلى فاتورة',     siFmt(max),           'ر.س', '#e07070', '')}
  `;
}

/* ── Charts ── */
function _siRenderCharts(invoices, rawData) {
  const multiDay = rawData && rawData.from !== rawData.to;

  // Daily trend (only when multi-day)
  const dayWrap   = document.getElementById('si-chart-day-wrap');
  const dayCanvas = document.getElementById('si-chart-day');
  if (dayWrap && dayCanvas) {
    if (_siChartDay) { _siChartDay.destroy(); _siChartDay = null; }
    if (multiDay && rawData.byDate?.length) {
      // Build from filtered invoices by date
      const dateMap = new Map();
      invoices.forEach(inv => {
        if (!dateMap.has(inv.date)) dateMap.set(inv.date, 0);
        dateMap.set(inv.date, dateMap.get(inv.date) + inv.net);
      });
      const dates = [...dateMap.keys()].sort();
      dayWrap.style.display = 'block';
      _siChartDay = new Chart(dayCanvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: dates,
          datasets: [{
            label: 'المبيعات اليومية (قبل الضريبة)',
            data: dates.map(d => dateMap.get(d) || 0),
            backgroundColor: 'rgba(91,174,240,0.7)',
            borderColor: '#5baef0',
            borderWidth: 1,
            borderRadius: 4,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: { display: true, text: 'الإيرادات اليومية (ر.س)', color: '#c8d8e8', font: { family: 'Tajawal,sans-serif', size: 12 } },
            tooltip: { callbacks: { label: ctx => '  ' + siFmt(ctx.raw) + ' ر.س' } },
          },
          scales: {
            x: { ticks: { color: '#7090b0', font: { family: 'Tajawal,sans-serif', size: 10 } }, grid: { color: '#0f2035' } },
            y: { ticks: { color: '#5a7a9a', callback: v => v >= 1e6 ? (v/1e6).toFixed(1)+'م' : v >= 1e3 ? (v/1e3).toFixed(0)+'ك' : v }, grid: { color: '#0f2035' } },
          },
        },
      });
    } else {
      dayWrap.style.display = 'none';
    }
  }

  // Salesman bar chart
  const smWrap   = document.getElementById('si-chart-sm-wrap');
  const smCanvas = document.getElementById('si-chart-sm');
  if (smWrap && smCanvas) {
    if (_siChartSm) { _siChartSm.destroy(); _siChartSm = null; }
    const smMap = new Map();
    invoices.forEach(inv => {
      if (!smMap.has(inv.salesman)) smMap.set(inv.salesman, 0);
      smMap.set(inv.salesman, smMap.get(inv.salesman) + inv.net);
    });
    const sorted = [...smMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (sorted.length) {
      smWrap.style.display = 'block';
      _siChartSm = new Chart(smCanvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: sorted.map(([k]) => k),
          datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: '#2B388F', borderRadius: 4, borderWidth: 0 }],
        },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: { display: true, text: 'المبيعات حسب البائع (ر.س)', color: '#c8d8e8', font: { family: 'Tajawal,sans-serif', size: 12 } },
            tooltip: { callbacks: { label: ctx => '  ' + siFmt(ctx.raw) + ' ر.س' } },
          },
          scales: {
            x: { ticks: { color: '#5a7a9a', callback: v => v >= 1e6 ? (v/1e6).toFixed(1)+'م' : v >= 1e3 ? (v/1e3).toFixed(0)+'ك' : v }, grid: { color: '#0f2035' } },
            y: { ticks: { color: '#7090b0', font: { family: 'Tajawal,sans-serif', size: 10 } }, grid: { color: '#0f2035' } },
          },
        },
      });
    } else {
      smWrap.style.display = 'none';
    }
  }

  // Payment type doughnut
  const payWrap   = document.getElementById('si-chart-pay-wrap');
  const payCanvas = document.getElementById('si-chart-pay');
  if (payWrap && payCanvas) {
    if (_siChartPay) { _siChartPay.destroy(); _siChartPay = null; }
    const ptMap = new Map();
    invoices.forEach(inv => {
      if (!ptMap.has(inv.payLabel)) ptMap.set(inv.payLabel, 0);
      ptMap.set(inv.payLabel, ptMap.get(inv.payLabel) + inv.net);
    });
    const sorted = [...ptMap.entries()].sort((a, b) => b[1] - a[1]);
    if (sorted.length) {
      payWrap.style.display = 'block';
      const COLORS = ['#2B388F', '#C9A84C', '#1a7a3c', '#8b1a1a', '#5a3a8a'];
      _siChartPay = new Chart(payCanvas.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: sorted.map(([k]) => k),
          datasets: [{ data: sorted.map(([, v]) => v), backgroundColor: COLORS.slice(0, sorted.length), borderWidth: 1, borderColor: '#0a1828' }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: '#a0b8d0', font: { family: 'Tajawal,sans-serif', size: 10 }, padding: 12 } },
            title: { display: true, text: 'توزيع نوع السداد', color: '#c8d8e8', font: { family: 'Tajawal,sans-serif', size: 12 } },
            tooltip: { callbacks: { label: ctx => `  ${ctx.label}: ${siFmt(ctx.raw)} ر.س` } },
          },
        },
      });
    } else {
      payWrap.style.display = 'none';
    }
  }
}

/* ── Top customers mini-table ── */
function _siRenderTopCustomers(invoices) {
  const el = document.getElementById('si-top-custs');
  if (!el) return;
  const custMap = new Map();
  invoices.forEach(inv => {
    if (!custMap.has(inv.customer)) custMap.set(inv.customer, { name: inv.customer, count: 0, net: 0, total: 0 });
    const e = custMap.get(inv.customer);
    e.count++; e.net += inv.net; e.total += inv.total;
  });
  const top = [...custMap.values()].sort((a, b) => b.net - a.net).slice(0, 8);
  if (!top.length) { el.innerHTML = ''; return; }

  const maxNet = top[0].net || 1;
  el.innerHTML = `
    <div class="si-top-header">أعلى العملاء — قبل الضريبة</div>
    <div class="si-top-list">
      ${top.map((c, i) => {
        const pct = (c.net / maxNet * 100).toFixed(0);
        return `<div class="si-top-row">
          <div class="si-top-rank">${i + 1}</div>
          <div class="si-top-name" title="${siEsc(c.name)}">${siEsc(c.name)}</div>
          <div class="si-top-bar-wrap"><div class="si-top-bar" style="width:${pct}%"></div></div>
          <div class="si-top-val">${siFmt(c.net)} <span class="si-top-cnt">(${c.count})</span></div>
        </div>`;
      }).join('')}
    </div>
  `;
}

/* ── Invoice table with expandable detail rows ── */
function _siRenderTable(invoices) {
  const wrap = document.getElementById('si-tbl-wrap');
  if (!wrap) return;
  if (!invoices.length) {
    wrap.innerHTML = '<div class="si-empty">لا توجد فواتير في هذه الفترة · جرّب تغيير التاريخ أو الفلاتر</div>';
    return;
  }

  const PAY_CLS = { 'نقدي': 'si-pay-cash', 'آجل': 'si-pay-credit', 'شبكة': 'si-pay-atm', 'بنك': 'si-pay-bank', 'أخرى': 'si-pay-other' };

  // Total row for filtered set
  const tot = {
    gross: invoices.reduce((s, i) => s + i.gross, 0),
    disc:  invoices.reduce((s, i) => s + i.disc,  0),
    net:   invoices.reduce((s, i) => s + i.net,   0),
    vat:   invoices.reduce((s, i) => s + i.vat,   0),
    total: invoices.reduce((s, i) => s + i.total, 0),
  };

  let html = `<table class="si-tbl">
    <thead><tr>
      <th class="si-th-exp" title="توسيع / طي"></th>
      <th class="si-th-seq">#</th>
      <th class="si-th-txt">رقم الفاتورة</th>
      <th class="si-th-txt">التاريخ</th>
      <th class="si-th-cust">العميل</th>
      <th class="si-th-txt">البائع</th>
      <th class="si-th-txt">نوع السداد</th>
      <th class="si-th-num">قبل الخصم</th>
      <th class="si-th-num">الخصم</th>
      <th class="si-th-num si-col-net">قبل الضريبة</th>
      <th class="si-th-num">الضريبة</th>
      <th class="si-th-num si-col-total">بعد الضريبة</th>
    </tr></thead>
    <tbody>`;

  invoices.forEach((inv, i) => {
    const hasDisc   = inv.disc > 0.01;
    const discPct   = inv.gross > 0 ? (inv.disc / inv.gross * 100).toFixed(1) : '0';
    const payCls    = PAY_CLS[inv.payLabel] || 'si-pay-other';
    const hasDetail = inv.details.length > 0;
    const rowCls    = i % 2 === 0 ? '' : 'si-row-alt';

    html += `<tr class="si-inv-row ${rowCls}" data-inv-id="${inv.id}">
      <td class="si-td-exp">
        ${hasDetail
          ? `<button class="si-exp-btn" data-inv="${inv.id}" title="تفاصيل البنود (${inv.lineCount})">▶</button>`
          : '<span class="si-no-det">—</span>'}
      </td>
      <td class="si-td-seq">${i + 1}</td>
      <td class="si-td-txt si-manual-id">${siEsc(inv.manualId)}</td>
      <td class="si-td-txt si-date-cell">${inv.date}</td>
      <td class="si-td-cust" title="${siEsc(inv.customer)}">${siEsc(inv.customer)}</td>
      <td class="si-td-txt si-sm-cell">${siEsc(inv.salesman)}</td>
      <td class="si-td-txt"><span class="si-pay-badge ${payCls}">${siEsc(inv.payLabel)}</span></td>
      <td class="si-td-num">${siFmt(inv.gross)}</td>
      <td class="si-td-num ${hasDisc ? 'si-disc-num' : 'si-zero-val'}">
        ${hasDisc ? `${siFmt(inv.disc)} <span class="si-pct-badge">${discPct}%</span>` : '—'}
      </td>
      <td class="si-td-num si-col-net si-bold-val">${siFmt(inv.net)}</td>
      <td class="si-td-num si-vat-num">${siFmt(inv.vat)}</td>
      <td class="si-td-num si-col-total si-bold-val">${siFmt(inv.total)}</td>
    </tr>`;

    if (hasDetail) {
      html += `<tr class="si-detail-tr" id="si-det-${inv.id}" style="display:none">
        <td colspan="12" class="si-det-td">
          <div class="si-det-inner">
            <table class="si-det-tbl">
              <thead><tr>
                <th class="si-dth">الصنف</th>
                <th class="si-dth si-dth-num">الكمية</th>
                <th class="si-dth">الوحدة</th>
                <th class="si-dth si-dth-num">سعر الوحدة</th>
                <th class="si-dth si-dth-num">خصم%</th>
                <th class="si-dth si-dth-num">قيمة الخصم</th>
                <th class="si-dth si-dth-num si-dcol-net">قبل الضريبة</th>
                <th class="si-dth si-dth-num">الضريبة</th>
                <th class="si-dth si-dth-num si-dcol-tot">إجمالي البند</th>
                <th class="si-dth">الفرع</th>
              </tr></thead>
              <tbody>
                ${inv.details.map(d => {
                  const dDiscCell = d.discValue > 0.01;
                  return `<tr>
                    <td class="si-dtd si-det-item">${siEsc(d.itemName)}${d.itemCode ? ` <span class="si-det-code">${siEsc(d.itemCode)}</span>` : ''}</td>
                    <td class="si-dtd si-dtd-num">${+d.qty % 1 === 0 ? d.qty : (+d.qty).toFixed(3)}</td>
                    <td class="si-dtd si-det-unit">${siEsc(d.unit)}</td>
                    <td class="si-dtd si-dtd-num">${siFmt(d.unitPrice)}</td>
                    <td class="si-dtd si-dtd-num">${d.discRate > 0 ? (+d.discRate).toFixed(1) + '%' : '—'}</td>
                    <td class="si-dtd si-dtd-num ${dDiscCell ? 'si-disc-num' : ''}">${dDiscCell ? siFmt(d.discValue) : '—'}</td>
                    <td class="si-dtd si-dtd-num si-dcol-net si-bold-val">${siFmt(d.net)}</td>
                    <td class="si-dtd si-dtd-num si-vat-num">${siFmt(d.vatValue)}</td>
                    <td class="si-dtd si-dtd-num si-dcol-tot si-bold-val">${siFmt(d.lineTotal)}</td>
                    <td class="si-dtd si-det-branch">${siEsc(d.branch)}</td>
                  </tr>`;
                }).join('')}
              </tbody>
              <tfoot><tr>
                <td class="si-dtd si-det-foot" colspan="5">إجمالي الفاتورة — ${inv.details.length} بند</td>
                <td class="si-dtd si-dtd-num si-disc-num">${inv.disc > 0.01 ? siFmt(inv.disc) : '—'}</td>
                <td class="si-dtd si-dtd-num si-dcol-net si-bold-val">${siFmt(inv.net)}</td>
                <td class="si-dtd si-dtd-num si-vat-num">${siFmt(inv.vat)}</td>
                <td class="si-dtd si-dtd-num si-dcol-tot si-bold-val">${siFmt(inv.total)}</td>
                <td class="si-dtd"></td>
              </tr></tfoot>
            </table>
          </div>
        </td>
      </tr>`;
    }
  });

  // Grand total row
  html += `<tr class="si-total-row">
    <td colspan="7" class="si-td-txt">الإجمالي — ${invoices.length} فاتورة</td>
    <td class="si-td-num">${siFmt(tot.gross)}</td>
    <td class="si-td-num si-disc-num">${siFmt(tot.disc)}</td>
    <td class="si-td-num si-col-net si-bold-val">${siFmt(tot.net)}</td>
    <td class="si-td-num si-vat-num">${siFmt(tot.vat)}</td>
    <td class="si-td-num si-col-total si-bold-val">${siFmt(tot.total)}</td>
  </tr>`;

  html += '</tbody></table>';
  wrap.innerHTML = html;

  // Wire expand buttons
  wrap.querySelectorAll('.si-exp-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const invId  = btn.dataset.inv;
      const detRow = document.getElementById('si-det-' + invId);
      if (!detRow) return;
      const open = detRow.style.display !== 'none';
      detRow.style.display = open ? 'none' : 'table-row';
      btn.textContent = open ? '▶' : '▼';
      btn.classList.toggle('si-exp-open', !open);
    });
  });
}

/* ── Countdown ── */
function _siStartCountdown(count, net) {
  _siStopTimer();
  _siCountdown = SI_REFRESH_SEC;
  const fmM = v => ((+v || 0) / 1e6).toFixed(2) + ' م';
  const tick = () => {
    const el = document.getElementById('si-status');
    if (!el) return;
    const netTxt = net > 0 ? ` | ${fmM(net)} ر.س` : '';
    if (_siCountdown > 0) {
      el.textContent = `✅ ${count} فاتورة${netTxt} | ${new Date().toLocaleTimeString('ar-SA')} · تحديث بعد ${_siCountdown}ث`;
      el.style.color = '#1a7a3c';
    } else {
      el.textContent = '⏳ جارٍ إعادة التحميل…';
      el.style.color = '#8a7a3c';
    }
  };
  tick();
  _siTimer = setInterval(() => {
    if (!_siIsActive()) { _siStopTimer(); return; }
    _siCountdown = Math.max(0, _siCountdown - 1);
    tick();
    if (_siCountdown === 0) { _siStopTimer(); _siLoad(); }
  }, 1000);
}

/* ── Excel export ── */
async function siExportExcel() {
  if (!_siData) return;
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل، جرّب تحديث الصفحة'); return; }

  const invoices = _siFiltered(_siData);
  const from  = document.getElementById('si-from')?.value  || _siData.from;
  const to    = document.getElementById('si-to')?.value    || _siData.to;
  const dbLbl = _siDb === 'MekSoftDb1' ? 'أبعاد الحديد' : 'وسام الفولاذ';
  const genDate = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });

  const FONT  = 'Calibri';
  const numFmt = '#,##0.00';
  const CLR = { navy: 'FF0D1F3C', gold: 'FFC9A84C', hdr: 'FF0a1828', white: 'FFFFFFFF', light: 'FFa0b8d0', blue: 'FF152d56' };
  const solid = a => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: a } });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MekSoft ERP Dashboard'; wb.created = new Date();

  // ── Sheet 1: Invoice list ──────────────────────────────────────────────────
  const ws = wb.addWorksheet('قائمة الفواتير', { views: [{ rightToLeft: true }] });
  ws.columns = [
    { width: 6 }, { width: 18 }, { width: 14 }, { width: 32 }, { width: 20 },
    { width: 12 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 },
  ];

  const addTitle = (text, sz, fg, bg, cols) => {
    const r = ws.addRow([text]); r.height = sz > 11 ? 28 : 20;
    ws.mergeCells(r.number, 1, r.number, cols || 11);
    const c = r.getCell(1);
    c.font = { name: FONT, size: sz, bold: true, color: { argb: fg } };
    c.fill = solid(bg); c.alignment = { horizontal: 'center', vertical: 'middle' };
  };

  addTitle(dbLbl, 13, CLR.gold, CLR.navy);
  addTitle(`فواتير المبيعات — من ${from} إلى ${to}`, 11, CLR.white, CLR.blue);
  addTitle(`${invoices.length} فاتورة   |   أُنشئ: ${genDate}`, 9, CLR.light, CLR.navy);
  ws.addRow([]);

  const hRow = ws.addRow(['#', 'رقم الفاتورة', 'التاريخ', 'العميل', 'البائع', 'نوع السداد', 'قبل الخصم', 'الخصم', 'قبل الضريبة', 'الضريبة', 'بعد الضريبة']);
  hRow.height = 20;
  hRow.eachCell(c => {
    c.font = { name: FONT, size: 10, bold: true, color: { argb: CLR.white } };
    c.fill = solid(CLR.hdr);
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  let rowNum = 1;
  for (const inv of invoices) {
    const r = ws.addRow([rowNum++, inv.manualId, inv.date, inv.customer, inv.salesman, inv.payLabel, inv.gross, inv.disc, inv.net, inv.vat, inv.total]);
    r.height = 16;
    r.eachCell((c, ci) => {
      c.fill = solid(rowNum % 2 === 0 ? 'FF0d1b2a' : 'FF0a1828');
      c.font = { name: FONT, size: 9.5, color: { argb: 'FFb0c8e0' } };
      c.border = { bottom: { style: 'hair', color: { argb: 'FF1e3a5f' } } };
      if (ci >= 7) { c.numFmt = numFmt; c.alignment = { horizontal: 'left' }; }
      else c.alignment = { horizontal: ci <= 2 ? 'center' : 'right' };
    });
    r.getCell(4).font  = { name: FONT, size: 9.5, bold: true, color: { argb: 'FFc8d8e8' } };
    r.getCell(9).font  = { name: FONT, size: 9.5, bold: true, color: { argb: 'FF4ada8e' } };
    r.getCell(11).font = { name: FONT, size: 9.5, bold: true, color: { argb: 'FFC9A84C' } };
  }

  // Total
  const totRow = ws.addRow(['', 'الإجمالي', '', '', '', '',
    invoices.reduce((s, i) => s + i.gross, 0),
    invoices.reduce((s, i) => s + i.disc,  0),
    invoices.reduce((s, i) => s + i.net,   0),
    invoices.reduce((s, i) => s + i.vat,   0),
    invoices.reduce((s, i) => s + i.total, 0),
  ]);
  totRow.height = 20;
  totRow.eachCell((c, ci) => {
    c.fill = solid(CLR.navy);
    c.font = { name: FONT, size: 10, bold: true, color: { argb: ci >= 7 ? 'FFC9A84C' : CLR.gold } };
    c.border = { top: { style: 'double', color: { argb: CLR.gold } } };
    if (ci >= 7) { c.numFmt = numFmt; c.alignment = { horizontal: 'left' }; }
    else c.alignment = { horizontal: 'right' };
  });

  // ── Sheet 2: Line items ────────────────────────────────────────────────────
  const ws2 = wb.addWorksheet('تفاصيل البنود', { views: [{ rightToLeft: true }] });
  ws2.columns = [
    { width: 14 }, { width: 36 }, { width: 14 }, { width: 20 }, { width: 8 },
    { width: 12 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 20 },
  ];

  const addTitle2 = (text, sz, fg, bg) => {
    const r = ws2.addRow([text]); r.height = sz > 11 ? 28 : 20;
    ws2.mergeCells(r.number, 1, r.number, 11);
    const c = r.getCell(1);
    c.font = { name: FONT, size: sz, bold: true, color: { argb: fg } };
    c.fill = solid(bg); c.alignment = { horizontal: 'center', vertical: 'middle' };
  };

  addTitle2(dbLbl, 13, CLR.gold, CLR.navy);
  addTitle2(`تفاصيل بنود الفواتير — من ${from} إلى ${to}`, 11, CLR.white, CLR.blue);
  addTitle2(genDate, 9, CLR.light, CLR.navy);
  ws2.addRow([]);

  const h2Row = ws2.addRow(['رقم الفاتورة', 'الصنف', 'التاريخ', 'العميل', 'الكمية', 'الوحدة', 'سعر الوحدة', 'خصم%', 'قبل الضريبة', 'الضريبة', 'إجمالي البند']);
  h2Row.height = 20;
  h2Row.eachCell(c => {
    c.font = { name: FONT, size: 10, bold: true, color: { argb: CLR.white } };
    c.fill = solid(CLR.hdr);
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  let d2Num = 1;
  for (const inv of invoices) {
    for (const d of inv.details) {
      const r2 = ws2.addRow([inv.manualId, d.itemName, inv.date, inv.customer, d.qty, d.unit, d.unitPrice, d.discRate || null, d.net, d.vatValue, d.lineTotal]);
      r2.height = 15;
      r2.eachCell((c, ci) => {
        c.fill = solid(d2Num % 2 === 0 ? 'FF0d1b2a' : 'FF0a1828');
        c.font = { name: FONT, size: 9, color: { argb: 'FFb0c8e0' } };
        c.border = { bottom: { style: 'hair', color: { argb: 'FF1e3a5f' } } };
        if (ci >= 5 && ci !== 6) { c.alignment = { horizontal: 'left' }; }
        if ([5, 7, 9, 10, 11].includes(ci)) c.numFmt = numFmt;
        if (ci === 8) c.numFmt = '0.0"%"';
      });
      r2.getCell(2).font = { name: FONT, size: 9, bold: true, color: { argb: 'FFc8d8e8' } };
      d2Num++;
    }
  }

  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `فواتير_المبيعات_${_siDb}_${from}_${to}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}

/* ── CSS injection ── */
function _injectSICSS() {
  if (document.getElementById('si-css')) return;
  const s = document.createElement('style'); s.id = 'si-css';
  s.textContent = `
    #tab-sales-inv { padding: 0 }

    /* Header */
    .si-header { background: linear-gradient(135deg, #0D1F3C, #152d56);
      padding: 12px 20px; display: flex; align-items: center;
      justify-content: space-between; border-bottom: 2px solid #C9A84C; flex-wrap: wrap; gap: 8px }
    .si-title  { font-size: 1rem; font-weight: 800; color: #C9A84C }
    .si-sub    { font-size: .72rem; color: #a0b8d8; margin-top: 2px }
    .si-status-bar { font-size: .78rem; color: #a0c4e8; white-space: nowrap }

    /* Filter bar */
    .si-bar { background: #0f2035; border-bottom: 1px solid #1e3a5f;
      padding: 8px 16px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap }
    .si-lbl  { font-size: .78rem; color: #7090b0; white-space: nowrap }
    .si-date-group { display: flex; align-items: center; gap: 6px }
    .si-inp-date { background: #0a1828; border: 1px solid #1e3a5f; color: #c8d8e8;
      border-radius: 5px; padding: 4px 8px; font-family: inherit; font-size: .8rem }
    .si-inp-date:focus { outline: none; border-color: #3a7abf }
    .si-inp-search { background: #0a1828; border: 1px solid #1e3a5f; color: #c8d8e8;
      border-radius: 5px; padding: 4px 10px; font-family: inherit; font-size: .8rem; min-width: 160px }
    .si-inp-search:focus { outline: none; border-color: #3a7abf }
    .si-sel { background: #0a1828; border: 1px solid #1e3a5f; color: #c8d8e8;
      border-radius: 5px; padding: 4px 8px; font-family: inherit; font-size: .8rem }
    .si-sel:focus { outline: none; border-color: #3a7abf }
    .si-presets { display: flex; gap: 3px }
    .si-preset-btn { padding: 3px 10px; border-radius: 4px; border: 1px solid #1e3a5f;
      background: #0a1828; color: #7090b0; font-family: inherit; font-size: .75rem; cursor: pointer }
    .si-preset-btn.active, .si-preset-btn:hover { background: #1e3a5f; color: #c8d8e8 }
    .si-db-group { display: flex; gap: 2px }
    .si-db-btn { padding: 4px 13px; border-radius: 5px; border: 1px solid #1e3a5f;
      background: #0a1828; color: #7090b0; font-family: inherit; font-size: .8rem; cursor: pointer }
    .si-db-btn.active { background: #C9A84C; color: #0D1F3C; font-weight: 700; border-color: #C9A84C }
    .si-db-btn:hover:not(.active) { color: #c8d8e8 }
    .si-btn { padding: 5px 13px; border-radius: 5px; border: none; font-family: inherit;
      font-size: .8rem; font-weight: 600; cursor: pointer; white-space: nowrap }
    .si-btn-blue  { background: #2B388F; color: #fff }
    .si-btn-blue:hover { background: #1f2d72 }
    .si-btn-excel { background: #0a3a1a; color: #80e0a0; border: 1px solid #1a5a2a }
    .si-btn-excel:hover { background: #0d4a20 }

    /* KPI cards */
    .si-kpis { display: flex; gap: 0; background: #0a1620;
      border-bottom: 1px solid #1e3a5f; flex-wrap: wrap }
    .si-kpi { flex: 1; min-width: 120px; padding: 10px 14px;
      border-left: 1px solid #1e3a5f; text-align: center; position: relative }
    .si-kpi::before { content: ''; position: absolute; top: 0; right: 0; width: 3px; height: 100%;
      background: var(--si-ac, #3a7abf) }
    .si-kpi-lbl  { font-size: .68rem; color: #6a8aa0; margin-bottom: 4px }
    .si-kpi-val  { font-size: .95rem; font-weight: 800; color: #e0f0ff; direction: ltr }
    .si-kpi-unit { font-size: .65rem; color: #5a7a9a; margin-top: 1px }
    .si-kpi-sub  { font-size: .62rem; color: #5a7a9a; margin-top: 2px }

    /* Charts */
    .si-charts-row { display: flex; gap: 12px; padding: 12px 16px;
      background: #0d1b2a; border-bottom: 1px solid #1e3a5f; flex-wrap: wrap }
    .si-chart-card { flex: 1; min-width: 280px; background: #0a1828;
      border: 1px solid #1e3a5f; border-radius: 8px; padding: 10px; position: relative; height: 210px }
    .si-chart-day-wrap { padding: 10px 16px; background: #0d1b2a;
      border-bottom: 1px solid #1e3a5f; position: relative; height: 170px }

    /* Top customers */
    .si-top-custs { padding: 10px 16px; background: #0a1620;
      border-bottom: 1px solid #1e3a5f }
    .si-top-header { font-size: .75rem; font-weight: 700; color: #C9A84C; margin-bottom: 6px }
    .si-top-list { display: flex; flex-direction: column; gap: 4px }
    .si-top-row { display: flex; align-items: center; gap: 8px; font-size: .75rem }
    .si-top-rank { width: 18px; color: #5a7a9a; flex-shrink: 0; text-align: center }
    .si-top-name { width: 200px; flex-shrink: 0; color: #b0c8e0; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis }
    .si-top-bar-wrap { flex: 1; height: 5px; background: #1a2a3a; border-radius: 3px; overflow: hidden }
    .si-top-bar { height: 100%; background: #2B388F; border-radius: 3px }
    .si-top-val { width: 130px; text-align: left; color: #5baef0; font-weight: 600;
      direction: ltr; font-size: .72rem }
    .si-top-cnt { color: #5a7a9a; font-weight: 400; font-size: .68rem }

    /* Table wrapper */
    .si-tbl-wrap { overflow-x: auto; padding: 0 16px 24px; background: #0d1b2a }
    .si-tbl { width: 100%; border-collapse: collapse; font-size: .77rem; min-width: 1050px }
    .si-tbl thead { position: sticky; top: 0; z-index: 3 }

    /* Table header cells */
    .si-th-exp, .si-th-seq, .si-th-txt, .si-th-cust, .si-th-num {
      background: #0a1e38; color: #7090b0; padding: 7px 8px;
      white-space: nowrap; border-bottom: 1px solid #1e3a5f; font-weight: 500 }
    .si-th-exp  { width: 28px; text-align: center }
    .si-th-seq  { width: 34px; text-align: center }
    .si-th-txt  { text-align: right }
    .si-th-cust { text-align: right; min-width: 160px }
    .si-th-num  { text-align: left; min-width: 88px }
    .si-col-net   { color: #4ada8e !important }
    .si-col-total { color: #C9A84C !important }

    /* Table data cells */
    .si-inv-row { transition: background .1s }
    .si-row-alt td { background: #0a1828 }
    .si-inv-row:hover td { background: #0a2030 !important }
    .si-td-exp, .si-td-seq { text-align: center; padding: 5px 6px; border-bottom: 1px solid #0e2540 }
    .si-td-txt, .si-td-cust { text-align: right; padding: 5px 8px; border-bottom: 1px solid #0e2540; color: #b0c8e0 }
    .si-td-cust { max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #c8d8e8 }
    .si-td-num  { text-align: left; padding: 5px 8px; border-bottom: 1px solid #0e2540;
      color: #c0d8f0; direction: ltr; font-variant-numeric: tabular-nums; white-space: nowrap }
    .si-manual-id { font-weight: 600; color: #7ab0d8 }
    .si-date-cell { color: #7090b0; font-size: .73rem }
    .si-sm-cell   { color: #90a8c0; font-size: .75rem }
    .si-bold-val  { font-weight: 700; color: #e0f0ff !important }
    .si-disc-num  { color: #f5a623 !important }
    .si-vat-num   { color: #7090b0 }
    .si-zero-val  { color: #3a5a7a !important }
    .si-pct-badge { font-size: .65rem; color: #c9a800; background: rgba(200,160,0,.1);
      padding: 0 3px; border-radius: 3px; margin-right: 3px }
    .si-no-det { color: #2a4a6a; font-size: .7rem }

    /* Payment badge */
    .si-pay-badge { display: inline-block; padding: 2px 7px; border-radius: 10px;
      font-size: .68rem; font-weight: 600 }
    .si-pay-cash   { background: #0d3a1a; color: #4ada8e }
    .si-pay-credit { background: #1a2a5a; color: #7ab0f0 }
    .si-pay-atm    { background: #2a1a4a; color: #c080e0 }
    .si-pay-bank   { background: #3a2a0a; color: #e0c060 }
    .si-pay-other  { background: #2a2a2a; color: #909090 }

    /* Expand button */
    .si-exp-btn { background: #0a2030; border: 1px solid #1e3a5f; color: #5a8ab0;
      border-radius: 4px; padding: 2px 6px; font-size: .7rem; cursor: pointer;
      transition: all .15s; font-family: inherit }
    .si-exp-btn:hover, .si-exp-btn.si-exp-open { background: #1e3a5f; color: #C9A84C }

    /* Detail row */
    .si-detail-tr { background: #070f1a }
    .si-det-td   { padding: 0 }
    .si-det-inner { padding: 8px 12px 12px 24px; background: #070f1a;
      border-bottom: 2px solid #C9A84C }
    .si-det-tbl { width: 100%; border-collapse: collapse; font-size: .73rem }
    .si-dth { background: #0c1f35; color: #5a7a9a; padding: 5px 8px; font-weight: 500;
      white-space: nowrap; border-bottom: 1px solid #1e3a5f; text-align: right }
    .si-dth-num { text-align: left; min-width: 80px }
    .si-dcol-net { color: #4ada8e !important }
    .si-dcol-tot { color: #C9A84C !important }
    .si-dtd { padding: 4px 8px; border-bottom: 1px solid #0c1f35; color: #90a8c0 }
    .si-dtd-num { text-align: left; direction: ltr; font-variant-numeric: tabular-nums; color: #b0c8e0 }
    .si-det-item { color: #c8d8e8; font-weight: 600 }
    .si-det-code { font-size: .65rem; color: #5a7a9a; font-weight: 400 }
    .si-det-unit { color: #7090b0; font-size: .72rem }
    .si-det-branch { color: #5a7a9a; font-size: .7rem }
    .si-det-foot { color: #7090b0; font-style: italic; font-size: .7rem }
    .si-det-tbl tfoot td { background: #0a1828; border-top: 1px solid #1e3a5f }
    .si-det-tbl tr:hover td { background: #0a1828 }

    /* Total row */
    .si-total-row td { background: #0D1F3C !important; font-weight: 800; color: #fff !important;
      border-top: 2px solid #C9A84C; padding: 7px 8px; border-bottom: none }
    .si-total-row .si-td-num { direction: ltr }

    /* Empty / loading */
    .si-loading, .si-empty { text-align: center; padding: 60px 20px; color: #5a7a9a; font-size: .88rem }
  `;
  document.head.appendChild(s);
}
