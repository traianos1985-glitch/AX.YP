// Deterministic, local-only incident recognition and query coverage checks.
(function (root) {
  var STOPWORDS = ['και','να','με','για','σε','στο','στη','στον','στην','τον','την','του','της','των','τα','το','ο','η','οι','ως','απο','που','ειναι','κατα','προς','περι','μετα','παρα','δια','υπο','επι','ενωπιον','λογω'];
  var CONCEPTS = {
    dog: ['σκυλο','σκυλι','κυνο','κυνα','ζωοσυντροφιας'],
    bite: ['δαγκ','επιθεσ','επιτεθ','δαγκωμα'],
    person: ['ανθρωπ','πολιτ','παθων','τραυματι','σωματικηβλαβη']
  };
  var RULES = [{
    id: 'dog-bite',
    label: 'Πιθανό περιστατικό δαγκώματος ανθρώπου από σκύλο',
    primaryEntryIds: ['zoa-16'],
    relatedEntryIds: ['zoa-12']
  }];

  function normalize(value) {
    return String(value || '').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/ς/g, 'σ');
  }

  function tokens(value) {
    return normalize(value).split(/[^a-zα-ω0-9]+/).filter(function (word) {
      return word.length >= 2 && STOPWORDS.indexOf(word) === -1;
    });
  }

  function startsWithConcept(word, concepts) {
    return concepts.some(function (concept) {
      return word.indexOf(concept) === 0 || (concept.length >= 5 && concept.indexOf(word) === 0);
    });
  }

  function hasConcept(words, concepts) {
    return words.some(function (word) { return startsWithConcept(word, concepts); });
  }

  function classify(query) {
    var words = tokens(query);
    var dog = hasConcept(words, CONCEPTS.dog);
    var bite = hasConcept(words, CONCEPTS.bite);
    var person = hasConcept(words, CONCEPTS.person);
    if (dog && bite && person) return RULES[0];
    return null;
  }

  function hasCoverage(query, item) {
    var queryWords = tokens(query);
    if (queryWords.length <= 1) return true;
    var itemWords = tokens([
      item.title, item.keywords, item.law, item.penalty, item.procedure, item.notes
    ].join(' '));
    var matched = queryWords.filter(function (word) {
      var stem = word.slice(0, Math.max(4, word.length - 2));
      return itemWords.some(function (candidate) {
        return candidate === word || candidate.indexOf(stem) === 0;
      });
    }).length;
    return matched >= 2 && matched / queryWords.length >= 0.25;
  }

  return { normalize: normalize, tokens: tokens, classify: classify, hasCoverage: hasCoverage };
})(window);
