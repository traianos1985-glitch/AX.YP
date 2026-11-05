// Κύρια λογική: αναζήτηση σε όλη τη βάση, φίλτρα, καθοδηγούμενος έλεγχος, θέμα, ιδιωτικότητα και εκτύπωση.
(function () {
  var STALE_DAYS = 90;
  var THEME_KEY = 'axyp-theme';
  var PRIVACY_KEY = 'axyp-privacy';
  var FAVORITES_KEY = 'axyp-favorites';
  var CHECKS_PREFIX = 'axyp-checks-';
  var WIZARD_CHECKS_KEY = 'axyp-wizard-checks';
  var CHECK_LABELS = [
    'Ασφάλεια και αναγκαία βοήθεια',
    'Καταγραφή πραγματικών περιστατικών χωρίς προσωπικά δεδομένα',
    'Έλεγχος ισχύος στην επίσημη πηγή',
    'Σημείωση εκκρεμοτήτων και ενημέρωση αρμόδιας αρχής'
  ];
  var STOPWORDS = ['και', 'να', 'με', 'για', 'σε', 'στο', 'στη', 'στον', 'στην', 'τον', 'την', 'του', 'της', 'των', 'τα', 'το', 'ο', 'η', 'οι', 'ως', 'απο', 'που', 'ειναι', 'κατα', 'προς', 'περι', 'μετα', 'παρα', 'δια', 'υπο', 'επι', 'ενωπιον', 'λογω', 'αρθρο', 'αρθρα', 'αρθρου', 'αρθρων', 'αρ', 'παρ', 'παραγρ', 'παραγραφος', 'εδ', 'εδαφ', 'εδαφιο', 'νομου', 'νομος', 'νομων', 'ν'];
  var SYNONYMS = {
    'κινητο': ['τηλεφωνο'], 'τηλεφωνο': ['κινητο'],
    'βια': ['κακοποιηση'], 'κακοποιηση': ['βια'],
    'ζωο': ['ζωα'], 'ζωα': ['ζωο'], 'σκυλος': ['ζωο'], 'γατα': ['ζωο']
  };
  var WEIGHTS = { title: 5, keywords: 3, other: 1 };

  var tabs = document.getElementById('tabs');
  var q = document.getElementById('q');
  var out = document.getElementById('out');
  var hint = document.getElementById('hint');
  var resultCount = document.getElementById('result-count');
  var resultTools = document.querySelector('.result-tools');
  var statusFilter = document.getElementById('status-filter');
  var sourceFilter = document.getElementById('source-filter');
  var sortResults = document.getElementById('sort-results');
  var favoritesOnly = document.getElementById('favorites-only');
  var themeButton = document.getElementById('theme');
  var privacyButton = document.getElementById('privacy');
  var wizardModule = document.getElementById('wizard-module');
  var wizardSearch = document.getElementById('wizard-search');
  var wizardNote = document.getElementById('wizard-note');
  var docsPanel = document.getElementById('docs-panel');
  var modes = { search: document.getElementById('search-panel'), wizard: document.getElementById('wizard-panel'), forms: document.getElementById('forms-panel'), cases: document.getElementById('cases-panel'), templates: document.getElementById('templates-panel'), docs: docsPanel };

  var activeModule = DATA.modules[0].id;
  var scopeAll = false;
  var debounceTimer = null;
  var privacyOn = storageGet(localStorage, PRIVACY_KEY) === '1';
  var indexCache = {};

  function storageGet(storage, key) {
    try { return storage.getItem(key); } catch (e) { return null; }
  }

  function storageSet(storage, key, value) {
    try { storage.setItem(key, value); } catch (e) { /* Storage may be blocked. */ }
  }

  function storageRemove(storage, key) {
    try { storage.removeItem(key); } catch (e) { /* Storage may be blocked. */ }
  }

  function norm(value) {
    return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ς/g, 'σ');
  }

  function tokens(text) {
    return norm(text).split(/[^a-zα-ω0-9]+/).filter(function (word) {
      return (word.length >= 2 || /^\d+$/.test(word)) && STOPWORDS.indexOf(word) === -1;
    });
  }

  function indexItem(item) {
    if (!indexCache[item.id]) {
      indexCache[item.id] = {
        title: tokens(item.title),
        keywords: tokens(item.keywords),
        other: tokens([item.law, item.penalty, item.procedure, item.notes].join(' '))
      };
    }
    return indexCache[item.id];
  }

  function termMatches(term, list) {
    var stem = term.slice(0, Math.max(4, term.length - 2));
    var numeric = /^\d+$/.test(term);
    return list.some(function (token) {
      if (token === term) return true;
      return !numeric && term.length >= 4 && token.indexOf(stem) === 0;
    });
  }

  function expandTerms(query) {
    var qNorm = norm(query);
    var articleBoosts = [];
    var articleRegex = /(?:αρθρ[οα]|αρ\.?)\s*(\d+)/g;
    var match;
    while ((match = articleRegex.exec(qNorm)) !== null) {
      articleBoosts.push(match[1]);
    }

    var base = tokens(query);
    var terms = base.map(function (text) {
      var isArticleNum = articleBoosts.indexOf(text) !== -1;
      return { text: text, mult: isArticleNum ? 4 : 1 };
    });

    articleBoosts.forEach(function (num) {
      if (!terms.some(function (t) { return t.text === num; })) {
        terms.push({ text: num, mult: 4 });
      }
    });

    base.forEach(function (text) {
      (SYNONYMS[text] || []).forEach(function (synonym) { terms.push({ text: synonym, mult: 0.5 }); });
    });
    return terms;
  }

  function score(item, terms) {
    var index = indexItem(item);
    return terms.reduce(function (sum, term) {
      var weight = termMatches(term.text, index.title) ? WEIGHTS.title
        : termMatches(term.text, index.keywords) ? WEIGHTS.keywords
        : termMatches(term.text, index.other) ? WEIGHTS.other : 0;
      return sum + weight * term.mult;
    }, 0);
  }

  function isOfficial(url) {
    try {
      var host = new URL(url).hostname;
      var officialHosts = ['et.gr', 'gov.gr', 'hellenicparliament.gr', 'proanakrisi.gr', 'kodiko.gr', 'e-nomothesia.gr'];
      return officialHosts.some(function (h) {
        return host === h || host.endsWith('.' + h);
      });
    } catch (_) {
      return false;
    }
  }

  function ageDays(date) {
    var time = new Date(date + 'T00:00:00').getTime();
    return isNaN(time) ? Infinity : Math.floor((Date.now() - time) / 864e5);
  }

  function readJson(key, fallback) {
    try { return JSON.parse(storageGet(localStorage, key) || '') || fallback; } catch (e) { return fallback; }
  }

  function favorites() {
    return readJson(FAVORITES_KEY, []);
  }

  function toggleFavorite(id) {
    var list = favorites();
    var index = list.indexOf(id);
    if (index > -1) list.splice(index, 1);
    else list.push(id);
    storageSet(localStorage, FAVORITES_KEY, JSON.stringify(list));
    return index === -1;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function moduleById(id) {
    return DATA.modules.filter(function (module) { return module.id === id; })[0];
  }

  function allEntries() {
    return DATA.modules.reduce(function (list, module) {
      return list.concat((module.items || []).map(function (item) { return { item: item, module: module }; }));
    }, []);
  }

  function visibleEntries(terms, rawQuery, incidentRule) {
    var pool;
    if (incidentRule) {
      var allowed = incidentRule.primaryEntryIds.concat(incidentRule.relatedEntryIds);
      pool = allEntries().filter(function (entry) { return allowed.indexOf(entry.item.id) !== -1; });
    } else {
      pool = (scopeAll || activeModule === 'all') ? allEntries() : (moduleById(activeModule) ? moduleById(activeModule).items.map(function (item) {
        return { item: item, module: moduleById(activeModule) };
      }) : allEntries());
    }
    var saved = favorites();
    var list = pool.map(function (entry) {
      var primary = incidentRule && incidentRule.primaryEntryIds.indexOf(entry.item.id) !== -1;
      var related = incidentRule && incidentRule.relatedEntryIds.indexOf(entry.item.id) !== -1;
      var matchedScore = incidentRule ? (primary ? 100 : 25) : (terms.length ? score(entry.item, terms) : 0);
      return { entry: entry, score: matchedScore, related: !!related };
    }).filter(function (row) {
      var item = row.entry.item;
      if (terms.length && row.score <= 0) return false;
      if (!incidentRule && terms.length > 2 && !window.AXYPIncidentSearch.hasCoverage(rawQuery, item)) return false;
      if (statusFilter.value !== 'all' && item.status !== statusFilter.value) return false;
      var official = isOfficial(item.source);
      if (sourceFilter.value === 'official' && !official) return false;
      if (sourceFilter.value === 'other' && official) return false;
      if (favoritesOnly.getAttribute('aria-pressed') === 'true' && saved.indexOf(item.id) === -1) return false;
      return true;
    });
    if (sortResults.value === 'newest') {
      list.sort(function (a, b) { return b.entry.item.verified.localeCompare(a.entry.item.verified); });
    } else if (sortResults.value === 'status') {
      list.sort(function (a, b) { return (b.entry.item.status === 'ok') - (a.entry.item.status === 'ok') || b.score - a.score; });
    } else if (terms.length) {
      list.sort(function (a, b) { return b.score - a.score; });
    }
    return list;
  }

  function highlight(parent, text, rawQuery) {
    var words = tokens(rawQuery);
    if (!words.length) { parent.textContent = text; return; }
    var matcher = /[\p{L}\p{N}]+/gu;
    var cursor = 0;
    var match;
    while ((match = matcher.exec(text))) {
      if (match.index > cursor) parent.appendChild(document.createTextNode(text.slice(cursor, match.index)));
      var token = norm(match[0]);
      var matches = words.some(function (word) {
        var stem = word.slice(0, Math.max(4, word.length - 2));
        return token === word || (word.length >= 4 && token.indexOf(stem) === 0);
      });
      parent.appendChild(matches ? el('mark', '', match[0]) : document.createTextNode(match[0]));
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) parent.appendChild(document.createTextNode(text.slice(cursor)));
  }

  function checksFor(key) {
    var saved = readJson(key, []);
    return CHECK_LABELS.map(function (label, index) { return !!saved[index]; });
  }

  function saveChecks(key, values) {
    storageSet(localStorage, key, JSON.stringify(values));
  }

  function checklistNode(key, onChange) {
    var wrapper = el('div', 'checklist-wrapper');
    var list = el('ul', 'summary-list');
    var values = checksFor(key);
    var inputs = [];
    CHECK_LABELS.forEach(function (label, index) {
      var item = el('li');
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = values[index];
      input.setAttribute('aria-label', label);
      inputs.push(input);
      input.onchange = function () {
        values[index] = input.checked;
        saveChecks(key, values);
        onChange(values.filter(Boolean).length);
      };
      item.appendChild(input);
      item.appendChild(document.createTextNode(label));
      list.appendChild(item);
    });
    wrapper.appendChild(list);

    var resetBtn = el('button', 'text-button', 'Μηδενισμός λίστας');
    resetBtn.type = 'button';
    resetBtn.style.fontSize = '0.8rem';
    resetBtn.style.margin = '4px 0 0';
    resetBtn.onclick = function (e) {
      e.stopPropagation();
      inputs.forEach(function (inp, idx) {
        inp.checked = false;
        values[idx] = false;
      });
      saveChecks(key, values);
      onChange(0);
    };
    wrapper.appendChild(resetBtn);
    return wrapper;
  }

  function card(entry, rawQuery, related) {
    var item = entry.item;
    var official = isOfficial(item.source);
    var article = el('article');
    var title = el('h2');
    highlight(title, item.title, rawQuery);
    article.appendChild(title);

    var stale = item.status !== 'ok' || ageDays(item.verified) > STALE_DAYS;
    article.appendChild(el('span', 'badge ' + (item.status === 'ok' ? 'b-ok' : 'b-wait'), item.status === 'ok' ? 'Επαληθευμένη' : 'Μερική επαλήθευση'));
    article.appendChild(el('span', 'badge ' + (stale ? 'b-old' : 'b-ok'), 'Καταγραφή: ' + item.verified + (stale ? ' · χρειάζεται επαλήθευση' : '')));
    article.appendChild(el('span', 'badge b-info', entry.module.title));
    if (related) article.appendChild(el('span', 'badge b-info', 'Συμπληρωματική διαδικασία — υπό προϋποθέσεις'));
    article.appendChild(el('span', 'badge b-wait', official ? 'Επίσημη πηγή' : 'Δευτερεύουσα πηγή'));
    if (item.source === 'https://search.et.gr/el/') {
      article.appendChild(el('span', 'badge b-info', 'Επίσημη αναζήτηση ΦΕΚ'));
    }

    var dl = el('dl');
    [['Διάταξη', item.law], ['Ποινή ή πρόστιμο', item.penalty], ['Διαδικασία / υπηρεσιακές ενέργειες', item.procedure], ['Σημειώσεις', item.notes]].forEach(function (pair) {
      dl.appendChild(el('dt', '', pair[0]));
      dl.appendChild(el('dd', '', pair[1]));
    });
    article.appendChild(dl);

    var key = CHECKS_PREFIX + item.id;
    var details = el('details', 'service-summary');
    var summary = el('summary', '', 'Υπηρεσιακή σύνοψη και έλεγχοι');
    details.appendChild(summary);
    details.appendChild(checklistNode(key, function (done) {
      summary.textContent = 'Υπηρεσιακή σύνοψη και έλεγχοι (' + done + '/' + CHECK_LABELS.length + ')';
    }));
    var initialDone = checksFor(key).filter(Boolean).length;
    summary.textContent = 'Υπηρεσιακή σύνοψη και έλεγχοι (' + initialDone + '/' + CHECK_LABELS.length + ')';
    article.appendChild(details);

    var row = el('div', 'row');
    var link = el('a', '', 'Άνοιγμα πηγής');
    link.href = item.source;
    link.target = '_blank';
    link.rel = 'noopener';
    row.appendChild(link);
    row.appendChild(copyButton(item));
    row.appendChild(favoriteButton(item.id));
    article.appendChild(row);
    return article;
  }

  function copyButton(item) {
    var button = el('button', '', 'Αντιγραφή αναφοράς');
    button.type = 'button';
    button.onclick = function () {
      var text = 'Εγγραφή ' + item.id + ' (' + item.title + ') – πιθανό λάθος ή αλλαγή νομοθεσίας: ';
      if (!navigator.clipboard) {
        window.prompt('Αντέγραψε το κείμενο:', text);
        return;
      }
      navigator.clipboard.writeText(text).then(function () {
        button.textContent = 'Αντιγράφηκε';
        setTimeout(function () { button.textContent = 'Αντιγραφή αναφοράς'; }, 2200);
      });
    };
    return button;
  }

  function favoriteButton(id) {
    var on = favorites().indexOf(id) > -1;
    var button = el('button', 'favorite', on ? '★ Αποθηκεύτηκε' : '☆ Αποθήκευση');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(on));
    button.onclick = function () {
      var nowOn = toggleFavorite(id);
      button.setAttribute('aria-pressed', String(nowOn));
      button.textContent = nowOn ? '★ Αποθηκεύτηκε' : '☆ Αποθήκευση';
    };
    return button;
  }

  function renderResults() {
    var raw = q.value.trim();
    out.textContent = '';
    if (!raw) {
      if (resultTools) resultTools.hidden = true;
      resultCount.textContent = 'Έτοιμο για αναζήτηση';
      hint.textContent = 'Πληκτρολόγησε λέξεις-κλειδιά ή επίλεξε μία γρήγορη αναζήτηση για να εμφανιστούν τα σχετικά άρθρα.';
      var start = el('div', 'search-start');
      start.innerHTML = '<strong>Ξεκίνα από εδώ</strong><span>Περιέγραψε σύντομα το περιστατικό και θα εμφανιστούν μόνο οι σχετικές διατάξεις.</span>';
      out.appendChild(start);
      return;
    }
    if (resultTools) resultTools.hidden = false;
    var terms = expandTerms(raw);
    var incidentRule = window.AXYPIncidentSearch.classify(raw);
    var list = visibleEntries(terms, raw, incidentRule);
    resultCount.textContent = list.length + (list.length === 1 ? ' αποτέλεσμα' : ' αποτελέσματα');
    if (!list.length) {
      hint.textContent = terms.length ? 'Δεν βρέθηκε καταχωρισμένη εγγραφή. Δοκίμασε άλλες λέξεις-κλειδιά.' : 'Δεν υπάρχουν εγγραφές με τα επιλεγμένα φίλτρα.';
      out.appendChild(el('div', 'empty', 'Δοκίμασε διαφορετικές λέξεις-κλειδιά, άλλη ενότητα ή αφαιρέσε τα φίλτρα.'));
      return;
    }
    hint.textContent = incidentRule
      ? incidentRule.label + '. ' + incidentRule.notice + ' Εμφανίζονται οι σχετικές νομικές καταχωρίσεις.'
      : (terms.length ? list.length + ' σχετικές εγγραφές σε όλη τη βάση.' : 'Εμφανίζονται ' + list.length + ' εγγραφές της ενότητας.');
    list.forEach(function (row) { out.appendChild(card(row.entry, raw, row.related)); });
  }

  function scheduleRender() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(renderResults, 200);
  }

  function renderTabs() {
    tabs.textContent = '';
    var allBtn = el('button', '', 'Όλες');
    allBtn.type = 'button';
    allBtn.setAttribute('aria-pressed', String(scopeAll || activeModule === 'all'));
    allBtn.onclick = function () {
      scopeAll = true;
      activeModule = 'all';
      renderTabs();
      renderResults();
    };
    tabs.appendChild(allBtn);

    DATA.modules.forEach(function (module) {
      var button = el('button', '', module.title);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(!scopeAll && module.id === activeModule));
      button.onclick = function () {
        activeModule = module.id;
        scopeAll = false;
        renderTabs();
        renderResults();
      };
      tabs.appendChild(button);
    });
  }

  function fillWizard() {
    DATA.modules.forEach(function (module) {
      var option = el('option', '', module.title);
      option.value = module.id;
      wizardModule.appendChild(option);
    });
    wizardModule.value = activeModule === 'all' ? DATA.modules[0].id : activeModule;
    var checks = checksFor(WIZARD_CHECKS_KEY);
    var inputs = document.querySelectorAll('#wizard-checks input');
    inputs.forEach(function (input, index) {
      input.checked = checks[index];
      input.onchange = function () {
        checks[index] = input.checked;
        saveChecks(WIZARD_CHECKS_KEY, checks);
      };
    });

    if (!document.getElementById('wizard-checks-reset')) {
      var resetBtn = el('button', 'mini-button', 'Μηδενισμός ελέγχων');
      resetBtn.id = 'wizard-checks-reset';
      resetBtn.type = 'button';
      resetBtn.style.margin = '8px 8px 8px 0';
      resetBtn.onclick = function () {
        inputs.forEach(function (input, index) {
          input.checked = false;
          checks[index] = false;
        });
        saveChecks(WIZARD_CHECKS_KEY, checks);
      };
      var wizardChecks = document.getElementById('wizard-checks');
      if (wizardChecks && wizardChecks.parentNode) {
        wizardChecks.parentNode.insertBefore(resetBtn, document.getElementById('wizard-run'));
      }
    }
  }

  function showMode(name) {
    Object.keys(modes).forEach(function (key) { modes[key].hidden = key !== name; });
    ['search', 'wizard', 'forms', 'cases', 'templates'].forEach(function (key) {
      document.getElementById(key + '-mode').setAttribute('aria-pressed', String(key === name));
    });
    if (name === 'search') renderResults();
    if (name === 'forms') FormsView.refresh();
  }

  function showDocs(file, title) {
    document.getElementById('docs-title').textContent = title;
    showMode('docs');
    document.getElementById('docs-title').focus();
    DocsView.show(file);
  }

  function applyTheme(state) {
    if (state === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', state);
    themeButton.textContent = { system: 'Θέμα: συστήματος', light: 'Θέμα: ανοιχτό', dark: 'Θέμα: σκούρο' }[state];
  }

  function applyPrivacy(on) {
    privacyOn = on;
    privacyButton.setAttribute('aria-pressed', String(on));
    privacyButton.textContent = 'Privacy mode: ' + (on ? 'ενεργό' : 'ανενεργό');
    storageSet(localStorage, PRIVACY_KEY, on ? '1' : '0');
  }

  function setConnection(online) {
    document.getElementById('connection').textContent = online
      ? 'Σε σύνδεση · τα δεδομένα παραμένουν στη συσκευή.'
      : 'Χωρίς σύνδεση · χρησιμοποιείται η αποθηκευμένη βάση.';
    document.getElementById('status-dot').classList.toggle('offline', !online);
  }

  function bind() {
    themeButton.onclick = function () {
      var order = ['system', 'light', 'dark'];
      var current = document.documentElement.getAttribute('data-theme') || 'system';
      var next = order[(order.indexOf(current) + 1) % order.length];
      if (next === 'system') storageRemove(localStorage, THEME_KEY);
      else storageSet(localStorage, THEME_KEY, next);
      applyTheme(next);
    };
    privacyButton.onclick = function () { applyPrivacy(!privacyOn); };
    document.getElementById('clear').onclick = function () {
      q.value = '';
      q.focus();
      renderResults();
    };
    q.addEventListener('input', function () {
      scopeAll = true;
      renderTabs();
      scheduleRender();
    });
    document.querySelectorAll('[data-query]').forEach(function (button) {
      button.onclick = function () {
        q.value = button.dataset.query;
        scopeAll = true;
        renderResults();
      };
    });
    [statusFilter, sourceFilter, sortResults].forEach(function (control) { control.onchange = renderResults; });
    favoritesOnly.onclick = function () {
      favoritesOnly.setAttribute('aria-pressed', String(favoritesOnly.getAttribute('aria-pressed') !== 'true'));
      renderResults();
    };
    document.getElementById('print').onclick = function () {
      document.getElementById('print-meta').textContent = 'Βάση: ' + DATA.updated + ' · Εκτυπώθηκε: ' + new Date().toISOString().slice(0, 10);
      window.print();
    };
    document.getElementById('search-mode').onclick = function () { showMode('search'); };
    document.getElementById('wizard-mode').onclick = function () { showMode('wizard'); };
    document.getElementById('forms-mode').onclick = function () { showMode('forms'); };
    document.getElementById('cases-mode').onclick = function () { showMode('cases'); HypothesesView.refresh(); if (window.CaseBundles) CaseBundles.refresh(); };
    document.getElementById('templates-mode').onclick = function () { showMode('templates'); TemplatesView.refresh(); };
    document.getElementById('docs-changelog').onclick = function () { showDocs('CHANGELOG.md', 'Αρχείο αλλαγών'); };
    document.getElementById('docs-pending').onclick = function () { showDocs('PENDING.md', 'Εκκρεμότητες περιεχομένου'); };
    document.getElementById('docs-close').onclick = function () { showMode('search'); };
    wizardModule.onchange = function () { activeModule = wizardModule.value; };
    document.getElementById('wizard-run').onclick = function () {
      activeModule = wizardModule.value;
      scopeAll = false;
      q.value = wizardSearch.value;
      renderTabs();
      wizardNote.textContent = 'Οι ερωτήσεις είναι οργανωτικές μόνο· έλεγξε κάθε αποτέλεσμα στην πηγή.';
      showMode('search');
    };
    wizardSearch.onkeydown = function (event) {
      if (event.key === 'Enter' && !event.isComposing) document.getElementById('wizard-run').click();
    };
    window.addEventListener('online', function () { setConnection(true); });
    window.addEventListener('offline', function () { setConnection(false); });
    window.addEventListener('pagehide', function () {
      if (!privacyOn) return;
      q.value = '';
      wizardSearch.value = '';
      FormsView.clearAll();
    });
  }

  function start() {
    document.getElementById('version').textContent = DATA.updated;
    document.getElementById('foot').textContent = 'Τελευταία ενημέρωση βάσης: ' + DATA.updated + '. Εγγραφές χωρίς επαλήθευση από επίσημη πηγή επισημαίνονται.';
    var savedTheme = storageGet(localStorage, THEME_KEY);
    applyTheme(savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'system');
    applyPrivacy(privacyOn);
    setConnection(navigator.onLine);
    renderTabs();
    fillWizard();
    bind();
    FormsView.init({
      message: function (text) { document.getElementById('flash').textContent = text; },
      isPrivacyOn: function () { return privacyOn; }
    });
    renderResults();
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      });
    }
  }

  start();
})();
