/**
 * タケノコ買取受付アプリ - app.js (Firestore対応版)
 */

// ===== STATE =====
let cfg = {
  date: todayStr(),
  prices: [200, 200, 100, 80, 60, 50],
  prevBal: 0,
};
let records    = [];
let history    = [];
let nameMaster = {};

// ===== UTIL =====
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function fmt(n) {
  return '¥' + Math.round(n).toLocaleString('ja-JP');
}
function fmtKg(n) {
  return Number(n).toFixed(1) + ' kg';
}
function roundUp10(n) {
  return Math.ceil(n / 10) * 10;
}
function calcRecord(weights) {
  let raw = 0;
  for (let i = 0; i < 6; i++) raw += (weights[i] || 0) * cfg.prices[i];
  const rounded = roundUp10(raw);
  return { raw, rounded, adj: rounded - raw };
}
function showMsg(elId, text, isError = false, seconds = 3) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = text;
  el.className = 'save-msg' + (isError ? ' error' : '');
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), seconds * 1000);
}

// ===== LOADING OVERLAY =====
function showLoading(visible) {
  const el = document.getElementById('loading-overlay');
  if (!el) return;
  if (visible) el.classList.remove('hidden');
  else el.classList.add('hidden');
}

// ===== TAB NAVIGATION =====
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(tabId).classList.add('active');
      if (tabId === 'tab03') renderRecordsTable();
      if (tabId === 'tab04') renderAgg();
      if (tabId === 'tab05') renderHistory();
    });
  });
}

function updateHeaderDate() {
  document.getElementById('header-date').textContent = cfg.date;
}

// ===== TAB-01: 設定 =====
function initTab01() {
  document.getElementById('cfg-date').value = cfg.date;
  const ids = ['price-1','price-2','price-3','price-4','price-5','price-kizu'];
  ids.forEach((id, i) => {
    document.getElementById(id).value = cfg.prices[i];
  });
  renderPrevBal();

  document.getElementById('btn-save-cfg').addEventListener('click', async () => {
    cfg.date   = document.getElementById('cfg-date').value;
    cfg.prices = ids.map(id => parseFloat(document.getElementById(id).value) || 0);
    try {
      await fsSaveCfg(cfg);
      updateHeaderDate();
      showMsg('cfg-save-msg', '✅ 設定を保存しました');
      updatePricePreview();
    } catch(e) {
      showMsg('cfg-save-msg', '❌ 保存に失敗しました', true);
    }
  });

  document.getElementById('btn-prevbal-change').addEventListener('click', async () => {
    const val = parseFloat(document.getElementById('prevbal-input').value);
    if (isNaN(val) || val < 0) { alert('正しい金額を入力してください'); return; }
    cfg.prevBal  = val;
    cfg._autobal = false;
    try {
      await fsSaveCfg(cfg);
      document.getElementById('prevbal-input').value = '';
      renderPrevBal();
      showMsg('cfg-save-msg', '✅ 前日残金を変更しました');
    } catch(e) {
      showMsg('cfg-save-msg', '❌ 保存に失敗しました', true);
    }
  });

  renderNameMaster();
}

function renderPrevBal() {
  document.getElementById('prevbal-display').textContent = fmt(cfg.prevBal || 0);
  const badge = document.getElementById('prevbal-badge');
  if (cfg._autobal) badge.classList.remove('hidden');
  else badge.classList.add('hidden');
}

function renderNameMaster() {
  const container = document.getElementById('name-master-list');
  const sorted = Object.entries(nameMaster).sort((a,b) => b[1]-a[1]);
  if (!sorted.length) {
    container.innerHTML = '<p class="empty-msg">まだ登録された氏名がありません</p>';
    return;
  }
  container.innerHTML = sorted.map(([name, count]) => `
    <div class="name-master-item">
      <span class="name-text">${name}<span class="name-count">${count}回</span></span>
      <div class="name-master-actions">
        <button class="btn-delete-name" data-name="${name}">削除</button>
      </div>
    </div>
  `).join('');
  container.querySelectorAll('.btn-delete-name').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm(`「${btn.dataset.name}」を氏名マスタから削除しますか？`)) {
        delete nameMaster[btn.dataset.name];
        await fsSaveNames(nameMaster);
        renderNameMaster();
      }
    });
  });
}

// ===== TAB-02: 受付入力 =====
let suggestIdx = -1;
const W_IDS = ['w1','w2','w3','w4','w5','w-kizu'];

function initTab02() {
  const nameInput = document.getElementById('input-name');
  const dropdown  = document.getElementById('suggest-dropdown');
  const wInputs   = W_IDS.map(id => document.getElementById(id)).filter(Boolean);

  if (!nameInput) { console.error('input-name not found'); return; }

  const onNameChange = () => { suggestIdx = -1; showSuggest(nameInput.value); updateRegisterBtn(); };
  nameInput.addEventListener('focus',  () => showSuggest(nameInput.value));
  nameInput.addEventListener('input',  onNameChange);
  nameInput.addEventListener('change', onNameChange);
  nameInput.addEventListener('keyup',  onNameChange);

  nameInput.addEventListener('keydown', e => {
    const items = dropdown.querySelectorAll('.suggest-item');
    if (e.key === 'ArrowDown')  { e.preventDefault(); suggestIdx = Math.min(suggestIdx+1, items.length-1); highlightSuggest(items); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); suggestIdx = Math.max(suggestIdx-1, -1); highlightSuggest(items); }
    else if (e.key === 'Enter')     { if (suggestIdx >= 0 && items[suggestIdx]) { selectSuggest(items[suggestIdx].dataset.name); e.preventDefault(); } }
    else if (e.key === 'Escape')    { closeSuggest(); }
  });

  document.addEventListener('click', e => {
    if (!dropdown.contains(e.target) && e.target !== nameInput) closeSuggest();
  });

  const onWeightChange = () => { updatePricePreview(); updateRegisterBtn(); };
  wInputs.forEach(inp => {
    inp.addEventListener('input',  onWeightChange);
    inp.addEventListener('change', onWeightChange);
    inp.addEventListener('keyup',  onWeightChange);
  });

  document.getElementById('btn-register').addEventListener('click', registerRecord);
}

function showSuggest(q) {
  const dropdown = document.getElementById('suggest-dropdown');
  const sorted   = Object.entries(nameMaster).sort((a,b) => b[1]-a[1]);
  const filtered = q.trim() ? sorted.filter(([n]) => n.includes(q.trim())) : sorted;
  const max8     = filtered.slice(0, 8);

  if (!max8.length) { closeSuggest(); return; }
  dropdown.innerHTML = max8.map(([name, count]) => `
    <div class="suggest-item" data-name="${name}">
      <span>${name}</span>
      <span class="suggest-count">${count}回</span>
    </div>
  `).join('');
  dropdown.classList.remove('hidden');
  dropdown.querySelectorAll('.suggest-item').forEach(item => {
    item.addEventListener('mousedown', e => { e.preventDefault(); selectSuggest(item.dataset.name); });
  });
}

function highlightSuggest(items) {
  items.forEach((el, i) => el.classList.toggle('active', i === suggestIdx));
  if (suggestIdx >= 0) document.getElementById('input-name').value = items[suggestIdx].dataset.name;
}
function selectSuggest(name) {
  document.getElementById('input-name').value = name;
  closeSuggest();
  updateRegisterBtn();
}
function closeSuggest() {
  document.getElementById('suggest-dropdown').classList.add('hidden');
  suggestIdx = -1;
}

function getWeights() {
  return W_IDS.map(id => {
    const el  = document.getElementById(id);
    const val = el ? parseFloat(el.value) : NaN;
    return isNaN(val) || val < 0 ? 0 : val;
  });
}

function updatePricePreview() {
  const weights = getWeights();
  const totalW  = weights.reduce((a,b) => a+b, 0);
  const { raw, rounded, adj } = calcRecord(weights);

  document.getElementById('prev-total-weight').textContent = fmtKg(totalW);
  document.getElementById('prev-raw').textContent          = fmt(raw);
  document.getElementById('prev-rounded').textContent      = fmt(rounded);
  document.getElementById('prev-adj').textContent          = fmt(adj);

  const adjRow = document.getElementById('prev-adj-row');
  if (adj > 0) adjRow.classList.add('show'); else adjRow.classList.remove('show');
}

function updateRegisterBtn() {
  const name     = document.getElementById('input-name').value.trim();
  const weights  = getWeights();
  const hasWeight = weights.some(w => w > 0);
  document.getElementById('btn-register').disabled = !(name && hasWeight);
}

async function registerRecord() {
  const name    = document.getElementById('input-name').value.trim();
  const weights = getWeights();
  if (!name) return;

  const { raw, rounded, adj } = calcRecord(weights);
  const rec = { id: records.length + 1, name, weights, raw, rounded, adj };
  records.push(rec);

  nameMaster[name] = (nameMaster[name] || 0) + 1;

  try {
    await Promise.all([fsSaveRecords(records), fsSaveNames(nameMaster)]);
  } catch(e) {
    console.error('Firestore save error:', e);
  }

  document.getElementById('input-name').value = '';
  W_IDS.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  closeSuggest();
  updatePricePreview();
  updateRegisterBtn();
  renderNameMaster();
  showMsg('register-msg', `✅ ${name} さんを登録しました（¥${rounded.toLocaleString('ja-JP')}）`);
}

// ===== TAB-03: 受付一覧 =====
function renderRecordsTable() {
  const totalW   = records.reduce((s, r) => s + r.weights.reduce((a,b) => a+b, 0), 0);
  const dayTotal = records.reduce((s, r) => s + r.rounded, 0);
  const balance  = (cfg.prevBal || 0) - dayTotal;

  document.getElementById('sum-count').textContent   = records.length + ' 件';
  document.getElementById('sum-weight').textContent  = fmtKg(totalW);
  document.getElementById('sum-total').textContent   = fmt(dayTotal);
  document.getElementById('sum-balance').textContent = fmt(balance);

  const tbody = document.getElementById('records-tbody');
  if (!records.length) {
    tbody.innerHTML = '<tr><td colspan="12" class="empty-row">受付データがありません</td></tr>';
    return;
  }
  tbody.innerHTML = records.map((r, idx) => {
    const wCells   = r.weights.map(w => `<td>${w > 0 ? fmtKg(w) : '-'}</td>`).join('');
    const totalKg  = r.weights.reduce((a,b) => a+b, 0);
    const adjBadge = r.adj > 0 ? `<span class="badge badge-warn">${fmt(r.adj)}</span>` : '-';
    return `<tr>
      <td>${idx+1}</td><td>${r.name}</td>${wCells}
      <td>${fmtKg(totalKg)}</td><td>${fmt(r.rounded)}</td>
      <td>${adjBadge}</td>
      <td><button class="btn-del-row" data-idx="${idx}">削除</button></td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('.btn-del-row').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx  = parseInt(btn.dataset.idx);
      const name = records[idx].name;
      if (confirm(`No.${idx+1} ${name} さんのデータを削除しますか？`)) {
        records.splice(idx, 1);
        records.forEach((r, i) => { r.id = i + 1; });
        await fsSaveRecords(records);
        renderRecordsTable();
      }
    });
  });
}

// ===== TAB-04: 集計 =====
function renderAgg() {
  const LABELS = ['規格1','規格2','規格3','規格4','規格5','キズ'];
  const sumW   = [0,0,0,0,0,0];
  let adjTotal = 0;
  records.forEach(r => {
    r.weights.forEach((w, i) => { sumW[i] += w; });
    adjTotal += r.adj;
  });
  const dayTotal = records.reduce((s, r) => s + r.rounded, 0);

  const tbody = document.getElementById('delivery-tbody');
  let rows = '';
  for (let i = 0; i < 6; i++) {
    if (sumW[i] === 0) continue;
    const amt = sumW[i] * cfg.prices[i];
    rows += `<tr><td>${LABELS[i]}</td><td>${fmtKg(sumW[i])}</td><td>¥${cfg.prices[i].toLocaleString('ja-JP')}</td><td>${fmt(amt)}</td></tr>`;
  }
  if (adjTotal > 0) {
    rows += `<tr class="adj-row"><td><span class="badge badge-warn">調整</span></td><td>-</td><td>-</td><td>${fmt(adjTotal)}</td></tr>`;
  }
  if (!rows) rows = '<tr><td colspan="4" class="empty-row">受付データがありません</td></tr>';
  tbody.innerHTML = rows;

  const prevBal = cfg.prevBal || 0;
  document.getElementById('agg-day-total').textContent = fmt(dayTotal);
  document.getElementById('agg-prev-bal').textContent  = fmt(prevBal);
  document.getElementById('agg-balance').textContent   = fmt(prevBal - dayTotal);
}

function genLineText() {
  const LABELS = ['規格1','規格2','規格3','規格4','規格5','キズ'];
  const sumW   = [0,0,0,0,0,0];
  let adjTotal = 0;
  records.forEach(r => {
    r.weights.forEach((w, i) => { sumW[i] += w; });
    adjTotal += r.adj;
  });
  const dayTotal = records.reduce((s, r) => s + r.rounded, 0);
  const prevBal  = cfg.prevBal || 0;
  const balance  = prevBal - dayTotal;

  let lines = [`【タケノコ買取 日報】${cfg.date}`, ''];
  for (let i = 0; i < 6; i++) {
    if (sumW[i] === 0) continue;
    const amt = sumW[i] * cfg.prices[i];
    lines.push(`${LABELS[i]}：${sumW[i].toFixed(1)}kg × ¥${cfg.prices[i].toLocaleString('ja-JP')} = ${fmt(amt)}`);
  }
  if (adjTotal > 0) lines.push(`調整：${fmt(adjTotal)}`);
  lines.push('');
  lines.push(`受付件数：${records.length}名`);
  lines.push(`当日合計：${fmt(dayTotal)}`);
  lines.push(`前日残金：${fmt(prevBal)}`);
  lines.push(`残　　金：${fmt(balance)}`);
  return lines.join('\n');
}

function initTab04() {
  document.getElementById('btn-gen-line').addEventListener('click', () => {
    document.getElementById('line-textarea').value = genLineText();
  });
  document.getElementById('btn-copy-line').addEventListener('click', async () => {
    const text = document.getElementById('line-textarea').value;
    if (!text) { alert('先にテキストを生成してください'); return; }
    try { await navigator.clipboard.writeText(text); showMsg('confirm-msg', '📋 コピーしました'); }
    catch(e) { alert('コピーに失敗しました'); }
  });
  document.getElementById('btn-pdf-day').addEventListener('click', exportDayPDF);
  document.getElementById('btn-confirm-day').addEventListener('click', confirmDay);
}

async function confirmDay() {
  if (!records.length) { alert('受付データが1件もありません'); return; }
  if (!confirm('本日分を確定して保存しますか？\n保存後、受付データはリセットされます。')) return;

  const sumW   = [0,0,0,0,0,0];
  let adjTotal = 0;
  records.forEach(r => {
    r.weights.forEach((w, i) => { sumW[i] += w; });
    adjTotal += r.adj;
  });
  const dayTotal = records.reduce((s, r) => s + r.rounded, 0);
  const prevBal  = cfg.prevBal || 0;
  const balance  = prevBal - dayTotal;

  const entry = {
    date: cfg.date, records: JSON.parse(JSON.stringify(records)),
    sumW, totA: dayTotal, prevBal, balance, adj: adjTotal, count: records.length,
  };

  // history 配列も更新（TAB-05用）
  const existIdx = history.findIndex(h => h.date === cfg.date);
  if (existIdx >= 0) history[existIdx] = entry; else history.push(entry);

  cfg.prevBal  = balance;
  cfg._autobal = true;
  records      = [];

  try {
    showLoading(true);
    await Promise.all([
      fsSaveHistoryEntry(entry),
      fsSaveRecords(records),
      fsSaveCfg(cfg),
    ]);
    showLoading(false);
  } catch(e) {
    showLoading(false);
    console.error('Firestore save error:', e);
  }

  renderPrevBal();
  renderRecordsTable();
  renderAgg();
  showMsg('confirm-msg', '✅ 保存しました。前日残金を次回に自動引き継ぎます。', false, 3);
}

// ===== TAB-05: 履歴・分析 =====
let currentUnit = 'daily';

function initTab05() {
  document.querySelectorAll('.unit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentUnit = btn.dataset.unit;
      renderHistory();
    });
  });
  document.getElementById('btn-csv').addEventListener('click', exportCSV);
  document.getElementById('btn-pdf-summary').addEventListener('click', exportSummaryPDF);
  document.getElementById('btn-gen-line-hist').addEventListener('click', () => {
    document.getElementById('line-hist-textarea').value = genLineHistText();
  });
  document.getElementById('btn-copy-line-hist').addEventListener('click', async () => {
    const text = document.getElementById('line-hist-textarea').value;
    if (!text) { alert('先にテキストを生成してください'); return; }
    try { await navigator.clipboard.writeText(text); alert('コピーしました'); }
    catch(e) { alert('コピーに失敗しました'); }
  });

  // 編集モーダルのボタン
  document.getElementById('edit-hist-cancel').addEventListener('click', () => {
    document.getElementById('history-edit-modal').classList.add('hidden');
  });
  document.getElementById('edit-hist-save').addEventListener('click', saveHistoryEdit);
  // オーバーレイ外クリックで閉じる
  document.getElementById('history-edit-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('history-edit-modal')) {
      document.getElementById('history-edit-modal').classList.add('hidden');
    }
  });
}

function periodKey(date, unit) {
  const [y, m] = date.split('-');
  if (unit === 'daily')   return date;
  if (unit === 'monthly') return `${y}-${m}`;
  if (unit === 'yearly')  return y;
  if (unit === 'weekly') {
    const dt      = new Date(date);
    const start   = new Date(dt.getFullYear(), 0, 1);
    const week    = Math.ceil(((dt - start) / 86400000 + start.getDay() + 1) / 7);
    return `${y}-W${String(week).padStart(2, '0')}`;
  }
  return date;
}

function aggregateHistory(unit) {
  const map = {};
  history.forEach(h => {
    const key = periodKey(h.date, unit);
    if (!map[key]) map[key] = { key, count: 0, sumW: [0,0,0,0,0,0], totA: 0 };
    map[key].count += h.count;
    h.sumW.forEach((w, i) => { map[key].sumW[i] += w; });
    map[key].totA += h.totA;
  });
  return Object.values(map).sort((a,b) => a.key < b.key ? -1 : 1);
}

function renderHistory() {
  const rows  = aggregateHistory(currentUnit);
  const LABELS = ['規格1','規格2','規格3','規格4','規格5','キズ'];
  const tbody = document.getElementById('history-tbody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-row">確定済みデータがありません</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => {
    const wCells = r.sumW.map(w => `<td>${w > 0 ? w.toFixed(1) : '-'}</td>`).join('');
    const actionBtns = currentUnit === 'daily'
      ? `<td><button class="btn-hist-edit" data-date="${r.key}">編集</button><button class="btn-hist-del" data-date="${r.key}">削除</button></td>`
      : '<td>-</td>';
    return `<tr><td>${r.key}</td><td>${r.count}</td>${wCells}<td>${fmt(r.totA)}</td>${actionBtns}</tr>`;
  }).join('');

  // 削除ボタン
  tbody.querySelectorAll('.btn-hist-del').forEach(btn => {
    btn.addEventListener('click', () => deleteHistoryEntry(btn.dataset.date));
  });
  // 編集ボタン
  tbody.querySelectorAll('.btn-hist-edit').forEach(btn => {
    btn.addEventListener('click', () => openHistoryEditModal(btn.dataset.date));
  });
}

// ===== 履歴: 編集モーダルを開く =====
function openHistoryEditModal(date) {
  const entry = history.find(h => h.date === date);
  if (!entry) return;

  document.getElementById('edit-hist-date').value    = entry.date;
  document.getElementById('edit-hist-count').value   = entry.count || 0;
  document.getElementById('edit-hist-total').value   = entry.totA || 0;
  document.getElementById('edit-hist-prevbal').value = entry.prevBal || 0;
  (entry.sumW || [0,0,0,0,0,0]).forEach((w, i) => {
    const el = document.getElementById(`edit-w${i}`);
    if (el) el.value = w || 0;
  });

  document.getElementById('history-edit-modal').classList.remove('hidden');
}

// ===== 履歴: 編集内容を保存 =====
async function saveHistoryEdit() {
  const date    = document.getElementById('edit-hist-date').value;
  const idx     = history.findIndex(h => h.date === date);
  if (idx < 0) return;

  const sumW    = [0,1,2,3,4,5].map(i => parseFloat(document.getElementById(`edit-w${i}`).value) || 0);
  const totA    = parseInt(document.getElementById('edit-hist-total').value)   || 0;
  const prevBal = parseInt(document.getElementById('edit-hist-prevbal').value) || 0;
  const count   = parseInt(document.getElementById('edit-hist-count').value)   || 0;

  history[idx] = { ...history[idx], sumW, totA, prevBal, balance: prevBal - totA, count };

  try {
    showLoading(true);
    await fsUpdateHistory(history[idx]);
    showLoading(false);
    document.getElementById('history-edit-modal').classList.add('hidden');
    renderHistory();
  } catch(e) {
    showLoading(false);
    alert('保存に失敗しました: ' + e.message);
  }
}

// ===== 履歴: 削除 =====
async function deleteHistoryEntry(date) {
  if (!confirm(`${date} の確定データを削除しますか？\nこの操作は元に戻せません。`)) return;
  try {
    showLoading(true);
    await fsDeleteHistory(date);
    history = history.filter(h => h.date !== date);
    showLoading(false);
    renderHistory();
  } catch(e) {
    showLoading(false);
    alert('削除に失敗しました: ' + e.message);
  }
}

function genLineHistText() {
  const rows   = aggregateHistory(currentUnit);
  const labels = { daily:'日別', weekly:'週別', monthly:'月別', yearly:'年別' };
  const LABELS = ['規格1','規格2','規格3','規格4','規格5','キズ'];
  let lines    = [`【タケノコ買取 ${labels[currentUnit]}集計】`, ''];
  rows.forEach(r => {
    lines.push(`■ ${r.key}`);
    r.sumW.forEach((w, i) => { if (w > 0) lines.push(`  ${LABELS[i]}：${w.toFixed(1)}kg`); });
    lines.push(`  件数：${r.count}名 / 合計：${fmt(r.totA)}`);
    lines.push('');
  });
  return lines.join('\n');
}

// ===== CSV出力 =====
function exportCSV() {
  const rows   = aggregateHistory(currentUnit);
  const labels = { daily:'daily', weekly:'weekly', monthly:'monthly', yearly:'yearly' };
  const BOM    = '\uFEFF';
  const head   = ['期間','件数','規格1(kg)','規格2(kg)','規格3(kg)','規格4(kg)','規格5(kg)','キズ(kg)','合計金額'];
  const csv    = [head.join(','), ...rows.map(r => [r.key, r.count, ...r.sumW.map(w => w.toFixed(1)), r.totA].join(','))];
  const blob   = new Blob([BOM + csv.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href       = url;
  a.download   = `takenoko_${labels[currentUnit]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ===== PDF: 当日納品書 =====
function exportDayPDF() {
  const { jsPDF } = window.jspdf;
  const doc       = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const LABELS    = ['Kikaku-1','Kikaku-2','Kikaku-3','Kikaku-4','Kikaku-5','Kizu'];

  const sumW   = [0,0,0,0,0,0];
  let adjTotal = 0;
  records.forEach(r => { r.weights.forEach((w, i) => { sumW[i] += w; }); adjTotal += r.adj; });
  const dayTotal = records.reduce((s, r) => s + r.rounded, 0);
  const prevBal  = cfg.prevBal || 0;
  const balance  = prevBal - dayTotal;

  doc.setFontSize(16); doc.setFont('helvetica', 'bold');
  doc.text('Takenoko Delivery Note', 14, 18);
  doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${cfg.date}`, 14, 26);

  const body = [];
  for (let i = 0; i < 6; i++) {
    if (sumW[i] === 0) continue;
    const amt = sumW[i] * cfg.prices[i];
    body.push([LABELS[i], sumW[i].toFixed(1)+' kg', `Y${cfg.prices[i]}`, `Y${Math.round(amt).toLocaleString('ja-JP')}`]);
  }
  if (adjTotal > 0) body.push(['Chosei', '-', '-', `Y${adjTotal.toLocaleString('ja-JP')}`]);

  doc.autoTable({ startY: 32, head: [['Item','Weight','Unit Price','Amount']], body,
    headStyles: { fillColor: [30,40,80], textColor: 255 }, styles: { font: 'helvetica', fontSize: 10 } });

  const fy = (doc.lastAutoTable ? doc.lastAutoTable.finalY : 100) + 8;
  doc.setFontSize(12); doc.setFont('helvetica', 'bold');
  doc.text(`Total: Y${dayTotal.toLocaleString('ja-JP')}`, 14, fy);
  doc.text(`Prev Balance: Y${prevBal.toLocaleString('ja-JP')}`, 14, fy+7);
  doc.text(`Balance: Y${balance.toLocaleString('ja-JP')}`, 14, fy+14);

  doc.autoTable({ startY: fy+24,
    head: [['No.','Name','G1','G2','G3','G4','G5','Kz','Total kg','Amount','Adj']],
    body: records.map((r, i) => {
      const wStr = r.weights.map(w => w > 0 ? w.toFixed(1) : '-');
      return [i+1,'(name)',...wStr, r.weights.reduce((a,b)=>a+b,0).toFixed(1), `Y${r.rounded.toLocaleString('ja-JP')}`, r.adj>0?`+Y${r.adj}`:'-'];
    }),
    headStyles: { fillColor: [30,40,80], textColor: 255, fontSize: 8 },
    styles: { font: 'helvetica', fontSize: 8 } });

  doc.save(`takenoko_${cfg.date}.pdf`);
}

// ===== PDF: 集計レポート =====
function exportSummaryPDF() {
  const { jsPDF } = window.jspdf;
  const doc       = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const rows      = aggregateHistory(currentUnit);
  const labels    = { daily:'Daily', weekly:'Weekly', monthly:'Monthly', yearly:'Yearly' };

  doc.setFontSize(16); doc.setFont('helvetica','bold');
  doc.text(`Takenoko Summary Report (${labels[currentUnit]})`, 14, 18);
  doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text(`Exported: ${todayStr()}`, 240, 18, { align: 'right' });

  doc.autoTable({
    startY: 24,
    head: [['Period','Count','G1(kg)','G2(kg)','G3(kg)','G4(kg)','G5(kg)','Kz(kg)','Total']],
    body: rows.map(r => [r.key, r.count, ...r.sumW.map(w => w > 0 ? w.toFixed(1) : '-'), `Y${r.totA.toLocaleString('ja-JP')}`]),
    headStyles: { fillColor: [30,40,80], textColor: 255 },
    alternateRowStyles: { fillColor: [245,245,250] },
    styles: { font: 'helvetica', fontSize: 9 },
  });
  doc.save(`takenoko_summary_${currentUnit}.pdf`);
}

// ===== INIT =====
async function init() {
  showLoading(true);
  try {
    const data  = await fsLoadAll();
    cfg         = data.cfg;
    records     = data.records;
    nameMaster  = data.nameMaster;
    history     = data.history;
  } catch(e) {
    console.error('初期データ読み込みエラー:', e);
  } finally {
    showLoading(false);
  }

  updateHeaderDate();
  initTabs();
  initTab01();
  initTab02();
  initTab04();
  initTab05();

  updatePricePreview();
  updateRegisterBtn();
  renderRecordsTable();
  renderAgg();
}

document.addEventListener('DOMContentLoaded', init);
