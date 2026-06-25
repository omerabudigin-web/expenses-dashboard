// ── Consolidated Dashboard (أبعاد + وسام) ────────────────────────────────────
const CONS_DBS = ['MekSoftDb1', 'MekSoftDb2'];

let _consTimer     = null;
let _consCountdown = 0;
const CONS_REFRESH_SEC = 60;
function _consIsActive()  { return !!document.querySelector('.tab.active[data-tab="consolidated"]'); }
function _consStopTimer() { if (_consTimer) { clearInterval(_consTimer); _consTimer = null; } }

let _consCfTimer     = null;
let _consCfCountdown = 0;
function _consCfIsActive()  { return !!document.querySelector('.tab.active[data-tab="cons-cf"]'); }
function _consCfStopTimer() { if (_consCfTimer) { clearInterval(_consCfTimer); _consCfTimer = null; } }
function _consCfStartCountdown(operatingCF, months) {
  _consCfStopTimer();
  _consCfCountdown = CONS_REFRESH_SEC;
  const el   = document.getElementById('cons-cf-status');
  const fmM  = v => ((+v||0)/1e6).toFixed(2) + ' م';
  const tick = () => {
    if (!el) return;
    const opTxt = operatingCF != null ? ` | تشغيلي: ${fmM(operatingCF)}` : '';
    const moTxt = months ? ` | ${months} شهر` : '';
    if (_consCfCountdown > 0) {
      el.textContent = `✅${moTxt}${opTxt} | ${new Date().toLocaleTimeString('ar-SA')} · تحديث بعد ${_consCfCountdown}ث`;
      el.style.color = '#1a7a3c';
    } else {
      el.textContent = `⏳ جارٍ إعادة التحميل...`;
      el.style.color = '#8a7a3c';
    }
  };
  tick();
  _consCfTimer = setInterval(() => {
    if (!_consCfIsActive()) { _consCfStopTimer(); return; }
    _consCfCountdown = Math.max(0, _consCfCountdown - 1);
    tick();
    if (_consCfCountdown === 0) {
      _consCfStopTimer();
      State.set('consolidated', null);
      renderConsCF();
    }
  }, 1000);
}
function _consStartCountdown(companies, revenue, netProfit) {
  _consStopTimer();
  _consCountdown = CONS_REFRESH_SEC;
  const el        = document.getElementById('cons-status');
  const fmM       = v => ((+v||0)/1e6).toFixed(2) + ' م';
  const namesStr  = (companies || []).map(c => c.name || c.db).join(' + ');
  const tick = () => {
    if (!el) return;
    const revTxt = revenue  != null ? ` | إيراد: ${fmM(revenue)}`   : '';
    const npTxt  = netProfit != null ? ` | صافي: ${fmM(netProfit)}` : '';
    if (_consCountdown > 0) {
      el.textContent = `✅ ${namesStr}${revTxt}${npTxt} | ${new Date().toLocaleTimeString('ar-SA')} · تحديث بعد ${_consCountdown}ث`;
      el.style.color = '#1a7a3c';
    } else {
      el.textContent = `⏳ جارٍ إعادة التحميل...`;
      el.style.color = '#8a7a3c';
    }
  };
  tick();
  _consTimer = setInterval(() => {
    if (!_consIsActive()) { _consStopTimer(); return; }
    _consCountdown = Math.max(0, _consCountdown - 1);
    tick();
    if (_consCountdown === 0) {
      _consStopTimer();
      State.set('consolidated', null);
      State.set('consFrom', null);
      State.set('consTo', null);
      renderConsolidatedTab();
    }
  }, 1000);
}

function _bsTotals(bsRows, month) {
  const latest  = month ? bsRows.filter(r => r.month === month) : [];
  const c3      = r => r.code3 || r.grpCode.slice(0, 3);
  const A       = latest.filter(r => r.grpCode.startsWith('1')).reduce((s, r) => s + r.balance, 0);
  const CA      = latest.filter(r => c3(r) === '103').reduce((s, r) => s + r.balance, 0);
  const NCA     = A - CA;
  const Inv     = latest.filter(r => r.grpCode === '10302').reduce((s, r) => s + r.balance, 0);
  const L       = latest.filter(r => r.grpCode.startsWith('2')).reduce((s, r) => s - r.balance, 0);
  const CL      = latest.filter(r => c3(r) === '201').reduce((s, r) => s - r.balance, 0);
  const NCL     = L - CL;
  const E_hist  = latest.filter(r => r.grpCode.startsWith('3')).reduce((s, r) => s - r.balance, 0);
  return { A, CA, NCA, Inv, L, CL, NCL, E: A - L, E_hist };
}

function renderConsolidatedTab() {
  const heroEl   = document.getElementById('cons-hero');
  const badgesEl = document.getElementById('cons-badges');
  const data     = State.get('consolidated');

  if (!data) {
    if (heroEl) heroEl.innerHTML = '<div style="color:#5a7a9a;padding:36px;text-align:center;grid-column:1/-1">جارٍ تحميل البيانات المجمعة…</div>';
    API.fetchConsolidated(CONS_DBS).then(result => {
      if (result) {
        State.set('consolidated', result);
        const active = document.querySelector('.tab.active');
        if (active && active.dataset.tab === 'consolidated') renderConsolidatedTab();
      } else {
        if (heroEl) heroEl.innerHTML = '<div style="color:#da4a4a;padding:36px;text-align:center;grid-column:1/-1">فشل تحميل البيانات — تحقق من الاتصال</div>';
      }
    });
    return;
  }

  const { companies, pl, bs, byDb } = data;

  // ── Unified period filter ─────────────────────────────────────────────────
  const allMths = [...new Set([...pl.map(r => r.month), ...bs.map(r => r.month)])].sort();
  const fromSel = document.getElementById('cons-period-from');
  const toSel   = document.getElementById('cons-period-to');
  if (fromSel && allMths.length) {
    const cur  = State.get('consFrom');
    const keep = (cur && allMths.includes(cur)) ? cur : allMths[0];
    fromSel.innerHTML = allMths.map(m => `<option value="${m}"${m===keep?' selected':''}>${m}</option>`).join('');
  }
  if (toSel && allMths.length) {
    const cur  = State.get('consTo');
    const keep = (cur && allMths.includes(cur)) ? cur : allMths[allMths.length-1];
    toSel.innerHTML = allMths.map(m => `<option value="${m}"${m===keep?' selected':''}>${m}</option>`).join('');
  }
  const selFrom = (fromSel?.value && allMths.includes(fromSel.value)) ? fromSel.value : (allMths[0] || null);
  const selTo   = (toSel?.value   && allMths.includes(toSel.value))   ? toSel.value   : (allMths[allMths.length-1] || null);
  const inRange = m => (!selFrom || m >= selFrom) && (!selTo || m <= selTo);

  // Update P&L range label
  const plRangeLabel = document.getElementById('cons-pl-range-label');
  if (plRangeLabel && selFrom && selTo) plRangeLabel.textContent = `${selFrom} — ${selTo}`;

  // Company badges
  const elim = data.elimination || { applied: false };

  if (badgesEl) {
    const elimBadge = elim.applied
      ? `<span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:.75rem;font-weight:600;background:#0d2a10;border:1px solid #1a5a20;color:#4ada8e;margin-left:8px">✓ تم استبعاد المعاملات البينية</span>`
      : `<span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:.75rem;font-weight:600;background:#2a1a0a;border:1px solid #5a3a10;color:#da9a4a;margin-left:8px">⚠ بدون استبعاد بيني</span>`;
    badgesEl.innerHTML =
      companies.map(c => `<span style="display:inline-block;padding:4px 14px;border-radius:20px;font-size:.78rem;font-weight:600;background:#0a2848;border:1px solid #1e5080;color:#7ac8f0;margin-left:8px">${c.name || c.db}</span>`).join('') +
      elimBadge +
      `<span style="color:#5a7a9a;font-size:.73rem;margin-right:4px">— منذ ${pl[0]?.month || ''}</span>`;
  }

  // Aggregates — filtered by selected P&L period
  const plFilt = pl.filter(r => inRange(r.month));
  const c      = aggregatePL(plFilt);
  const perDb  = byDb.map(d => ({ ...d, agg: aggregatePL(d.pl.filter(r => inRange(r.month))) }));


  // BS period: use the "to" month from the unified filter
  const bsMths  = [...new Set(bs.map(r => r.month))].sort();
  const selBsMo = (selTo && bsMths.includes(selTo)) ? selTo : (bsMths[bsMths.length-1] || null);
  const bsAsofLabel = document.getElementById('cons-bs-asof-label');
  if (bsAsofLabel) bsAsofLabel.textContent = selBsMo ? `كما في ${selBsMo}` : '';
  const { A: totalA, CA: totalCA, NCA: totalNCA, Inv: totalInv,
          L: totalL, CL: totalCL, NCL: totalNCL,
          E: totalE, E_hist: totalE_hist } = _bsTotals(bs, selBsMo);

  const grossMargin = c.revenue > 0 ? c.grossProfit / c.revenue * 100 : null;
  const netMargin   = c.revenue > 0 ? c.netProfit   / c.revenue * 100 : null;
  const nmCol       = netMargin === null ? '#5a7a9a' : netMargin >= 5 ? '#4ada8e' : netMargin >= 1 ? '#da9a4a' : '#da4a4a';
  const gmCol       = grossMargin === null ? '#5a7a9a' : grossMargin >= 15 ? '#4ada8e' : '#da9a4a';

  // ── Hero KPIs ──
  if (heroEl) heroEl.innerHTML = [
    { lbl:'إجمالي الإيراد (مجمع)',      val:fmt(c.revenue)+' ر.س',                                          sub:(selFrom&&selTo&&selFrom!==selTo)?selFrom+' — '+selTo:selFrom||selTo||'',accent:'#5baef0' },
    { lbl:'هامش الربح الإجمالي',        val:grossMargin!==null?grossMargin.toFixed(1)+'%':'—',              sub:fmtPlNum(c.grossProfit)+' ر.س',                           accent:gmCol },
    { lbl:'صافي الربح',                 val:netMargin!==null?netMargin.toFixed(2)+'%':'—',                  sub:fmtPlNum(c.netProfit)+' ر.س',                             accent:nmCol },
    { lbl:'إجمالي الأصول (مجمع)',       val:fmt(totalA)+' ر.س',                                             sub:'كما في '+selBsMo,                                       accent:'#4a9eda' },
    { lbl:'إجمالي الالتزامات',          val:fmt(totalL)+' ر.س',                                             sub:totalA>0?(totalL/totalA*100).toFixed(1)+'% من الأصول':'—',accent:'#da9a4a' },
    { lbl:'حقوق الملكية (مجمع)',        val:fmtPlNum(totalE)+' ر.س',                                        sub:'',                                                        accent:totalE>=0?'#4ada8e':'#da4a4a' },
  ].map(k => `<div class="kpi" style="--accent:${k.accent}"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div><div class="sub">${k.sub}</div></div>`).join('');

  // ── Elimination Disclosure Card ──
  const elimEl = document.getElementById('cons-elim');
  if (elimEl) {
    if (elim.applied) {
      elimEl.innerHTML = `
        <div style="background:#061a08;border:1px solid #1a4a20;border-radius:10px;padding:16px 20px;margin-bottom:18px">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px">
            <span style="color:#4ada8e;font-size:.88rem;font-weight:600">✓ استبعاد المعاملات البينية — الأرقام أعلاه بعد الاستبعاد</span>
            <span style="color:#3a7a40;font-size:.73rem">( وفق معايير التوحيد المحاسبي )</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">
            ${[
              { lbl:'إيرادات بينية مُستبعَدة',   val:fmt(elim.totalRevenue)+' ر.س', note:'من الإيراد المجمع',   col:'#da9a4a' },
              { lbl:'تكلفة بينية مُستبعَدة',      val:fmt(elim.totalCOGS)+' ر.س',   note:'من COGS المجمع',      col:'#da9a4a' },
              { lbl:'ربح بيني غير محقق',          val:fmt(elim.grossProfit)+' ر.س', note:'صافي الاستبعاد',      col:elim.grossProfit>0?'#da4a4a':'#4ada8e' },
              { lbl:'ذمم بينية مُستبعَدة (AR)',    val:fmt(elim.latestARElim)+' ر.س',note:'مدينون بيني من الأصول',col:'#da9a4a' },
              { lbl:'ذمم بينية مُستبعَدة (AP)',    val:fmt(elim.latestAPElim)+' ر.س',note:'دائنون بيني من الخصوم',col:'#da9a4a' },
              { lbl:'فارق التسوية البيني الصافي', val:fmt(elim.netGap||0)+' ر.س',  note:'صافي AR − AP بين الشركتين', col:(elim.netGap||0)<1000?'#4ada8e':'#da9a4a' },
            ].map(x => `
              <div style="background:#081e0a;border-radius:6px;padding:10px 14px;border-right:3px solid ${x.col}">
                <div style="font-size:.72rem;color:#6a9a70;margin-bottom:3px">${x.lbl}</div>
                <div style="font-size:.92rem;font-weight:700;color:${x.col};font-variant-numeric:tabular-nums">${x.val}</div>
                <div style="font-size:.68rem;color:#3a6040;margin-top:2px">${x.note}</div>
              </div>`).join('')}
          </div>
          <div style="margin-top:10px;font-size:.70rem;color:#3a6040;line-height:1.7">
            * المعاملات البينية: مبيعات أبعاد لوسام + مبيعات وسام لأبعاد — تم استبعادها من الإيراد وتكلفة البضاعة.
            أرصدة الذمم البينية (عميل + مورد لكل طرف) استُبعدت من المركز المالي. فارق التسوية الصافي = الفرق بين صافي مركز كل شركة تجاه الأخرى.
          </div>
        </div>`;
    } else {
      elimEl.innerHTML = `<div style="background:#1a0e04;border:1px solid #4a3010;border-radius:8px;padding:12px 16px;margin-bottom:18px;color:#da9a4a;font-size:.80rem">
        ⚠ لم يتم استبعاد المعاملات البينية — الأرقام تشمل مبيعات/مشتريات بين الشركتين
      </div>`;
    }
  }

  // ── P&L Comparison ──
  const plEl = document.getElementById('cons-pl');
  if (plEl) {
    const shortName = s => (s || '').replace('مؤسسة ','').replace('مصنع ','');
    const PL_ROWS = [
      { lbl:'الإيراد',                       key:'revenue',    type:'rev' },
      { lbl:'(-) تكلفة البضاعة المباعة',    key:'cogs',       type:'cost' },
      { lbl:'مجمل الربح',                    key:'grossProfit',type:'subtotal' },
      { lbl:null },
      { lbl:'رواتب وأجور',                   key:'sal',        type:'opex', indent:true },
      { lbl:'إيجار',                         key:'rent',       type:'opex', indent:true },
      { lbl:'صيانة وتشغيل',                 key:'maint',      type:'opex', indent:true },
      { lbl:'مبيعات وتسويق',                key:'sell',       type:'opex', indent:true },
      { lbl:'توزيع ونقل',                   key:'dist',       type:'opex', indent:true },
      { lbl:'مصروفات إدارية',               key:'adm',        type:'opex', indent:true },
      { lbl:'فوائد بنكية',                  key:'fin',        type:'opex', indent:true },
      { lbl:'مصروفات خيرية',               key:'char',       type:'opex', indent:true },
      { lbl:'مصروفات أخرى',                key:'oth',        type:'opex', indent:true },
      { lbl:'(-) إجمالي المصروفات التشغيلية', key:'totalOpex', type:'subtotal' },
      { lbl:'صافي الربح',                   key:'netProfit',  type:'total' },
    ];
    const gv = (agg, key) => {
      if (!key) return 0;
      if (key === 'cogs') return agg.totalCost;
      if (key in agg) return agg[key];
      return 0;
    };
    const fv = (v, type) => {
      if (v === 0) return '<span style="color:#3a5a7a">—</span>';
      if (type === 'cost' || type === 'opex') return `(${fmt(v)})`;
      if (type === 'subtotal' || type === 'total') return `<strong>${fmtPlNum(v)}</strong>`;
      return fmt(v);
    };
    const colOf = (v, type) => type === 'total' ? (v >= 0 ? '#4ada8e' : '#da4a4a') : type === 'subtotal' ? '#c8e0f0' : '#b0c8e0';
    const cols  = perDb.length + 1;

    plEl.innerHTML = `<div class="tbl-wrap"><table style="width:100%;border-collapse:collapse;font-size:.78rem">
      <thead><tr>
        <th style="text-align:right;padding:8px 10px;color:#7090b0;font-weight:500;border-bottom:1px solid #1e3a5f;background:#081828">البند</th>
        ${perDb.map(d => `<th style="text-align:left;padding:8px 10px;color:#7ac8f0;font-variant-numeric:tabular-nums;border-bottom:1px solid #1e3a5f;background:#081828;white-space:nowrap">${shortName(d.name)}</th>`).join('')}
        <th style="text-align:left;padding:8px 10px;color:#5baef0;font-weight:700;border-bottom:1px solid #1e3a5f;background:#081828;white-space:nowrap">المجمع</th>
      </tr></thead>
      <tbody>
        ${PL_ROWS.map(row => {
          if (!row.lbl) return `<tr><td colspan="${cols+1}" style="padding:3px 10px;color:#3a5a7a;font-size:.68rem;border-bottom:1px solid #0e2540">المصروفات التشغيلية</td></tr>`;
          const conVal  = gv(c, row.key);
          const rowBg   = row.type === 'subtotal' ? 'background:#081828' : row.type === 'total' ? 'background:#0a1e34;border-top:2px solid #2a5080' : '';
          const tdStyle = `padding:7px 10px;border-bottom:1px solid #0e2540;${rowBg}`;
          return `<tr>
            <td style="${tdStyle};color:#8ab0cc;${row.indent?'padding-right:22px':''}">${row.lbl}</td>
            ${perDb.map(d => {
              const v = gv(d.agg, row.key);
              return `<td style="${tdStyle};text-align:left;font-variant-numeric:tabular-nums;color:${colOf(v,row.type)}">${fv(v, row.type)}</td>`;
            }).join('')}
            <td style="${tdStyle};text-align:left;font-variant-numeric:tabular-nums;color:${colOf(conVal,row.type)}">${fv(conVal, row.type)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
  }

  // ── P&L NP from monitoring-start up to selBsMo (for BS equity reconciliation) ──
  // getBSMonthly has NO date filter (cumulative from inception), while getPLMonthly starts
  // from DATA_START_DATE. We split derivedNP into "prior period" + "current monitoring NP"
  // so the BS equity section shows a figure that matches the P&L.
  const plUpToSelBsMo  = pl.filter(r => !selBsMo || r.month <= selBsMo);
  const cUpTo          = aggregatePL(plUpToSelBsMo);
  const monitoringNP   = cUpTo.netProfit;
  const firstPLMonth   = plUpToSelBsMo.length ? plUpToSelBsMo[0].month : null;

  // ── Consolidated Balance Sheet ──
  const bsEl = document.getElementById('cons-bs');
  if (bsEl) {
    if (!selBsMo) {
      bsEl.innerHTML = '<div style="color:#5a7a9a;padding:20px;text-align:center">لا توجد بيانات مركز مالي</div>';
    } else {
      const bsLatest = bs.filter(r => r.month === selBsMo);
      const c3 = r => r.code3 || r.grpCode.slice(0, 3);
      const srt = arr => arr.sort((a, b) => a.grpCode.localeCompare(b.grpCode));

      // Classify assets
      const curAssets    = srt(bsLatest.filter(r => c3(r) === '103' && r.balance !== 0));
      const nonCurAssets = srt(bsLatest.filter(r => r.grpCode.startsWith('1') && c3(r) !== '103' && r.balance !== 0));
      // Classify liabilities
      const curLiab      = srt(bsLatest.filter(r => c3(r) === '201' && r.balance !== 0));
      const nonCurLiab   = srt(bsLatest.filter(r => r.grpCode.startsWith('2') && c3(r) !== '201' && r.balance !== 0));
      // Equity
      const equity       = srt(bsLatest.filter(r => r.grpCode.startsWith('3') && r.balance !== 0));

      const derivedNP = totalE - totalE_hist;
      const priorNP   = derivedNP - monitoringNP;
      const npCol     = monitoringNP >= 0 ? '#4ada8e' : '#da4a4a';
      const wcCol     = (totalCA - totalCL) >= 0 ? '#4ada8e' : '#da4a4a';
      const crVal     = totalCL > 0 ? totalCA / totalCL : null;
      const qrVal     = totalCL > 0 ? (totalCA - totalInv) / totalCL : null;
      const icNetGap  = elim.applied ? (elim.netGap || 0) : 0;
      const showICGap = elim.applied && icNetGap > 100;

      // ── helper renderers ──
      const bsRow  = (r, sign) => `
        <tr>
          <td style="padding:5px 10px 5px 26px;color:#8ab0cc;font-size:.77rem;border-bottom:1px solid #081e34">${r.grpName||r.grpCode}</td>
          <td style="text-align:left;font-variant-numeric:tabular-nums;font-size:.77rem;padding:5px 10px;border-bottom:1px solid #081e34;color:#b0c8e0">${fmt(Math.abs(r.balance * sign))} ر.س</td>
        </tr>`;
      const catHdr = lbl => `
        <tr style="background:#071420">
          <td colspan="2" style="padding:8px 12px 4px;color:#4a8ab0;font-size:.72rem;font-weight:700;letter-spacing:.03em;border-bottom:1px solid #0e2540">▸ ${lbl}</td>
        </tr>`;
      const secHdr = lbl => `
        <tr style="background:#040e1a">
          <td colspan="2" style="padding:10px 12px 5px;color:#7ac8f0;font-size:.74rem;font-weight:700;border-top:2px solid #1e3a5f;border-bottom:1px solid #1e3a5f;text-transform:uppercase;letter-spacing:.05em">${lbl}</td>
        </tr>`;
      const subTot = (lbl, v, col = '#c8e0f0', indent = true) => `
        <tr style="background:#081828">
          <td style="padding:7px 10px${indent?' 7px 20px':''};font-weight:600;color:${col};border-top:1px solid #1a3a5a;font-size:.78rem">${lbl}</td>
          <td style="text-align:left;font-variant-numeric:tabular-nums;font-weight:600;color:${col};padding:7px 10px;border-top:1px solid #1a3a5a;font-size:.78rem">${fmtPlNum(v)} ر.س</td>
        </tr>`;
      const grandTot = (lbl, v) => `
        <tr style="background:#0a1e34;border-top:2px solid #3a6a9a">
          <td style="padding:9px 12px;font-weight:700;color:#e0f0ff;font-size:.82rem">${lbl}</td>
          <td style="text-align:left;font-variant-numeric:tabular-nums;font-weight:700;color:#e0f0ff;padding:9px 12px;font-size:.82rem">${fmt(v)} ر.س</td>
        </tr>`;

      // ── KPI strip: liquidity ──
      const kpiStrip = [
        { lbl:'رأس المال العامل', val: fmtPlNum(totalCA - totalCL) + ' ر.س', col: wcCol },
        { lbl:'نسبة التداول',     val: crVal !== null ? crVal.toFixed(2) + '×' : '—',
          col: crVal === null ? '#5a7a9a' : crVal >= 2 ? '#4ada8e' : crVal >= 1 ? '#da9a4a' : '#da4a4a' },
        { lbl:'النسبة السريعة',   val: qrVal !== null ? qrVal.toFixed(2) + '×' : '—',
          col: qrVal === null ? '#5a7a9a' : qrVal >= 1 ? '#4ada8e' : qrVal >= 0.7 ? '#da9a4a' : '#da4a4a' },
        { lbl:'الأصول المتداولة', val: fmt(totalCA)  + ' ر.س', col: '#5baef0' },
        { lbl:'الخصوم المتداولة', val: fmt(totalCL)  + ' ر.س', col: '#da9a4a' },
        { lbl:'أصول ثابتة',      val: fmt(totalNCA) + ' ر.س', col: '#7090b0' },
      ].map(k => `
        <div style="background:#071420;border-radius:7px;padding:9px 12px;border-right:3px solid ${k.col};flex:1;min-width:130px">
          <div style="font-size:.68rem;color:#5a7a9a;margin-bottom:3px">${k.lbl}</div>
          <div style="font-size:.88rem;font-weight:700;color:${k.col};font-variant-numeric:tabular-nums">${k.val}</div>
        </div>`).join('');

      const _bsDiff   = Math.abs(totalA - (totalL + totalE));
      const _bsBalanced = _bsDiff < 1;
      const _icGapPct = elim.applied && totalA > 0 ? (elim.netGap || 0) / totalA * 100 : 0;
      const _icGapNote = elim.applied ? ` &nbsp;|&nbsp; فارق التسوية البيني: ${fmt(elim.netGap||0)} ر.س (${_icGapPct.toFixed(2)}%)` : '';
      const bsFooterNote = '<div style="margin-top:6px;font-size:.68rem;color:' + (_bsBalanced ? '#3a5a7a' : '#7a2a2a') + ';line-height:1.6">'
        + (_bsBalanced ? '✓ المعادلة المحاسبية متوازنة (إجمالي الأصول = إجمالي الخصوم + حقوق الملكية)' : ('⚠ فرق في الميزانية: ' + fmtPlNum(totalA - totalL - totalE) + ' ر.س'))
        + ' &nbsp;|&nbsp; نسبة التداول المستهدفة ≥ 2× &nbsp;|&nbsp; النسبة السريعة المستهدفة ≥ 1×'
        + _icGapNote + '</div>';

      bsEl.innerHTML = `
        <div style="font-size:.72rem;color:#5a7a9a;margin-bottom:10px">كما في ${selBsMo} — وفق المعايير السعودية للمنشآت الصغيرة والمتوسطة</div>
        ${showICGap ? `<div style="background:#1e1004;border:1px solid #5a3010;border-radius:7px;padding:9px 14px;margin-bottom:10px;font-size:.75rem;color:#da9a4a">
          ⚠ فارق تسوية بيني: <strong>${fmt(icNetGap)} ر.س</strong> — فروق توقيت تسجيل بين الشركتين تتطلب تسوية.
        </div>` : ''}
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">${kpiStrip}</div>
        <div class="tbl-wrap"><table style="width:100%;border-collapse:collapse">
          <tbody>

            ${secHdr('الأصول — Assets')}

            ${catHdr('الأصول المتداولة')}
            ${curAssets.map(r => bsRow(r, 1)).join('')}
            ${subTot('إجمالي الأصول المتداولة', totalCA, '#5baef0')}

            ${catHdr('الأصول غير المتداولة (الأصول الثابتة)')}
            ${nonCurAssets.map(r => bsRow(r, 1)).join('')}
            ${subTot('إجمالي الأصول غير المتداولة', totalNCA, '#7090b0')}

            ${grandTot('إجمالي الأصول', totalA)}

            ${secHdr('الخصوم وحقوق الملكية — Liabilities & Equity')}

            ${catHdr('الخصوم المتداولة')}
            ${curLiab.map(r => bsRow(r, -1)).join('')}
            ${subTot('إجمالي الخصوم المتداولة', totalCL, '#da9a4a')}

            ${nonCurLiab.length ? catHdr('الخصوم غير المتداولة') : ''}
            ${nonCurLiab.map(r => bsRow(r, -1)).join('')}
            ${nonCurLiab.length ? subTot('إجمالي الخصوم غير المتداولة', totalNCL, '#da7a4a') : ''}

            ${subTot('إجمالي الخصوم', totalL, '#c8d8e0', false)}

            ${catHdr('حقوق الملكية')}
            ${equity.map(r => bsRow(r, -1)).join('')}
            ${Math.abs(priorNP) > 100 ? `<tr><td style="padding:5px 10px 5px 26px;color:${priorNP>=0?'#7ac8a0':'#da8a8a'};font-size:.77rem;border-bottom:1px solid #081e34">أرباح مرحلة من فترات سابقة</td><td style="text-align:left;font-variant-numeric:tabular-nums;font-size:.77rem;padding:5px 10px;border-bottom:1px solid #081e34;color:${priorNP>=0?'#7ac8a0':'#da8a8a'}">${fmtPlNum(priorNP)} ر.س</td></tr>` : ''}
            <tr><td style="padding:5px 10px 5px 26px;color:${npCol};font-size:.77rem;border-bottom:1px solid #081e34">صافي ربح الفترة الجارية${firstPLMonth ? ` (${firstPLMonth} — ${selBsMo})` : ''}</td><td style="text-align:left;font-variant-numeric:tabular-nums;font-size:.77rem;padding:5px 10px;border-bottom:1px solid #081e34;color:${npCol}">${fmtPlNum(monitoringNP)} ر.س</td></tr>
            ${subTot('إجمالي حقوق الملكية', totalE, totalE >= 0 ? '#4ada8e' : '#da4a4a', false)}

            ${grandTot('إجمالي الخصوم وحقوق الملكية', totalA)}

          </tbody>
        </table></div>
        ${bsFooterNote}`;
    }
  }

  // ── Per-company ratios comparison ──
  const ratiosEl = document.getElementById('cons-ratios');
  if (ratiosEl) {
    const perDbBS = byDb.map(d => _bsTotals(d.bs, selBsMo));
    const METRICS = [
      { lbl:'إجمالي الإيراد',              fn:(a,_) => fmt(a.revenue)+' ر.س',                             fmtC:(a,b)=>fmt(a.revenue)+' ر.س' },
      { lbl:'هامش الربح الإجمالي',         fn:(a,_) => a.revenue?(a.grossProfit/a.revenue*100).toFixed(1)+'%':'—', col:(a,_)=>a.revenue>0?( a.grossProfit/a.revenue>=0.15?'#4ada8e':'#da9a4a'):'#7090b0' },
      { lbl:'هامش الربح الصافي',           fn:(a,_) => a.revenue?(a.netProfit/a.revenue*100).toFixed(2)+'%':'—', col:(a,_)=>a.revenue>0?(a.netProfit/a.revenue>=0.05?'#4ada8e':a.netProfit>=0?'#da9a4a':'#da4a4a'):'#7090b0' },
      { lbl:'نسبة تكلفة البضاعة/الإيراد',  fn:(a,_) => a.revenue?(a.totalCost/a.revenue*100).toFixed(1)+'%':'—' },
      { lbl:'إجمالي المصروفات التشغيلية',  fn:(a,_) => fmt(a.totalOpex)+' ر.س' },
      { lbl:'نسبة المصروفات/الإيراد',      fn:(a,_) => a.revenue?(a.totalOpex/a.revenue*100).toFixed(1)+'%':'—', col:(a,_)=>a.revenue>0?(a.totalOpex/a.revenue<0.2?'#4ada8e':a.totalOpex/a.revenue<0.3?'#da9a4a':'#da4a4a'):'#7090b0' },
      { lbl:'إجمالي الأصول',               fn:(_,b) => fmt(b.A)+' ر.س' },
      { lbl:'أصول متداولة',                fn:(_,b) => fmt(b.CA)+' ر.س', col:(_,b)=>'#5baef0' },
      { lbl:'أصول ثابتة',                  fn:(_,b) => fmt(b.NCA)+' ر.س', col:(_,b)=>'#7090b0' },
      { lbl:'إجمالي الالتزامات',           fn:(_,b) => fmt(b.L)+' ر.س' },
      { lbl:'خصوم متداولة',                fn:(_,b) => fmt(b.CL)+' ر.س', col:(_,b)=>'#da9a4a' },
      { lbl:'خصوم غير متداولة',            fn:(_,b) => fmt(b.NCL)+' ر.س', col:(_,b)=>'#da7a4a' },
      { lbl:'حقوق الملكية',                fn:(_,b) => fmtPlNum(b.E)+' ر.س', col:(_,b)=>b.E>=0?'#4ada8e':'#da4a4a' },
      { lbl:'رأس المال العامل',            fn:(_,b) => fmtPlNum(b.CA-b.CL)+' ر.س', col:(_,b)=>(b.CA-b.CL)>=0?'#4ada8e':'#da4a4a' },
      { lbl:'نسبة التداول',                fn:(_,b) => b.CL>0?(b.CA/b.CL).toFixed(2)+'×':'—', col:(_,b)=>b.CL>0?(b.CA/b.CL>=2?'#4ada8e':b.CA/b.CL>=1?'#da9a4a':'#da4a4a'):'#7090b0' },
      { lbl:'النسبة السريعة',              fn:(_,b) => b.CL>0?((b.CA-b.Inv)/b.CL).toFixed(2)+'×':'—', col:(_,b)=>b.CL>0?((b.CA-b.Inv)/b.CL>=1?'#4ada8e':(b.CA-b.Inv)/b.CL>=0.7?'#da9a4a':'#da4a4a'):'#7090b0' },
      { lbl:'نسبة الدين/الأصول',           fn:(_,b) => b.A>0?(b.L/b.A*100).toFixed(1)+'%':'—', col:(_,b)=>b.A>0?(b.L/b.A<0.5?'#4ada8e':b.L/b.A<0.7?'#da9a4a':'#da4a4a'):'#7090b0' },
    ];
    const consBs = { A:totalA, L:totalL, E:totalE };
    ratiosEl.innerHTML = `<div class="tbl-wrap"><table style="width:100%;border-collapse:collapse;font-size:.81rem">
      <thead><tr>
        <th style="text-align:right;padding:9px 12px;color:#7090b0;font-weight:500;border-bottom:1px solid #1e3a5f;background:#081828">المؤشر</th>
        ${perDb.map(d => `<th style="text-align:left;padding:9px 12px;color:#7ac8f0;font-variant-numeric:tabular-nums;border-bottom:1px solid #1e3a5f;background:#081828;white-space:nowrap">${(d.name||d.db).replace('مؤسسة ','').replace('مصنع ','')}</th>`).join('')}
        <th style="text-align:left;padding:9px 12px;color:#5baef0;font-weight:700;border-bottom:1px solid #1e3a5f;background:#081828">المجمع</th>
      </tr></thead>
      <tbody>
        ${METRICS.map(m => {
          const tdBase = 'padding:8px 12px;border-bottom:1px solid #0e2540;font-variant-numeric:tabular-nums';
          return `<tr>
            <td style="${tdBase};color:#8ab0cc">${m.lbl}</td>
            ${perDb.map((d,i) => {
              const col = m.col ? m.col(d.agg, perDbBS[i], i) : '#b0c8e0';
              return `<td style="${tdBase};text-align:left;color:${col}">${m.fn(d.agg, perDbBS[i], i)}</td>`;
            }).join('')}
            <td style="${tdBase};text-align:left;font-weight:600;color:${m.col?m.col(c,consBs,undefined):'#c8e0f0'}">${m.fn(c, consBs, undefined)}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
  }

  _consStartCountdown(companies, c.revenue, c.netProfit);
}

// ── Consolidated Cash Flow tab ────────────────────────────────────────────────

// Returns previous comparable period rows: same number of months shifted back
function getConsCFComparablePrev(selFrom, selTo, allCF) {
  if (!selFrom || !selTo) return [];
  const months = allCF.map(m => m.month).sort();
  const fromIdx = months.indexOf(selFrom);
  const toIdx   = months.indexOf(selTo);
  if (fromIdx < 0 || toIdx < 0 || fromIdx > toIdx) return [];
  const span       = toIdx - fromIdx + 1;
  const cmpFromIdx = fromIdx - span;
  const cmpToIdx   = fromIdx - 1;
  if (cmpFromIdx < 0) return [];
  const cmpFrom = months[cmpFromIdx];
  const cmpTo   = months[cmpToIdx];
  return allCF.filter(m => m.month >= cmpFrom && m.month <= cmpTo);
}

function renderConsCF() {
  const heroEl = document.getElementById('cons-cf-hero');
  const data   = State.get('consolidated');

  if (!data) {
    if (heroEl) heroEl.innerHTML = '<div style="color:#5a7a9a;padding:36px;text-align:center;grid-column:1/-1">جارٍ تحميل البيانات المجمعة…</div>';
    API.fetchConsolidated(CONS_DBS).then(result => {
      if (result) {
        State.set('consolidated', result);
        const active = document.querySelector('.tab.active');
        if (active && active.dataset.tab === 'cons-cf') renderConsCF();
      } else {
        if (heroEl) heroEl.innerHTML = '<div style="color:#da4a4a;padding:36px;text-align:center;grid-column:1/-1">فشل تحميل البيانات — تحقق من الاتصال</div>';
      }
    });
    return;
  }

  const { pl, bs, bankFacilities = [], companies = [] } = data;

  // ── Company badges ──
  const badgesEl = document.getElementById('cons-cf-badges');
  if (badgesEl) {
    badgesEl.innerHTML = companies
      .map(c => `<span style="background:#0a2848;border:1px solid #1e5080;border-radius:20px;padding:3px 12px;font-size:.76rem;color:#7ac8f0">${(c.name||c.db).replace('مؤسسة ','').replace('مصنع ','')}</span>`)
      .join('');
  }

  // ── Period selectors (from/to by month) ──
  const bsMonths  = [...new Set(bs.map(r => r.month))].sort();
  const fromSel   = document.getElementById('cons-cf-from');
  const toSel     = document.getElementById('cons-cf-to');

  if (fromSel && bsMonths.length) {
    const saved = State.get('consCfFrom');
    const cur   = (saved && bsMonths.includes(saved)) ? saved : bsMonths[0];
    fromSel.innerHTML = bsMonths.map(m => `<option value="${m}"${m===cur?' selected':''}>${m}</option>`).join('');
    if (!saved) State.set('consCfFrom', cur);
  }
  if (toSel && bsMonths.length) {
    const saved = State.get('consCfTo');
    const cur   = (saved && bsMonths.includes(saved)) ? saved : bsMonths[bsMonths.length - 1];
    toSel.innerHTML = bsMonths.map(m => `<option value="${m}"${m===cur?' selected':''}>${m}</option>`).join('');
    if (!saved) State.set('consCfTo', cur);
  }

  const selFrom  = (fromSel && fromSel.value) || bsMonths[0] || '';
  const selTo    = (toSel   && toSel.value)   || bsMonths[bsMonths.length - 1] || '';
  const cmpMode  = (document.getElementById('cons-cf-cmp-sel') || {}).value || 'prev';

  // ── Compute CF ──
  const allCF    = cfMonthly(bs, pl, bankFacilities);
  const filtered = allCF.filter(m => m.month >= selFrom && m.month <= selTo);
  if (!filtered.length) return;
  const c = aggregateCF(filtered);
  if (!c) return;

  const filteredCmp = cmpMode === 'prev' ? getConsCFComparablePrev(selFrom, selTo, allCF) : [];
  const cPrev  = filteredCmp.length ? aggregateCF(filteredCmp) : null;
  const hasCmp = cmpMode === 'prev' && cPrev !== null;

  const periodLabel = selFrom === selTo
    ? (allCF.find(m => m.month === selFrom) || {}).label || selFrom
    : `${selFrom} — ${selTo}`;
  const cmpLabel = filteredCmp.length
    ? (filteredCmp.length === 1 ? filteredCmp[0].label : `${filteredCmp[0].label} — ${filteredCmp[filteredCmp.length-1].label}`)
    : '';

  // ── KPIs ──
  const kpiDelta = (cur, prev) => {
    if (!hasCmp || !prev || Math.abs(prev) < 1) return '';
    const pct = ((cur - prev) / Math.abs(prev) * 100).toFixed(1);
    const col = +pct >= 0 ? '#4ada8e' : '#da4a4a';
    const arr = +pct >= 0 ? '▲' : '▼';
    return `<div style="font-size:.7rem;color:${col};margin-top:2px">${arr} ${Math.abs(+pct)}%</div>
            <div style="font-size:.7rem;color:#3a5a7a;margin-top:1px">مقابل: ${fmtPlNum(prev)}</div>`;
  };
  if (heroEl) heroEl.innerHTML = [
    { lbl:'التدفقات التشغيلية',       cur:c.operatingCF,   prev:cPrev?.operatingCF,   accent:c.operatingCF  >=0?'#4ada8e':'#da4a4a' },
    { lbl:'التدفقات الاستثمارية',     cur:c.investingCF,   prev:cPrev?.investingCF,   accent:c.investingCF  >=0?'#4ada8e':'#da9a4a' },
    { lbl:'التدفقات التمويلية',       cur:c.financingCF,   prev:cPrev?.financingCF,   accent:c.financingCF  >=0?'#4ada8e':'#da4a4a' },
    { lbl:'صافي التغيير في النقدية',  cur:c.netCashChange, prev:cPrev?.netCashChange, accent:c.netCashChange>=0?'#5baef0':'#da4a4a' },
    { lbl:'رصيد النقدية الافتتاحي',   cur:c.openingCash,   prev:null,                 accent:'#7090b0' },
    { lbl:'رصيد النقدية الختامي',     cur:c.closingCash,   prev:cPrev?.closingCash,   accent:'#5baef0' },
  ].map(k => `<div class="kpi" style="--accent:${k.accent}">
    <div class="lbl">${k.lbl}</div>
    <div class="val">${fmtPlNum(k.cur)} ر.س</div>
    ${kpiDelta(k.cur, k.prev)}
  </div>`).join('');

  // ── Flow bars ──
  const cfFlowEl = document.getElementById('cons-cf-flow-bars');
  if (cfFlowEl) {
    const vals  = [c.operatingCF, c.investingCF, c.financingCF, c.netCashChange];
    const pvals = hasCmp ? [cPrev.operatingCF, cPrev.investingCF, cPrev.financingCF, cPrev.netCashChange] : [];
    const maxAbs = Math.max(...vals.map(Math.abs), ...pvals.map(Math.abs), 1);
    const flowBar = (lbl, val, col, prevVal) => {
      const w  = Math.min(100, Math.abs(val)    / maxAbs * 100).toFixed(1);
      const wp = hasCmp ? Math.min(100, Math.abs(prevVal) / maxAbs * 100).toFixed(1) : 0;
      return `<div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;margin-bottom:3px">
          <span style="color:#c0d0e0;font-size:.82rem">${lbl}</span>
          <span style="color:${col};font-size:.82rem;font-weight:600">${fmtPlNum(val)} ر.س${hasCmp ? `<span style="color:#3a5a7a;font-size:.72rem;margin-right:8px"> / ${fmtPlNum(prevVal)}</span>` : ''}</span>
        </div>
        <div style="height:9px;border-radius:5px;background:#061420;position:relative;overflow:hidden">
          ${hasCmp ? `<div style="position:absolute;top:0;height:100%;border-radius:5px;width:${wp}%;background:${col}33;border-left:1px solid ${col}55"></div>` : ''}
          <div style="position:absolute;top:0;height:100%;border-radius:5px;width:${w}%;background:${col}99;transition:width .4s"></div>
        </div>
      </div>`;
    };
    cfFlowEl.innerHTML =
      flowBar('التدفقات التشغيلية',      c.operatingCF,  c.operatingCF >=0?'#4ada8e':'#da4a4a', cPrev?.operatingCF)  +
      flowBar('التدفقات الاستثمارية',    c.investingCF,  c.investingCF >=0?'#4ada8e':'#da9a4a', cPrev?.investingCF)  +
      flowBar('التدفقات التمويلية',      c.financingCF,  c.financingCF >=0?'#4ada8e':'#da4a4a', cPrev?.financingCF)  +
      flowBar('صافي التغيير في النقدية', c.netCashChange,c.netCashChange>=0?'#5baef0':'#da4a4a', cPrev?.netCashChange);
  }

  // ── CF Statement (SOCPA/IFRS for SMEs Section 7 format) ──
  const stmtEl = document.getElementById('cons-cf-stmt');
  if (stmtEl) stmtEl.innerHTML = renderCFStatement(c, cPrev, hasCmp, periodLabel, cmpLabel);

  // ── Trend chart ──
  destroyChart('cons-cf');
  const ctx = document.getElementById('chart-cons-cf');
  if (ctx && allCF.length) {
    charts['cons-cf'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: allCF.map(m => m.label),
        datasets: [
          { label:'تشغيلية',   data: allCF.map(m => m.operatingCF),  backgroundColor:'#4ada8e99', borderColor:'#4ada8e', borderWidth:1 },
          { label:'استثمارية', data: allCF.map(m => m.investingCF),  backgroundColor:'#da9a4a99', borderColor:'#da9a4a', borderWidth:1 },
          { label:'تمويلية',   data: allCF.map(m => m.financingCF),  backgroundColor:'#5baef099', borderColor:'#5baef0', borderWidth:1 },
        ],
      },
      options: {
        ...CHART_OPTS,
        plugins: {
          legend: { labels: { color:'#8ba0b8', font:{ size:10 }, boxWidth:12 } },
          tooltip: { callbacks: { label: tooltipLabel } },
        },
        scales: {
          x: { ...AXIS_STYLE },
          y: { ...AXIS_STYLE, ticks: { ...AXIS_STYLE.ticks, callback: v => fmt(v) } },
        },
      },
    });
  }

  // ── Monthly breakdown table (7 columns) ──
  const moEl = document.getElementById('cons-cf-monthly');
  if (moEl) moEl.innerHTML = allCF.map(m => {
    const opCls  = m.operatingCF  >= 0 ? 'color:#4ada8e' : 'color:#da4a4a';
    const invCls = m.investingCF  >= 0 ? 'color:#4ada8e' : 'color:#da9a4a';
    const finCls = m.financingCF  >= 0 ? 'color:#4ada8e' : 'color:#da4a4a';
    const netCls = m.netCashChange >= 0 ? 'color:#5baef0' : 'color:#da4a4a';
    const inRange = m.month >= selFrom && m.month <= selTo;
    return `<tr class="${inRange ? 'cf-mo-active' : ''}">
      <td${inRange ? ' style="color:#7ac8f0;font-weight:600"' : ''}>${m.label}</td>
      <td class="num" style="${opCls}">${fmtPlNum(m.operatingCF)}</td>
      <td class="num" style="${invCls}">${fmtPlNum(m.investingCF)}</td>
      <td class="num" style="${finCls}">${fmtPlNum(m.financingCF)}</td>
      <td class="num" style="${netCls}">${fmtPlNum(m.netCashChange)}</td>
      <td class="num" style="color:#5a7a9a">${fmt(m.openingCash)}</td>
      <td class="num">${fmt(m.closingCash)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" style="text-align:center;padding:30px;color:#5a7a9a">لا توجد بيانات</td></tr>';

  // ── Expert financial analysis ──
  _renderConsCFAnalysis(c, filtered, allCF);

  _consCfStartCountdown(c?.operatingCF, allCF.length);
}

async function exportConsCFExcel() {
  const data = State.get('consolidated');
  if (!data) { alert('لا توجد بيانات مجمعة لتصديرها'); return; }
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد، جرّب تحديث الصفحة'); return; }

  const { pl, bs, bankFacilities = [], companies = [] } = data;
  const bsMonths = [...new Set(bs.map(r => r.month))].sort();
  const fromSel  = document.getElementById('cons-cf-from');
  const toSel    = document.getElementById('cons-cf-to');
  const cmpMode  = (document.getElementById('cons-cf-cmp-sel') || {}).value || 'prev';
  const selFrom  = (fromSel && fromSel.value) || bsMonths[0] || '';
  const selTo    = (toSel   && toSel.value)   || bsMonths[bsMonths.length - 1] || '';

  const allCF    = cfMonthly(bs, pl, bankFacilities);
  const filtered = allCF.filter(m => m.month >= selFrom && m.month <= selTo);
  if (!filtered.length) { alert('لا توجد بيانات للفترة المحددة'); return; }
  const c = aggregateCF(filtered);
  if (!c) return;

  const filteredCmp = cmpMode === 'prev' ? getConsCFComparablePrev(selFrom, selTo, allCF) : [];
  const cPrev  = filteredCmp.length ? aggregateCF(filteredCmp) : null;
  const hasCmp = cmpMode === 'prev' && cPrev !== null;

  const periodLabel = selFrom === selTo
    ? (allCF.find(m => m.month === selFrom) || {}).label || selFrom
    : `${selFrom} — ${selTo}`;
  const cmpLabel = filteredCmp.length
    ? (filteredCmp.length === 1 ? filteredCmp[0].label : `${filteredCmp[0].label} — ${filteredCmp[filteredCmp.length-1].label}`)
    : '';
  const companyName = companies.map(c => (c.name||c.db).replace('مؤسسة ','').replace('مصنع ','')).join(' + ') || 'المجموعة المجمعة';

  const FONT   = 'Calibri';
  const NC     = hasCmp ? 3 : 2;
  const numFmt = '#,##0;[Red](#,##0);"-"';
  const CLR = {
    navyDark:'FF0A2040', navy:'FF1A3A6A', blueLight:'FFE8EEF8',
    bluePale:'FFF4F7FB', blueXPale:'FFDDE6F4', white:'FFFFFFFF',
    textDark:'FF111111', textNavy:'FF0A2040', textBlue:'FF1A3A6A',
    textLight:'FF6A8AAA', textGray:'FF888888',
    greenBg:'FFF4FFF8', greenBdr:'FF90C890', greenText:'FF1A6A2A',
  };
  const solid = a => ({ type:'pattern', pattern:'solid', fgColor:{ argb:a } });
  const bdr   = (s, a) => ({ style:s, color:{ argb:a } });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MekSoft ERP Dashboard'; wb.created = new Date();

  // ── Sheet 1: Statement ────────────────────────────────────────────────────
  const ws = wb.addWorksheet('التدفقات النقدية المجمعة', { views:[{ rightToLeft:true }] });
  ws.pageSetup.paperSize=9; ws.pageSetup.orientation='portrait';
  ws.pageSetup.fitToPage=true; ws.pageSetup.fitToWidth=1;
  ws.pageSetup.margins={left:0.6,right:0.5,top:0.75,bottom:0.75,header:0.3,footer:0.3};
  ws.columns=[{width:50},{width:20},...(hasCmp?[{width:20}]:[])];

  const spanRow = row => ws.mergeCells(row.number,1,row.number,NC);
  const addTitle = (text,sz,fc,bg) => {
    const row=ws.addRow([text]); row.height=sz>12?32:22; spanRow(row);
    const c=row.getCell(1);
    c.font={name:FONT,size:sz,bold:true,color:{argb:fc}};
    c.fill=solid(bg); c.alignment={horizontal:'center',vertical:'middle'};
  };
  const addSpacer = (h=5) => {
    const row=ws.addRow(['']); row.height=h; spanRow(row);
    row.getCell(1).fill=solid(CLR.white);
  };
  const setNum = (cell,v,fc,bold) => {
    cell.value=(v!==null&&v!==undefined)?+v.toFixed(0):null;
    cell.numFmt=numFmt; cell.alignment={horizontal:'left',vertical:'middle'};
    cell.font={name:FONT,size:9.5,color:{argb:fc||CLR.textNavy},bold:bold||false};
  };
  const addSecRow = text => {
    const row=ws.addRow([text]); row.height=20; spanRow(row);
    const c=row.getCell(1);
    c.font={name:FONT,size:9.5,bold:true,color:{argb:CLR.white}};
    c.fill=solid(CLR.navy); c.alignment={horizontal:'right',vertical:'middle',indent:1};
  };
  const addSubHdrRow = text => {
    const row=ws.addRow([text]); row.height=15; spanRow(row);
    const c=row.getCell(1);
    c.font={name:FONT,size:8.5,italic:true,color:{argb:CLR.textLight}};
    c.fill=solid('FFF4F7FB'); c.alignment={horizontal:'right',vertical:'middle',indent:2};
  };
  const addItemRow = (label,cur,cmp,indent=true) => {
    const row=ws.addRow([label,null,...(hasCmp?[null]:[])]);
    row.height=17;
    const c1=row.getCell(1);
    c1.font={name:FONT,size:9.5,color:{argb:CLR.textDark}};
    c1.alignment={horizontal:'right',vertical:'middle',indent:indent?2:1};
    c1.border={bottom:bdr('hair','FFE8ECF0')};
    setNum(row.getCell(2),cur,CLR.textNavy,false);
    row.getCell(2).border={bottom:bdr('hair','FFE8ECF0')};
    if(hasCmp){
      setNum(row.getCell(3),cmp,CLR.textGray,false);
      row.getCell(3).border={bottom:bdr('hair','FFE8ECF0')};
      row.getCell(3).fill=solid('FFF8FAFE');
    }
  };
  const addSubTotRow = (label,cur,cmp) => {
    const row=ws.addRow([label,null,...(hasCmp?[null]:[])]);
    row.height=18;
    const tb={top:bdr('thin','FFC0CFE8'),bottom:bdr('thin','FFB0C4DC')};
    const c1=row.getCell(1);
    c1.font={name:FONT,size:9.5,bold:true,color:{argb:CLR.textNavy}};
    c1.fill=solid(CLR.bluePale); c1.alignment={horizontal:'right',vertical:'middle'}; c1.border=tb;
    setNum(row.getCell(2),cur,CLR.textNavy,true);
    Object.assign(row.getCell(2),{fill:solid(CLR.bluePale),border:tb});
    if(hasCmp){
      setNum(row.getCell(3),cmp,CLR.textGray,false);
      Object.assign(row.getCell(3),{fill:solid('FFF0F4FA'),border:tb});
    }
  };
  const addTotalRow = (label,cur,cmp,fc) => {
    const row=ws.addRow([label,null,...(hasCmp?[null]:[])]);
    row.height=20;
    const bord={top:bdr('medium',CLR.navy),bottom:bdr('medium',CLR.navy)};
    const c1=row.getCell(1);
    c1.font={name:FONT,size:10,bold:true,color:{argb:fc||CLR.navyDark}};
    c1.fill=solid(CLR.blueXPale); c1.alignment={horizontal:'right',vertical:'middle'}; c1.border=bord;
    setNum(row.getCell(2),cur,fc||CLR.navyDark,true);
    Object.assign(row.getCell(2),{fill:solid(CLR.blueXPale),border:bord});
    if(hasCmp){
      setNum(row.getCell(3),cmp,CLR.textBlue,true);
      Object.assign(row.getCell(3),{fill:solid('FFD5E0F0'),border:bord});
    }
  };

  const genDate = new Date().toLocaleDateString('ar-SA',{year:'numeric',month:'long',day:'numeric'});
  addTitle('المجموعة المجمعة — ' + companyName, 14, CLR.white, CLR.navyDark);
  addTitle('قائمة التدفقات النقدية المجمعة (الطريقة غير المباشرة)', 12, CLR.white, CLR.navy);
  addTitle(`الفترة: ${periodLabel}${hasCmp ? `  |  للمقارنة: ${cmpLabel}` : ''}  |  بعد الاستبعاد البيني`, 9.5, 'FFAACCE8', CLR.navyDark);
  addTitle(`المبالغ بالريال السعودي  —  أُنشئ: ${genDate}`, 8.5, CLR.textLight, CLR.navyDark);
  addSpacer(4);
  {
    const row=ws.addRow(['البيان',periodLabel,...(hasCmp?[cmpLabel]:[])]);
    row.height=22;
    row.eachCell({includeEmpty:true},(cell,ci)=>{
      cell.font={name:FONT,size:10,bold:true,color:{argb:CLR.white}};
      cell.fill=solid(CLR.navy);
      cell.alignment={horizontal:ci===1?'right':'center',vertical:'middle'};
      cell.border={bottom:bdr('medium',CLR.navyDark)};
    });
  }
  addSpacer(3);
  addSecRow('أولاً: التدفقات النقدية من الأنشطة التشغيلية');
  addItemRow('صافي الربح (الخسارة) للفترة',             c.netIncome,      cPrev?.netIncome,      false);
  addSubHdrRow('تعديلات في رأس المال العامل:');
  addItemRow('(الزيادة)/نقص في المخزون',                c.δInventory,     cPrev?.δInventory);
  addItemRow('(الزيادة)/نقص في الذمم المدينة التجارية', c.δAR,            cPrev?.δAR);
  addItemRow('(الزيادة)/نقص في ذمم الموظفين والسلف',    c.δEmpRec,        cPrev?.δEmpRec);
  addItemRow('(الزيادة)/نقص في أرصدة مدينة أخرى',        c.δOtherCA,       cPrev?.δOtherCA);
  addItemRow('زيادة/(نقص) في الذمم الدائنة التجارية',    c.δAP,            cPrev?.δAP);
  addItemRow('زيادة/(نقص) في أرصدة دائنة أخرى',          c.δOtherPay,      cPrev?.δOtherPay);
  addItemRow('زيادة/(نقص) في المصروفات المستحقة',         c.δAccrued,       cPrev?.δAccrued);
  addSubTotRow('صافي التدفقات النقدية من الأنشطة التشغيلية', c.operatingCF, cPrev?.operatingCF);

  addSpacer(3);
  addSecRow('ثانياً: التدفقات النقدية من أنشطة الاستثمار');
  addItemRow('(الزيادة)/النقص في الأصول الثابتة (صافي)',  c.δFixedAssets,   cPrev?.δFixedAssets);
  addItemRow('(الزيادة)/النقص في المشاريع قيد التنفيذ',    c.δProjects,      cPrev?.δProjects);
  addSubTotRow('صافي التدفقات النقدية من أنشطة الاستثمار', c.investingCF, cPrev?.investingCF);

  addSpacer(3);
  addSecRow('ثالثاً: التدفقات النقدية من أنشطة التمويل');
  addItemRow('زيادة/(نقص) في التسهيلات البنكية',          c.δBankFacilities,cPrev?.δBankFacilities);
  addItemRow('زيادة/(نقص) في القروض طويلة الأجل',         c.δLTLoans,       cPrev?.δLTLoans);
  addItemRow('زيادة/(نقص) في رأس المال المدفوع',          c.δCapital,       cPrev?.δCapital);
  addItemRow('زيادة/(نقص) في حساب الشركاء',               c.δPartners,      cPrev?.δPartners);
  addSubTotRow('صافي التدفقات النقدية من أنشطة التمويل', c.financingCF, cPrev?.financingCF);

  addSpacer(3);
  addTotalRow('صافي الزيادة (النقص) في النقدية وما يعادلها', c.netCashChange, cPrev?.netCashChange, 'FF1A5A9A');
  addItemRow('رصيد النقدية وما يعادلها في بداية الفترة', c.openingCash, cPrev?.openingCash, false);
  addTotalRow('رصيد النقدية وما يعادلها في نهاية الفترة', c.closingCash, cPrev?.closingCash, 'FF0A2040');
  addSpacer(3);
  {
    const balanced = Math.abs(c.openingCash + c.netCashChange - c.closingCash) < 1;
    const note = balanced
      ? `✓ الميزانية متوازنة: ${Math.round(c.openingCash).toLocaleString('ar-SA')} + ${Math.round(c.netCashChange).toLocaleString('ar-SA')} = ${Math.round(c.closingCash).toLocaleString('ar-SA')}`
      : `⚠ فرق في التسوية: ${(c.openingCash + c.netCashChange - c.closingCash).toFixed(2)}`;
    const row=ws.addRow([note]); row.height=17; spanRow(row);
    const cell=row.getCell(1);
    cell.font={name:FONT,size:8.5,bold:balanced,color:{argb:balanced?CLR.greenText:'FFCC4444'}};
    cell.fill=solid(balanced?CLR.greenBg:'FFFFF4F4');
    cell.alignment={horizontal:'center',vertical:'middle'};
    cell.border={top:bdr('thin',balanced?CLR.greenBdr:'FFCC8888'),bottom:bdr('thin',balanced?CLR.greenBdr:'FFCC8888'),
                 left:bdr('thin',balanced?CLR.greenBdr:'FFCC8888'),right:bdr('thin',balanced?CLR.greenBdr:'FFCC8888')};
  }

  // ── Sheet 2: Monthly breakdown ────────────────────────────────────────────
  const ws2 = wb.addWorksheet('التطور الشهري المجمع', { views:[{ rightToLeft:true }] });
  ws2.pageSetup.paperSize=9; ws2.pageSetup.orientation='landscape';
  ws2.pageSetup.fitToPage=true; ws2.pageSetup.fitToWidth=1;
  ws2.columns=[{width:16},{width:17},{width:17},{width:17},{width:17},{width:17},{width:17}];
  {
    const hr=ws2.addRow(['الشهر','تشغيلية','استثمارية','تمويلية','صافي التغيير','رصيد الافتتاح','رصيد الاختتام']);
    hr.height=20;
    hr.eachCell((cell,ci)=>{
      cell.font={name:FONT,size:9.5,bold:true,color:{argb:CLR.white}};
      cell.fill=solid(CLR.navy);
      cell.alignment={horizontal:ci===1?'right':'center',vertical:'middle'};
      cell.border={bottom:bdr('medium',CLR.navyDark)};
    });
    const inRange = new Set(filtered.map(m => m.month));
    allCF.forEach(m => {
      const isActive = inRange.has(m.month);
      const row=ws2.addRow([m.label,m.operatingCF,m.investingCF,m.financingCF,m.netCashChange,m.openingCash,m.closingCash]);
      row.height=16;
      row.getCell(1).font={name:FONT,size:9,color:{argb:isActive?'FFC8E8FF':CLR.textGray}};
      row.getCell(1).alignment={horizontal:'right',vertical:'middle'};
      if(isActive) row.getCell(1).fill=solid('FF07182A');
      for(let ci=2;ci<=7;ci++){
        const cell=row.getCell(ci);
        const v=cell.value||0;
        cell.numFmt=numFmt; cell.alignment={horizontal:'left',vertical:'middle'};
        cell.font={name:FONT,size:9,color:{argb:
          ci>=6 ? CLR.textNavy : v<0 ? 'FFDA4A4A' : ci===5 ? 'FF5BAEF0' : 'FF4ADA8E'}};
        if(isActive) cell.fill=solid('FF07182A');
        cell.border={bottom:bdr('hair','FF0E2540')};
      }
    });
    const tr=ws2.addRow(['إجمالي الفترة المحددة',c.operatingCF,c.investingCF,c.financingCF,c.netCashChange,c.openingCash,c.closingCash]);
    tr.height=20;
    const totBrd={top:bdr('double',CLR.navyDark),bottom:bdr('medium',CLR.navyDark)};
    tr.eachCell({includeEmpty:true},cell=>{cell.fill=solid(CLR.blueXPale);cell.border=totBrd;});
    tr.getCell(1).font={name:FONT,size:9.5,bold:true,color:{argb:CLR.navyDark}};
    tr.getCell(1).alignment={horizontal:'right',vertical:'middle'};
    for(let ci=2;ci<=7;ci++){
      const cell=tr.getCell(ci);
      cell.numFmt=numFmt; cell.alignment={horizontal:'left',vertical:'middle'};
      cell.font={name:FONT,size:9.5,bold:true,color:{argb:CLR.navyDark}};
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `تدفقات_نقدية_مجمعة_${selFrom}_${selTo}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function _renderConsCFAnalysis(c, filtered, allCF) {
  const el = document.getElementById('cons-cf-analysis');
  if (!el) return;

  const nMonths        = filtered.length;
  const positiveMonths = filtered.filter(m => m.operatingCF > 0).length;
  const negativeMonths = nMonths - positiveMonths;
  const eqRatio        = (c.netIncome !== 0) ? c.operatingCF / c.netIncome : null;

  // ── Earnings quality ──
  let eqLabel, eqColor, eqText;
  if (eqRatio === null) {
    eqLabel = 'غير محدد'; eqColor = '#7090b0';
    eqText  = 'لا يمكن حساب نسبة جودة الأرباح عند غياب صافي الربح أو الخسارة الصافية.';
  } else if (eqRatio >= 1.5) {
    eqLabel = 'ممتاز ★'; eqColor = '#4ada8e';
    eqText  = `نسبة ${eqRatio.toFixed(2)}× تعكس أن التدفق النقدي التشغيلي يتجاوز الأرباح المحاسبية — علامة على أرباح نقدية حقيقية وتحصيل قوي من العملاء.`;
  } else if (eqRatio >= 1.0) {
    eqLabel = 'جيد'; eqColor = '#4ada8e';
    eqText  = `نسبة ${eqRatio.toFixed(2)}× تدل على تحصيل صحي للإيرادات وتدفقات تشغيلية موثوقة.`;
  } else if (eqRatio >= 0) {
    eqLabel = 'مقبول'; eqColor = '#da9a4a';
    eqText  = `نسبة ${eqRatio.toFixed(2)}× تعني أن جزءاً من الأرباح لم يتحول بعد إلى نقدية. يُوصى بمتابعة دورة التحصيل.`;
  } else {
    eqLabel = 'ضعيف ⚠'; eqColor = '#da4a4a';
    eqText  = `نسبة ${eqRatio.toFixed(2)}× سالبة — التدفق التشغيلي سالب رغم ${c.netIncome >= 0 ? 'الربحية المحاسبية' : 'الخسارة'}. يستوجب مراجعة عاجلة لرأس المال العامل وسياسة التحصيل.`;
  }

  // ── Consistency ──
  const consistencyColor = negativeMonths === 0 ? '#4ada8e' : positiveMonths > negativeMonths ? '#da9a4a' : '#da4a4a';
  const consistencyText  = negativeMonths === 0
    ? `جميع الأشهر الـ${nMonths} سجّلت تدفقات تشغيلية موجبة — استقرار تشغيلي واضح.`
    : positiveMonths > negativeMonths
      ? `${positiveMonths} من ${nMonths} أشهر موجبة. الأشهر الـ${negativeMonths} السالبة تستحق المراجعة.`
      : `تحذير: ${negativeMonths} من ${nMonths} أشهر سجّلت تدفقاً تشغيلياً سالباً — يستوجب مراجعة عاجلة للعمليات.`;

  // ── Investing ──
  const investText = c.investingCF < 0
    ? `سالبة بـ ${fmt(Math.abs(c.investingCF))} ر.س — المجموعة تستثمر في توسعة أصولها. مؤشر إيجابي للنمو إذا تمت تغطيته من التدفق التشغيلي.`
    : c.investingCF > 0
      ? `موجبة بـ ${fmt(c.investingCF)} ر.س — تشير إلى استرداد أصول أو تقليص استثمارات. يُوصى بالتحقق من أسباب البيع.`
      : 'معدومة — لا حركة في الأصول الثابتة خلال الفترة.';

  // ── Financing ──
  const finText = c.financingCF > 0
    ? `موجبة بـ ${fmt(c.financingCF)} ر.س — المجموعة تعتمد على التمويل الخارجي (تسهيلات، قروض، ضخ رأس مال). ينبغي موازنة تكلفة التمويل مع العائد على الأصول.`
    : c.financingCF < 0
      ? `سالبة بـ ${fmt(Math.abs(c.financingCF))} ر.س — المجموعة تسدد ديونها وتعزز استقلاليتها المالية. مؤشر إيجابي للاستدامة طويلة الأجل.`
      : 'لا توجد أنشطة تمويلية خلال الفترة.';

  // ── Cash position ──
  const cashChange = c.closingCash - c.openingCash;
  const cashText   = cashChange > 0
    ? `تحسّن الرصيد النقدي بـ ${fmt(cashChange)} ر.س ليصل إلى ${fmt(c.closingCash)} ر.س.`
    : cashChange < 0
      ? `انخفض الرصيد النقدي بـ ${fmt(Math.abs(cashChange))} ر.س إلى ${fmt(c.closingCash)} ر.س — يستوجب مراقبة السيولة.`
      : `استقر الرصيد النقدي عند ${fmt(c.closingCash)} ر.س.`;

  // ── Recommendations ──
  const recs = [];
  if (c.operatingCF < 0)                                          recs.push('⚠️ مراجعة دورة التحصيل من العملاء وتسريع قبض الذمم المدينة.');
  if (c.δInventory < -50000)                                      recs.push('📦 مراجعة مستويات المخزون — تراكمه يستنزف النقدية التشغيلية.');
  if (c.δAR < -50000)                                             recs.push('📋 تفعيل متابعة الذمم المدينة — الزيادة فيها تضغط على التدفق النقدي.');
  if (c.financingCF > 0 && c.financingCF > c.operatingCF)        recs.push('🏦 الاعتماد على التمويل الخارجي يفوق التوليد الداخلي — تحسين الكفاءة التشغيلية أولوية.');
  if (c.investingCF < 0 && c.operatingCF < 0)                    recs.push('🔍 استثمار في الأصول مع تدفق تشغيلي سالب — مراجعة جدولة المشتريات الرأسمالية.');
  if (c.closingCash < c.openingCash * 0.5 && c.openingCash > 0)  recs.push('🚨 تراجع كبير في النقدية — وضع خطة لإعادة بناء الاحتياطي النقدي.');
  if (recs.length === 0) recs.push('✅ الوضع النقدي المجمع سليم — استمر في مراقبة نسبة جودة الأرباح والحفاظ على رصيد نقدي صحي.');
  if (nMonths >= 3 && eqRatio !== null && eqRatio >= 1.0 && c.operatingCF > 0)
    recs.push('💡 التدفق التشغيلي الموجب يمنحك فرصة لتسريع سداد الديون أو توزيع أرباح إذا سمح الوضع التشغيلي.');

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
      <div style="background:#081828;border:1px solid #1e3a5f;border-radius:8px;padding:14px">
        <div style="color:#7090b0;font-size:.73rem;font-weight:600;margin-bottom:7px;text-transform:uppercase;letter-spacing:.5px">جودة الأرباح — OCF / NI</div>
        <div style="font-size:1.5rem;font-weight:700;color:${eqColor};margin-bottom:5px">
          ${eqRatio !== null ? eqRatio.toFixed(2)+'×' : '—'}
          <span style="font-size:.82rem;font-weight:500;margin-right:6px;color:${eqColor}">${eqLabel}</span>
        </div>
        <div style="color:#8aa0b8;font-size:.78rem;line-height:1.7">${eqText}</div>
      </div>
      <div style="background:#081828;border:1px solid #1e3a5f;border-radius:8px;padding:14px">
        <div style="color:#7090b0;font-size:.73rem;font-weight:600;margin-bottom:7px;text-transform:uppercase;letter-spacing:.5px">استقرار التدفق التشغيلي</div>
        <div style="font-size:1.5rem;font-weight:700;color:${consistencyColor};margin-bottom:5px">
          ${positiveMonths}<span style="font-size:.9rem;color:#7090b0"> / ${nMonths} شهراً</span>
        </div>
        <div style="color:#8aa0b8;font-size:.78rem;line-height:1.7">${consistencyText}</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px">
      <div style="background:#081828;border:1px solid #1e3a5f;border-radius:8px;padding:12px">
        <div style="color:#da9a4a;font-size:.72rem;font-weight:600;margin-bottom:6px">📈 الأنشطة الاستثمارية</div>
        <div style="color:#8aa0b8;font-size:.77rem;line-height:1.7">${investText}</div>
      </div>
      <div style="background:#081828;border:1px solid #1e3a5f;border-radius:8px;padding:12px">
        <div style="color:#7ac8f0;font-size:.72rem;font-weight:600;margin-bottom:6px">🏦 الأنشطة التمويلية</div>
        <div style="color:#8aa0b8;font-size:.77rem;line-height:1.7">${finText}</div>
      </div>
      <div style="background:#081828;border:1px solid #1e3a5f;border-radius:8px;padding:12px">
        <div style="color:#5baef0;font-size:.72rem;font-weight:600;margin-bottom:6px">💧 الوضع النقدي</div>
        <div style="color:#8aa0b8;font-size:.77rem;line-height:1.7">${cashText}</div>
      </div>
    </div>
    <div style="background:#081828;border:1px solid #1e3a5f;border-radius:8px;padding:14px">
      <div style="color:#7090b0;font-size:.73rem;font-weight:600;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">🎯 التوجيهات والتوصيات</div>
      <ul style="margin:0;padding-right:20px;color:#8aa0b8;font-size:.79rem;line-height:2.1">
        ${recs.map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>`;
}

async function exportConsExcel() {
  const data = State.get('consolidated');
  if (!data) { alert('لا توجد بيانات مجمعة لتصديرها'); return; }
  if (typeof ExcelJS === 'undefined') { alert('مكتبة ExcelJS لم تُحمَّل بعد، جرّب تحديث الصفحة'); return; }

  const { companies = [], pl, bs, byDb, elimination } = data;
  const allMths  = [...new Set([...pl.map(r => r.month), ...bs.map(r => r.month)])].sort();
  const fromSel  = document.getElementById('cons-period-from');
  const toSel    = document.getElementById('cons-period-to');
  const selFrom  = (fromSel && fromSel.value && allMths.includes(fromSel.value)) ? fromSel.value : allMths[0];
  const selTo    = (toSel   && toSel.value   && allMths.includes(toSel.value))   ? toSel.value   : allMths[allMths.length-1];
  const inRange  = m => m >= selFrom && m <= selTo;

  const plFilt   = pl.filter(r => inRange(r.month));
  const c        = aggregatePL(plFilt);
  const bsMths   = [...new Set(bs.map(r => r.month))].sort();
  const selBsMo  = (selTo && bsMths.includes(selTo)) ? selTo : bsMths[bsMths.length-1];
  const { A: totalA, CA: totalCA, NCA: totalNCA, Inv: totalInv,
          L: totalL, CL: totalCL, NCL: totalNCL, E: totalE, E_hist: totalE_hist } = _bsTotals(bs, selBsMo);

  const plUpTo   = pl.filter(r => r.month <= selBsMo);
  const monNP    = aggregatePL(plUpTo).netProfit;
  const derivNP  = totalE - totalE_hist;
  const priorNP  = derivNP - monNP;

  const perDb    = (byDb || []).map(d => ({ ...d, agg: aggregatePL(d.pl.filter(r => inRange(r.month))), bs: _bsTotals(d.bs, selBsMo) }));
  const companyName = companies.map(cx => (cx.name||cx.db).replace('مؤسسة ','').replace('مصنع ','')).join(' + ') || 'المجموعة المجمعة';
  const elim = elimination || { applied: false };

  const FONT   = 'Calibri';
  const numFmt = '#,##0;[Red](#,##0);"-"';
  const numFmt0= '#,##0;#,##0;"-"';
  const CLR = {
    navyDark:'FF0A2040', navy:'FF1A3A6A', blueLight:'FFE8EEF8',
    bluePale:'FFF4F7FB', blueXPale:'FFDDE6F4', white:'FFFFFFFF',
    textDark:'FF111111', textNavy:'FF0A2040', textBlue:'FF1A3A6A',
    textLight:'FF6A8AAA', textGray:'FF888888',
    greenBg:'FFF4FFF8', greenBdr:'FF90C890', greenText:'FF1A6A2A',
  };
  const solid = a => ({ type:'pattern', pattern:'solid', fgColor:{ argb:a } });
  const bdr   = (s, a) => ({ style:s, color:{ argb:a } });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MekSoft ERP Dashboard'; wb.created = new Date();
  const genDate = new Date().toLocaleDateString('ar-SA',{year:'numeric',month:'long',day:'numeric'});

  // ── Sheet 1: Consolidated P&L ────────────────────────────────────────────
  const NC_PL = perDb.length + 2; // company cols + consolidated col + label col
  const ws1 = wb.addWorksheet('قائمة الدخل المجمعة', { views:[{ rightToLeft:true }] });
  ws1.pageSetup.paperSize=9; ws1.pageSetup.orientation='landscape';
  ws1.pageSetup.fitToPage=true; ws1.pageSetup.fitToWidth=1;
  ws1.pageSetup.margins={left:0.5,right:0.5,top:0.75,bottom:0.75,header:0.3,footer:0.3};
  ws1.columns=[{width:38},...perDb.map(()=>({width:20})),{width:22}];

  const span1 = row => ws1.mergeCells(row.number,1,row.number,NC_PL);
  const addT1 = (t,sz,fc,bg) => {
    const row=ws1.addRow([t]); row.height=sz>12?32:22; span1(row);
    const cell=row.getCell(1);
    cell.font={name:FONT,size:sz,bold:true,color:{argb:fc}};
    cell.fill=solid(bg); cell.alignment={horizontal:'center',vertical:'middle'};
  };
  const addS1 = (h=5) => { const row=ws1.addRow(['']); row.height=h; span1(row); row.getCell(1).fill=solid(CLR.white); };

  addT1('المجموعة المجمعة — '+companyName,14,CLR.white,CLR.navyDark);
  addT1('قائمة الدخل الشامل المجمعة',12,CLR.white,CLR.navy);
  addT1(`الفترة: ${selFrom} — ${selTo}${elim.applied?' | بعد الاستبعاد البيني':''}`,9.5,'FFAACCE8',CLR.navyDark);
  addT1(`المبالغ بالريال السعودي  —  أُنشئ: ${genDate}`,8.5,CLR.textLight,CLR.navyDark);
  addS1(4);

  // Header row
  {
    const hdrRow=ws1.addRow(['البند',...perDb.map(d=>(d.name||d.db).replace('مؤسسة ','').replace('مصنع ','')),'المجمع']);
    hdrRow.height=22;
    hdrRow.eachCell({includeEmpty:true},(cell,ci)=>{
      cell.font={name:FONT,size:10,bold:true,color:{argb:CLR.white}};
      cell.fill=solid(CLR.navy);
      cell.alignment={horizontal:ci===1?'right':'center',vertical:'middle'};
      cell.border={bottom:bdr('medium',CLR.navyDark)};
    });
  }

  const PL_ROWS = [
    { lbl:'الإيراد',                         key:'revenue',    bold:false, indent:false },
    { lbl:'(-) تكلفة البضاعة المباعة',        key:'cogs',       bold:false, indent:true,  negate:true },
    { lbl:'مجمل الربح',                       key:'grossProfit',bold:true,  indent:false, subtotal:true },
    { lbl:null },
    { lbl:'رواتب وأجور',                      key:'sal',        bold:false, indent:true,  negate:true },
    { lbl:'إيجار',                            key:'rent',       bold:false, indent:true,  negate:true },
    { lbl:'صيانة وتشغيل',                    key:'maint',      bold:false, indent:true,  negate:true },
    { lbl:'مبيعات وتسويق',                   key:'sell',       bold:false, indent:true,  negate:true },
    { lbl:'توزيع ونقل',                      key:'dist',       bold:false, indent:true,  negate:true },
    { lbl:'مصروفات إدارية',                  key:'adm',        bold:false, indent:true,  negate:true },
    { lbl:'فوائد بنكية',                     key:'fin',        bold:false, indent:true,  negate:true },
    { lbl:'مصروفات خيرية',                  key:'char',       bold:false, indent:true,  negate:true },
    { lbl:'مصروفات أخرى',                   key:'oth',        bold:false, indent:true,  negate:true },
    { lbl:'(-) إجمالي المصروفات التشغيلية',  key:'totalOpex',  bold:true,  indent:false, subtotal:true, negate:true },
    { lbl:'صافي الربح',                      key:'netProfit',  bold:true,  indent:false, total:true },
  ];
  const gvPL = (agg, key) => {
    if (!key) return 0;
    if (key === 'cogs') return agg.totalCost;
    return (key in agg) ? agg[key] : 0;
  };

  PL_ROWS.forEach(row => {
    if (!row.lbl) {
      const srow=ws1.addRow(['مصروفات تشغيلية']); srow.height=14;
      srow.getCell(1).font={name:FONT,size:8.5,italic:true,color:{argb:CLR.textLight}};
      srow.getCell(1).alignment={horizontal:'right',vertical:'middle',indent:1};
      return;
    }
    const isTotal = row.total, isSub = row.subtotal;
    const vals = [...perDb.map(d => gvPL(d.agg, row.key)), gvPL(c, row.key)];
    const xlRow = ws1.addRow([row.lbl, ...vals.map(() => null)]);
    xlRow.height = isSub || isTotal ? 18 : 16;
    xlRow.getCell(1).font={name:FONT,size:9.5,bold:row.bold,color:{argb:isTotal?CLR.white:CLR.textDark}};
    xlRow.getCell(1).alignment={horizontal:'right',vertical:'middle',indent:row.indent?2:0};
    if(isTotal) { xlRow.getCell(1).fill=solid(CLR.navy); xlRow.getCell(1).border={top:bdr('medium',CLR.navyDark),bottom:bdr('medium',CLR.navyDark)}; }
    else if(isSub) { xlRow.getCell(1).fill=solid(CLR.bluePale); xlRow.getCell(1).border={top:bdr('thin','FFC0CFE8'),bottom:bdr('thin','FFB0C4DC')}; }
    else xlRow.getCell(1).border={bottom:bdr('hair','FFE8ECF0')};
    vals.forEach((v, ci) => {
      const cell = xlRow.getCell(ci + 2);
      const display = row.negate ? -v : v;
      cell.value = +display.toFixed(0);
      cell.numFmt = (isSub || isTotal) ? numFmt : numFmt0;
      cell.alignment = { horizontal:'left', vertical:'middle' };
      const isConsCol = ci === vals.length - 1;
      cell.font = { name:FONT, size:9.5, bold:row.bold,
        color:{ argb: isTotal ? (v>=0?CLR.greenText:'FFCC4444') : isConsCol ? 'FF1A3A6A' : CLR.textNavy } };
      if(isTotal)  { cell.fill=solid(CLR.navy); cell.border={top:bdr('medium',CLR.navyDark),bottom:bdr('medium',CLR.navyDark)}; }
      else if(isSub) { cell.fill=solid(isConsCol?'FFF0F4FA':CLR.bluePale); cell.border={top:bdr('thin','FFC0CFE8'),bottom:bdr('thin','FFB0C4DC')}; }
      else cell.border={bottom:bdr('hair','FFE8ECF0')};
    });
  });

  if (elim.applied) {
    addS1(3);
    const noteRow=ws1.addRow([`* استُبعد بينياً: إيراد ${Math.round(elim.totalRevenue).toLocaleString('ar-SA')} ر.س | تكلفة ${Math.round(elim.totalCOGS).toLocaleString('ar-SA')} ر.س | ذمم AR/AP ${Math.round(elim.latestARElim).toLocaleString('ar-SA')} / ${Math.round(elim.latestAPElim).toLocaleString('ar-SA')} ر.س`]);
    noteRow.height=14; span1(noteRow);
    noteRow.getCell(1).font={name:FONT,size:8,color:{argb:CLR.textLight}};
    noteRow.getCell(1).alignment={horizontal:'right',vertical:'middle'};
  }

  // ── Sheet 2: Consolidated Balance Sheet ──────────────────────────────────
  const ws2 = wb.addWorksheet('المركز المالي المجمع', { views:[{ rightToLeft:true }] });
  ws2.pageSetup.paperSize=9; ws2.pageSetup.orientation='portrait';
  ws2.pageSetup.fitToPage=true; ws2.pageSetup.fitToWidth=1;
  ws2.pageSetup.margins={left:0.6,right:0.5,top:0.75,bottom:0.75,header:0.3,footer:0.3};
  ws2.columns=[{width:46},{width:22}];

  const span2 = row => ws2.mergeCells(row.number,1,row.number,2);
  const addT2 = (t,sz,fc,bg) => {
    const row=ws2.addRow([t]); row.height=sz>12?32:22; span2(row);
    const cell=row.getCell(1);
    cell.font={name:FONT,size:sz,bold:true,color:{argb:fc}};
    cell.fill=solid(bg); cell.alignment={horizontal:'center',vertical:'middle'};
  };
  const addS2 = (h=5) => { const row=ws2.addRow(['']); row.height=h; span2(row); row.getCell(1).fill=solid(CLR.white); };
  const addHdr2 = lbl => {
    const row=ws2.addRow([lbl]); row.height=18; span2(row);
    const c=row.getCell(1);
    c.font={name:FONT,size:9.5,bold:true,color:{argb:CLR.white}};
    c.fill=solid(CLR.navy); c.alignment={horizontal:'right',vertical:'middle',indent:1};
  };
  const addCatHdr2 = lbl => {
    const row=ws2.addRow([lbl]); row.height=16; span2(row);
    const c=row.getCell(1);
    c.font={name:FONT,size:8.5,bold:true,color:{argb:CLR.textBlue}};
    c.fill=solid(CLR.blueLight); c.alignment={horizontal:'right',vertical:'middle',indent:1};
  };
  const addBsItem = (lbl, val) => {
    const row=ws2.addRow([lbl,null]); row.height=16;
    row.getCell(1).font={name:FONT,size:9.5,color:{argb:CLR.textDark}};
    row.getCell(1).alignment={horizontal:'right',vertical:'middle',indent:3};
    row.getCell(1).border={bottom:bdr('hair','FFE8ECF0')};
    const c2=row.getCell(2);
    c2.value=val!==null?+val.toFixed(0):null; c2.numFmt=numFmt0;
    c2.font={name:FONT,size:9.5,color:{argb:CLR.textNavy}};
    c2.alignment={horizontal:'left',vertical:'middle'}; c2.border={bottom:bdr('hair','FFE8ECF0')};
  };
  const addSubTot2 = (lbl, val, fc) => {
    const row=ws2.addRow([lbl,null]); row.height=17;
    const tb={top:bdr('thin','FFC0CFE8'),bottom:bdr('thin','FFB0C4DC')};
    row.getCell(1).font={name:FONT,size:9.5,bold:true,color:{argb:fc||CLR.textNavy}};
    row.getCell(1).fill=solid(CLR.bluePale); row.getCell(1).alignment={horizontal:'right',vertical:'middle',indent:1}; row.getCell(1).border=tb;
    const c2=row.getCell(2);
    c2.value=+val.toFixed(0); c2.numFmt=numFmt; c2.font={name:FONT,size:9.5,bold:true,color:{argb:fc||CLR.textNavy}};
    c2.fill=solid(CLR.bluePale); c2.alignment={horizontal:'left',vertical:'middle'}; c2.border=tb;
  };
  const addGrandTot2 = (lbl, val, fc) => {
    const row=ws2.addRow([lbl,null]); row.height=20;
    const bord={top:bdr('double',CLR.navyDark),bottom:bdr('medium',CLR.navyDark)};
    row.getCell(1).font={name:FONT,size:10,bold:true,color:{argb:fc||CLR.white}};
    row.getCell(1).fill=solid(CLR.navyDark); row.getCell(1).alignment={horizontal:'right',vertical:'middle'}; row.getCell(1).border=bord;
    const c2=row.getCell(2);
    c2.value=+val.toFixed(0); c2.numFmt=numFmt; c2.font={name:FONT,size:10,bold:true,color:{argb:fc||CLR.white}};
    c2.fill=solid(CLR.navyDark); c2.alignment={horizontal:'left',vertical:'middle'}; c2.border=bord;
  };

  addT2('المجموعة المجمعة — '+companyName,14,CLR.white,CLR.navyDark);
  addT2('قائمة المركز المالي المجمع',12,CLR.white,CLR.navy);
  addT2(`كما في ${selBsMo}${elim.applied?' | بعد الاستبعاد البيني':''}`,9.5,'FFAACCE8',CLR.navyDark);
  addT2(`المبالغ بالريال السعودي  —  أُنشئ: ${genDate}`,8.5,CLR.textLight,CLR.navyDark);
  addS2(4);

  // Assets
  const bsLatest = bs.filter(r => r.month === selBsMo);
  const c3r = r => r.code3 || r.grpCode.slice(0,3);
  const srt = arr => arr.sort((a,b) => a.grpCode.localeCompare(b.grpCode));
  const curAssets    = srt(bsLatest.filter(r => c3r(r)==='103' && r.balance!==0));
  const nonCurAssets = srt(bsLatest.filter(r => r.grpCode.startsWith('1') && c3r(r)!=='103' && r.balance!==0));
  const curLiab      = srt(bsLatest.filter(r => c3r(r)==='201' && r.balance!==0));
  const nonCurLiab   = srt(bsLatest.filter(r => r.grpCode.startsWith('2') && c3r(r)!=='201' && r.balance!==0));
  const equity       = srt(bsLatest.filter(r => r.grpCode.startsWith('3') && r.balance!==0));

  addHdr2('الأصول');
  addCatHdr2('الأصول المتداولة');
  curAssets.forEach(r => addBsItem(r.grpName||r.grpCode, Math.abs(r.balance)));
  addSubTot2('إجمالي الأصول المتداولة', totalCA, 'FF1A5A9A');
  addCatHdr2('الأصول غير المتداولة');
  nonCurAssets.forEach(r => addBsItem(r.grpName||r.grpCode, Math.abs(r.balance)));
  addSubTot2('إجمالي الأصول غير المتداولة', totalNCA, 'FF4A7A9A');
  addGrandTot2('إجمالي الأصول', totalA);

  addS2(4);
  addHdr2('الخصوم وحقوق الملكية');
  addCatHdr2('الخصوم المتداولة');
  curLiab.forEach(r => addBsItem(r.grpName||r.grpCode, -r.balance));
  addSubTot2('إجمالي الخصوم المتداولة', totalCL, 'FFDA7A2A');
  if (nonCurLiab.length) {
    addCatHdr2('الخصوم غير المتداولة');
    nonCurLiab.forEach(r => addBsItem(r.grpName||r.grpCode, -r.balance));
    addSubTot2('إجمالي الخصوم غير المتداولة', totalNCL, 'FFDA6A2A');
  }
  addSubTot2('إجمالي الخصوم', totalL, 'FFAA7070');
  addS2(3);
  addCatHdr2('حقوق الملكية');
  equity.forEach(r => addBsItem(r.grpName||r.grpCode, -r.balance));
  if (Math.abs(priorNP) > 100) addBsItem('أرباح مرحلة من فترات سابقة', priorNP);
  addBsItem(`صافي ربح الفترة الجارية (${plUpTo[0]?.month||''} — ${selBsMo})`, monNP);
  addSubTot2('إجمالي حقوق الملكية', totalE, totalE>=0?CLR.greenText:'FFCC4444');
  addGrandTot2('إجمالي الخصوم وحقوق الملكية', totalA);

  addS2(4);
  {
    const balanced = Math.abs(totalA - (totalL + totalE)) < 1;
    const noteRow=ws2.addRow([`${balanced?'✓':'⚠'} المعادلة المحاسبية: إجمالي الأصول ${Math.round(totalA).toLocaleString('ar-SA')} = خصوم ${Math.round(totalL).toLocaleString('ar-SA')} + ملكية ${Math.round(totalE).toLocaleString('ar-SA')} ر.س`]);
    noteRow.height=16; span2(noteRow);
    noteRow.getCell(1).font={name:FONT,size:8.5,bold:balanced,color:{argb:balanced?CLR.greenText:'FFCC4444'}};
    noteRow.getCell(1).fill=solid(balanced?CLR.greenBg:'FFFFF4F4');
    noteRow.getCell(1).alignment={horizontal:'center',vertical:'middle'};
    noteRow.getCell(1).border={top:bdr('thin',balanced?CLR.greenBdr:'FFCC8888'),bottom:bdr('thin',balanced?CLR.greenBdr:'FFCC8888')};
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `القوائم_المالية_المجمعة_${selFrom}_${selTo}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Consolidated HTML report builder (shared by export + print) ──────────────
function buildConsHTMLReport(data, selFrom, selTo) {
  const { companies = [], pl, bs, byDb, elimination } = data;
  const elim = elimination || { applied: false };

  const inRange  = m => m >= selFrom && m <= selTo;
  const plFilt   = pl.filter(r => inRange(r.month));
  const c        = aggregatePL(plFilt);
  const bsMths   = [...new Set(bs.map(r => r.month))].sort();
  const selBsMo  = (selTo && bsMths.includes(selTo)) ? selTo : bsMths[bsMths.length - 1];
  const { A: totalA, CA: totalCA, NCA: totalNCA,
          L: totalL, CL: totalCL, NCL: totalNCL, E: totalE, E_hist: totalE_hist } = _bsTotals(bs, selBsMo);

  const plUpTo  = pl.filter(r => r.month <= selBsMo);
  const monNP   = aggregatePL(plUpTo).netProfit;
  const priorNP = (totalE - totalE_hist) - monNP;

  const perDb = (byDb || []).map(d => ({
    ...d,
    agg: aggregatePL(d.pl.filter(r => inRange(r.month))),
    bs:  _bsTotals(d.bs, selBsMo),
  }));
  const companyName = companies.map(cx => (cx.name||cx.db).replace('مؤسسة ','').replace('مصنع ','')).join(' + ') || 'المجموعة المجمعة';
  const genDate = new Date().toLocaleDateString('ar-SA', { year:'numeric', month:'long', day:'numeric' });
  const fN  = v => Math.round(Math.abs(v)).toLocaleString('ar-SA');
  const fSg = v => v < 0 ? `(${fN(v)})` : fN(v);
  const gvPL = (agg, key) => { if (!key) return 0; if (key==='cogs') return agg.totalCost; return (key in agg) ? agg[key] : 0; };

  const PL_ROWS = [
    { lbl:'الإيراد',                        key:'revenue',    type:'normal' },
    { lbl:'(-) تكلفة البضاعة المباعة',       key:'cogs',       type:'normal',   negate:true },
    { lbl:'مجمل الربح',                      key:'grossProfit',type:'subtotal' },
    null,
    { lbl:'رواتب وأجور',                     key:'sal',        type:'indent',   negate:true },
    { lbl:'إيجار',                           key:'rent',       type:'indent',   negate:true },
    { lbl:'صيانة وتشغيل',                   key:'maint',      type:'indent',   negate:true },
    { lbl:'مبيعات وتسويق',                  key:'sell',       type:'indent',   negate:true },
    { lbl:'توزيع ونقل',                     key:'dist',       type:'indent',   negate:true },
    { lbl:'مصروفات إدارية',                 key:'adm',        type:'indent',   negate:true },
    { lbl:'فوائد بنكية',                    key:'fin',        type:'indent',   negate:true },
    { lbl:'مصروفات خيرية',                 key:'char',       type:'indent',   negate:true },
    { lbl:'مصروفات أخرى',                  key:'oth',        type:'indent',   negate:true },
    { lbl:'(-) إجمالي المصروفات التشغيلية', key:'totalOpex',  type:'subtotal', negate:true },
    { lbl:'صافي الربح',                     key:'netProfit',  type:'total' },
  ];

  const dbHdrs = perDb.map(d => `<th>${(d.name||d.db).replace('مؤسسة ','').replace('مصنع ','')}</th>`).join('');
  let plHtml = '';
  PL_ROWS.forEach(row => {
    if (!row) { plHtml += `<tr class="section-lbl"><td colspan="${perDb.length+2}">مصروفات تشغيلية</td></tr>`; return; }
    const vals = [...perDb.map(d => gvPL(d.agg, row.key)), gvPL(c, row.key)];
    plHtml += `<tr class="${row.type}">
      <td class="lbl">${row.lbl}</td>
      ${vals.map((v,i) => { const d = row.negate ? -v : v; return `<td class="num${i===vals.length-1?' cons':''}">${d!==0?fSg(d):'—'}</td>`; }).join('')}
    </tr>`;
  });

  const bsLatest     = bs.filter(r => r.month === selBsMo);
  const c3r          = r => r.code3 || r.grpCode.slice(0,3);
  const srt          = arr => [...arr].sort((a,b) => a.grpCode.localeCompare(b.grpCode));
  const curAssets    = srt(bsLatest.filter(r => c3r(r)==='103'  && r.balance!==0));
  const nonCurAssets = srt(bsLatest.filter(r => r.grpCode.startsWith('1') && c3r(r)!=='103' && r.balance!==0));
  const curLiab      = srt(bsLatest.filter(r => c3r(r)==='201'  && r.balance!==0));
  const nonCurLiab   = srt(bsLatest.filter(r => r.grpCode.startsWith('2') && c3r(r)!=='201' && r.balance!==0));
  const equity       = srt(bsLatest.filter(r => r.grpCode.startsWith('3') && r.balance!==0));

  const bi   = (l,v) => `<tr class="bs-item"><td>${l}</td><td class="num">${fN(v)}</td></tr>`;
  const bsub = (l,v) => `<tr class="subtotal"><td>${l}</td><td class="num">${fN(v)}</td></tr>`;
  const bgrd = (l,v) => `<tr class="grand"><td>${l}</td><td class="num">${fN(v)}</td></tr>`;
  const bsec = l     => `<tr class="sec-hdr"><td colspan="2">${l}</td></tr>`;
  const bcat = l     => `<tr class="cat-hdr"><td colspan="2">${l}</td></tr>`;
  const bsep = ()    => `<tr class="spacer"><td colspan="2"></td></tr>`;

  let bsHtml = '';
  bsHtml += bsec('الأصول');
  bsHtml += bcat('الأصول المتداولة');
  curAssets.forEach(r => { bsHtml += bi(r.grpName||r.grpCode, Math.abs(r.balance)); });
  bsHtml += bsub('إجمالي الأصول المتداولة', totalCA);
  bsHtml += bcat('الأصول غير المتداولة');
  nonCurAssets.forEach(r => { bsHtml += bi(r.grpName||r.grpCode, Math.abs(r.balance)); });
  bsHtml += bsub('إجمالي الأصول غير المتداولة', totalNCA);
  bsHtml += bgrd('إجمالي الأصول', totalA);
  bsHtml += bsep();
  bsHtml += bsec('الخصوم وحقوق الملكية');
  bsHtml += bcat('الخصوم المتداولة');
  curLiab.forEach(r => { bsHtml += bi(r.grpName||r.grpCode, -r.balance); });
  bsHtml += bsub('إجمالي الخصوم المتداولة', totalCL);
  if (nonCurLiab.length) {
    bsHtml += bcat('الخصوم غير المتداولة');
    nonCurLiab.forEach(r => { bsHtml += bi(r.grpName||r.grpCode, -r.balance); });
    bsHtml += bsub('إجمالي الخصوم غير المتداولة', totalNCL);
  }
  bsHtml += bsub('إجمالي الخصوم', totalL);
  bsHtml += bsep();
  bsHtml += bcat('حقوق الملكية');
  equity.forEach(r => { bsHtml += bi(r.grpName||r.grpCode, -r.balance); });
  if (Math.abs(priorNP) > 100) bsHtml += bi('أرباح مرحلة من فترات سابقة', priorNP);
  bsHtml += bi(`صافي ربح الفترة الجارية (${plUpTo[0]?.month||''} — ${selBsMo})`, monNP);
  bsHtml += bsub('إجمالي حقوق الملكية', totalE);
  bsHtml += bgrd('إجمالي الخصوم وحقوق الملكية', totalA);

  const balanced = Math.abs(totalA - (totalL + totalE)) < 1;
  const elimNote = elim.applied
    ? `<p class="elim-note">* استُبعد بينياً: إيراد ${fN(elim.totalRevenue)} ر.س | تكلفة ${fN(elim.totalCOGS)} ر.س | ذمم AR/AP ${fN(elim.latestARElim)} / ${fN(elim.latestAPElim)} ر.س</p>` : '';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>القوائم المالية المجمعة — ${selFrom} إلى ${selTo}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Tahoma,'Arabic Typesetting',sans-serif;direction:rtl;text-align:right;background:#fff;color:#111;font-size:13px;line-height:1.6}
.page{max-width:920px;margin:0 auto;padding:28px 24px}
.hdr{background:#0A2040;color:#fff;padding:18px 24px;border-radius:6px 6px 0 0;text-align:center}
.hdr h1{font-size:18px;margin-bottom:4px}
.hdr h2{font-size:13px;font-weight:normal;color:#AACCE8}
.hdr .meta{font-size:11px;color:#6A8AAA;margin-top:4px}
.sec-title{background:#1A3A6A;color:#fff;padding:8px 14px;font-size:13px;font-weight:bold;margin-top:20px;border-radius:4px}
table{width:100%;border-collapse:collapse;margin-top:0}
td,th{padding:6px 10px;border-bottom:1px solid #E8ECF0}
th{background:#1A3A6A;color:#fff;font-size:11px;text-align:center;padding:8px 10px}
th:first-child{text-align:right}
.num{text-align:left;font-variant-numeric:tabular-nums;white-space:nowrap}
.cons{color:#1A3A6A;font-weight:bold}
.lbl{}
.indent td.lbl{padding-right:28px;color:#444;font-size:12px}
.subtotal{background:#F4F7FB;font-weight:bold}
.subtotal td{border-top:1px solid #C0CFE8;border-bottom:1px solid #B0C4DC}
.grand{background:#0A2040;color:#fff;font-weight:bold;font-size:13.5px}
.grand td{color:#fff;border-bottom:2px solid #0A2040}
.section-lbl td{font-size:11px;color:#6A8AAA;font-style:italic;padding:10px 10px 3px;border-bottom:none}
.sec-hdr td{background:#1A3A6A;color:#fff;font-weight:bold;padding:8px 12px;font-size:12.5px}
.cat-hdr td{background:#E8EEF8;color:#1A3A6A;font-weight:bold;padding:6px 12px;font-size:11.5px}
.bs-item td{padding:5px 10px}
.bs-item td:first-child{padding-right:32px;color:#333;font-size:12px}
.spacer td{height:8px;border-bottom:none}
.bal-note{margin-top:10px;padding:8px 14px;border-radius:4px;font-size:11.5px;font-weight:bold;text-align:center}
.bal-ok{background:#F4FFF8;color:#1A6A2A;border:1px solid #90C890}
.bal-err{background:#FFF4F4;color:#CC4444;border:1px solid #CC8888}
.elim-note{font-size:11px;color:#6A8AAA;margin-top:8px;padding:6px 10px;border-top:1px solid #E8ECF0}
.footer{margin-top:28px;padding-top:10px;border-top:1px solid #E8ECF0;font-size:10px;color:#9AB;text-align:center}
.page-break{page-break-before:always;height:1px}
@media print{
  body{font-size:11px}
  .page{padding:8px;max-width:100%}
  .sec-title{margin-top:10px}
}
</style>
</head>
<body>
<div class="page">
  <div class="hdr">
    <h1>المجموعة المجمعة — ${companyName}</h1>
    <h2>القوائم المالية المجمعة${elim.applied?' | بعد الاستبعاد البيني':''}</h2>
    <div class="meta">المبالغ بالريال السعودي &nbsp;|&nbsp; أُنشئ: ${genDate}</div>
  </div>

  <div class="sec-title">قائمة الدخل الشامل المجمعة &nbsp;—&nbsp; الفترة: ${selFrom} إلى ${selTo}</div>
  <table>
    <thead><tr><th>البند</th>${dbHdrs}<th>المجمع</th></tr></thead>
    <tbody>${plHtml}</tbody>
  </table>
  ${elimNote}

  <div class="page-break"></div>
  <div class="sec-title">قائمة المركز المالي المجمع &nbsp;—&nbsp; كما في ${selBsMo}</div>
  <table><tbody>${bsHtml}</tbody></table>
  <div class="bal-note ${balanced?'bal-ok':'bal-err'}">
    ${balanced?'✓':'⚠'} المعادلة المحاسبية: إجمالي الأصول ${fN(totalA)} = خصوم ${fN(totalL)} + ملكية ${fN(totalE)} ر.س
  </div>

  <div class="footer">أُنشئ بواسطة MekSoft ERP Dashboard &nbsp;|&nbsp; ${genDate}</div>
</div>
</body>
</html>`;
}

function exportConsHTML() {
  const data = State.get('consolidated');
  if (!data) { alert('لا توجد بيانات مجمعة لتصديرها'); return; }
  const { pl, bs } = data;
  const allMths = [...new Set([...pl.map(r => r.month), ...bs.map(r => r.month)])].sort();
  const fromSel = document.getElementById('cons-period-from');
  const toSel   = document.getElementById('cons-period-to');
  const selFrom = (fromSel && fromSel.value && allMths.includes(fromSel.value)) ? fromSel.value : allMths[0];
  const selTo   = (toSel   && toSel.value   && allMths.includes(toSel.value))   ? toSel.value   : allMths[allMths.length - 1];
  const html = buildConsHTMLReport(data, selFrom, selTo);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `القوائم_المالية_المجمعة_${selFrom}_${selTo}.html`; a.click();
  URL.revokeObjectURL(url);
}

function printConsPDF() {
  const data = State.get('consolidated');
  if (!data) { alert('لا توجد بيانات مجمعة لتصديرها'); return; }
  const { pl, bs } = data;
  const allMths = [...new Set([...pl.map(r => r.month), ...bs.map(r => r.month)])].sort();
  const fromSel = document.getElementById('cons-period-from');
  const toSel   = document.getElementById('cons-period-to');
  const selFrom = (fromSel && fromSel.value && allMths.includes(fromSel.value)) ? fromSel.value : allMths[0];
  const selTo   = (toSel   && toSel.value   && allMths.includes(toSel.value))   ? toSel.value   : allMths[allMths.length - 1];
  const html = buildConsHTMLReport(data, selFrom, selTo);
  const w = window.open('', '_blank', 'width=960,height=720');
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 800);
}
