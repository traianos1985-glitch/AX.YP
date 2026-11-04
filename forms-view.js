// Κέντρο εντύπων: προφίλ κοινών στοιχείων, λίστα εντύπων και εξαγωγή προσχεδίου.
// Ευαίσθητα πεδία (ονοματεπώνυμο, πατρώνυμο, ταυτότητα, διεύθυνση) μένουν μόνο στο sessionStorage.
(function () {
  var PROFILE_KEY = 'axyp-form-profile';
  var root = document.getElementById('profile-fields');
  var form = document.getElementById('person-profile');
  var queryInput = document.getElementById('forms-query');
  var list = document.getElementById('forms-list');
  var message = null;
  var privacyOn = function () { return false; };

  function storageGet(storage, key) {
    try { return storage.getItem(key); } catch (e) { return null; }
  }

  function storageSet(storage, key, value) {
    try { storage.setItem(key, value); } catch (e) { /* Storage may be blocked. */ }
  }

  function storageRemove(storage, key) {
    try { storage.removeItem(key); } catch (e) { /* Storage may be blocked. */ }
  }

  function fieldById(id) {
    return FORMS_DATA.commonFields.filter(function (field) { return field.id === id; })[0];
  }

  function readProfile() {
    var local = {};
    var session = {};
    try { local = JSON.parse(storageGet(localStorage, PROFILE_KEY) || '{}'); } catch (e) { local = {}; }
    try { session = JSON.parse(storageGet(sessionStorage, PROFILE_KEY) || '{}'); } catch (e) { session = {}; }
    FORMS_DATA.commonFields.forEach(function (field) {
      if (field.sensitive && Object.prototype.hasOwnProperty.call(local, field.id)) delete local[field.id];
    });
    return Object.assign({}, local, session);
  }

  function saveProfile() {
    var local = {};
    var session = {};
    new FormData(form).forEach(function (value, key) {
      if (!value) return;
      var field = fieldById(key);
      if (field && field.sensitive) session[key] = value;
      else if (privacyOn()) session[key] = value;
      else local[key] = value;
    });
    FORMS_DATA.commonFields.forEach(function (field) {
      if (field.sensitive) delete local[field.id];
    });
    storageSet(localStorage, PROFILE_KEY, JSON.stringify(local));
    storageSet(sessionStorage, PROFILE_KEY, JSON.stringify(session));
  }

  function clearProfile() {
    storageRemove(localStorage, PROFILE_KEY);
    storageRemove(sessionStorage, PROFILE_KEY);
    renderProfileFields();
  }

  function clearFields() {
    form.reset();
  }

  function renderProfileFields() {
    var profile = readProfile();
    root.textContent = '';
    FORMS_DATA.commonFields.forEach(function (field) {
      var wrap = document.createElement('label');
      wrap.className = 'profile-field';
      wrap.textContent = field.label;
      var input = document.createElement('input');
      input.id = 'profile-' + field.id;
      input.name = field.id;
      input.type = field.type;
      input.autocomplete = 'off';
      input.value = profile[field.id] || '';
      wrap.appendChild(input);
      root.appendChild(wrap);
    });
  }

  function fieldValues(item) {
    return item.fields.map(function (id) {
      var input = document.getElementById('profile-' + id);
      return { id: id, label: fieldById(id).label, value: input ? input.value : '' };
    });
  }

  function renderForms() {
    var query = norm(queryInput.value);
    var matches = FORMS_DATA.categories.filter(function (item) {
      return !query || norm(item.title + ' ' + item.description + ' ' + item.id).indexOf(query) > -1;
    });
    list.textContent = '';
    matches.forEach(function (item) {
      list.appendChild(formCard(item));
    });
    if (!matches.length) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Δεν βρέθηκε έντυπο με αυτή την αναζήτηση.';
      list.appendChild(empty);
    }
  }

  function formCard(item) {
    var card = document.createElement('article');
    card.className = 'form-card';
    var title = document.createElement('h3');
    title.textContent = item.title;
    var description = document.createElement('p');
    description.className = 'muted';
    description.textContent = item.description;
    var count = document.createElement('span');
    count.className = 'badge b-wait';
    count.textContent = item.countLabel;
    var fields = document.createElement('p');
    fields.className = 'form-fields';
    fields.textContent = 'Κοινά πεδία: ' + item.fields.map(function (id) { return fieldById(id).label; }).join(' · ');
    var actions = document.createElement('div');
    actions.className = 'row';
    actions.appendChild(sourceLink(item.source));
    actions.appendChild(checkButton(item, fields));
    actions.appendChild(exportButton(item));
    card.append(title, description, count, fields, actions);
    return card;
  }

  function sourceLink(url) {
    var link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Άνοιγμα πηγής';
    return link;
  }

  function checkButton(item, fieldsLine) {
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Έλεγχος κοινών στοιχείων';
    button.onclick = function () {
      var missing = fieldValues(item).filter(function (entry) { return !entry.value; });
      fieldsLine.textContent = missing.length
        ? 'Λείπουν: ' + missing.map(function (entry) { return entry.label; }).join(', ')
        : 'Τα κοινά στοιχεία είναι έτοιμα ως προσχέδιο για το έντυπο.';
    };
    return button;
  }

  function exportButton(item) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'mini-button';
    button.textContent = 'Εξαγωγή DOCX για Word';
    button.onclick = function () {
      DocxExport.download({
        title: item.title,
        rows: fieldValues(item).map(function (entry) { return [entry.label, entry.value]; }),
        fileName: item.id + '-proschedio.docx'
      });
      message('Το συμπληρωμένο έγγραφο DOCX κατέβηκε τοπικά. Μπορείς να το ανοίξεις απευθείας στο Word.');
    };
    return button;
  }

  window.FormsView = {
    init: function (options) {
      message = options.message;
      privacyOn = options.isPrivacyOn;
      renderProfileFields();
      renderForms();
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        saveProfile();
        message('Το προφίλ αποθηκεύτηκε στη συσκευή.');
      });
      document.getElementById('clear-profile').onclick = function () {
        clearProfile();
        message('Το προφίλ καθαρίστηκε.');
      };
      queryInput.oninput = renderForms;
    },
    clearAll: function () {
      storageRemove(localStorage, PROFILE_KEY);
      storageRemove(sessionStorage, PROFILE_KEY);
      clearFields();
    },
    refresh: renderForms
  };

  function norm(value) {
    return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
})();
