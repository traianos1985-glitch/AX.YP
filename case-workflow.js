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
    'case-protocol-number', 'case-location', 'case-time', 'case-prosecutor',
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
    var missing = ['case-title', 'case-offence', 'case-protocol-number'].filter(function (id) {
      var field = $(id);
      return field && !field.value.trim();
    }).map(function (id) {
      return ({ 'case-title': 'Τίτλος υπόθεσης', 'case-offence': 'Είδος αδικήματος', 'case-protocol-number': 'Αριθμός πρωτοκόλλου' })[id];
    });
    var profile = $('case-profile') ? $('case-profile').value : 'generic';
    var category = $('dossier-active-title') ? $('dossier-active-title').textContent : 'Δικογραφία';
    var checks = ['check-safety', 'check-source', 'check-notify'].filter(function (id) {
      return $(id) && $(id).checked;
    }).length;
    summary.textContent = missing.length
      ? 'Πριν από την αποθήκευση συμπλήρωσε τα υποχρεωτικά πεδία: ' + missing.join(', ') + '. Δεν συμπληρώνονται αυτόματα στοιχεία που λείπουν.'
      : category + ' · Τα υποχρεωτικά πεδία έχουν συμπληρωθεί. Έχουν σημειωθεί ' + checks + '/3 έλεγχοι πληρότητας. Έλεγξε τα πραγματικά στοιχεία και τα έγγραφα πριν από την οριστικοποίηση.';
    summary.setAttribute('data-state', missing.length ? 'incomplete' : 'ready');
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
