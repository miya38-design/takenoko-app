/**
 * Firebase 初期化 & Firestore ヘルパー (自動生成)
 */
const firebaseConfig = {
  apiKey: "AIzaSyAMAjlJZH-oDxnI18NYu1raMY9vusszLQg",
  authDomain: "takenoko-app.firebaseapp.com",
  projectId: "takenoko-app",
  storageBucket: "takenoko-app.firebasestorage.app",
  messagingSenderId: "375474041899",
  appId: "1:375474041899:web:17d2e8446bb8814989e66e"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const COL = {
  cfg:     () => db.collection('cfg').doc('main'),
  records: () => db.collection('records').doc('main'),
  names:   () => db.collection('names').doc('main'),
  history: () => db.collection('history'),
};

async function fsSaveCfg(cfg) {
  localStorage.setItem('tk_cfg2', JSON.stringify(cfg));
  try { await COL.cfg().set(cfg); } catch(e) { console.warn('Firestore fsSaveCfg:', e); }
}

async function fsSaveRecords(records) {
  localStorage.setItem('tk_records2', JSON.stringify(records));
  try { await COL.records().set({ data: records }); } catch(e) { console.warn('Firestore fsSaveRecords:', e); }
}

async function fsSaveNames(nameMaster) {
  localStorage.setItem('tk_names2', JSON.stringify(nameMaster));
  try { await COL.names().set({ data: nameMaster }); } catch(e) { console.warn('Firestore fsSaveNames:', e); }
}

async function fsSaveHistoryEntry(entry) {
  const history = JSON.parse(localStorage.getItem('tk_history2') || '[]');
  const idx = history.findIndex(h => h.date === entry.date);
  if (idx >= 0) history[idx] = entry; else history.push(entry);
  localStorage.setItem('tk_history2', JSON.stringify(history));
  try { await COL.history().doc(entry.date).set(entry); } catch(e) { console.warn('Firestore fsSaveHistoryEntry:', e); }
}

const fsSaveHistory = fsSaveHistoryEntry;

async function fsLoadAll() {
  let cfg = { date: todayStr(), prices: [200,200,100,80,60,50], prevBal: 0 };
  try {
    const d = await COL.cfg().get();
    if (d.exists) { cfg = d.data(); }
    else { const c = localStorage.getItem('tk_cfg2'); if (c) cfg = JSON.parse(c); }
  } catch(e) { const c = localStorage.getItem('tk_cfg2'); if (c) try { cfg = JSON.parse(c); } catch(e2) {} }
  if (!cfg.prices || cfg.prices.length < 6) cfg.prices = [200,200,100,80,60,50];

  let records = [];
  try {
    const d = await COL.records().get();
    if (d.exists && d.data().data) { records = d.data().data; }
    else { const c = localStorage.getItem('tk_records2'); if (c) records = JSON.parse(c) || []; }
  } catch(e) { const c = localStorage.getItem('tk_records2'); if (c) try { records = JSON.parse(c) || []; } catch(e2) {} }

  let nameMaster = {};
  try {
    const d = await COL.names().get();
    if (d.exists && d.data().data) { nameMaster = d.data().data; }
    else { const c = localStorage.getItem('tk_names2'); if (c) nameMaster = JSON.parse(c) || {}; }
  } catch(e) { const c = localStorage.getItem('tk_names2'); if (c) try { nameMaster = JSON.parse(c) || {}; } catch(e2) {} }

  let history = [];
  try {
    const snap = await COL.history().orderBy('date').get();
    history = snap.docs.map(d => d.data());
  } catch(e) { const c = localStorage.getItem('tk_history2'); if (c) try { history = JSON.parse(c) || []; } catch(e2) {} }

  return { cfg, records, nameMaster, history };
}

async function fsDeleteHistory(date) {
  const history = JSON.parse(localStorage.getItem('tk_history2') || '[]');
  localStorage.setItem('tk_history2', JSON.stringify(history.filter(h => h.date !== date)));
  try { await COL.history().doc(date).delete(); } catch(e) { console.warn('Firestore fsDeleteHistory:', e); }
}

async function fsUpdateHistory(entry) {
  const history = JSON.parse(localStorage.getItem('tk_history2') || '[]');
  const idx = history.findIndex(h => h.date === entry.date);
  if (idx >= 0) history[idx] = entry; else history.push(entry);
  localStorage.setItem('tk_history2', JSON.stringify(history));
  try { await COL.history().doc(entry.date).set(entry); } catch(e) { console.warn('Firestore fsUpdateHistory:', e); }
}
