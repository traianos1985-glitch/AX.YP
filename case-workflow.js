// Καθοδηγούμενη ροή δικογραφίας: κοινά στοιχεία, ειδικά πεδία, έλεγχος και αποθήκευση.
(function () {
  'use strict';
  var form = document.getElementById('case-form');
  if (!form) return;
  var currentStep = 0;
  var dirty = false;
  var steps = [];
  var labels = ['Βασικά στοιχεία', 'Πρόσωπα και ειδικά στοιχεία', 'Έλεγχος και ολοκλήρωση'];
  var basicIds = new Set([
    'case-title', 'case-offence', 'case-status', 'case-date', 'case-people',
    'case-protocol-number', 'case-location', 'case-time', 'case-incident-date', 'case-incident-time', 'case-prosecutor',
    'case-arresting-officer'
  ]);
  var $ = function (id) { return document.getElementById(id); };

  function makeStep(index) {
    var section = document.createElement('section');
    section.className = 'case-workflow-step';
    section.id = 'case-workflow-step-' + (index + 1);
    section.hidden = true;
    section.setAttribute('aria-labelledby', section.id + '-title');
    var heading = document.createElement('h3');
    heading.id = section.id + '-title';
    heading.className = 'case-workflow-step-title';
    heading.textContent = labels[index];
    section.appendChild(heading);
    return section;
  }

  function addControls(section, index) {
    var controls = document.createElement('div');
    controls.className = 'case-workflow-controls';
    if (index > 0) {
      var back = document.createElement('button');
      back.type = 'button';
      back.className = 'mini-button';
      back.textContent = '← Προηγούμενο';
      back.addEventListener('click', function () { showStep(index - 1); });
      controls.appendChild(back);
    }
    if (index < steps.length - 1) {
      var next = document.createElement('button');
      next.type = 'button';
      next.className = 'mini-button primary';
      next.textContent = index === 0 ? 'Συνέχεια στα ειδικά στοιχεία →' : 'Έλεγχος και ολοκλήρωση →';
      next.addEventListener('click', function () {
        if (index === 0 && !form.reportValidity()) return;
        showStep(index + 1);
      });
      controls.appendChild(next);
    } else {
      var word = document.createElement('button');
      word.type = 'button';
      word.className = 'mini-button';
      word.textContent = 'Πρόχειρο Word';
      word.addEventListener('click', function () {
        var source = $('case-word');
        if (source) source.click();
      });
      controls.appendChild(word);
    }
    section.appendChild(controls);
  }

  function build() {
    var children = Array.prototype.slice.call(form.children);
    var hiddenId = children.find(function (node) { return node.id === 'case-id'; });
    var groups = [makeStep(0), makeStep(1), makeStep(2)];
    steps = groups;
    if (hiddenId) form.insertBefore(hiddenId, form.firstChild);
    children.forEach(function (node) {
      if (node === hiddenId) return;
      var id = node.querySelector && node.querySelector('[id]') ? node.querySelector('[id]').id : node.id;
      var target = 1;
      if (node.tagName === 'LABEL' && (basicIds.has(id) || basicIds.has(node.querySelector('input,select,textarea')?.id))) target = 0;
      else if (node.classList && (node.classList.contains('completeness') || node.classList.contains('profile-actions'))) target = 2;
      else if (node.querySelector && (node.querySelector('#case-evidence') || node.querySelector('#case-notes'))) target = 2;
      groups[target].appendChild(node);
    });
    groups.forEach(function (section, index) {
      addControls(section, index);
      form.appendChild(section);
    });
    steps = groups;
    var nav = document.createElement('nav');
    nav.className = 'case-workflow-progress';
    nav.setAttribute('aria-label', 'Βήματα δημιουργίας δικογραφίας');
    nav.innerHTML = '<p class="case-workflow-caption">Καθοδηγούμενη καταχώριση</p><ol></ol>';
    var list = nav.querySelector('ol');
    labels.forEach(function (label, index) {
      var item = document.createElement('li');
      item.textContent = (index + 1) + '. ' + label;
      item.setAttribute('aria-current', index === 0 ? 'step' : 'false');
      list.appendChild(item);
    });
    form.insertBefore(nav, form.firstChild);
    var summary = document.createElement('div');
    summary.id = 'case-workflow-summary';
    summary.className = 'case-workflow-summary';
    summary.setAttribute('role', 'status');
    summary.setAttribute('aria-live', 'polite');
    groups[2].insertBefore(summary, groups[2].querySelector('.case-workflow-controls'));
    showStep(0, false);
    updateSummary();
  }

  function showStep(index, focusHeading) {
    currentStep = Math.max(0, Math.min(index, steps.length - 1));
    steps.forEach(function (step, i) { step.hidden = i !== currentStep; });
    var items = form.querySelectorAll('.case-workflow-progress li');
    items.forEach(function (item, i) {
      item.setAttribute('aria-current', i === currentStep ? 'step' : 'false');
      item.classList.toggle('is-complete', i < currentStep);
    });
    updateSummary();
    if (focusHeading !== false) {
      var heading = steps[currentStep].querySelector('h3');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
    }
  }

  function updateSummary() {
    var summary = $('case-workflow-summary');
    if (!summary) return;
    var profile = $('case-profile') ? $('case-profile').value : 'generic';
    var category = $('dossier-active-title') ? $('dossier-active-title').textContent : 'Δικογραφία';
    var required = [
      ['case-title', 'Τίτλος υπόθεσης'],
      ['case-offence', 'Είδος αδικήματος'],
      ['case-protocol-number', 'Αριθμός πρωτοκόλλου']
    ];
    var missing = required.filter(function (entry) {
      var field = $(entry[0]);
      return field && !field.value.trim();
    }).map(function (entry) { return entry[1]; });
    var checks = ['check-safety', 'check-source', 'check-notify'].filter(function (id) {
      return $(id) && $(id).checked;
    }).length;
    var read = function (id) { var field = $(id); return field ? field.value : ''; };
    var registerCount = function (id) {
      var root = $(id);
      return root ? root.querySelectorAll('.case-register-entry').length : 0;
    };
    var report = window.AXYPDossierCompleteness
      ? window.AXYPDossierCompleteness.evaluate(profile, {
          title: read('case-title'), offence: read('case-offence'), protocolNumber: read('case-protocol-number'),
          date: read('case-date'), location: read('case-location'), incidentDate: read('case-incident-date'),
          incidentTime: read('case-incident-time'), people: read('case-people'), evidence: read('case-evidence'),
          fields: null,
          register: { persons: registerCount('person-register-list'), evidence: registerCount('evidence-register-list'), actions: registerCount('task-register-list') }
        }, function (id) { return read(id); })
      : null;

    summary.replaceChildren();
    var intro = document.createElement('p');
    intro.textContent = missing.length
      ? 'Πριν από την αποθήκευση συμπλήρωσε τα βασικά πεδία: ' + missing.join(', ') + '.'
      : category + ' · Τα βασικά πεδία έχουν συμπληρωθεί. Έχουν σημειωθεί ' + checks + '/3 γενικοί έλεγχοι.';
    summary.appendChild(intro);
    summary.setAttribute('data-state', missing.length ? 'incomplete' : 'review');

    if (report) {
      var heading = document.createElement('strong');
      heading.textContent = 'Έλεγχος ειδικών στοιχείων — ' + report.categoryLabel;
      summary.appendChild(heading);
      var note = document.createElement('p');
      note.textContent = report.guidance;
      summary.appendChild(note);
      report.groups.forEach(function (group) {
        var section = document.createElement('section');
        section.className = 'completeness-review-group';
        var title = document.createElement('strong');
        title.textContent = group.label + ' · ' + group.filled + '/' + group.total + ' συμπληρωμένα';
        section.appendChild(title);
        if (group.missing.length) {
          var list = document.createElement('ul');
          group.missing.forEach(function (field) {
            var item = document.createElement('li');
            item.textContent = field.label + ' — δεν έχει συμπληρωθεί· έλεγξε αν αφορά την υπόθεση.';
            list.appendChild(item);
          });
          section.appendChild(list);
        } else {
          var complete = document.createElement('p');
          complete.textContent = group.total ? 'Τα πεδία αυτής της ενότητας έχουν συμπληρωθεί.' : 'Δεν υπάρχουν ειδικά δομημένα πεδία για αυτή την κατηγορία.';
          section.appendChild(complete);
        }
        summary.appendChild(section);
      });
      var register = document.createElement('p');
      register.className = 'completeness-register-counts';
      register.textContent = 'Μητρώο: ' + report.register.persons + ' πρόσωπα · ' + report.register.evidence + ' πειστήρια · ' + report.register.actions + ' εκκρεμείς ενέργειες.';
      summary.appendChild(register);
      var caution = document.createElement('p');
      caution.className = 'completeness-caution';
      caution.textContent = 'Οι ενδείξεις αφορούν μόνο κενά καταχώρισης. Δεν αποτελούν νομικό έλεγχο, δεν χαρακτηρίζουν πεδία ως υποχρεωτικά και δεν εμποδίζουν την αποθήκευση.';
      summary.appendChild(caution);
    }
  }

  function visibleFields() {
    return Array.prototype.slice.call(steps[currentStep].querySelectorAll('input:not([type="hidden"]), select, textarea, button'))
      .filter(function (field) {
        return !field.disabled && !field.closest('[hidden]') && field.type !== 'submit' && field.type !== 'button';
      });
  }

  form.addEventListener('input', function () { dirty = true; updateSummary(); });
  form.addEventListener('change', function () { dirty = true; updateSummary(); });
  form.addEventListener('reset', function () { setTimeout(function () { dirty = false; updateSummary(); }, 0); });

  // Enter moves to the next visible field on mobile; textareas keep their normal newline behavior.
  form.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' || event.defaultPrevented || event.target.tagName === 'TEXTAREA' ||
        event.target.tagName === 'BUTTON' || event.target.tagName === 'SELECT' ||
        event.target.type === 'submit' || event.target.type === 'checkbox' || event.target.type === 'radio') return;
    var fields = visibleFields();
    var index = fields.indexOf(event.target);
    if (index < 0 || index >= fields.length - 1) return;
    event.preventDefault();
    fields[index + 1].focus();
  });

  // Prevent accidental loss when starting another case or leaving the current category.
  function confirmDiscard(event) {
    if (!dirty) return;
    if (!window.confirm('Υπάρχουν αλλαγές που δεν έχουν αποθηκευτεί. Θέλεις να συνεχίσεις χωρίς αποθήκευση;')) {
      event.preventDefault();
      event.stopImmediatePropagation();
    } else {
      dirty = false;
    }
  }
  ['case-reset', 'dossier-back', 'dossier-new-case'].forEach(function (id) {
    var node = $(id);
    if (node) node.addEventListener('click', confirmDiscard, true);
  });
  var list = $('cases-list');
  if (list) {
    list.addEventListener('click', function (event) {
      if (event.target.closest('.case-card')) confirmDiscard(event);
    }, true);
    list.addEventListener('click', function () { setTimeout(applyCategoryFields, 0); });
  }
  var categoryGrid = $('dossier-category-grid');
  if (categoryGrid) categoryGrid.addEventListener('click', function () { setTimeout(applyCategoryFields, 0); });
  var newCaseButton = $('dossier-new-case');
  if (newCaseButton) newCaseButton.addEventListener('click', function () { setTimeout(applyCategoryFields, 0); });
  window.addEventListener('beforeunload', function (event) {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });

  var flash = $('case-flash');
  if (flash && typeof MutationObserver !== 'undefined') {
    new MutationObserver(function () {
      if (/Η υπόθεση αποθηκεύτηκε/.test(flash.textContent)) dirty = false;
    }).observe(flash, { childList: true, characterData: true, subtree: true });
  }

  form.addEventListener('submit', function (event) {
    if (currentStep !== 2) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (currentStep === 0 && !form.reportValidity()) return;
      showStep(Math.min(currentStep + 1, 2));
    } else {
      updateSummary();
    }
  }, true);

  function applyCategoryFields() {
    var selected = profile ? profile.value : 'generic';
    var commerce = $('commerce-offenders');
    if (commerce) commerce.hidden = selected !== 'commerce';
    var narcoticsReleaseFields = $('case-narcotics-release-section');
    if (narcoticsReleaseFields) narcoticsReleaseFields.hidden = selected !== 'narcotics';
    var noiseFields = $('noise-fields');
    if (noiseFields) noiseFields.hidden = selected !== 'noise';
    var campingFields = $('camping-fields');
    if (campingFields) campingFields.hidden = selected !== 'camping';
    var generalPerson = $('offender-section-title');
    var generalFieldset = generalPerson && generalPerson.closest('fieldset');
    if (generalFieldset) generalFieldset.hidden = selected === 'commerce';
    updateSummary();
  }

  var profile = $('case-profile');
  if (profile) profile.addEventListener('change', applyCategoryFields);
  applyCategoryFields();
  ['check-safety', 'check-source', 'check-notify'].forEach(function (id) {
    if ($(id)) $(id).addEventListener('change', updateSummary);
  });

  var formObserver = new MutationObserver(function () {
    if (!form.hidden) {
      showStep(0, false);
      applyCategoryFields();
    }
  });
  formObserver.observe(form, { attributes: true, attributeFilter: ['hidden'] });
  build();
  window.AXYPCaseWorkflow = {
    showStep: showStep,
    updateSummary: updateSummary,
    isDirty: function () { return dirty; }
  };
})();
