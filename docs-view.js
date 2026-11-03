// Εμφάνιση του CHANGELOG.md και του PENDING.md μέσα στην εφαρμογή, χωρίς να ανοίγουν ως αρχείο κειμένου.
(function () {
  var container = document.getElementById('docs-content');
  var cache = {};

  function renderBlocks(text) {
    var fragment = document.createDocumentFragment();
    var list = null;
    text.split(/\r?\n/).forEach(function (line) {
      var heading = /^(#{1,3})\s+(.*)$/.exec(line);
      var item = /^\s*-\s+(.*)$/.exec(line);
      if (item) {
        if (!list) {
          list = document.createElement('ul');
          fragment.appendChild(list);
        }
        var li = document.createElement('li');
        li.textContent = item[1];
        list.appendChild(li);
        return;
      }
      list = null;
      if (!line.trim()) return;
      var node = document.createElement(heading ? 'h' + (heading[1].length + 1) : 'p');
      node.textContent = heading ? heading[2] : line;
      fragment.appendChild(node);
    });
    return fragment;
  }

  function load(file) {
    if (cache[file]) return Promise.resolve(cache[file]);
    return fetch(file, { cache: 'no-cache' }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.text();
    }).catch(function () {
      if (!('caches' in window)) throw new Error('Document unavailable');
      return caches.match(file).then(function (response) {
        if (!response) throw new Error('Document unavailable');
        return response.text();
      });
    }).then(function (text) {
      cache[file] = text;
      return text;
    });
  }

  window.DocsView = {
    show: function (file) {
      container.textContent = 'Φόρτωση…';
      load(file).then(function (text) {
        container.textContent = '';
        container.appendChild(renderBlocks(text));
      }).catch(function () {
        container.textContent = 'Το αρχείο δεν είναι διαθέσιμο αυτή τη στιγμή. Δοκίμασε ξανά όταν υπάρχει σύνδεση.';
      });
    }
  };
})();
