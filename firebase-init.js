/**
 * Firebase 初期化 & Firestore ヘルパー
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

// ===== Firestore コレクション定数 =====
const COL = {
  cfg:     () => db.collection('cfg').doc('main'),
  records: () => db.collection('records').doc('main'),
  names:   () => db.collection('names').doc('main'),
  history: () => db.collection('history'),
};

// ===== 保存ヘルパー =====
async function fsSaveCfg(cfg) {
  await COL.cfg().set(cfg);
  localStorage.setItem('tk_cfg2', JSON.stringify(cfg));
}

async function fsSaveRecords(records) {
  await COL.records().set({ data: records });
  localStorage.setItem('tk_records2', JSON.stringify(records));
}

async function fsSaveNames(nameMaster) {
  await COL.names().set({ data: nameMaster });
  localStorage.setItem('tk_names2', JSON.stringify(nameMaster));
}

async function fsSaveHistory(entry) {
  await COL.history().doc(entry.date).set(entry);
}

// ===== 読み込みヘルパー =====
async function fsLoadAll() {
  // cfg
  let cfg = { date: todayStr(), prices: [200,200,100,80,60,50], prevBal: 0 };
  try {
    const d = await COL.cfg().get();
    if (d.exists) { cfg = d.data(); }
    else {
      const c = localStorage.getItem('tk_cfg2');
      if (c) cfg = JSON.parse(c);
    }
  } catch(e) {
    const c = localStorage.getItem('tk_cfg2');
    if (c) try { cfg = JSON.parse(c); } catch(e2) {}
  }
  if (!cfg.prices || cfg.prices.length < 6) cfg.prices = [200,200,100,80,60,50];

  // records
  let records = [];
  try {
    const d = await COL.records().get();
    if (d.exists && d.data().data) { records = d.data().data; }
    else {
      const c = localStorage.getItem('tk_records2');
      if (c) records = JSON.parse(c) || [];
    }
  } catch(e) {
    const c = localStorage.getItem('tk_records2');
    if (c) try { records = JSON.parse(c) || []; } catch(e2) {}
  }

  // nameMaster
  let nameMaster = {};
  try {
    const d = await COL.names().get();
    if (d.exists && d.data().data) { nameMaster = d.data().data; }
    else {
      const c = localStorage.getItem('tk_names2');
      if (c) nameMaster = JSON.parse(c) || {};
    }
  } catch(e) {
    const c = localStorage.getItem('tk_names2');
    if (c) try { nameMaster = JSON.parse(c) || {}; } catch(e2) {}
  }

  // history
  let history = [];
  try {
    const snap = await COL.history().orderBy('date').get();
    history = snap.docs.map(d => d.data());
  } catch(e) {
    const c = localStorage.getItem('tk_history2');
    if (c) try { history = JSON.parse(c) || []; } catch(e2) {}
  }

  return { cfg, records, nameMaster, history };
}

async function fsDeleteHistory(date) {
  await COL.history().doc(date).delete();
}

async function fsUpdateHistory(entry) {
  await COL.history().doc(entry.date).set(entry);
}
