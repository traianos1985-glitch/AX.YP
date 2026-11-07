import { DOSSIER_CATEGORIES } from './dossier-categories.js';
import { getServiceProfileBackupValue, getServiceProfileRestoreEntry, getServiceProfileOperatorIdentity } from './service-profile.js';
import { getCaseRegisterData, loadCaseRegister, resetCaseRegister } from './case-register.js';

if (window.AXYP_STORAGE && window.AXYP_STORAGE.ready) await window.AXYP_STORAGE.ready;
(function () {
  var KEY = 'axyp-hypotheses';
  var selectedId = null;
  var selectedCaseUpdatedAt = null;
  var remoteCaseUpdatePending = false;
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
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        var bc = new BroadcastChannel('axyp-hypotheses-sync');
        bc.postMessage({ type: 'hypotheses-updated' });
      } catch (_) {}
    }
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

  function ensureCommerceOffenderFields() {
    if ($('commerce-offenders')) return;
    var form = $('case-form');
    if (!form) return;
    var section = document.createElement('div');
    section.id = 'commerce-offenders';
    section.className = 'commerce-offenders case-wide';
    section.hidden = $('case-profile')?.value !== 'commerce';
    section.innerHTML = '<div class="section-heading"><div><p class="eyebrow">Αυτοτελή στοιχεία</p><h3>Δύο δράστες παρεμπορίου</h3><p class="muted">Τα στοιχεία των δύο προσώπων παραμένουν σε χωριστά πεδία και μεταφέρονται μόνο στα αντίστοιχα πρότυπα.</p></div></div>' +
      '<div class="offender-grid"><fieldset><legend>Δράστης Α</legend><label>Ονοματεπώνυμο<input id="commerce-offender-a-full-name" autocomplete="off"></label><label>Αριθμός ταυτότητας<input id="commerce-offender-a-id" autocomplete="off"></label><label>Διεύθυνση<input id="commerce-offender-a-address" autocomplete="street-address"></label></fieldset>' +
      '<fieldset><legend>Δράστης Β</legend><label>Ονοματεπώνυμο<input id="commerce-offender-b-full-name" autocomplete="off"></label><label>Αριθμός ταυτότητας<input id="commerce-offender-b-id" autocomplete="off"></label><label>Διεύθυνση<input id="commerce-offender-b-address" autocomplete="street-address"></label></fieldset></div>';
    form.insertBefore(section, form.querySelector('.profile-actions'));
  }

  function commerceOffender(prefix) {
    ensureCommerceOffenderFields();
    return {
      fullName: $(prefix + '-full-name') ? $(prefix + '-full-name').value.trim() : '',
      idNumber: $(prefix + '-id') ? $(prefix + '-id').value.trim() : '',
      address: $(prefix + '-address') ? $(prefix + '-address').value.trim() : ''
    };
  }

  function values(preservedCase) {
    ensureCommerceOffenderFields();
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
  incidentDate: ($('case-incident-date') ? $('case-incident-date').value : ''),
  incidentTime: ($('case-incident-time') ? $('case-incident-time').value : ''),
  incident: {
    date: ($('case-incident-date') ? $('case-incident-date').value : ''),
    time: ($('case-incident-time') ? $('case-incident-time').value : ''),
    location: ($('case-incident-location') ? $('case-incident-location').value.trim() : '')
  },
      prosecutor: ($('case-prosecutor') ? $('case-prosecutor').value.trim() : ''),
      prosecutorPerson: {
        fullName: $('camping-prosecutor-full-name') ? $('camping-prosecutor-full-name').value.trim() : '',
        title: $('camping-prosecutor-title') ? $('camping-prosecutor-title').value.trim() : ''
      },
      arrestingOfficer: ($('case-arresting-officer') ? $('case-arresting-officer').value.trim() : ''),
      officerA: preservedCase ? preservedCase.officerA : getServiceProfileOperatorIdentity(window.AXYP_SERVICE_PROFILE && window.AXYP_SERVICE_PROFILE.get ? window.AXYP_SERVICE_PROFILE.get() : {}),
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
      offenderA: commerceOffender('commerce-offender-a'),
      offenderB: commerceOffender('commerce-offender-b'),
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
        taxOffice: $('offender-tax-office').value.trim(),
        postalCode: $('offender-postal-code') ? $('offender-postal-code').value.trim() : '',
        nationality: $('offender-nationality') ? $('offender-nationality').value.trim() : '',
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
      noise: {
        description: $('case-profile').value === 'noise' && $('noise-description') ? $('noise-description').value.trim() : '',
        establishmentName: $('case-profile').value === 'noise' && $('noise-establishment-name') ? $('noise-establishment-name').value.trim() : '',
        measuredDecibels: $('case-profile').value === 'noise' && $('noise-measured-decibels') ? $('noise-measured-decibels').value.trim() : '',
        limitDecibels: $('case-profile').value === 'noise' && $('noise-limit-decibels') ? $('noise-limit-decibels').value.trim() : '',
        legalProvision: $('case-profile').value === 'noise' && $('noise-legal-provision') ? $('noise-legal-provision').value.trim() : '',
        regulationNumber: $('case-profile').value === 'noise' && $('noise-regulation-number') ? $('noise-regulation-number').value.trim() : ''
      },
      owner: {
        fullName: $('case-profile').value === 'noise' && $('noise-owner-full-name') ? $('noise-owner-full-name').value.trim() : '',
        fatherName: $('case-profile').value === 'noise' && $('noise-owner-father-name') ? $('noise-owner-father-name').value.trim() : '',
        motherName: $('case-profile').value === 'noise' && $('noise-owner-mother-name') ? $('noise-owner-mother-name').value.trim() : '',
        birthDate: $('case-profile').value === 'noise' && $('noise-owner-birth-date') ? $('noise-owner-birth-date').value : '',
        birthPlace: $('case-profile').value === 'noise' && $('noise-owner-birth-place') ? $('noise-owner-birth-place').value.trim() : '',
        city: $('case-profile').value === 'noise' && $('noise-owner-city') ? $('noise-owner-city').value.trim() : '',
        idNumber: $('case-profile').value === 'noise' && $('noise-owner-id-number') ? $('noise-owner-id-number').value.trim() : '',
        idDate: $('case-profile').value === 'noise' && $('noise-owner-id-date') ? $('noise-owner-id-date').value : '',
        idService: $('case-profile').value === 'noise' && $('noise-owner-id-service') ? $('noise-owner-id-service').value.trim() : '',
        taxId: $('case-profile').value === 'noise' && $('noise-owner-tax-id') ? $('noise-owner-tax-id').value.trim() : '',
        taxOffice: $('case-profile').value === 'noise' && $('noise-owner-tax-office') ? $('noise-owner-tax-office').value.trim() : ''
      },
      camping: {
        legalProvision: $('camping-legal-provision')?.value.trim() || '', location: $('camping-location')?.value.trim() || '', actDescription: $('camping-act-description')?.value.trim() || '', actQualifier: $('camping-act-qualifier')?.value.trim() || '', outdoorItems: $('camping-outdoor-items')?.value.trim() || '', noDesignatedSite: $('camping-no-designated-site')?.value.trim() || ''
      },
      vehicle: { type: $('camping-vehicle-type')?.value.trim() || '', registration: $('camping-vehicle-registration')?.value.trim() || '', towVehicleRegistration: $('camping-tow-registration')?.value.trim() || '', caravanRegistration: $('camping-caravan-registration')?.value.trim() || '' },
      interpreter: {
        fullName: $('camping-interpreter-full-name')?.value.trim() || '', language: $('camping-interpreter-language')?.value.trim() || '',
        fatherName: $('camping-interpreter-father-name')?.value.trim() || '', motherName: $('camping-interpreter-mother-name')?.value.trim() || '',
        birthDate: $('camping-interpreter-birth-date')?.value || '', birthPlace: $('camping-interpreter-birth-place')?.value.trim() || '',
        city: $('camping-interpreter-city')?.value.trim() || '', idNumber: $('camping-interpreter-id-number')?.value.trim() || '',
        idDate: $('camping-interpreter-id-date')?.value || '', idService: $('camping-interpreter-id-service')?.value.trim() || '',
        nationality: $('camping-interpreter-nationality')?.value.trim() || ''
      },
      notes: $('case-notes').value.trim(),
      caseRegister: getCaseRegisterData(),
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
    ensureCommerceOffenderFields();
    $('case-form').reset();
    resetCaseRegister();
    $('case-id').value = '';
    var now = new Date();
    $('case-date').value = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    var serviceProfile = window.AXYP_SERVICE_PROFILE && window.AXYP_SERVICE_PROFILE.get ? window.AXYP_SERVICE_PROFILE.get() : {};
    if ($('case-location')) $('case-location').value = serviceProfile.location || 'Κυπαρισσία';
    if (activeProfileFilter) $('case-profile').value = activeProfileFilter;
    ensureCommerceOffenderFields();
    if ($('commerce-offenders')) $('commerce-offenders').hidden = activeProfileFilter !== 'commerce';
    $('case-timeline-section').hidden = activeProfileFilter !== 'narcotics';
    $('case-counterfeit-section').hidden = activeProfileFilter !== 'counterfeit';
    $('case-counterfeit-witness-section').hidden = activeProfileFilter !== 'counterfeit';
    $('case-counterfeit-timeline-section').hidden = activeProfileFilter !== 'counterfeit';
    if ($('case-environment-section')) $('case-environment-section').hidden = activeProfileFilter !== 'environment';
    if ($('case-environment-timeline-section')) $('case-environment-timeline-section').hidden = activeProfileFilter !== 'environment';
    if ($('case-health-section')) $('case-health-section').hidden = activeProfileFilter !== 'health';
    if ($('case-health-timeline-section')) $('case-health-timeline-section').hidden = activeProfileFilter !== 'health';
    if ($('camping-fields')) $('camping-fields').hidden = activeProfileFilter !== 'camping';
    $('case-investigators-section').hidden = !['narcotics', 'counterfeit', 'environment', 'health', 'camping'].includes(activeProfileFilter);
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
    selectedCaseUpdatedAt = null;
    remoteCaseUpdatePending = false;
    renderDetail();
  }

  function select(id) {
    ensureCommerceOffenderFields();
    selectedId = id;
    var item = read().filter(function (entry) { return entry.id === id; })[0];
    if (!item) return;
    selectedCaseUpdatedAt = item.updatedAt || null;
    remoteCaseUpdatePending = false;
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
    if ($('camping-fields')) $('camping-fields').hidden = item.profile !== 'camping';
    $('case-investigators-section').hidden = !['narcotics', 'counterfeit', 'environment', 'health', 'camping'].includes(item.profile);
    $('case-people').value = item.people || '';
    if ($('case-location')) $('case-location').value = item.location || '';
    if ($('case-time')) $('case-time').value = item.time || '';
  if ($('case-incident-date')) $('case-incident-date').value = item.incidentDate || (item.incident && item.incident.date) || '';
  if ($('case-incident-time')) $('case-incident-time').value = item.incidentTime || (item.incident && item.incident.time) || '';
  if ($('case-incident-location')) $('case-incident-location').value = (item.incident && item.incident.location) || '';
    if ($('case-prosecutor')) $('case-prosecutor').value = item.prosecutor || '';
    if ($('case-arresting-officer')) $('case-arresting-officer').value = item.arrestingOfficer || '';
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
    $('offender-section-title').textContent = (item.profile === 'narcotics' || item.profile === 'environment' || item.profile === 'health' || item.profile === 'noise') ? 'Στοιχεία δράστη' : item.profile === 'counterfeit' ? 'Στοιχεία προσώπου που κατέθεσε το χαρτονόμισμα στο ΑΤΜ' : 'Στοιχεία εμπλεκόμενου προσώπου';
    var offender = item.profile === 'counterfeit' ? ((item.counterfeit && item.counterfeit.depositor) || {}) : (item.offender || {});
    var offenderA = item.offenderA || {};
    var offenderB = item.offenderB || {};
    if ($('commerce-offenders')) $('commerce-offenders').hidden = item.profile !== 'commerce';
    if ($('commerce-offender-a-full-name')) $('commerce-offender-a-full-name').value = offenderA.fullName || '';
    if ($('commerce-offender-a-id')) $('commerce-offender-a-id').value = offenderA.idNumber || '';
    if ($('commerce-offender-a-address')) $('commerce-offender-a-address').value = offenderA.address || '';
    if ($('commerce-offender-b-full-name')) $('commerce-offender-b-full-name').value = offenderB.fullName || '';
    if ($('commerce-offender-b-id')) $('commerce-offender-b-id').value = offenderB.idNumber || '';
    if ($('commerce-offender-b-address')) $('commerce-offender-b-address').value = offenderB.address || '';
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
    if ($('noise-description')) $('noise-description').value = (item.noise && item.noise.description) || '';
    if ($('noise-establishment-name')) $('noise-establishment-name').value = (item.noise && item.noise.establishmentName) || '';
    if ($('noise-measured-decibels')) $('noise-measured-decibels').value = (item.noise && item.noise.measuredDecibels) || '';
    if ($('noise-limit-decibels')) $('noise-limit-decibels').value = (item.noise && item.noise.limitDecibels) || '';
    if ($('noise-legal-provision')) $('noise-legal-provision').value = (item.noise && item.noise.legalProvision) || '';
    if ($('noise-regulation-number')) $('noise-regulation-number').value = (item.noise && item.noise.regulationNumber) || '';
    var owner = item.owner || {};
    if ($('noise-owner-full-name')) $('noise-owner-full-name').value = owner.fullName || '';
    if ($('noise-owner-father-name')) $('noise-owner-father-name').value = owner.fatherName || '';
    if ($('noise-owner-mother-name')) $('noise-owner-mother-name').value = owner.motherName || '';
    if ($('noise-owner-birth-date')) $('noise-owner-birth-date').value = owner.birthDate || '';
    if ($('noise-owner-birth-place')) $('noise-owner-birth-place').value = owner.birthPlace || '';
    if ($('noise-owner-city')) $('noise-owner-city').value = owner.city || '';
    if ($('noise-owner-id-number')) $('noise-owner-id-number').value = owner.idNumber || '';
    if ($('noise-owner-id-date')) $('noise-owner-id-date').value = owner.idDate || '';
    if ($('noise-owner-id-service')) $('noise-owner-id-service').value = owner.idService || '';
    if ($('noise-owner-tax-id')) $('noise-owner-tax-id').value = owner.taxId || '';
    if ($('noise-owner-tax-office')) $('noise-owner-tax-office').value = owner.taxOffice || '';
    if ($('noise-fields')) $('noise-fields').hidden = item.profile !== 'noise';
    var camping = item.camping || {};
    [['camping-legal-provision','legalProvision'],['camping-location','location'],['camping-act-description','actDescription'],['camping-act-qualifier','actQualifier'],['camping-outdoor-items','outdoorItems'],['camping-no-designated-site','noDesignatedSite']].forEach(function (pair) { if ($(pair[0])) $(pair[0]).value = camping[pair[1]] || ''; });
    var vehicle = item.vehicle || {};
    [['camping-vehicle-type','type'],['camping-vehicle-registration','registration'],['camping-tow-registration','towVehicleRegistration'],['camping-caravan-registration','caravanRegistration']].forEach(function (pair) { if ($(pair[0])) $(pair[0]).value = vehicle[pair[1]] || ''; });
    var interpreter = item.interpreter || {};
    if ($('camping-interpreter-full-name')) $('camping-interpreter-full-name').value = interpreter.fullName || '';
    if ($('camping-interpreter-language')) $('camping-interpreter-language').value = interpreter.language || '';
    [['camping-interpreter-father-name','fatherName'],['camping-interpreter-mother-name','motherName'],['camping-interpreter-birth-date','birthDate'],['camping-interpreter-birth-place','birthPlace'],['camping-interpreter-city','city'],['camping-interpreter-id-number','idNumber'],['camping-interpreter-id-date','idDate'],['camping-interpreter-id-service','idService'],['camping-interpreter-nationality','nationality']].forEach(function (pair) { if ($(pair[0])) $(pair[0]).value = interpreter[pair[1]] || ''; });
    var prosecutorPerson = item.prosecutorPerson || {};
    if ($('camping-prosecutor-full-name')) $('camping-prosecutor-full-name').value = prosecutorPerson.fullName || '';
    if ($('camping-prosecutor-title')) $('camping-prosecutor-title').value = prosecutorPerson.title || '';
    if ($('camping-fields')) $('camping-fields').hidden = item.profile !== 'camping';
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
    $('offender-tax-office').value = offender.taxOffice || '';
    if ($('offender-postal-code')) $('offender-postal-code').value = offender.postalCode || '';
    if ($('offender-nationality')) $('offender-nationality').value = offender.nationality || '';
    $('offender-phone').value = offender.phone || '';
    $('offender-email').value = offender.email || '';
    $('case-evidence').value = item.evidence || '';
    $('case-notes').value = item.notes || '';
    loadCaseRegister(item.caseRegister || {});
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
      var categoryTemplates = window.TemplateLibrary && window.TemplateLibrary.getCategoryTemplates ? window.TemplateLibrary.getCategoryTemplates(category.id) : templates.filter(function (item) { return item.category === category.id || item.profile === category.id; });
      var officialTemplates = categoryTemplates.filter(function (template) { return template.source === 'user-uploaded' || template.source === 'published-package'; });
      var templateCount = officialTemplates.length;
      var card = document.createElement('article'); card.className = 'dossier-category';
      var top = document.createElement('div'); top.className = 'dossier-category-top';
      var mark = document.createElement('span'); mark.className = 'dossier-category-mark'; mark.textContent = category.mark;
      var heading = document.createElement('div'), title = document.createElement('h3'), desc = document.createElement('p');
      title.textContent = category.label; desc.textContent = category.description; heading.append(title, desc); top.append(mark, heading);
      var stats = document.createElement('div'); stats.className = 'dossier-category-stats';
      var count = document.createElement('span'); count.className = 'dossier-stat'; count.textContent = caseCount + (caseCount === 1 ? ' υπόθεση' : ' υποθέσεις');
      var docs = document.createElement('span'); docs.className = 'dossier-stat'; docs.textContent = templateCount + (templateCount === 1 ? ' πρότυπο Word' : ' πρότυπα Word'); stats.append(count, docs);
      var note = document.createElement('p'); note.className = 'dossier-category-note'; note.textContent = templateCount ? 'Διαθέσιμα έντυπα για αυτή την κατηγορία.' : 'Δεν έχει δημοσιευθεί ακόμη πακέτο εντύπων για αυτή την κατηγορία.';
      var actions = document.createElement('div'); actions.className = 'dossier-category-actions';
      var open = document.createElement('button'); open.type = 'button'; open.textContent = 'Προβολή'; open.onclick = function () { openCategory(category.id, false); };
      var create = document.createElement('button'); create.type = 'button'; create.className = 'primary'; create.textContent = '+ Νέα υπόθεση'; create.onclick = function () { openCategory(category.id, true); };
      actions.append(open, create); card.append(top, stats, note, actions); root.appendChild(card);
    });
  }
  async function renderDossierTemplates() {
    var root = $('dossier-template-list');
    if (!root || !activeProfileFilter) return;
    root.textContent = 'Φόρτωση εντύπων…';
    try {
      await import('./template-library.js');
      await window.TemplateLibrary.ready;
      var templates = window.TemplateLibrary.getCategoryTemplates(activeProfileFilter);
      var selected = templates.filter(function (template) { return template.source === 'user-uploaded' || template.source === 'published-package'; });
      root.textContent = '';
      if (!selected.length) {
        root.textContent = 'Δεν έχει δημοσιευθεί ακόμη επίσημο πακέτο εντύπων για αυτή την κατηγορία. Τα ενσωματωμένα βοηθητικά πρότυπα δεν χρησιμοποιούνται στην κύρια ροή δικογραφίας.';
        return;
      }
      var list = document.createElement('ol');
      list.className = 'dossier-template-items';
      selected.forEach(function (template) {
        var item = document.createElement('li');
        var name = document.createElement('strong');
        name.textContent = template.name || 'Έντυπο Word';
        var source = document.createElement('small');
        source.textContent = template.source === 'published-package' ? 'Επίσημο πακέτο εφαρμογής' : template.source === 'user-uploaded' ? 'Τοπικό ανέβασμα δημιουργού · μη δημοσιευμένο' : 'Ενσωματωμένο βοηθητικό πρότυπο';
        item.append(name, source);
        list.appendChild(item);
      });
      root.appendChild(list);
      var note = document.createElement('p');
      note.className = 'muted';
      note.textContent = selected.length + (selected.length === 1 ? ' έγγραφο θα συμπεριληφθεί στην εξαγωγή.' : ' έγγραφα θα συμπεριληφθούν στην εξαγωγή.');
      root.appendChild(note);
    } catch (error) {
      root.textContent = 'Δεν ήταν δυνατή η φόρτωση της βιβλιοθήκης εντύπων: ' + (error.message || 'Άγνωστο σφάλμα.');
    }
  }

  async function exportCategoryDossier() {
    if (!activeProfileFilter) return;
    if (remoteCaseUpdatePending) {
      $('case-flash').textContent = 'Η υπόθεση ενημερώθηκε σε άλλη καρτέλα. Επίλεξέ την ξανά και έλεγξε τα στοιχεία πριν από την εξαγωγή.';
      return;
    }
    if (!$('case-form').reportValidity()) return;
    try {
      await import('./template-library.js');
      await window.TemplateLibrary.ready;
      var categoryTemplates = window.TemplateLibrary.getCategoryTemplates(activeProfileFilter);
      var selectedTemplates = categoryTemplates.filter(function (template) { return template.source === 'user-uploaded' || template.source === 'published-package'; });
      if (!selectedTemplates.length) {
        $('case-flash').textContent = 'Δεν υπάρχουν διαθέσιμα έντυπα για αυτή την κατηγορία. Η φόρμα δεν καθαρίστηκε.';
        return;
      }
      var previewData = values();
      var missing = selectedTemplates.flatMap(function (template) {
        return window.TemplateLibrary.getMissingTemplateFields
          ? window.TemplateLibrary.getMissingTemplateFields(template, previewData).map(function (entry) { return template.name + ': {{' + entry.field + '}} — ' + entry.reason; })
          : [];
      });
      if (missing.length && !window.confirm('Ορισμένα πεδία χρειάζονται συμπλήρωση ή αντιστοίχιση:\n\n' + missing.join('\n') + '\n\nΝα συνεχιστεί η παραγωγή; Τα μη συμπληρωμένα placeholders θα παραμείνουν ορατά.')) return;

      var saved = await save({ preventDefault: function () {} });
      if (!saved || !saved.id) return;
      var archive = window.TemplateLibrary.buildCategoryArchive(selectedTemplates, saved);
      var blob = new Blob([archive], { type: 'application/zip' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      var caseName = String(saved.title || 'δικογραφία').replace(/[\\\\/:*?"<>|]+/gu, '-');
      link.href = url;
      link.download = caseName + '-' + activeProfileFilter + '-συμπληρωμένα-έντυπα.zip';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);

      // Keep the saved case in the local register; only clear the working form after ZIP creation and download initiation.
      reset();
      $('case-flash').textContent = 'Το ZIP δημιουργήθηκε και η λήψη ξεκίνησε. Η υπόθεση διατηρήθηκε στο τοπικό μητρώο και η φόρμα καθαρίστηκε για την επόμενη ίδια δικογραφία.';
      render();
    } catch (error) {
      $('case-flash').textContent = 'Η εξαγωγή δεν ολοκληρώθηκε. Τα στοιχεία παραμένουν στη φόρμα και η αποθηκευμένη υπόθεση δεν διαγράφηκε: ' + (error.message || 'Άγνωστο σφάλμα.');
    }
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
    if ($('camping-fields')) $('camping-fields').hidden = category.id !== 'camping';
    $('case-investigators-section').hidden = !['narcotics', 'counterfeit', 'environment', 'health', 'camping'].includes(category.id);
    $('offender-section-title').textContent = (category.id === 'narcotics' || category.id === 'environment' || category.id === 'health') ? 'Στοιχεία δράστη' : category.id === 'counterfeit' ? 'Στοιχεία προσώπου που κατέθεσε το χαρτονόμισμα στο ΑΤΜ' : 'Στοιχεία εμπλεκόμενου προσώπου';
    $('case-form').hidden = !createNew; $('case-layout').hidden = false;
    renderDossierTemplates();
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
    if (activeProfileFilter) renderDossierTemplates();
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

  async function openCaseDocument(item, file) {
    var blob = null;
    if (window.AXYP_WORKSPACE && window.AXYP_WORKSPACE.isConnected() && window.AXYP_WORKSPACE.readDocument) {
      try { blob = await window.AXYP_WORKSPACE.readDocument(item.id, file.name); } catch (_) {}
    }
    if (!blob && file.bundleDocument && file.bundleDocument.data) {
      try {
        var response = await fetch(file.bundleDocument.data);
        if (response.ok) blob = await response.blob();
      } catch (_) {}
    }
    if (!blob) {
      $('case-flash').textContent = 'Δεν βρέθηκε το πραγματικό αρχείο «' + file.name + '». Έλεγξε αν υπάρχει στον προσωπικό φάκελο εργασίας ή στο αρχικό πακέτο.';
      return;
    }
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    $('case-flash').textContent = 'Το αρχείο «' + file.name + '» στάλθηκε για άνοιγμα/λήψη. Άνοιξέ το με συμβατή εφαρμογή Word ή PDF.';
  }

  function appendDocumentRow(item, file, source) {
    var row = document.createElement('div');
    row.className = 'case-document-row';
    var label = document.createElement('span');
    label.textContent = file.name + (file.size ? ' · ' + Math.round(file.size / 1024) + ' KB' : '') + ' · ' + source;
    var open = document.createElement('button');
    open.type = 'button';
    open.className = 'mini-button';
    open.textContent = 'Άνοιγμα / λήψη';
    open.onclick = function () { openCaseDocument(item, file).catch(function (error) {
      $('case-flash').textContent = 'Δεν ήταν δυνατό το άνοιγμα του αρχείου: ' + error.message;
    }); };
    row.append(label, open);
    $('case-documents').appendChild(row);
  }

  function renderDocuments(item) {
    var root = $('case-documents');
    if (!root) return;
    root.textContent = '';
    var files = [];
    try {
      var bundles = JSON.parse((window.AXYP_STORAGE || localStorage).getItem('axyp-case-bundles') || '[]');
      var bundle = bundles.find(function (entry) { return entry.id === item.sourceBundleId; });
      files = (bundle && bundle.documents || []).map(function (file) {
        return { name: file.name, size: file.size, source: 'Πρότυπο', bundleDocument: file };
      });
    } catch (_) {}
    (item.documents || []).forEach(function (file) {
      if (!files.some(function (entry) { return entry.name === file.name; })) {
        files.push({ name: file.name, size: file.size, source: 'Δικογραφία' });
      }
    });
    if (!files.length && !(window.AXYP_WORKSPACE && window.AXYP_WORKSPACE.isConnected() && window.AXYP_WORKSPACE.listDocuments)) {
      root.textContent = 'Δεν έχουν συνδεθεί ακόμη έγγραφα.';
      return;
    }
    files.forEach(function (file) { appendDocumentRow(item, file, file.source); });
    if (window.AXYP_WORKSPACE && window.AXYP_WORKSPACE.isConnected() && window.AXYP_WORKSPACE.listDocuments) {
      window.AXYP_WORKSPACE.listDocuments(item.id).then(function (stored) {
        stored.forEach(function (file) {
          if (files.some(function (entry) { return entry.name === file.name; })) return;
          files.push(file);
          appendDocumentRow(item, file, 'Αποθηκευμένο');
        });
        if (!files.length) root.textContent = 'Δεν έχουν συνδεθεί ακόμη έγγραφα.';
      }).catch(function () {});
    }
  }

  function renderDetail() {
    var item = read().filter(function (entry) { return entry.id === selectedId; })[0];
    $('case-detail-empty').hidden = !!item;
    $('case-detail-content').hidden = !item;
    if (!item) return;
    $('case-detail-title').textContent = (item.title || 'Υπόθεση') + ' · ' + (item.snapshots ? item.snapshots.length : 0) + ' snapshot';
    renderDocuments(item);
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
    if (remoteCaseUpdatePending) {
      $('case-flash').textContent = 'Η υπόθεση ενημερώθηκε σε άλλη καρτέλα. Για να αποφύγεις την αντικατάσταση νεότερων στοιχείων, επίλεξέ την ξανά από τη λίστα και έλεγξε τα ενημερωμένα δεδομένα πριν αποθηκεύσεις.';
      return null;
    }
    if (window.AXYP_STORAGE && window.AXYP_STORAGE.checkQuota) {
      window.AXYP_STORAGE.checkQuota().then(function (res) {
        if (res.low) $('case-flash').textContent = 'Προσοχή: Ο διαθέσιμος αποθηκευτικός χώρος είναι χαμηλός (' + res.freeMb + ' MB).';
      });
    }
    var items = read();
    var id = $('case-id').value || uid();
    var existing = items.filter(function (item) { return item.id === id; })[0];
    var data = values(existing);
    var saved = existing
      ? Object.assign({}, existing, data, { updatedAt: new Date().toISOString() })
      : Object.assign({ id: id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), snapshots: [] }, data);
    try {
      var workspaceError = null;
      if (window.AXYP_WORKSPACE && window.AXYP_WORKSPACE.isConnected()) {
        try {
          saved = await Promise.race([
            window.AXYP_WORKSPACE.saveCase(saved),
            new Promise(function (_, reject) { setTimeout(function () { reject(new Error('Η εγγραφή στον προσωπικό φάκελο έληξε λόγω timeout.')); }, 5000); })
          ]);
        } catch (error) {
          workspaceError = error;
        }
      }
      var index = items.findIndex(function (item) { return item.id === id; });
      if (index >= 0) items[index] = saved;
      else items.unshift(saved);
      write(items);
      if (window.AXYP_STORAGE && window.AXYP_STORAGE.flush) {
        await window.AXYP_STORAGE.flush();
      }
      selectedId = id;
      selectedCaseUpdatedAt = saved.updatedAt || null;
      remoteCaseUpdatePending = false;
      $('case-flash').textContent = workspaceError
        ? 'Η υπόθεση αποθηκεύτηκε στον browser, αλλά δεν ενημερώθηκε ο προσωπικός φάκελος εργασίας: ' + workspaceError.message
        : window.AXYP_WORKSPACE && window.AXYP_WORKSPACE.isConnected()
          ? 'Η υπόθεση αποθηκεύτηκε στον προσωπικό φάκελο εργασίας και στον τοπικό κατάλογο.'
          : 'Η υπόθεση αποθηκεύτηκε μόνο στον browser. Επίλεξε προσωπικό φάκελο εργασίας για να δημιουργηθεί και αυτοτελής φάκελος στον υπολογιστή.';
      render();
      return saved;
    } catch (error) {
      $('case-flash').textContent = 'Δεν επιβεβαιώθηκε η αποθήκευση της υπόθεσης: ' + error.message + ' Τα στοιχεία της φόρμας παραμένουν διαθέσιμα· έλεγξε την αποθήκευση και ξαναπροσπάθησε.';
      return null;
    }
  }

  async function snapshot() {
    if (remoteCaseUpdatePending) {
      $('case-flash').textContent = 'Η υπόθεση ενημερώθηκε σε άλλη καρτέλα. Επίλεξέ την ξανά από τη λίστα πριν δημιουργήσεις νέο snapshot.';
      return;
    }
    var items = read();
    var item = items.filter(function (entry) { return entry.id === selectedId; })[0];
    if (!item) return;
    if (!item.snapshots) item.snapshots = [];
    item.snapshots.push({
      label: item.title + ' · έκδοση ' + (item.snapshots.length + 1),
      createdAt: new Date().toISOString(),
      data: values(item)
    });
    item.updatedAt = new Date().toISOString();
    try {
      if (window.AXYP_WORKSPACE && window.AXYP_WORKSPACE.isConnected()) {
        var saved = await window.AXYP_WORKSPACE.saveSnapshot(item);
        Object.assign(item, saved);
      }
      write(items);
      if (window.AXYP_STORAGE && window.AXYP_STORAGE.flush) await window.AXYP_STORAGE.flush();
      $('case-flash').textContent = window.AXYP_WORKSPACE && window.AXYP_WORKSPACE.isConnected()
        ? 'Το snapshot αποθηκεύτηκε στο Ιστορικό της δικογραφίας.'
        : 'Το snapshot αποθηκεύτηκε στον browser. Επίλεξε προσωπικό φάκελο για αντίγραφο στον υπολογιστή.';
      renderDetail();
    } catch (error) {
      $('case-flash').textContent = 'Δεν επιβεβαιώθηκε η αποθήκευση του ιστορικού: ' + error.message;
    }
  }

  async function exportData() {
    try {
      if (window.AXYP_STORAGE && window.AXYP_STORAGE.ready) await window.AXYP_STORAGE.ready;
      if (window.AXYP_STORAGE && window.AXYP_STORAGE.flush) await window.AXYP_STORAGE.flush();
      var blob = new Blob([JSON.stringify({ schema: 1, exportedAt: new Date().toISOString(), hypotheses: read() }, null, 2)], { type: 'application/json' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'axyp-ypotheseis.json';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      $('case-flash').textContent = 'Δεν δημιουργήθηκε εξαγωγή: δεν επιβεβαιώθηκε η αποθήκευση των τελευταίων αλλαγών. ' + error.message;
    }
  }

  async function backupChecksum(payload) {
    if (!window.crypto || !window.crypto.subtle || !window.TextEncoder) return null;
    var bytes = new TextEncoder().encode(JSON.stringify(payload));
    var digest = await window.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
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

  async function fullBackup() {
    try {
    if (window.AXYP_STORAGE && window.AXYP_STORAGE.ready) await window.AXYP_STORAGE.ready;
    if (window.AXYP_STORAGE && window.AXYP_STORAGE.flush) await window.AXYP_STORAGE.flush();
    var s = window.AXYP_STORAGE || localStorage;
    var payload = {
      schema: 2,
      exportedAt: new Date().toISOString(),
      hypotheses: read(),
      favorites: s.getItem('axyp-favorites'),
      profile: s.getItem('axyp-form-profile'),
      theme: s.getItem('axyp-theme'),
      privacy: s.getItem('axyp-privacy'),
      bundles: s.getItem('axyp-case-bundles'),
      templates: s.getItem('axyp-docx-templates'),
      templateMappings: s.getItem('axyp-template-mappings'),
      serviceProfile: getServiceProfileBackupValue(s)
    };
    var checksum = await backupChecksum(payload);
    if (checksum) payload.checksum = checksum;
    downloadJson('axyp-plires-antigrafo.json', payload);
    $('case-flash').textContent = 'Το πλήρες αντίγραφο δημιουργήθηκε τοπικά μετά από επιβεβαίωση αποθήκευσης.';
    } catch (error) {
      $('case-flash').textContent = 'Δεν δημιουργήθηκε αντίγραφο: δεν επιβεβαιώθηκε η αποθήκευση των τελευταίων αλλαγών. ' + error.message;
    }
  }

  function restoreBackup(event) {
    var file = event.target.files[0];
    if (!file) return Promise.resolve(false);
    var reader = new FileReader();
    return new Promise(function (resolve) {
    reader.onload = async function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (parsed && parsed.checksum) {
          var unsigned = Object.assign({}, parsed);
          delete unsigned.checksum;
          var expectedChecksum = await backupChecksum(unsigned);
          if (!expectedChecksum || expectedChecksum !== parsed.checksum) throw new Error('Το checksum του αντιγράφου δεν ταιριάζει.');
        }
        function isValidHypothesis(item) {
          if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
          if (typeof item.id !== 'string' || !item.id.trim()) return false;
          if (item.title !== undefined && typeof item.title !== 'string') return false;
          if (item.snapshots !== undefined && !Array.isArray(item.snapshots)) return false;
          var objectFields = ['offender', 'offenderA', 'offenderB', 'officerA', 'officerB', 'counterfeit', 'vehicle', 'noise', 'camping', 'timeline', 'interpreter'];
          for (var i = 0; i < objectFields.length; i++) {
            var f = objectFields[i];
            if (item[f] !== undefined && item[f] !== null && (typeof item[f] !== 'object' || Array.isArray(item[f]))) {
              return false;
            }
          }
          return true;
        }

        if (!parsed || (parsed.schema !== 2 && parsed.schema !== 1) || !Array.isArray(parsed.hypotheses) ||
            !parsed.hypotheses.every(isValidHypothesis)) {
          throw new Error('invalid schema');
        }

        function parseArray(raw, label) {
          if (raw === null || raw === undefined) return [];
          var value = JSON.parse(raw);
          if (!Array.isArray(value)) throw new Error('invalid ' + label);
          return value;
        }

        var incomingBundles = parsed.bundles === null || parsed.bundles === undefined ? null : parseArray(parsed.bundles, 'bundles');
        var incomingTemplates = parsed.templates === null || parsed.templates === undefined ? null : parseArray(parsed.templates, 'templates');

        // Αυτόματο τοπικό αντίγραφο ασφαλείας πριν από την επαναφορά
        try {
          var sPre = window.AXYP_STORAGE || localStorage;
          var preBackup = {
            schema: 2,
            exportedAt: new Date().toISOString(),
            hypotheses: read(),
            favorites: sPre.getItem('axyp-favorites'),
            profile: sPre.getItem('axyp-form-profile'),
            theme: sPre.getItem('axyp-theme'),
            privacy: sPre.getItem('axyp-privacy'),
            bundles: sPre.getItem('axyp-case-bundles'),
            templates: sPre.getItem('axyp-docx-templates'),
            templateMappings: sPre.getItem('axyp-template-mappings'),
            serviceProfile: getServiceProfileBackupValue(sPre)
          };
          var preBackupSerialized = JSON.stringify(preBackup);
          sPre.setItem('axyp-pre-restore-backup', preBackupSerialized);
          if (sPre.flush) await sPre.flush();
          if (sPre.getItem('axyp-pre-restore-backup') !== preBackupSerialized) {
            throw new Error('Δεν επιβεβαιώθηκε η durable αποθήκευση του προληπτικού αντιγράφου.');
          }
        } catch (backupErr) {
          $('case-flash').textContent = 'Η επαναφορά ακυρώθηκε: δεν επιβεβαιώθηκε το προληπτικό αντίγραφο ασφαλείας. Δεν έγινε καμία αλλαγή. ' + (backupErr.message || backupErr);
          resolve(false);
          return;
        }

        var shouldMerge = window.confirm(
          'Επαναφορά αντιγράφου:\n\n' +
          '• Πάτησε [OK] για ΣΥΓΧΩΝΕΥΣΗ (διατήρηση των υπαρχουσών υποθέσεων και προσθήκη/ενημέρωση των εισαγόμενων).\n' +
          '• Πάτησε [Άκυρο] για επιλογή Πλήρους Αντικατάστασης.'
        );

        var s = window.AXYP_STORAGE || localStorage;
        var entries = [];
        if (shouldMerge) {
          var merged = read().slice();
          parsed.hypotheses.forEach(function (incoming) {
            var index = merged.findIndex(function (item) { return item.id === incoming.id; });
            if (index >= 0) {
              var existing = merged[index];
              var incomingTime = incoming && incoming.updatedAt ? Date.parse(incoming.updatedAt) : NaN;
              var existingTime = existing && existing.updatedAt ? Date.parse(existing.updatedAt) : NaN;
              if (Number.isFinite(incomingTime) && Number.isFinite(existingTime)) {
                if (incomingTime > existingTime) {
                  merged[index] = Object.assign({}, existing, incoming);
                }
              } else {
                merged[index] = Object.assign({}, existing, incoming);
              }
            } else {
              merged.push(incoming);
            }
          });
          entries.push(['axyp-hypotheses', JSON.stringify(merged)]);

          if (incomingBundles) {
            var currentBundles = parseArray(s.getItem('axyp-case-bundles') || '[]', 'υπαρχόντων bundles');
            incomingBundles.forEach(function (bundle) {
              if (!currentBundles.some(function (entry) { return entry.id === bundle.id; })) currentBundles.push(bundle);
            });
            entries.push(['axyp-case-bundles', JSON.stringify(currentBundles)]);
          }
          if (incomingTemplates) {
            var currentTemplates = parseArray(s.getItem('axyp-docx-templates') || '[]', 'υπαρχόντων προτύπων');
            incomingTemplates.forEach(function (template) {
              if (!currentTemplates.some(function (entry) { return entry.id === template.id; })) currentTemplates.push(template);
            });
            entries.push(['axyp-docx-templates', JSON.stringify(currentTemplates)]);
          }
        } else {
          var confirmReplace = window.confirm(
            'ΠΡΟΣΟΧΗ: Επιβεβαιώνεις την ΠΛΗΡΗ ΑΝΤΙΚΑΤΑΣΤΑΣΗ;\n\n' +
            'Οι τρέχουσες τοπικές υποθέσεις, τα πρότυπα και οι ρυθμίσεις θα αντικατασταθούν από το αντίγραφο.'
          );
          if (!confirmReplace) {
            $('case-flash').textContent = 'Η επαναφορά ακυρώθηκε χωρίς αλλαγές.';
            resolve(false);
            return;
          }
          entries = [['axyp-hypotheses', JSON.stringify(parsed.hypotheses)]];
          var optionalKeys = [
            ['axyp-favorites', parsed.favorites],
            ['axyp-form-profile', parsed.profile],
            ['axyp-theme', parsed.theme],
            ['axyp-privacy', parsed.privacy],
            ['axyp-case-bundles', parsed.bundles],
            ['axyp-docx-templates', parsed.templates],
            ['axyp-template-mappings', parsed.templateMappings],
          ];
          var serviceProfileEntry = getServiceProfileRestoreEntry(parsed);
          if (serviceProfileEntry) optionalKeys.push(serviceProfileEntry);
          optionalKeys.forEach(function (pair) {
            if (pair[1] !== undefined && pair[1] !== null) {
              entries.push([pair[0], typeof pair[1] === 'string' ? pair[1] : JSON.stringify(pair[1])]);
            }
          });
        }

        if (s.setItemsDurable) {
          await s.setItemsDurable(entries);
        } else {
          entries.forEach(function (entry) {
            if (entry[1] === null || entry[1] === undefined) s.removeItem(entry[0]);
            else s.setItem(entry[0], entry[1]);
          });
          if (s.flush) await s.flush();
        }
        $('case-flash').textContent = 'Η επαναφορά ολοκληρώθηκε και η τοπική αποθήκευση επιβεβαιώθηκε. Ανανεώνεται η εφαρμογή.';
        resolve(true);
        setTimeout(function () { location.reload(); }, 500);
      } catch (error) {
        $('case-flash').textContent = error && error.message === 'invalid schema'
          ? 'Το αρχείο δεν έχει έγκυρη μορφή αντιγράφου AX.YP.'
          : 'Η επαναφορά δεν ολοκληρώθηκε. Τα δεδομένα δεν επιβεβαιώθηκαν ως αποθηκευμένα: ' + (error.message || 'Άγνωστο σφάλμα.');
        resolve(false);
      } finally {
        event.target.value = '';
      }
    };
    reader.onerror = function () {
      $('case-flash').textContent = 'Η επαναφορά απέτυχε: δεν ήταν δυνατή η ανάγνωση του αρχείου.';
      resolve(false);
    };
    reader.readAsText(file);
    });
  }

  function importData(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = async function () {
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
        if (window.AXYP_STORAGE && window.AXYP_STORAGE.flush) await window.AXYP_STORAGE.flush();
        $('case-flash').textContent = 'Η εισαγωγή ολοκληρώθηκε και η τοπική αποθήκευση επιβεβαιώθηκε.';
        render();
      } catch (e) {
        $('case-flash').textContent = e && e.message === 'invalid format'
          ? 'Το αρχείο JSON δεν έχει έγκυρη μορφή υποθέσεων.'
          : 'Η εισαγωγή δεν επιβεβαιώθηκε ως αποθηκευμένη: ' + (e.message || 'Άγνωστο σφάλμα.');
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
    getActiveProfileFilter: function () { return activeProfileFilter; },
    restoreBackup: restoreBackup,
    importData: importData
  };

  $('dossier-back').onclick = showDashboard;
  $('dossier-new-case').onclick = function () { if (activeProfileFilter) openCategory(activeProfileFilter, true); };
  $('case-form').addEventListener('submit', save);
  $('case-reset').onclick = reset;
  $('case-export-dossier')?.addEventListener('click', exportCategoryDossier);
  $('case-snapshot').onclick = snapshot;
  $('case-export').onclick = exportData;
  $('case-import').onchange = importData;
  $('full-backup').onclick = fullBackup;
  $('full-restore').onchange = restoreBackup;

  // Cross-tab synchronization via storage event and BroadcastChannel (M6)
  function handleExternalHypothesesUpdate() {
    try {
      var latest = read();
      var list = $('cases-list');
      if (list) {
        var currentFilter = activeProfileFilter;
        var filtered = latest.filter(function (item) { return !currentFilter || (item.profile || 'generic') === currentFilter; });
        var activeItem = latest.find(function (item) { return item.id === selectedId; });
        if (selectedId && !activeItem) {
          // The selected case was removed in another tab
          selectedId = null;
          selectedCaseUpdatedAt = null;
          remoteCaseUpdatePending = false;
          reset();
        } else if (selectedId && activeItem && activeItem.updatedAt && activeItem.updatedAt !== selectedCaseUpdatedAt) {
          remoteCaseUpdatePending = true;
          var flash = $('case-flash');
          if (flash) flash.textContent = 'Η επιλεγμένη υπόθεση ενημερώθηκε σε άλλη καρτέλα. Η φόρμα δεν θα αποθηκεύσει παλιά στοιχεία πάνω από τη νεότερη έκδοση. Επίλεξε ξανά την υπόθεση από τη λίστα για να φορτώσεις τις αλλαγές.';
        }
        render();
      }
    } catch (_) {}
  }

  function showHypothesesConflict(conflict) {
    var flash = $('case-flash');
    if (!flash || !conflict) return;
    flash.textContent = 'Η ίδια δικογραφία τροποποιήθηκε και σε άλλη καρτέλα. Επίλεξε ποια έκδοση θα διατηρηθεί: ';
    var localButton = document.createElement('button');
    localButton.type = 'button';
    localButton.textContent = 'Κράτησε αυτή την καρτέλα';
    var remoteButton = document.createElement('button');
    remoteButton.type = 'button';
    remoteButton.textContent = 'Κράτησε την άλλη καρτέλα';
    [localButton, remoteButton].forEach(function (button) {
      button.className = 'mini-button';
    });
    localButton.addEventListener('click', function () {
      window.AXYP_STORAGE.resolveConflict(KEY, 'local').then(function () {
        flash.textContent = 'Διατηρήθηκε η έκδοση αυτής της καρτέλας.';
        handleExternalHypothesesUpdate();
      }).catch(function (error) { flash.textContent = 'Δεν επιλύθηκε η σύγκρουση: ' + error.message; });
    });
    remoteButton.addEventListener('click', function () {
      window.AXYP_STORAGE.resolveConflict(KEY, 'remote').then(function () {
        flash.textContent = 'Διατηρήθηκε η έκδοση της άλλης καρτέλας.';
        handleExternalHypothesesUpdate();
      }).catch(function (error) { flash.textContent = 'Δεν επιλύθηκε η σύγκρουση: ' + error.message; });
    });
    flash.appendChild(localButton);
    flash.appendChild(remoteButton);
  }

  if (typeof window !== 'undefined') {
    if (window.AXYP_STORAGE && typeof window.AXYP_STORAGE.onChange === 'function') {
      window.AXYP_STORAGE.onChange(function (event) {
        if (event && event.key === KEY && event.remote) handleExternalHypothesesUpdate();
      });
      window.AXYP_STORAGE.onConflict(function (conflict) {
        if (conflict && conflict.key === KEY) showHypothesesConflict(conflict);
      });
    }
    window.addEventListener('storage', function (e) {
      if (e.key === KEY) handleExternalHypothesesUpdate();
    });
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        var bc = new BroadcastChannel('axyp-hypotheses-sync');
        bc.onmessage = function (e) {
          if (e.data && e.data.type === 'hypotheses-updated') {
            handleExternalHypothesesUpdate();
          }
        };
      } catch (_) {}
    }
  }

  reset();
  showDashboard();
  render();
})();
