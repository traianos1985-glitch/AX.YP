import { DOSSIER_CATEGORIES } from './dossier-categories.js';
(function () {
  var KEY = 'axyp-hypotheses';
  var selectedId = null;
  var activeProfileFilter = null;
  var storage = window.AXYP_STORAGE || localStorage;
  var $ = function (id) { return document.getElementById(id); };

  function read() {
    try {
      var s = window.AXYP_STORAGE || localStorage;
      return JSON.parse(s.getItem(KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  function write(value) {
    var s = window.AXYP_STORAGE || localStorage;
    s.setItem(KEY, JSON.stringify(value));
  }

    function addMinutes(timeStr, mins) {
    if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) return '';
    var parts = timeStr.split(':');
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return '';
    var totalMins = (h * 60 + m + mins) % (24 * 60);
    if (totalMins < 0) totalMins += 24 * 60;
    var newH = Math.floor(totalMins / 60);
    var newM = totalMins % 60;
    return (newH < 10 ? '0' : '') + newH + ':' + (newM < 10 ? '0' : '') + newM;
  }

  function computeTimeline(baseTime) {
    if (!baseTime) return {};
    var witnessStart = baseTime;
    var witnessEnd = addMinutes(witnessStart, 5);
    var arrestStart = addMinutes(witnessEnd, 1);
    var arrestEnd = addMinutes(arrestStart, 5);
    var seizureStart = addMinutes(arrestEnd, 1);
    var seizureEnd = addMinutes(seizureStart, 5);
    var notificationStart = addMinutes(seizureEnd, 1);
    var notificationEnd = addMinutes(notificationStart, 5);
    var weighingStart = addMinutes(notificationEnd, 1);
    var weighingEnd = addMinutes(weighingStart, 5);
    var examinationStart = addMinutes(weighingEnd, 1);
    var examinationEnd = addMinutes(examinationStart, 5);
    return {
      witnessStartTime: witnessStart,
      witnessEndTime: witnessEnd,
      arrestStartTime: arrestStart,
      arrestEndTime: arrestEnd,
      seizureStartTime: seizureStart,
      seizureEndTime: seizureEnd,
      notificationStartTime: notificationStart,
      notificationEndTime: notificationEnd,
      weighingStartTime: weighingStart,
      weighingEndTime: weighingEnd,
      examinationStartTime: examinationStart,
      examinationEndTime: examinationEnd
    };
  }

  function applyTimelineToInputs(timeline, force) {
    if (!timeline) return;
    var fields = [
      ['timeline-witness-start', timeline.witnessStartTime],
      ['timeline-witness-end', timeline.witnessEndTime],
      ['timeline-arrest-start', timeline.arrestStartTime],
      ['timeline-arrest-end', timeline.arrestEndTime],
      ['timeline-seizure-start', timeline.seizureStartTime],
      ['timeline-seizure-end', timeline.seizureEndTime],
      ['timeline-notification-start', timeline.notificationStartTime],
      ['timeline-notification-end', timeline.notificationEndTime],
      ['timeline-weighing-start', timeline.weighingStartTime],
      ['timeline-weighing-end', timeline.weighingEndTime],
      ['timeline-examination-start', timeline.examinationStartTime],
      ['timeline-examination-end', timeline.examinationEndTime]
    ];
    fields.forEach(function (pair) {
      var el = $(pair[0]);
      if (el && (force || !el.value)) {
        el.value = pair[1] || '';
      }
    });
  }

function uid() {
    return 'yp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function values() {
    return {
      title: $('case-title').value.trim(),
      offence: $('case-offence').value.trim(),
      status: $('case-status').value,
      date: $('case-date').value,
      protocolNumber: $('case-protocol-number').value.trim(),
      profile: $('case-profile').value,
      people: $('case-people').value.trim(),
      location: ($('case-location') ? $('case-location').value.trim() : ''),
      time: ($('case-time') ? $('case-time').value : ''),
      prosecutor: ($('case-prosecutor') ? $('case-prosecutor').value.trim() : ''),
      arrestingOfficer: ($('case-arresting-officer') ? $('case-arresting-officer').value.trim() : ''),
      officerA: {
        rank: ($('officer-a-rank') ? $('officer-a-rank').value.trim() : ''),
        surname: ($('officer-a-surname') ? $('officer-a-surname').value.trim() : ''),
        name: ($('officer-a-name') ? $('officer-a-name').value.trim() : ''),
        service: ($('officer-a-service') ? $('officer-a-service').value.trim() : '')
      },
      officerB: {
        rank: ($('officer-b-rank') ? $('officer-b-rank').value.trim() : ''),
        surname: ($('officer-b-surname') ? $('officer-b-surname').value.trim() : ''),
        name: ($('officer-b-name') ? $('officer-b-name').value.trim() : ''),
        service: ($('officer-b-service') ? $('officer-b-service').value.trim() : '')
      },
      timeline: {
        witnessStartTime: $('case-profile').value === 'counterfeit' ? ($('counterfeit-witness-start') ? $('counterfeit-witness-start').value : '') : ($('timeline-witness-start') ? $('timeline-witness-start').value : ''),
        witnessEndTime: $('case-profile').value === 'counterfeit' ? ($('counterfeit-witness-end') ? $('counterfeit-witness-end').value : '') : ($('timeline-witness-end') ? $('timeline-witness-end').value : ''),
        arrestStartTime: $('case-profile').value === 'health' ? ($('health-arrest-start') ? $('health-arrest-start').value : '') : ($('case-profile').value === 'environment' ? ($('environment-arrest-start') ? $('environment-arrest-start').value : '') : ($('timeline-arrest-start') ? $('timeline-arrest-start').value : '')),
        arrestEndTime: $('case-profile').value === 'health' ? ($('health-arrest-end') ? $('health-arrest-end').value : '') : ($('case-profile').value === 'environment' ? ($('environment-arrest-end') ? $('environment-arrest-end').value : '') : ($('timeline-arrest-end') ? $('timeline-arrest-end').value : '')),
        seizureStartTime: $('case-profile').value === 'counterfeit' ? ($('counterfeit-seizure-start') ? $('counterfeit-seizure-start').value : '') : ($('timeline-seizure-start') ? $('timeline-seizure-start').value : ''),
        seizureEndTime: $('case-profile').value === 'counterfeit' ? ($('counterfeit-seizure-end') ? $('counterfeit-seizure-end').value : '') : ($('timeline-seizure-end') ? $('timeline-seizure-end').value : ''),
        notificationStartTime: $('timeline-notification-start') ? $('timeline-notification-start').value : '',
        notificationEndTime: $('timeline-notification-end') ? $('timeline-notification-end').value : '',
        weighingStartTime: $('timeline-weighing-start') ? $('timeline-weighing-start').value : '',
        weighingEndTime: $('timeline-weighing-end') ? $('timeline-weighing-end').value : '',
        examinationStartTime: $('case-profile').value === 'health' ? ($('health-examination-start') ? $('health-examination-start').value : '') : ($('case-profile').value === 'environment' ? ($('environment-examination-start') ? $('environment-examination-start').value : '') : ($('timeline-examination-start') ? $('timeline-examination-start').value : '')),
        examinationEndTime: $('case-profile').value === 'health' ? ($('health-examination-end') ? $('health-examination-end').value : '') : ($('case-profile').value === 'environment' ? ($('environment-examination-end') ? $('environment-examination-end').value : '') : ($('timeline-examination-end') ? $('timeline-examination-end').value : ''))
      },
      offender: $('case-profile').value === 'counterfeit' ? {} : {
        surname: $('offender-surname').value.trim(),
        name: $('offender-name').value.trim(),
        fatherName: $('offender-father-name').value.trim(),
        motherName: $('offender-mother-name').value.trim(),
        birthDate: $('offender-birth-date').value,
        birthPlace: $('offender-birth-place').value.trim(),
        city: $('offender-city').value.trim(),
        address: $('offender-address').value.trim(),
        idNumber: $('offender-id-number').value.trim(),
        idDate: $('offender-id-date').value,
        idService: $('offender-id-service').value.trim(),
        taxId: $('offender-tax-id').value.trim(),
        phone: $('offender-phone').value.trim(),
        email: $('offender-email').value.trim()
      },
      evidence: $('case-evidence').value.trim(),
      counterfeit: {
        serialNumber: $('case-profile').value === 'counterfeit' && $('counterfeit-serial-number') ? $('counterfeit-serial-number').value.trim() : '',
        witness: {
          surname: $('counterfeit-witness-surname') ? $('counterfeit-witness-surname').value.trim() : '',
          name: $('counterfeit-witness-name') ? $('counterfeit-witness-name').value.trim() : '',
          fatherName: $('counterfeit-witness-father-name') ? $('counterfeit-witness-father-name').value.trim() : '',
          motherName: $('counterfeit-witness-mother-name') ? $('counterfeit-witness-mother-name').value.trim() : '',
          birthDate: $('counterfeit-witness-birth-date') ? $('counterfeit-witness-birth-date').value : '',
          birthPlace: $('counterfeit-witness-birth-place') ? $('counterfeit-witness-birth-place').value.trim() : '',
          city: $('counterfeit-witness-city') ? $('counterfeit-witness-city').value.trim() : '',
          address: $('counterfeit-witness-address') ? $('counterfeit-witness-address').value.trim() : '',
          idNumber: $('counterfeit-witness-id-number') ? $('counterfeit-witness-id-number').value.trim() : '',
          idDate: $('counterfeit-witness-id-date') ? $('counterfeit-witness-id-date').value : '',
          idService: $('counterfeit-witness-id-service') ? $('counterfeit-witness-id-service').value.trim() : '',
          email: $('counterfeit-witness-email') ? $('counterfeit-witness-email').value.trim() : ''
        },
        depositor: $('case-profile').value === 'counterfeit' ? {
          surname: $('offender-surname').value.trim(),
          name: $('offender-name').value.trim(),
          fatherName: $('offender-father-name').value.trim(),
          motherName: $('offender-mother-name').value.trim(),
          birthDate: $('offender-birth-date').value,
          birthPlace: $('offender-birth-place').value.trim(),
          city: $('offender-city').value.trim(),
          address: $('offender-address').value.trim(),
          idNumber: $('offender-id-number').value.trim(),
          idDate: $('offender-id-date').value,
          idService: $('offender-id-service').value.trim(),
          taxId: $('offender-tax-id').value.trim(),
          phone: $('offender-phone').value.trim(),
          email: $('offender-email').value.trim()
        } : {}
      },
      environment: {
        description: $('case-profile').value === 'environment' && $('environment-description') ? $('environment-description').value.trim() : '',
        documentation: $('case-profile').value === 'environment' && $('environment-documentation') ? $('environment-documentation').value.trim() : ''
      },
      health: {
        description: $('case-profile').value === 'health' && $('health-description') ? $('health-description').value.trim() : ''
      },
      notes: $('case-notes').value.trim(),
      completeness: {
        safety: $('check-safety').checked,
        source: $('check-source').checked,
        notify: $('check-notify').checked
      },
      checks: ['check-safety', 'check-source', 'check-notify'].filter(function (id) {
        return $(id) && $(id).checked;
      })
    };
  }

  function reset() {
    $('case-form').reset();
    $('case-id').value = '';
    $('case-date').value = new Date().toISOString().slice(0, 10);
    if (activeProfileFilter) $('case-profile').value = activeProfileFilter;
    $('case-timeline-section').hidden = activeProfileFilter !== 'narcotics';
    $('case-counterfeit-section').hidden = activeProfileFilter !== 'counterfeit';
    $('case-counterfeit-witness-section').hidden = activeProfileFilter !== 'counterfeit';
    $('case-counterfeit-timeline-section').hidden = activeProfileFilter !== 'counterfeit';
    if ($('case-environment-section')) $('case-environment-section').hidden = activeProfileFilter !== 'environment';
    if ($('case-environment-timeline-section')) $('case-environment-timeline-section').hidden = activeProfileFilter !== 'environment';
    if ($('case-health-section')) $('case-health-section').hidden = activeProfileFilter !== 'health';
    if ($('case-health-timeline-section')) $('case-health-timeline-section').hidden = activeProfileFilter !== 'health';
    $('case-investigators-section').hidden = activeProfileFilter !== 'narcotics' && activeProfileFilter !== 'counterfeit' && activeProfileFilter !== 'environment' && activeProfileFilter !== 'health';
    $('offender-section-title').textContent = (activeProfileFilter === 'narcotics' || activeProfileFilter === 'environment' || activeProfileFilter === 'health') ? 'Στοιχεία δράστη' : activeProfileFilter === 'counterfeit' ? 'Στοιχεία προσώπου που κατέθεσε το χαρτονόμισμα στο ΑΤΜ' : 'Στοιχεία εμπλεκόμενου προσώπου';
    if ($('environment-description')) $('environment-description').value = '';
    if ($('environment-documentation')) $('environment-documentation').value = '';
    if ($('environment-arrest-start')) $('environment-arrest-start').value = '';
    if ($('environment-arrest-end')) $('environment-arrest-end').value = '';
    if ($('environment-examination-start')) $('environment-examination-start').value = '';
    if ($('environment-examination-end')) $('environment-examination-end').value = '';
    if ($('health-description')) $('health-description').value = '';
    if ($('health-arrest-start')) $('health-arrest-start').value = '';
    if ($('health-arrest-end')) $('health-arrest-end').value = '';
    if ($('health-examination-start')) $('health-examination-start').value = '';
    if ($('health-examination-end')) $('health-examination-end').value = '';
    selectedId = null;
    renderDetail();
  }

  function select(id) {
    selectedId = id;
    var item = read().filter(function (entry) { return entry.id === id; })[0];
    if (!item) return;
    $('case-id').value = item.id;
    $('case-form').hidden = false;
    $('case-title').value = item.title || '';
    $('case-offence').value = item.offence || '';
    $('case-status').value = item.status || 'Νέα';
    $('case-date').value = item.date || '';
    $('case-protocol-number').value = item.protocolNumber || '';
    $('case-profile').value = item.profile || 'generic';
    $('case-timeline-section').hidden = item.profile !== 'narcotics';
    $('case-counterfeit-section').hidden = item.profile !== 'counterfeit';
    $('case-counterfeit-witness-section').hidden = item.profile !== 'counterfeit';
    $('case-counterfeit-timeline-section').hidden = item.profile !== 'counterfeit';
    if ($('case-environment-section')) $('case-environment-section').hidden = item.profile !== 'environment';
    if ($('case-environment-timeline-section')) $('case-environment-timeline-section').hidden = item.profile !== 'environment';
    if ($('case-health-section')) $('case-health-section').hidden = item.profile !== 'health';
    if ($('case-health-timeline-section')) $('case-health-timeline-section').hidden = item.profile !== 'health';
    $('case-investigators-section').hidden = item.profile !== 'narcotics' && item.profile !== 'counterfeit' && item.profile !== 'environment' && item.profile !== 'health';
    $('case-people').value = item.people || '';
    if ($('case-location')) $('case-location').value = item.location || '';
    if ($('case-time')) $('case-time').value = item.time || '';
    if ($('case-prosecutor')) $('case-prosecutor').value = item.prosecutor || '';
    if ($('case-arresting-officer')) $('case-arresting-officer').value = item.arrestingOfficer || '';
    var officerA = item.officerA || {};
    if ($('officer-a-rank')) $('officer-a-rank').value = officerA.rank || '';
    if ($('officer-a-surname')) $('officer-a-surname').value = officerA.surname || '';
    if ($('officer-a-name')) $('officer-a-name').value = officerA.name || '';
    if ($('officer-a-service')) $('officer-a-service').value = officerA.service || '';
    var officerB = item.officerB || {};
    if ($('officer-b-rank')) $('officer-b-rank').value = officerB.rank || '';
    if ($('officer-b-surname')) $('officer-b-surname').value = officerB.surname || '';
    if ($('officer-b-name')) $('officer-b-name').value = officerB.name || '';
    if ($('officer-b-service')) $('officer-b-service').value = officerB.service || '';
    var timeline = item.timeline || (item.profile === 'narcotics' ? computeTimeline(item.time || '') : {});
    applyTimelineToInputs(item.profile === 'narcotics' ? timeline : {}, true);
    if ($('counterfeit-witness-start')) $('counterfeit-witness-start').value = timeline.witnessStartTime || '';
    if ($('counterfeit-witness-end')) $('counterfeit-witness-end').value = timeline.witnessEndTime || '';
    if ($('counterfeit-seizure-start')) $('counterfeit-seizure-start').value = timeline.seizureStartTime || '';
    if ($('counterfeit-seizure-end')) $('counterfeit-seizure-end').value = timeline.seizureEndTime || '';
    if ($('counterfeit-serial-number')) $('counterfeit-serial-number').value = (item.counterfeit && item.counterfeit.serialNumber) || '';
    $('offender-section-title').textContent = (item.profile === 'narcotics' || item.profile === 'environment' || item.profile === 'health') ? 'Στοιχεία δράστη' : item.profile === 'counterfeit' ? 'Στοιχεία προσώπου που κατέθεσε το χαρτονόμισμα στο ΑΤΜ' : 'Στοιχεία εμπλεκόμενου προσώπου';
    var offender = item.profile === 'counterfeit' ? ((item.counterfeit && item.counterfeit.depositor) || {}) : (item.offender || {});
    var witness = (item.counterfeit && item.counterfeit.witness) || {};
    if ($('counterfeit-witness-surname')) $('counterfeit-witness-surname').value = witness.surname || '';
    if ($('counterfeit-witness-name')) $('counterfeit-witness-name').value = witness.name || '';
    if ($('counterfeit-witness-father-name')) $('counterfeit-witness-father-name').value = witness.fatherName || '';
    if ($('counterfeit-witness-mother-name')) $('counterfeit-witness-mother-name').value = witness.motherName || '';
    if ($('counterfeit-witness-birth-date')) $('counterfeit-witness-birth-date').value = witness.birthDate || '';
    if ($('counterfeit-witness-birth-place')) $('counterfeit-witness-birth-place').value = witness.birthPlace || '';
    if ($('counterfeit-witness-city')) $('counterfeit-witness-city').value = witness.city || '';
    if ($('counterfeit-witness-address')) $('counterfeit-witness-address').value = witness.address || '';
    if ($('counterfeit-witness-id-number')) $('counterfeit-witness-id-number').value = witness.idNumber || '';
    if ($('counterfeit-witness-id-date')) $('counterfeit-witness-id-date').value = witness.idDate || '';
    if ($('counterfeit-witness-id-service')) $('counterfeit-witness-id-service').value = witness.idService || '';
    if ($('counterfeit-witness-email')) $('counterfeit-witness-email').value = witness.email || '';
    if ($('environment-description')) $('environment-description').value = (item.environment && item.environment.description) || '';
    if ($('environment-documentation')) $('environment-documentation').value = (item.environment && item.environment.documentation) || '';
    if ($('environment-arrest-start')) $('environment-arrest-start').value = (item.timeline && item.timeline.arrestStartTime) || '';
    if ($('environment-arrest-end')) $('environment-arrest-end').value = (item.timeline && item.timeline.arrestEndTime) || '';
    if ($('environment-examination-start')) $('environment-examination-start').value = (item.timeline && item.timeline.examinationStartTime) || '';
    if ($('environment-examination-end')) $('environment-examination-end').value = (item.timeline && item.timeline.examinationEndTime) || '';
    if ($('health-description')) $('health-description').value = (item.health && item.health.description) || '';
    if ($('health-arrest-start')) $('health-arrest-start').value = (item.timeline && item.timeline.arrestStartTime) || '';
    if ($('health-arrest-end')) $('health-arrest-end').value = (item.timeline && item.timeline.arrestEndTime) || '';
    if ($('health-examination-start')) $('health-examination-start').value = (item.timeline && item.timeline.examinationStartTime) || '';
    if ($('health-examination-end')) $('health-examination-end').value = (item.timeline && item.timeline.examinationEndTime) || '';
    $('offender-surname').value = offender.surname || '';
    $('offender-name').value = offender.name || '';
    $('offender-father-name').value = offender.fatherName || '';
    $('offender-mother-name').value = offender.motherName || '';
    $('offender-birth-date').value = offender.birthDate || '';
    $('offender-birth-place').value = offender.birthPlace || '';
    $('offender-city').value = offender.city || '';
    $('offender-address').value = offender.address || '';
    $('offender-id-number').value = offender.idNumber || '';
    $('offender-id-date').value = offender.idDate || '';
    $('offender-id-service').value = offender.idService || '';
    $('offender-tax-id').value = offender.taxId || '';
    $('offender-phone').value = offender.phone || '';
    $('offender-email').value = offender.email || '';
    $('case-evidence').value = item.evidence || '';
    $('case-notes').value = item.notes || '';
    $('check-safety').checked = !!(item.completeness && item.completeness.safety);
    $('check-source').checked = !!(item.completeness && item.completeness.source);
    $('check-notify').checked = !!(item.completeness && item.completeness.notify);
    if (window.CaseEnhancements) CaseEnhancements.load();
    render();
  }


  function readTemplates() {
    try { return JSON.parse((window.AXYP_STORAGE || localStorage).getItem('axyp-docx-templates') || '[]'); } catch (e) { return []; }
  }
  function renderDossierCategories() {
    var root = $('dossier-category-grid'); if (!root) return;
    root.textContent = '';
    var items = read(), templates = readTemplates();
    DOSSIER_CATEGORIES.forEach(function (category) {
      var caseCount = items.filter(function (item) { return (item.profile || 'generic') === category.id; }).length;
      var templateCount = templates.filter(function (item) { return item.category === category.id || item.profile === category.id; }).length;
      var card = document.createElement('article'); card.className = 'dossier-category';
      var top = document.createElement('div'); top.className = 'dossier-category-top';
      var mark = document.createElement('span'); mark.className = 'dossier-category-mark'; mark.textContent = category.mark;
      var heading = document.createElement('div'), title = document.createElement('h3'), desc = document.createElement('p');
      title.textContent = category.label; desc.textContent = category.description; heading.append(title, desc); top.append(mark, heading);
      var stats = document.createElement('div'); stats.className = 'dossier-category-stats';
      var count = document.createElement('span'); count.className = 'dossier-stat'; count.textContent = caseCount + (caseCount === 1 ? ' υπόθεση' : ' υποθέσεις');
      var docs = document.createElement('span'); docs.className = 'dossier-stat'; docs.textContent = templateCount + (templateCount === 1 ? ' πρότυπο Word' : ' πρότυπα Word'); stats.append(count, docs);
      var note = document.createElement('p'); note.className = 'dossier-category-note'; note.textContent = templateCount ? 'Διαθέσιμα πρότυπα για αυτή την κατηγορία.' : 'Τα επίσημα έγγραφα και πρότυπα θα προστεθούν όταν τα ανεβάσεις.';
      var actions = document.createElement('div'); actions.className = 'dossier-category-actions';
      var open = document.createElement('button'); open.type = 'button'; open.textContent = 'Προβολή'; open.onclick = function () { openCategory(category.id, false); };
      var create = document.createElement('button'); create.type = 'button'; create.className = 'primary'; create.textContent = '+ Νέα υπόθεση'; create.onclick = function () { openCategory(category.id, true); };
      actions.append(open, create); card.append(top, stats, note, actions); root.appendChild(card);
    });
  }
  function openCategory(profile, createNew) {
    var category = DOSSIER_CATEGORIES.find(function (entry) { return entry.id === profile; }) || DOSSIER_CATEGORIES[DOSSIER_CATEGORIES.length - 1];
    activeProfileFilter = category.id;
    $('dossier-dashboard').hidden = true; $('dossier-workspace').hidden = false;
    $('dossier-active-title').textContent = category.label;
    $('dossier-active-description').textContent = category.description + ' Οι υποθέσεις αυτής της κατηγορίας εμφανίζονται μόνο εδώ.';
    $('case-profile').value = category.id; $('bundle-profile').value = category.id;
    $('case-timeline-section').hidden = category.id !== 'narcotics';
    $('case-counterfeit-section').hidden = category.id !== 'counterfeit';
    $('case-counterfeit-witness-section').hidden = category.id !== 'counterfeit';
    $('case-counterfeit-timeline-section').hidden = category.id !== 'counterfeit';
    if ($('case-environment-section')) $('case-environment-section').hidden = category.id !== 'environment';
    if ($('case-environment-timeline-section')) $('case-environment-timeline-section').hidden = category.id !== 'environment';
    if ($('case-health-section')) $('case-health-section').hidden = category.id !== 'health';
    if ($('case-health-timeline-section')) $('case-health-timeline-section').hidden = category.id !== 'health';
    $('case-investigators-section').hidden = category.id !== 'narcotics' && category.id !== 'counterfeit' && category.id !== 'environment' && category.id !== 'health';
    $('offender-section-title').textContent = (category.id === 'narcotics' || category.id === 'environment' || category.id === 'health') ? 'Στοιχεία δράστη' : category.id === 'counterfeit' ? 'Στοιχεία προσώπου που κατέθεσε το χαρτονόμισμα στο ΑΤΜ' : 'Στοιχεία εμπλεκόμενου προσώπου';
    $('case-form').hidden = !createNew; $('case-layout').hidden = false;
    if (createNew) {
      reset();
      $('case-profile').value = category.id;
      if (category.id === 'narcotics') {
        $('case-offence').value = 'Νόμος περί ναρκωτικών';
      }
      $('case-form').hidden = false;
    }
    else { selectedId = null; $('case-id').value = ''; $('case-detail-empty').hidden = false; $('case-detail-content').hidden = true; }
    render(); if (window.CaseBundles) CaseBundles.refresh();
  }
  function showDashboard() {
    activeProfileFilter = null; $('dossier-dashboard').hidden = false; $('dossier-workspace').hidden = true;
    $('case-form').hidden = true; $('case-layout').hidden = true; renderDossierCategories();
  }
  function render() {
    renderDossierCategories();
    var list = $('cases-list');
    if (!list) return;
    list.textContent = '';
    var items = read().filter(function (item) { return !activeProfileFilter || (item.profile || 'generic') === activeProfileFilter; });
    if (!items.length) { var empty = document.createElement('div'); empty.className = 'dossier-category-empty'; empty.textContent = activeProfileFilter ? 'Δεν υπάρχει ακόμη αποθηκευμένη υπόθεση σε αυτή την κατηγορία. Πάτησε «Νέα υπόθεση» για να ξεκινήσεις.' : 'Δεν υπάρχει ακόμη αποθηκευμένη υπόθεση.'; list.appendChild(empty); renderDetail(); return; }
    items.forEach(function (item) {
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'case-card' + (item.id === selectedId ? ' selected' : '');
      card.innerHTML = '<strong></strong><span></span><small></small>';
      card.querySelector('strong').textContent = item.title || 'Χωρίς τίτλο';
      card.querySelector('span').textContent = item.offence || 'Χωρίς κατηγορία';
      card.querySelector('small').textContent = (item.status || 'Νέα') + ' · ' + (item.date || 'χωρίς ημερομηνία');
      card.onclick = function () { select(item.id); };
      list.appendChild(card);
    });
    renderDetail();
  }

  function renderDetail() {
    var item = read().filter(function (entry) { return entry.id === selectedId; })[0];
    $('case-detail-empty').hidden = !!item;
    $('case-detail-content').hidden = !item;
    if (!item) return;
    $('case-detail-title').textContent = (item.title || 'Υπόθεση') + ' · ' + (item.snapshots ? item.snapshots.length : 0) + ' snapshot';
    var root = $('case-snapshots');
    root.textContent = '';
    (item.snapshots || []).slice().reverse().forEach(function (snap) {
      var row = document.createElement('div');
      row.className = 'snapshot';
      row.innerHTML = '<strong></strong><span></span>';
      row.querySelector('strong').textContent = snap.label;
      row.querySelector('span').textContent = new Date(snap.createdAt).toLocaleString('el-GR');
      root.appendChild(row);
    });
  }

  async function save(event) {
    event.preventDefault();
    if (window.AXYP_STORAGE && window.AXYP_STORAGE.checkQuota) {
      window.AXYP_STORAGE.checkQuota().then(function (res) {
        if (res.low) $('case-flash').textContent = 'Προσοχή: Ο διαθέσιμος αποθηκευτικός χώρος είναι χαμηλός (' + res.freeMb + ' MB).';
      });
    }
    var items = read();
    var data = values();
    var id = $('case-id').value || uid();
    var existing = items.filter(function (item) { return item.id === id; })[0];
    var saved = existing
      ? Object.assign({}, existing, data, { updatedAt: new Date().toISOString() })
      : Object.assign({ id: id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), snapshots: [] }, data);
    try {
      if (window.AXYP_WORKSPACE && window.AXYP_WORKSPACE.isConnected()) {
        saved = await window.AXYP_WORKSPACE.saveCase(saved);
      }
      var index = items.findIndex(function (item) { return item.id === id; });
      if (index >= 0) items[index] = saved;
      else items.unshift(saved);
      write(items);
      selectedId = id;
      $('case-flash').textContent = window.AXYP_WORKSPACE && window.AXYP_WORKSPACE.isConnected()
        ? 'Η υπόθεση αποθηκεύτηκε στον προσωπικό φάκελο εργασίας και στον τοπικό κατάλογο.'
        : 'Η υπόθεση αποθηκεύτηκε μόνο στον browser. Επίλεξε προσωπικό φάκελο εργασίας για να δημιουργηθεί και αυτοτελής φάκελος στον υπολογιστή.';
      render();
    } catch (error) {
      $('case-flash').textContent = 'Δεν ολοκληρώθηκε η αποθήκευση στον φάκελο εργασίας: ' + error.message + ' Τα στοιχεία της φόρμας παραμένουν διαθέσιμα· έλεγξε τον φάκελο και ξαναπροσπάθησε.';
    }
  }

  async function snapshot() {
    var items = read();
    var item = items.filter(function (entry) { return entry.id === selectedId; })[0];
    if (!item) return;
    if (!item.snapshots) item.snapshots = [];
    item.snapshots.push({
      label: item.title + ' · έκδοση ' + (item.snapshots.length + 1),
      createdAt: new Date().toISOString(),
      data: values()
    });
    item.updatedAt = new Date().toISOString();
    try {
      if (window.AXYP_WORKSPACE && window.AXYP_WORKSPACE.isConnected()) {
        var saved = await window.AXYP_WORKSPACE.saveSnapshot(item);
        Object.assign(item, saved);
      }
      write(items);
      $('case-flash').textContent = window.AXYP_WORKSPACE && window.AXYP_WORKSPACE.isConnected()
        ? 'Το snapshot αποθηκεύτηκε στο Ιστορικό της δικογραφίας.'
        : 'Το snapshot αποθηκεύτηκε στον browser. Επίλεξε προσωπικό φάκελο για αντίγραφο στον υπολογιστή.';
      renderDetail();
    } catch (error) {
      $('case-flash').textContent = 'Δεν αποθηκεύτηκε το ιστορικό στον φάκελο εργασίας: ' + error.message;
    }
  }

  function exportData() {
    var blob = new Blob([JSON.stringify({ schema: 1, exportedAt: new Date().toISOString(), hypotheses: read() }, null, 2)], { type: 'application/json' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'axyp-ypotheseis.json';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function downloadJson(name, value) {
    var link = document.createElement('a');
    var blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function fullBackup() {
    var s = window.AXYP_STORAGE || localStorage;
    downloadJson('axyp-plires-antigrafo.json', {
      schema: 2,
      exportedAt: new Date().toISOString(),
      hypotheses: read(),
      favorites: s.getItem('axyp-favorites'),
      profile: s.getItem('axyp-form-profile'),
      theme: s.getItem('axyp-theme'),
      privacy: s.getItem('axyp-privacy'),
      bundles: s.getItem('axyp-case-bundles'),
      templates: s.getItem('axyp-docx-templates'),
      templateMappings: s.getItem('axyp-template-mappings')
    });
    $('case-flash').textContent = 'Το πλήρες αντίγραφο δημιουργήθηκε τοπικά.';
  }

  function restoreBackup(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (!parsed || (parsed.schema !== 2 && parsed.schema !== 1) || !Array.isArray(parsed.hypotheses)) {
          throw new Error('invalid schema');
        }

        var shouldMerge = window.confirm(
          'Επαναφορά αντιγράφου:\n\n' +
          '• Πάτησε [OK] για ΣΥΓΧΩΝΕΥΣΗ (διατήρηση των υπαρχουσών υποθέσεων και προσθήκη των νέων).\n' +
          '• Πάτησε [Άκυρο] για επιλογή Πλήρους Αντικατάστασης.'
        );

        var s = window.AXYP_STORAGE || localStorage;
        var currentItems = read();

        if (shouldMerge) {
          // Merge logic: match by ID or append
          var merged = currentItems.slice();
          parsed.hypotheses.forEach(function (incoming) {
            var idx = -1;
            for (var i = 0; i < merged.length; i++) {
              if (merged[i].id === incoming.id) { idx = i; break; }
            }
            if (idx >= 0) {
              merged[idx] = Object.assign({}, merged[idx], incoming);
            } else {
              merged.push(incoming);
            }
          });
          write(merged);

          // Merge bundles
          if (parsed.bundles) {
            try {
              var currBundles = JSON.parse(s.getItem('axyp-case-bundles') || '[]');
              var incBundles = JSON.parse(parsed.bundles);
              if (Array.isArray(incBundles)) {
                incBundles.forEach(function (b) {
                  if (!currBundles.some(function (cb) { return cb.id === b.id; })) {
                    currBundles.push(b);
                  }
                });
                s.setItem('axyp-case-bundles', JSON.stringify(currBundles));
              }
            } catch (_) {}
          }

          // Merge templates
          if (parsed.templates) {
            try {
              var currTemplates = JSON.parse(s.getItem('axyp-docx-templates') || '[]');
              var incTemplates = JSON.parse(parsed.templates);
              if (Array.isArray(incTemplates)) {
                incTemplates.forEach(function (t) {
                  if (!currTemplates.some(function (ct) { return ct.id === t.id; })) {
                    currTemplates.push(t);
                  }
                });
                s.setItem('axyp-docx-templates', JSON.stringify(currTemplates));
              }
            } catch (_) {}
          }

          $('case-flash').textContent = 'Η συγχώνευση αντιγράφου ολοκληρώθηκε επιτυχώς.';
          setTimeout(function () { location.reload(); }, 600);
          return;
        }

        // User chose Cancel -> ask for full overwrite confirmation
        var confirmReplace = window.confirm(
          'ΠΡΟΣΟΧΗ: Επιβεβαιώνεις την ΠΛΗΡΗ ΑΝΤΙΚΑΤΑΣΤΑΣΗ;\n\n' +
          'Όλες οι τρέχουσες τοπικές υποθέσεις θα αντικατασταθούν με τα δεδομένα του αρχείου.'
        );
        if (!confirmReplace) {
          $('case-flash').textContent = 'Η επαναφορά ακυρώθηκε χωρίς αλλαγές.';
          return;
        }

        write(parsed.hypotheses);
        [
          ['axyp-favorites', parsed.favorites],
          ['axyp-form-profile', parsed.profile],
          ['axyp-theme', parsed.theme],
          ['axyp-privacy', parsed.privacy],
          ['axyp-case-bundles', parsed.bundles],
          ['axyp-docx-templates', parsed.templates],
          ['axyp-template-mappings', parsed.templateMappings]
        ].forEach(function (entry) {
          if (entry[1] === null || entry[1] === undefined) {
            s.removeItem(entry[0]);
          } else {
            s.setItem(entry[0], entry[1]);
          }
        });

        $('case-flash').textContent = 'Η πλήρης επαναφορά ολοκληρώθηκε. Ανανεώνεται η εφαρμογή.';
        setTimeout(function () { location.reload(); }, 500);
      } catch (e) {
        $('case-flash').textContent = 'Το αρχείο δεν έχει έγκυρη μορφή αντιγράφου AX.YP.';
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  function importData(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        var list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.hypotheses) ? parsed.hypotheses : null);
        if (!list) throw new Error('invalid format');

        var shouldMerge = window.confirm('Να γίνει συγχώνευση των εισαγόμενων υποθέσεων με τις ήδη υπάρχουσες;');
        if (shouldMerge) {
          var current = read();
          list.forEach(function (item) {
            if (!current.some(function (c) { return c.id === item.id; })) {
              current.push(item);
            }
          });
          write(current);
        } else {
          write(list);
        }
        $('case-flash').textContent = 'Η εισαγωγή ολοκληρώθηκε τοπικά.';
        render();
      } catch (e) {
        $('case-flash').textContent = 'Το αρχείο JSON δεν έχει έγκυρη μορφή υποθέσεων.';
      }
      event.target.value = '';
    };
    reader.readAsText(file);
  }

  window.HypothesesView = {
    refresh: render,
    getSelectedId: function () { return selectedId; },
    openCategory: openCategory,
    showDashboard: showDashboard,
    getActiveProfileFilter: function () { return activeProfileFilter; }
  };

  $('dossier-back').onclick = showDashboard;
  $('dossier-new-case').onclick = function () { if (activeProfileFilter) openCategory(activeProfileFilter, true); };
  $('case-form').addEventListener('submit', save);
  $('case-reset').onclick = reset;
  $('case-snapshot').onclick = snapshot;
  $('case-export').onclick = exportData;
  $('case-import').onchange = importData;
  $('full-backup').onclick = fullBackup;
  $('full-restore').onchange = restoreBackup;
  reset();
  showDashboard();
  render();
})();
