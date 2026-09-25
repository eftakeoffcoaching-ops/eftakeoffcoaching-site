// Parent-Teacher Conference Companion — screens, routing, snapshot and sharing.
// Wording lives in content.js / content-zh.js; storage in storage.js; settings in config.js.

(function () {
  const P = window.PTCC;
  const store = P.storage;
  const config = P.config || {};
  const assets = P.assets || {};

  let lang = pickLang();
  let C = P.content[lang];

  const app = document.getElementById('app');
  const statusEl = document.getElementById('save-status');
  const stepperNav = document.getElementById('stepper');
  const stepperList = document.getElementById('stepper-list');
  const footer = document.getElementById('site-footer');
  const langToggle = document.getElementById('lang-toggle');
  const installBtn = document.getElementById('install-btn');
  let installEvent = null; // Chrome/Edge/Android install prompt, saved for the button

  let flash = null;        // { text, undo } shown once on the landing page
  let qMessage = '';       // feedback for "Add your own question"
  let snapMessage = '';    // feedback on the snapshot page
  let undoData = null;     // previous answers after "Start over" (memory only)
  let currentRoute = null;
  let lastAnalytics = '';

  const A = () => store.answers();
  const MAX_Q = () => C.questions.max;
  const MAX_P = () => C.after.maxPriorities;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  function pickLang() {
    const saved = store.getLang();
    if (saved && P.content[saved]) return saved;
    return /^zh/i.test(navigator.language || '') && P.content.zh ? 'zh' : 'en';
  }

  // ---------- Question bank ----------

  function questionBank() {
    return C.questions.categories.flatMap((cat) =>
      cat.items.map((text, i) => ({ id: `${cat.id}-${i + 1}`, text, cat: cat.id })));
  }

  function questionText(id) {
    const q = questionBank().find((x) => x.id === id) || A().customQuestions.find((x) => x.id === id);
    return q ? q.text : '';
  }

  // Selected question ids that still exist (guards against edited content files).
  function selectedQuestions() {
    return A().questions.filter((id) => questionText(id));
  }

  // ---------- Small building blocks ----------

  function labelFor(list, id) {
    const o = list.find((x) => x.id === id);
    return o ? o.label : '';
  }

  function checkGroup(name, options, opts = {}) {
    const selected = A()[name];
    const full = opts.max && selected.length >= opts.max;
    const chips = options.map((o) => {
      const id = `${name}-${o.id}`;
      const checked = selected.includes(o.id);
      const disabled = full && !checked;
      return `<li><input type="checkbox" class="chip-input" id="${id}" data-group="${name}" value="${esc(o.id)}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}>` +
        `<label class="chip" for="${id}">${esc(o.label)}</label></li>`;
    }).join('');
    const other = selected.includes('other')
      ? textInput(`${name}Other`, C.ui.otherLabel, { cls: 'other-field' })
      : '';
    const limitNote = opts.max
      ? `<p class="limit-note" id="${name}-limit" aria-live="polite">${full ? esc(opts.fullNote) : ''}</p>`
      : '';
    return `<fieldset class="field-group">
      <legend class="q-legend">${esc(opts.legend)}</legend>
      ${opts.hint ? `<p class="hint">${esc(opts.hint)}</p>` : ''}
      <ul class="chips" role="list">${chips}</ul>
      ${limitNote}
      ${other}
    </fieldset>`;
  }

  function textInput(field, label, opts = {}) {
    return `<div class="field ${opts.cls || ''}">
      <label for="f-${field}">${esc(label)}</label>
      <input type="text" id="f-${field}" data-field="${field}" value="${esc(A()[field])}" autocomplete="off">
    </div>`;
  }

  function textArea(field, label, opts = {}) {
    const hintId = opts.hint ? `h-${field}` : '';
    return `<div class="field">
      <label for="f-${field}" class="${opts.legendStyle ? 'q-legend' : ''}">${esc(label)}</label>
      ${opts.hint ? `<p class="hint" id="${hintId}">${esc(opts.hint)}</p>` : ''}
      <textarea id="f-${field}" data-field="${field}" rows="${opts.rows || 4}"${hintId ? ` aria-describedby="${hintId}"` : ''}>${esc(A()[field])}</textarea>
    </div>`;
  }

  function dateField(field, label) {
    const value = A()[field];
    const past = value && value < todayISO();
    return `<div class="field field-date">
      <label for="f-${field}" class="q-legend">${esc(label)}</label>
      <div class="date-row">
        <input type="date" id="f-${field}" data-field="${field}" value="${esc(value)}" aria-describedby="n-${field}">
        <button type="button" class="btn btn-secondary btn-sm" data-act="calendar" data-dates="${field}" id="cal-${field}"${value ? '' : ' hidden'}>${esc(C.ui.addToCalendar)}</button>
      </div>
      <p class="soft-note" id="n-${field}" aria-live="polite">${past ? esc(C.ui.pastDate) : ''}</p>
    </div>`;
  }

  function todayISO() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function formatDate(iso, long) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    const opts = long === false ? { year: 'numeric', month: 'long', day: 'numeric' }
      : { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(y, m - 1, d).toLocaleDateString(C.lang.locale, opts);
  }

  // Full-width coloured band with the page title.
  function pageBand(eyebrow, title, intro) {
    return `<section class="band band-stage">
      <div class="wrap">
        <p class="eyebrow">${esc(eyebrow)}</p>
        <h1 tabindex="-1">${esc(title)}</h1>
        ${intro ? `<p class="lede">${esc(intro)}</p>` : ''}
      </div>
    </section>`;
  }

  function stageIndex(route) {
    return C.stages.findIndex((s) => s.id === stageOf(route));
  }

  // Links to every later stage except the one "Next" already points to.
  function skipAhead(fromRoute, nextRoute) {
    const from = stageIndex(fromRoute);
    const later = C.stages.filter((s, i) => i > from && s.route !== nextRoute);
    if (!later.length) return '';
    return `<nav class="skip-ahead" aria-label="${esc(C.ui.skipAhead)}">
      <span>${esc(C.ui.skipAhead)}</span>
      ${later.map((s) => `<a href="#/${s.route}">${esc(s.title)}</a>`).join('')}
    </nav>`;
  }

  function navButtons(prev, next, nextLabel) {
    return `<div class="page-nav">
      <div class="page-nav-main">
        ${prev ? `<a class="btn btn-secondary" href="#/${prev}">${esc(C.ui.back)}</a>` : '<span></span>'}
        ${next ? `<a class="btn btn-primary" href="#/${next}">${esc(nextLabel || C.ui.next)}</a>` : ''}
      </div>
      <div class="page-nav-extra">
        <button type="button" class="btn-link" data-act="save-later">${esc(C.ui.saveLater)}</button>
        ${skipAhead(currentRoute, next)}
      </div>
    </div>`;
  }

  function qrBlock(dataUri, caption, alt) {
    return `<figure class="qr">
      <img src="${dataUri}" alt="${esc(alt)}" width="120" height="120">
      <figcaption>${esc(caption)}</figcaption>
    </figure>`;
  }

  // Phones that can't show an install button get a one-time tip instead.
  function installTip() {
    if (isStandalone() || store.getPref('ptcc:tip-dismissed') === 'yes') return '';
    const ua = navigator.userAgent || '';
    let title = '';
    let body = '';
    if (/MicroMessenger/i.test(ua)) { title = C.ui.wechatTipTitle; body = C.ui.wechatTip; }
    else if (/iPhone|iPad|iPod/i.test(ua) && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua)) { title = C.ui.iosTipTitle; body = C.ui.iosTip; }
    if (!title) return '';
    return `<div class="install-tip"><p><strong>${esc(title)}</strong> ${esc(body)}</p>
      <button type="button" class="btn btn-secondary btn-sm" data-act="dismiss-tip">${esc(C.ui.tipDismiss)}</button></div>`;
  }

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }

  function importInput() {
    return `<input type="file" id="import-file" accept=".json,application/json" class="visually-hidden" tabindex="-1" aria-hidden="true">`;
  }

  // ---------- Screens ----------

  function renderLanding() {
    const L = C.landing;
    const back = store.hasData();
    const steps = L.steps.map((s, i) => `<li class="step">
        <span class="step-num" aria-hidden="true">${i + 1}</span>
        <div><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p></div>
      </li>`).join('');
    const skipLinks = C.stages.slice(1, 4).map((s, i) => `<a class="skip-card" href="#/${s.route}">
        <span class="skip-num" aria-hidden="true">${i + 2}</span><span>${esc(s.title)}</span></a>`).join('');

    return `<section class="band band-hero">
        <div class="wrap hero-inner">
          <p class="eyebrow">${esc(L.eyebrow)}</p>
          <h1 class="hero-title" tabindex="-1">${esc(L.title)}</h1>
          <p class="hero-sub">${esc(L.sub)}</p>
          <div class="hero-actions">
            <a class="btn btn-gold btn-lg" href="#/before/1">${esc(L.start)}</a>
            <a class="btn-link btn-link-light" href="#how" data-act="show-how">${esc(L.how)}</a>
          </div>
        </div>
      </section>
      <div class="wrap page-body landing-body">
        ${installTip()}
        ${flash ? `<div class="notice notice-success" role="status"><span>${esc(flash.text)}</span>
          ${flash.undo ? `<button type="button" class="btn btn-secondary btn-sm" data-act="undo">${esc(C.ui.undo)}</button>` : ''}</div>` : ''}
        ${back ? `<div class="card welcome">
          <div>
            <h2 class="h3">${esc(L.welcomeBack)}</h2>
            <p>${esc(L.welcomeBody)}</p>
          </div>
          <div class="welcome-actions">
            <a class="btn btn-primary" href="#/${esc(store.lastRoute() || 'before/1')}">${esc(L.continue)}</a>
            <button type="button" class="btn-link" data-act="reset">${esc(L.reset)}</button>
          </div>
        </div>` : ''}
        <section class="skip-panel" aria-labelledby="skip-title">
          <h2 id="skip-title" class="h3">${esc(L.skipTitle)}</h2>
          <div class="skip-grid">${skipLinks}</div>
        </section>
        <div class="pull-quote"><p>${esc(L.explain)}</p></div>
        <details class="how card" id="how">
          <summary><h2 class="h3">${esc(L.how)}</h2></summary>
          <ol class="steps" role="list">${steps}</ol>
          <p class="hint">${esc(L.privacy)}</p>
        </details>
        <p class="import-line">${esc(L.importPrompt)}
          <button type="button" class="btn-link" data-act="import">${esc(L.importButton)}</button></p>
        ${importInput()}
        <p class="disclaimer">${esc(L.disclaimer)}</p>
      </div>`;
  }

  function renderBefore(part) {
    const B = C.before;
    const parts = B.parts;
    const dots = parts.map((p, i) => `<li class="${i + 1 === part ? 'is-current' : ''}${i + 1 < part ? ' is-done' : ''}">
        <a href="#/before/${i + 1}"${i + 1 === part ? ' aria-current="step"' : ''} data-key="${p.key}"><span class="visually-hidden">${esc(C.ui.partLabel(p.key))}</span><span class="subnav-text">${esc(p.title)}</span></a>
      </li>`).join('');

    let body = '';
    if (part === 1) {
      body = checkGroup('strengths', B.strengths, { legend: B.strengthsQ, hint: B.strengthsHint }) +
        textArea('engaged', B.engagedQ, { hint: B.engagedHint, legendStyle: true });
    } else if (part === 2) {
      body = checkGroup('noticing', B.noticing, { legend: B.noticingQ, hint: B.noticingHint });
    } else if (part === 3) {
      body = checkGroup('when', B.when, { legend: B.whenQ, hint: B.whenHint }) +
        textArea('notProblem', B.notProblemQ, { hint: B.notProblemHint, legendStyle: true });
    } else if (part === 4) {
      body = checkGroup('tried', B.tried, { legend: B.triedQ, hint: B.triedHint }) + ratingsBlock();
    } else {
      body = `<div class="field-group">
          <p class="q-legend" id="child-q">${esc(B.childQ)}</p>
          <p class="hint">${esc(B.childExamplesLabel)}</p>
          <ul class="quotes" role="list">${B.childExamples.map((q) => `<li>${lang === 'zh' ? `「${esc(q)}」` : `“${esc(q)}”`}</li>`).join('')}</ul>
          <label for="f-childSays" class="visually-hidden">${esc(B.childQ)}</label>
          <textarea id="f-childSays" data-field="childSays" rows="5" aria-describedby="child-q">${esc(A().childSays)}</textarea>
        </div>
        <aside class="note-box"><p class="note-label">${esc(B.childNoteLabel)}</p><p>${esc(B.childNote)}</p></aside>`;
    }

    const prev = part === 1 ? '' : `before/${part - 1}`;
    const next = part === 5 ? 'questions' : `before/${part + 1}`;
    const nextLabel = C.ui.nextTo(part === 5 ? C.stages[1].title : parts[part].title);

    return `${pageBand(B.eyebrow, B.title, part === 1 ? B.intro : '')}
      <div class="wrap page-body">
        ${part === 1 ? `<p class="hint skip-hint">${esc(C.ui.skipHint)}</p>` : ''}
        <nav class="subnav" aria-label="${esc(C.ui.partsNav)}"><ol role="list">${dots}</ol></nav>
        <section class="card card-accent" aria-labelledby="part-title">
          <h2 id="part-title" class="part-title"><span class="part-key">${parts[part - 1].key}</span> ${esc(parts[part - 1].title)}</h2>
          ${body}
        </section>
        ${navButtons(prev, next, nextLabel)}
      </div>`;
  }

  function ratingsBlock() {
    const B = C.before;
    const a = A();
    if (!a.tried.length) return '';
    const rows = a.tried.map((id) => {
      const name = id === 'other' ? (a.triedOther.trim() || labelFor(B.tried, 'other')) : labelFor(B.tried, id);
      const radios = B.ratings.map((r) => {
        const rid = `rating-${id}-${r.id}`;
        return `<li><input type="radio" class="chip-input" name="rating-${id}" id="${rid}" data-rating="${id}" value="${r.id}"${a.triedRatings[id] === r.id ? ' checked' : ''}>` +
          `<label class="chip chip-sm" for="${rid}">${esc(r.label)}</label></li>`;
      }).join('');
      return `<fieldset class="rating">
        <legend><span class="rating-name"${id === 'other' ? ' data-other-name' : ''}>${esc(name)}</span> <span class="rating-q">${esc(B.helpQ)}</span></legend>
        <ul class="chips" role="list">${radios}</ul>
      </fieldset>`;
    }).join('');
    return `<div class="ratings"><h3 class="h4">${esc(B.helpSection)}</h3>${rows}</div>`;
  }

  function renderQuestions() {
    const Q = C.questions;
    const sel = selectedQuestions();
    const full = sel.length >= MAX_Q();
    const bank = questionBank();

    const cats = Q.categories.map((cat, ci) => {
      const qs = bank.filter((q) => q.cat === cat.id);
      const count = qs.filter((q) => sel.includes(q.id)).length;
      const items = qs.map((q) => {
        const checked = sel.includes(q.id);
        const id = `q-${q.id}`;
        return `<li><input type="checkbox" class="q-input" id="${id}" data-question="${q.id}"${checked ? ' checked' : ''}${full && !checked ? ' disabled' : ''}>` +
          `<label class="q-option" for="${id}">${esc(q.text)}</label></li>`;
      }).join('');
      return `<details class="q-cat card" id="cat-${cat.id}"${ci === 0 || count ? ' open' : ''}>
        <summary><span class="h4">${esc(cat.title)}</span>${count ? `<span class="badge">${esc(C.ui.chosenBadge(count))}</span>` : ''}</summary>
        <ul class="q-list" role="list">${items}</ul>
      </details>`;
    }).join('');

    const list = sel.length
      ? `<ol class="my-list">${sel.map((id) => `<li><span>${esc(questionText(id))}</span>
          <button type="button" class="btn-remove" data-act="remove-q" data-id="${esc(id)}" aria-label="${esc(Q.remove)}: ${esc(questionText(id))}">${esc(Q.remove)}</button></li>`).join('')}</ol>`
      : `<p class="hint">${esc(Q.listEmpty)}</p>`;

    return `${pageBand(Q.eyebrow, Q.title, Q.intro)}
      <div class="wrap page-body">
        <div class="counter-bar" role="status" aria-live="polite">
          <span class="counter-pill${full ? ' is-full' : ''}">${esc(Q.counter(sel.length))}</span> <span class="muted">(${esc(Q.counterOf)})</span>
          ${full ? `<p class="limit-note">${esc(Q.fullNote)}</p>` : ''}
        </div>
        <div class="two-col">
          <div class="col-main">${cats}</div>
          <aside class="col-side" aria-labelledby="my-list-title">
            <div class="card card-list sticky">
              <h2 id="my-list-title" class="h3" tabindex="-1">${esc(Q.listTitle)}</h2>
              ${list}
              <form class="add-q" data-form="add-q" novalidate>
                <label for="add-q-input">${esc(Q.addLabel)}</label>
                <div class="add-q-row">
                  <input type="text" id="add-q-input" maxlength="240" autocomplete="off" aria-describedby="add-q-msg">
                  <button type="submit" class="btn btn-secondary">${esc(Q.addButton)}</button>
                </div>
                <p id="add-q-msg" class="soft-note" aria-live="polite">${esc(qMessage)}</p>
              </form>
            </div>
          </aside>
        </div>
        ${navButtons('before/5', 'during', C.ui.nextTo(C.stages[2].title))}
      </div>`;
  }

  function renderDuring() {
    const D = C.during;
    const a = A();
    const sel = selectedQuestions();

    const qList = sel.length
      ? `<ul class="asked-list" role="list">${sel.map((id) => {
          const cid = `asked-${id}`;
          return `<li><input type="checkbox" id="${cid}" data-asked="${esc(id)}"${a.askedDuring.includes(id) ? ' checked' : ''}><label for="${cid}">${esc(questionText(id))}</label></li>`;
        }).join('')}</ul>`
      : `<p>${esc(D.noQuestions)} <a href="#/questions">${esc(D.chooseQuestions)}</a></p>`;

    const rows = a.actions.map((r, i) => `<tr>
        <td data-label="${esc(D.cols.action)}"><input type="text" data-row="${i}" data-col="action" value="${esc(r.action)}" aria-label="${esc(C.ui.rowLabel(D.cols.action, i + 1))}"></td>
        <td data-label="${esc(D.cols.person)}"><input type="text" data-row="${i}" data-col="person" value="${esc(r.person)}" aria-label="${esc(C.ui.rowLabel(D.cols.person, i + 1))}"></td>
        <td data-label="${esc(D.cols.when)}"><input type="text" data-row="${i}" data-col="when" value="${esc(r.when)}" aria-label="${esc(C.ui.rowLabel(D.cols.when, i + 1))}"></td>
        <td class="td-remove"><button type="button" class="btn-remove" data-act="remove-row" data-index="${i}" aria-label="${esc(C.ui.removeRowLabel(i + 1))}">${esc(D.removeRow)}</button></td>
      </tr>`).join('');

    const quote = (p) => (lang === 'zh' ? `「${esc(p)}」` : `“${esc(p)}”`);

    return `${pageBand(D.eyebrow, D.title, D.intro)}
      <div class="wrap page-body">
        <div class="during-layout">
          <aside class="pause-wrap" aria-labelledby="pause-title">
            <details class="pause-box" id="pause-box" open>
              <summary><h2 id="pause-title" class="h3">${esc(D.pauseTitle)}</h2></summary>
              <p class="hint">${esc(D.pauseHint)}</p>
              <ul role="list">${D.pausePrompts.map((p) => `<li>${quote(p)}</li>`).join('')}</ul>
            </details>
          </aside>
          <div class="during-main">
            <section class="card card-accent" aria-labelledby="myq-title">
              <h2 id="myq-title" class="h3">${esc(D.myQuestions)}</h2>
              <p class="hint">${esc(D.myQuestionsHint)}</p>
              ${qList}
            </section>
            <section class="card">
              ${D.fields.map((f) => textArea(f.id, f.label, { rows: 5, legendStyle: true })).join('')}
            </section>
            <section class="card" aria-labelledby="who-title">
              <h2 id="who-title" class="q-legend">${esc(D.whoTitle)}</h2>
              <table class="action-table">
                <thead><tr><th scope="col">${esc(D.cols.action)}</th><th scope="col">${esc(D.cols.person)}</th><th scope="col">${esc(D.cols.when)}</th><th scope="col"><span class="visually-hidden">${esc(D.removeRow)}</span></th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
              <button type="button" class="btn btn-secondary btn-sm" data-act="add-row">+ ${esc(D.addRow)}</button>
            </section>
            <section class="card">
              ${dateField('checkBack', D.checkBack)}
            </section>
          </div>
        </div>
        ${navButtons('questions', 'after', C.ui.nextTo(C.stages[3].title))}
      </div>`;
  }

  function renderAfter() {
    const F = C.after;
    return `${pageBand(F.eyebrow, F.title)}
      <div class="wrap page-body">
        <section class="card card-accent">${textArea('learned', F.learned, { rows: 5, legendStyle: true })}</section>
        <section class="card">${checkGroup('priorities', F.priorities, { legend: F.prioritiesQ, hint: F.prioritiesHint, max: MAX_P(), fullNote: F.prioritiesFull })}</section>
        <section class="card">
          ${textArea('willTry', F.willTry, { rows: 4, legendStyle: true })}
          ${textArea('watchFor', F.watchFor, { rows: 4, legendStyle: true, hint: F.watchForHint })}
          ${dateField('reviewDate', F.reviewDate)}
        </section>
        ${navButtons('during', 'snapshot', F.toSnapshot)}
      </div>`;
  }

  // ---------- Snapshot model (shared by the page, the PDF and the text version) ----------

  function listOf(name, options, otherField) {
    const a = A();
    return a[name].map((id) => {
      if (id === 'other') return a[otherField] ? a[otherField].trim() : '';
      return labelFor(options, id);
    }).filter(Boolean);
  }

  function triedWithRating(ratingIds) {
    const a = A();
    const B = C.before;
    return a.tried.filter((id) => ratingIds.includes(a.triedRatings[id])).map((id) => {
      const name = id === 'other' ? (a.triedOther.trim() || labelFor(B.tried, 'other')) : labelFor(B.tried, id);
      const rating = labelFor(B.ratings, a.triedRatings[id]);
      return lang === 'zh' ? `${name}（${rating}）` : `${name} (${rating.toLowerCase()})`;
    });
  }

  const txt = (label, text) => (text && text.trim() ? [{ label, text: text.trim() }] : []);
  const items = (label, list) => (list.length ? [{ label, items: list }] : []);

  function snapshotModel() {
    const S = C.snapshot;
    const L = S.labels;
    const B = C.before;
    const a = A();
    const rows = a.actions.filter((r) => r.action.trim() || r.person.trim() || r.when.trim());
    const dates = [
      ...(a.checkBack ? [{ label: L.checkBack, text: formatDate(a.checkBack) }] : []),
      ...(a.reviewDate ? [{ label: L.review, text: formatDate(a.reviewDate) }] : []),
    ];
    return {
      grid: [
        { title: S.sections.strengths, blocks: [...items('', listOf('strengths', B.strengths, 'strengthsOther')), ...txt(L.engaged, a.engaged), ...txt(L.teacherStrengths, a.teacherStrengths)] },
        { title: S.sections.noticing, blocks: [...items('', listOf('noticing', B.noticing, 'noticingOther')), ...items(L.when, listOf('when', B.when, 'whenOther')), ...txt(L.notProblem, a.notProblem)] },
        { title: S.sections.teacher, blocks: [...txt('', a.teacherSeeing), ...txt(L.patterns, a.patterns)] },
        { title: S.sections.barriers, blocks: [...txt(L.childSays, a.childSays), ...items(L.limited, triedWithRating(['little', 'temporary'])), ...txt(L.learned, a.learned)] },
        { title: S.sections.supports, blocks: [...txt('', a.supports), ...items(L.helped, triedWithRating(['lot', 'somewhat']))] },
        { title: S.sections.trying, blocks: [...txt(L.agreed, a.agreed), ...txt(L.plan, a.willTry), ...items(L.priorities, listOf('priorities', C.after.priorities, 'prioritiesOther')), ...txt(L.watchFor, a.watchFor)] },
      ],
      who: { title: S.sections.who, rows },
      followUp: { title: S.sections.followUp, dates },
      revisit: { title: S.sections.revisit, items: selectedQuestions().filter((id) => !a.askedDuring.includes(id)).map(questionText) },
    };
  }

  function blocksHtml(blocks) {
    return blocks.map((b) => {
      const label = b.label ? `<p class="snap-label">${esc(b.label)}</p>` : '';
      const body = b.items ? `<ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : `<p class="snap-text">${esc(b.text)}</p>`;
      return `<div class="snap-item">${label}${body}</div>`;
    }).join('');
  }

  function snapSection(title, inner) {
    return `<section class="snap-section">
      <h2>${esc(title)}</h2>
      ${inner.trim() ? inner : `<p class="snap-empty">${esc(C.ui.notRecorded)}</p>`}
    </section>`;
  }

  function snapshotText() {
    const m = snapshotModel();
    const S = C.snapshot;
    const D = C.during;
    const out = [S.title, `${S.prepared} ${new Date().toLocaleDateString(C.lang.locale, { year: 'numeric', month: 'long', day: 'numeric' })}`, ''];
    const section = (title, lines) => { out.push(title.toUpperCase(), ...(lines.length ? lines : [C.ui.notRecorded]), ''); };
    m.grid.forEach((s) => section(s.title, s.blocks.flatMap((b) => [
      ...(b.label ? [`${b.label}${C.ui.colon.trim()}`] : []),
      ...(b.items ? b.items.map((i) => `• ${i}`) : [b.text]),
    ])));
    section(m.who.title, m.who.rows.map((r) => `• ${r.action}${r.person ? ` — ${D.cols.person}: ${r.person}` : ''}${r.when ? ` — ${D.cols.when} ${r.when}` : ''}`));
    section(m.followUp.title, m.followUp.dates.map((d) => `${d.label}${C.ui.colon}${d.text}`));
    section(m.revisit.title, m.revisit.items.map((i) => `• ${i}`));
    out.push(`${S.rememberLabel}${C.ui.colon}${S.remember}`, '', `${C.brand.name} · ${C.brand.site}`);
    return out.join('\n');
  }

  function canShareFiles() {
    try {
      return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.pdf', { type: 'application/pdf' })] }));
    } catch { return false; }
  }

  function renderSnapshot() {
    const S = C.snapshot;
    const D = C.during;
    const m = snapshotModel();
    const a = A();
    const hasDates = a.checkBack || a.reviewDate;

    const who = m.who.rows.length
      ? `<table class="snap-table"><thead><tr><th scope="col">${esc(D.cols.action)}</th><th scope="col">${esc(D.cols.person)}</th><th scope="col">${esc(D.cols.when)}</th></tr></thead>
        <tbody>${m.who.rows.map((r) => `<tr><td>${esc(r.action)}</td><td>${esc(r.person)}</td><td>${esc(r.when)}</td></tr>`).join('')}</tbody></table>`
      : '';
    const follow = m.followUp.dates.map((d) => `<p><span class="snap-label-inline">${esc(d.label)}${esc(C.ui.colon)}</span>${esc(d.text)}</p>`).join('');
    const revisit = m.revisit.items.length ? `<ul>${m.revisit.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '';

    const analytics = config.analyticsEndpoint ? `<label class="optin">
        <input type="checkbox" id="analytics-optin"${store.getAnalytics() === 'yes' ? ' checked' : ''}>
        <span>${esc(S.analyticsLabel)}</span></label>` : '';

    return `${pageBand(S.eyebrow, S.title)}
      <div class="wrap page-body">
        <div class="snap-toolbar no-print">
          <div class="snap-toolbar-actions">
            <button type="button" class="btn btn-primary" data-act="pdf" id="pdf-btn">${esc(S.download)}</button>
            <details class="menu" id="send-menu">
              <summary class="btn btn-secondary">${esc(S.send)}</summary>
              <div class="menu-panel" role="group" aria-label="${esc(S.sendTitle)}">
                ${canShareFiles() ? `<button type="button" data-act="share">${esc(S.shareFile)}</button>` : ''}
                <button type="button" data-act="email">${esc(S.email)}</button>
                <button type="button" data-act="copy">${esc(S.copy)}</button>
              </div>
            </details>
            <button type="button" class="btn btn-secondary" data-act="print">${esc(S.print)}</button>
            ${hasDates ? `<button type="button" class="btn btn-secondary" data-act="calendar" data-dates="checkBack,reviewDate">${esc(S.calendar)}</button>` : ''}
          </div>
          <p class="snap-msg" id="snap-msg" role="status" aria-live="polite">${esc(snapMessage)}</p>
        </div>

        <article class="snapshot" id="snapshot" aria-labelledby="snap-title">
          <header class="snap-head">
            <img class="snap-logo" src="${assets.logo || 'assets/logo.png'}" alt="${esc(C.brand.logoAlt)}" width="202" height="52">
            <div>
              <h2 id="snap-title" class="snap-title">${esc(S.title)}</h2>
              <p class="snap-date">${esc(S.prepared)} ${esc(new Date().toLocaleDateString(C.lang.locale, { year: 'numeric', month: 'long', day: 'numeric' }))}</p>
            </div>
          </header>
          <div class="snap-grid">
            ${m.grid.map((s) => snapSection(s.title, blocksHtml(s.blocks))).join('')}
          </div>
          ${snapSection(m.who.title, who)}
          <div class="snap-grid">
            ${snapSection(m.followUp.title, follow)}
            ${snapSection(m.revisit.title, revisit)}
          </div>
          <aside class="remember">
            <p><strong>${esc(S.rememberLabel)}${esc(C.ui.colon)}</strong>${esc(S.remember)}</p>
          </aside>
          <footer class="snap-foot">
            <div class="snap-foot-brand">
              <img src="${assets.logo || 'assets/logo.png'}" alt="${esc(C.brand.logoAlt)}" width="156" height="40">
              <p><a href="${esc(C.brand.site)}" target="_blank" rel="noopener">${esc(C.brand.siteLabel)}</a></p>
              <p class="snap-disclaimer">${esc(C.landing.disclaimer)}</p>
            </div>
            <div class="snap-qrs">
              ${qrBlock(assets.qrOfficial || 'assets/qr-official-account.png', C.ui.qrOfficial, C.ui.qrOfficialAlt)}
              ${qrBlock(assets.qrWechat || 'assets/qr-wechat.png', C.ui.qrWechat, C.ui.qrWechatAlt)}
            </div>
          </footer>
        </article>

        <section class="card backup no-print" aria-labelledby="backup-title">
          <h2 id="backup-title" class="h3">${esc(S.backupTitle)}</h2>
          <p class="hint">${esc(S.backupHint)}</p>
          <div class="backup-actions">
            <button type="button" class="btn btn-secondary" data-act="export">${esc(S.exportBtn)}</button>
            <button type="button" class="btn btn-secondary" data-act="import">${esc(S.importBtn)}</button>
          </div>
          ${importInput()}
          ${analytics}
        </section>

        <div class="page-nav no-print">
          <div class="page-nav-main">
            <a class="btn btn-secondary" href="#/after">${esc(C.ui.back)}</a>
            <a class="btn btn-secondary" href="#/before/1">${esc(S.edit)}</a>
          </div>
          <div class="page-nav-extra">
            <button type="button" class="btn-link" data-act="reset">${esc(S.reset)}</button>
          </div>
        </div>
      </div>`;
  }

  // ---------- Chrome: header, stepper, footer ----------

  function renderChrome() {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.getElementById('skip-link').textContent = C.ui.skipLink;
    document.getElementById('brand-app').textContent = C.brand.app;
    document.querySelector('.brand-logo').alt = C.brand.logoAlt;
    stepperNav.setAttribute('aria-label', C.ui.progress);
    langToggle.textContent = C.lang.switchLabel;
    langToggle.setAttribute('lang', C.lang.switchTo === 'zh' ? 'zh-CN' : 'en');
    langToggle.setAttribute('aria-label', C.lang.switchAria);
    installBtn.textContent = C.ui.install;
    if (statusEl.textContent) statusEl.textContent = store.isAvailable() ? C.ui.saved : C.ui.saveFailed;

    footer.innerHTML = `<div class="wrap footer-inner">
        <div class="footer-text">
          <p class="footer-brand">EF TakeOff <em>Coaching</em> · 卓行咨询</p>
          <p><a href="${esc(C.brand.site)}" target="_blank" rel="noopener">${esc(C.brand.siteLabel)}</a></p>
          <p>${esc(C.landing.disclaimer)}</p>
          <p>${esc(C.ui.footerPrivacy)}</p>
        </div>
        <div class="footer-connect">
          <p class="footer-connect-title">${esc(C.ui.connect)}</p>
          <div class="footer-qrs">
            ${qrBlock('assets/qr-official-account.png', C.ui.qrOfficial, C.ui.qrOfficialAlt)}
            ${qrBlock('assets/qr-wechat.png', C.ui.qrWechat, C.ui.qrWechatAlt)}
          </div>
        </div>
      </div>`;
  }

  function renderStepper(route) {
    const current = stageOf(route);
    stepperNav.hidden = !route;
    const idx = C.stages.findIndex((s) => s.id === current);
    stepperList.innerHTML = C.stages.map((s, i) => {
      const isCurrent = s.id === current;
      const num = s.id === 'snapshot' ? '✓' : String(i + 1);
      return `<li class="${isCurrent ? 'is-current' : ''}${i < idx ? ' is-done' : ''}">
        <a href="#/${s.route}"${isCurrent ? ' aria-current="step"' : ''}>
          <span class="step-dot" aria-hidden="true">${num}</span>
          <span class="step-label">${esc(s.short)}<span class="visually-hidden">: ${esc(s.title)}</span></span>
        </a></li>`;
    }).join('');
  }

  // ---------- Routing ----------

  function routeName() {
    return location.hash.replace(/^#\/?/, '');
  }

  function viewFor(route) {
    if (route === '') return renderLanding;
    const m = route.match(/^before\/([1-5])$/);
    if (m) return () => renderBefore(Number(m[1]));
    switch (route) {
      case 'questions': return renderQuestions;
      case 'during': return renderDuring;
      case 'after': return renderAfter;
      case 'snapshot': return renderSnapshot;
      default: return null;
    }
  }

  function stageOf(route) {
    return route.startsWith('before') ? 'before' : route;
  }

  function titleFor(route) {
    const s = C.stages.find((x) => x.id === stageOf(route));
    return s ? s.title : '';
  }

  function router() {
    const route = routeName();
    // "#how" is an in-page anchor on the landing page, not a route.
    if (route === 'how') { location.replace('#/'); return; }
    const view = viewFor(route);
    if (!view) { location.replace('#/'); return; }

    const changed = route !== currentRoute;
    currentRoute = route;
    if (changed) { qMessage = ''; snapMessage = ''; }
    app.innerHTML = view();
    if (!route) flash = null;
    renderStepper(route);
    document.title = `${route ? `${titleFor(route)} · ` : ''}${C.brand.app} · EF TakeOff Coaching`;
    if (route) store.setLastRoute(route);
    if (changed) {
      window.scrollTo(0, 0);
      const h1 = app.querySelector('h1');
      if (h1) h1.focus({ preventScroll: true });
    }
    if (route === 'snapshot') sendAnalytics();
  }

  // Re-render the current screen in place, keeping scroll, focus and open panels.
  function refresh(focusId) {
    const y = window.scrollY;
    const openState = [...app.querySelectorAll('details[id]')].map((d) => [d.id, d.open]);
    app.innerHTML = viewFor(currentRoute)();
    openState.forEach(([id, open]) => {
      const d = document.getElementById(id);
      if (d) d.open = open;
    });
    window.scrollTo(0, y);
    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) el.focus({ preventScroll: true });
    }
  }

  function setLang(next) {
    if (!P.content[next]) return;
    lang = next;
    C = P.content[lang];
    store.setLang(lang);
    renderChrome();
    const y = window.scrollY;
    currentRoute = null; // force a full render
    router();
    window.scrollTo(0, y);
    langToggle.focus();
  }

  // ---------- Saving ----------

  function showSaved(ok) {
    const msg = ok ? C.ui.saved : C.ui.saveFailed;
    if (statusEl.textContent !== msg) statusEl.textContent = msg;
    statusEl.classList.toggle('is-error', !ok);
  }

  function saveNow() { showSaved(store.saveNow()); }
  function saveSoon() { store.saveSoon(showSaved); }

  function setSnapMessage(text) {
    snapMessage = text;
    const el = document.getElementById('snap-msg');
    if (el) el.textContent = text;
  }

  // ---------- Files: download, PDF, calendar, backup ----------

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  const fileDate = () => todayISO();
  const pdfName = () => `conference-snapshot-${fileDate()}.pdf`;

  function loadPdfLibrary() {
    if (window.html2pdf) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = config.pdfLibrary.src;
      if (config.pdfLibrary.integrity) {
        s.integrity = config.pdfLibrary.integrity;
        s.crossOrigin = 'anonymous';
        s.referrerPolicy = 'no-referrer';
      }
      s.onload = () => (window.html2pdf ? resolve() : reject(new Error('PDF library missing')));
      s.onerror = () => { s.remove(); reject(new Error('PDF library failed to load')); };
      document.head.appendChild(s);
    });
  }

  async function makePdf(asBlob) {
    await loadPdfLibrary();
    const el = document.getElementById('snapshot');
    const opt = {
      margin: [10, 10, 12, 10],
      filename: pdfName(),
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', windowWidth: 1000 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['.snap-section', '.remember', '.snap-foot', 'tr', 'li'] },
    };
    document.body.classList.add('pdf-mode');
    try {
      const worker = window.html2pdf().set(opt).from(el);
      if (asBlob) return await worker.outputPdf('blob');
      await worker.save();
      return null;
    } finally {
      document.body.classList.remove('pdf-mode');
    }
  }

  async function withBusy(btn, fn) {
    const S = C.snapshot;
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = S.downloading; }
    setSnapMessage(S.downloading);
    try {
      await fn();
    } catch (err) {
      if (err && err.name === 'AbortError') setSnapMessage(''); // user closed the share sheet
      else setSnapMessage(S.pdfFailed);
      return;
    } finally {
      if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = label; }
    }
  }

  function icsEscape(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  }

  function downloadCalendar(fields) {
    const a = A();
    const S = C.snapshot;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const plan = [a.agreed, a.willTry].filter((x) => x && x.trim()).join('\n').slice(0, 600);
    const events = fields.filter((f) => a[f]).map((f) => {
      const start = a[f].replace(/-/g, '');
      const [y, m, d] = a[f].split('-').map(Number);
      const end = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10).replace(/-/g, '');
      const summary = f === 'checkBack' ? S.checkBackEvent : S.reviewEvent;
      return ['BEGIN:VEVENT', `UID:ptcc-${f}-${start}@eftakeoffcoachingcg.com`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`, `SUMMARY:${icsEscape(summary)}`,
        ...(plan ? [`DESCRIPTION:${icsEscape(plan)}`] : []), 'END:VEVENT'].join('\r\n');
    });
    if (!events.length) return;
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EF TakeOff Coaching//Conference Companion//EN',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...events, 'END:VCALENDAR'].join('\r\n') + '\r\n';
    downloadBlob(`conference-follow-up-${fileDate()}.ics`, new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  }

  function exportBackup() {
    const json = JSON.stringify(store.exportData(), null, 2);
    downloadBlob(`conference-companion-backup-${fileDate()}.json`, new Blob([json], { type: 'application/json' }));
  }

  function importBackup(file) {
    const S = C.snapshot;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed = null;
      try { parsed = JSON.parse(reader.result); } catch { parsed = null; }
      if (!parsed || parsed.app !== 'ptcc' || !parsed.answers) {
        announce(S.importBad);
        return;
      }
      if (store.hasData() && !window.confirm(S.importConfirm)) return;
      store.replaceAnswers(parsed.answers);
      showSaved(store.isAvailable());
      if (currentRoute === 'snapshot') { snapMessage = S.importOk; refresh('snap-msg'); } else {
        flash = { text: S.importOk };
        currentRoute = null;
        location.hash = '#/';
        router();
      }
    };
    reader.readAsText(file);
  }

  // Message on the snapshot page, or a flash on the landing page.
  function announce(text) {
    if (currentRoute === 'snapshot') setSnapMessage(text);
    else { flash = { text }; refresh(null); }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }

  async function emailSummary() {
    const text = snapshotText();
    let body = text;
    // Some email apps cut off very long links, so long summaries are also copied.
    if (text.length > 1800) {
      await copyText(text);
      body = `${text.slice(0, 1500)}\n\n${C.ui.emailTruncated}`;
    }
    window.location.href = `mailto:?subject=${encodeURIComponent(C.snapshot.title)}&body=${encodeURIComponent(body)}`;
  }

  // ---------- Opt-in anonymous analytics (off unless configured) ----------

  function sendAnalytics() {
    if (!config.analyticsEndpoint || store.getAnalytics() !== 'yes') return;
    const a = A();
    const payload = JSON.stringify({
      tool: 'ptcc', v: 1, lang,
      strengths: a.strengths, noticing: a.noticing, when: a.when,
      tried: a.tried, triedRatings: a.triedRatings, priorities: a.priorities,
      questions: a.questions.filter((id) => !id.startsWith('custom-')),
    });
    if (payload === lastAnalytics) return;
    lastAnalytics = payload;
    try {
      fetch(config.analyticsEndpoint, { method: 'POST', mode: 'no-cors', keepalive: true, headers: { 'Content-Type': 'text/plain' }, body: payload });
    } catch { /* never block the parent */ }
  }

  // ---------- Events ----------

  app.addEventListener('input', (e) => {
    const t = e.target;
    const a = A();
    if (t.dataset.field) {
      a[t.dataset.field] = t.value;
      saveSoon();
      if (t.dataset.field === 'triedOther') {
        const span = app.querySelector('[data-other-name]');
        if (span) span.textContent = t.value.trim() || labelFor(C.before.tried, 'other');
      }
    } else if (t.dataset.row != null) {
      const row = a.actions[Number(t.dataset.row)];
      if (row) { row[t.dataset.col] = t.value; saveSoon(); }
    }
  });

  app.addEventListener('change', (e) => {
    const t = e.target;
    const a = A();

    if (t.id === 'import-file') {
      if (t.files && t.files[0]) importBackup(t.files[0]);
      t.value = '';
      return;
    }

    if (t.id === 'analytics-optin') {
      store.setAnalytics(t.checked ? 'yes' : 'no');
      if (t.checked) { sendAnalytics(); setSnapMessage(C.snapshot.analyticsThanks); } else setSnapMessage('');
      return;
    }

    if (t.dataset.group) {
      const name = t.dataset.group;
      const list = a[name];
      const max = name === 'priorities' ? MAX_P() : 0;
      if (t.checked) {
        if (max && list.length >= max) { t.checked = false; return; }
        if (!list.includes(t.value)) list.push(t.value);
      } else {
        a[name] = list.filter((v) => v !== t.value);
        if (name === 'tried') delete a.triedRatings[t.value];
      }
      saveNow();
      refresh(t.id);
      return;
    }

    if (t.dataset.rating) {
      a.triedRatings[t.dataset.rating] = t.value;
      saveNow();
      return;
    }

    if (t.dataset.question) {
      const id = t.dataset.question;
      if (t.checked) {
        if (selectedQuestions().length >= MAX_Q()) { t.checked = false; return; }
        if (!a.questions.includes(id)) a.questions.push(id);
      } else {
        a.questions = a.questions.filter((q) => q !== id);
      }
      qMessage = '';
      saveNow();
      refresh(t.id);
      return;
    }

    if (t.dataset.asked) {
      const id = t.dataset.asked;
      a.askedDuring = t.checked ? [...new Set([...a.askedDuring, id])] : a.askedDuring.filter((q) => q !== id);
      saveNow();
      return;
    }

    if (t.type === 'date' && t.dataset.field) {
      a[t.dataset.field] = t.value;
      saveNow();
      const note = document.getElementById(`n-${t.dataset.field}`);
      if (note) note.textContent = t.value && t.value < todayISO() ? C.ui.pastDate : '';
      const cal = document.getElementById(`cal-${t.dataset.field}`);
      if (cal) cal.hidden = !t.value;
    }
  });

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const a = A();
    const S = C.snapshot;
    const menu = el.closest('details.menu');
    if (menu) menu.open = false;

    switch (el.dataset.act) {
      case 'save-later':
        saveNow();
        flash = { text: store.isAvailable() ? C.ui.savedFlash : C.ui.saveFailed };
        location.hash = '#/';
        break;
      case 'show-how': {
        e.preventDefault();
        const how = document.getElementById('how');
        how.open = true;
        how.querySelector('summary').focus();
        how.scrollIntoView({ block: 'start' });
        break;
      }
      case 'add-row': {
        a.actions.push({ action: '', person: '', when: '' });
        saveNow();
        refresh(null);
        const inputs = app.querySelectorAll('.action-table tbody tr:last-child input');
        if (inputs[0]) inputs[0].focus();
        break;
      }
      case 'remove-row': {
        a.actions.splice(Number(el.dataset.index), 1);
        if (!a.actions.length) a.actions.push({ action: '', person: '', when: '' });
        saveNow();
        refresh(null);
        const btn = app.querySelector('[data-act="add-row"]');
        if (btn) btn.focus({ preventScroll: true });
        break;
      }
      case 'remove-q': {
        const id = el.dataset.id;
        a.questions = a.questions.filter((q) => q !== id);
        a.customQuestions = a.customQuestions.filter((q) => q.id !== id);
        a.askedDuring = a.askedDuring.filter((q) => q !== id);
        qMessage = '';
        saveNow();
        refresh('my-list-title');
        break;
      }
      case 'pdf':
        withBusy(el, async () => { await makePdf(false); setSnapMessage(S.pdfDone); });
        break;
      case 'share':
        withBusy(document.getElementById('pdf-btn'), async () => {
          const blob = await makePdf(true);
          const file = new File([blob], pdfName(), { type: 'application/pdf' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: S.title });
            setSnapMessage('');
          } else {
            downloadBlob(pdfName(), blob);
            setSnapMessage(S.pdfDone);
          }
        });
        break;
      case 'email':
        emailSummary();
        break;
      case 'copy':
        copyText(snapshotText()).then((ok) => setSnapMessage(ok ? S.copied : S.copyFailed));
        break;
      case 'print':
        window.print();
        break;
      case 'calendar':
        downloadCalendar(el.dataset.dates.split(','));
        break;
      case 'export':
        exportBackup();
        break;
      case 'import': {
        const input = document.getElementById('import-file');
        if (input) input.click();
        break;
      }
      case 'reset':
        if (window.confirm(C.ui.resetConfirm)) {
          undoData = store.reset();
          statusEl.textContent = '';
          flash = { text: C.ui.resetDone, undo: true };
          if (currentRoute === '') refresh(null); else location.hash = '#/';
        }
        break;
      case 'dismiss-tip':
        store.setPref('ptcc:tip-dismissed', 'yes');
        refresh(null);
        break;
      case 'undo':
        if (undoData) {
          store.restore(undoData);
          undoData = null;
          showSaved(store.isAvailable());
          flash = { text: C.ui.restored };
          refresh(null);
        }
        break;
      default:
    }
  });

  // Close the "Send" menu when clicking elsewhere or pressing Escape.
  document.addEventListener('click', (e) => {
    document.querySelectorAll('details.menu[open]').forEach((m) => { if (!m.contains(e.target)) m.open = false; });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('details.menu[open]').forEach((m) => { m.open = false; m.querySelector('summary').focus(); });
  });

  app.addEventListener('submit', (e) => {
    const form = e.target;
    if (form.dataset.form !== 'add-q') return;
    e.preventDefault();
    const Q = C.questions;
    const input = form.querySelector('input');
    const text = input.value.replace(/\s+/g, ' ').trim();
    const a = A();
    if (!text) {
      qMessage = Q.addEmpty;
    } else if (selectedQuestions().some((id) => questionText(id).toLowerCase() === text.toLowerCase())) {
      qMessage = Q.addDuplicate;
    } else if (selectedQuestions().length >= MAX_Q()) {
      qMessage = Q.addFull;
    } else {
      const id = `custom-${Date.now().toString(36)}`;
      a.customQuestions.push({ id, text });
      a.questions.push(id);
      qMessage = Q.addDone;
      saveNow();
      refresh('add-q-input');
      return;
    }
    const keep = input.value;
    refresh('add-q-input');
    document.getElementById('add-q-input').value = keep;
  });

  langToggle.addEventListener('click', () => setLang(C.lang.switchTo));

  // ---------- Installable app ----------

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener('click', async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    installEvent = null;
    installBtn.hidden = true;
  });
  window.addEventListener('appinstalled', () => {
    installBtn.hidden = true;
    statusEl.textContent = C.ui.installDone;
  });
  // Service workers only run on a real web address (http/https), not when opened from disk.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
  window.addEventListener('hashchange', router);

  renderChrome();
  router();
})();
