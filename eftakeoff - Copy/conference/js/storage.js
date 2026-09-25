// Browser-only storage. Nothing leaves the device.
// Shape leaves room for multiple child profiles and saved history later:
// { version, activeProfileId, profiles: { [id]: { answers, lastRoute, updatedAt } } }

(function () {
const KEY = 'ptcc:v1';
const LANG_KEY = 'ptcc:lang';
const ANALYTICS_KEY = 'ptcc:analytics';
const VERSION = 1;

function emptyAnswers() {
  return {
    strengths: [], strengthsOther: '', engaged: '',
    noticing: [], noticingOther: '',
    when: [], whenOther: '', notProblem: '',
    tried: [], triedOther: '', triedRatings: {},
    childSays: '',
    questions: [], customQuestions: [], askedDuring: [],
    teacherSeeing: '', teacherStrengths: '', patterns: '', supports: '', agreed: '',
    actions: [{ action: '', person: '', when: '' }],
    checkBack: '',
    learned: '', priorities: [], prioritiesOther: '', willTry: '', watchFor: '', reviewDate: '',
  };
}

function emptyStore() {
  return { version: VERSION, activeProfileId: 'default', profiles: { default: { answers: emptyAnswers(), lastRoute: '', updatedAt: null } } };
}

// Keeps only known fields with the right types, so an edited or foreign
// backup file can never break the app.
function clean(input) {
  const base = emptyAnswers();
  if (!input || typeof input !== 'object') return base;
  const str = (v) => (typeof v === 'string' ? v.slice(0, 20000) : '');
  const strList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 100) : []);
  Object.keys(base).forEach((k) => {
    const v = input[k];
    if (typeof base[k] === 'string') base[k] = str(v);
    else if (k === 'triedRatings') {
      base[k] = {};
      if (v && typeof v === 'object') Object.keys(v).forEach((id) => { if (typeof v[id] === 'string') base[k][id] = v[id]; });
    } else if (k === 'customQuestions') {
      base[k] = Array.isArray(v) ? v.filter((q) => q && typeof q.id === 'string' && typeof q.text === 'string')
        .map((q) => ({ id: q.id, text: str(q.text) })) : [];
    } else if (k === 'actions') {
      const rows = Array.isArray(v) ? v.filter((r) => r && typeof r === 'object')
        .map((r) => ({ action: str(r.action), person: str(r.person), when: str(r.when) })) : [];
      base[k] = rows.length ? rows : emptyAnswers().actions;
    } else base[k] = strList(v);
  });
  return base;
}

let data = read();
let available = true;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    if (parsed.version !== VERSION || !parsed.profiles) return emptyStore();
    const p = parsed.profiles[parsed.activeProfileId];
    p.answers = clean(p.answers);
    return parsed;
  } catch {
    return emptyStore();
  }
}

function profile() {
  return data.profiles[data.activeProfileId];
}

function answers() {
  return profile().answers;
}

function lastRoute() {
  return profile().lastRoute;
}

function setLastRoute(route) {
  profile().lastRoute = route;
  write();
}

function hasData() {
  return Boolean(profile().updatedAt);
}

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    available = true;
  } catch {
    available = false;
  }
  return available;
}

// Call after changing answers(). Returns true when stored successfully.
function saveNow() {
  profile().updatedAt = new Date().toISOString();
  return write();
}

let timer;
function saveSoon(onDone) {
  clearTimeout(timer);
  timer = setTimeout(() => onDone(saveNow()), 300);
}

// Clears everything. Returns the previous data so the page can offer "Undo".
// The copy is kept in memory only — never written back to storage — so
// clearing on a shared computer really removes it once the tab is closed.
function reset() {
  clearTimeout(timer);
  const previous = data;
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  data = emptyStore();
  return previous;
}

function restore(previous) {
  data = previous;
  write();
}

function replaceAnswers(input) {
  profile().answers = clean(input);
  return saveNow();
}

function exportData() {
  return { app: 'ptcc', version: VERSION, exportedAt: new Date().toISOString(), answers: answers() };
}

function getPref(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function setPref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

window.PTCC = window.PTCC || {};
window.PTCC.storage = {
  emptyAnswers, answers, lastRoute, setLastRoute, hasData, saveNow, saveSoon,
  reset, restore, replaceAnswers, exportData,
  isAvailable: () => available,
  getPref,
  setPref,
  getLang: () => getPref(LANG_KEY),
  setLang: (v) => setPref(LANG_KEY, v),
  getAnalytics: () => getPref(ANALYTICS_KEY),
  setAnalytics: (v) => setPref(ANALYTICS_KEY, v),
};
})();
