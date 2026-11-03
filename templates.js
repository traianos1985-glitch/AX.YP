(function () {
  var KEY = 'axyp-template-mappings';
  var root = document.getElementById('template-catalog');
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } }
  function write(value) { localStorage.setItem(KEY, JSON.stringify(value)); }
  function render() {
    if (!root || !window.FORMS_DATA) return;
    var mappings = read(); root.textContent = '';
    window.FORMS_DATA.categories.forEach(function (category) {
      var card = document.createElement('article'); card.className = 'template-card';
      var header = document.createElement('div'); header.className = 'template-card-header';
      var title = document.createElement('div'); title.innerHTML = '<p class="eyebrow"></p><h3></h3><p class="muted"></p>'; title.querySelector('.eyebrow').textContent = category.countLabel; title.querySelector('h3').textContent = category.title; title.querySelector('.muted').textContent = category.description; header.appendChild(title);
      var status = document.createElement('span'); status.className = 'mapping-status'; status.textContent = category.fields.length + ' κοινά πεδία'; header.appendChild(status); card.appendChild(header);
      var fields = document.createElement('div'); fields.className = 'field-mapping'; category.fields.forEach(function (fieldId) { var field = window.FORMS_DATA.commonFields.filter(function (entry) { return entry.id === fieldId; })[0]; if (!field) return; var label = document.createElement('label'); label.className = 'field-chip'; var checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = mappings[category.id] ? mappings[category.id].indexOf(field.id) !== -1 : true; checkbox.onchange = function () { var next = read(); next[category.id] = Array.from(fields.querySelectorAll('input:checked')).map(function (input) { return input.value; }); write(next); status.textContent = next[category.id].length + ' κοινά πεδία'; }; checkbox.value = field.id; label.appendChild(checkbox); label.appendChild(document.createTextNode(field.label + (field.sensitive ? ' · ευαίσθητο' : ''))); fields.appendChild(label); }); card.appendChild(fields); var link = document.createElement('a'); link.className = 'template-source'; link.href = category.source; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = 'Προβολή αρχικών υποδειγμάτων'; card.appendChild(link); root.appendChild(card);
    });
  }
  window.TemplatesView = { refresh: render }; render();
})();
