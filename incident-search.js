// Deterministic, local-only incident recognition. Rules identify relevant legal topics;
// they never determine that an offence has occurred or prescribe an unverified police action.
(function (root) {
  var STOPWORDS = ['και','να','με','για','σε','στο','στη','στον','στην','τον','την','του','της','των','τα','το','ο','η','οι','ως','απο','που','ειναι','κατα','προς','περι','μετα','παρα','δια','υπο','επι','ενωπιον','λογω'];
  var CONCEPTS = {
    dog: ['σκυλο','σκυλι','κυνο','κυνα','ζωοσυντροφιας'],
    animal: ['ζωο','ζωων','σκυλο','σκυλι','γατα','γατεσ','ζωοσυντροφιασ','κουταβ','γατακι','αιγοπροβατ','ιππο'],
    animalHarm: ['κακοποι','βασαν','χτυπ','δηλητηρ','πυροβολ','τραυματ','θανατ','θανατω'],
    animalNeglect: ['παραμελ','πεινα','διψ','αλυσιδ','δεμεν','καταλυμ','χωρισνερο','χωριστροφη','χωρισκτηνιατρ','ευζω'],
    animalOwner: ['λουρι','συνοδευ','ελευθερ','μικροτσιπ','τσιπ','σημανσ','στειρωσ','dna','ανεμβολιαστ'],
    animalTrade: ['εμπορ','πωλ','πουλ','αγοραπωλη','αγγελι','εκτροφ','κουταβ'],
    animalTheft: ['κλοπ','εκλεψ','αφαιρεσ','αρπαγ'],
    animalNoise: ['γαβγ','υλακ','θορυβ','κοινηησυχ','διαταραξη'],
    animalTransport: ['μεταφορ','μετεφερ','οχημα','φορτηγ','πλοιο','αεροπλανο','ταξιδευ'],
    bite: ['δαγκ','επιθεσ','επιτεθ','δαγκωμα'],
    person: ['ανθρωπ','πολιτ','παθων','τραυματι','σωματικηβλαβη'],
    drug: ['ναρκωτ','εξαρτησιογον','κανναβ','ηρωιν','κοκαιν','μεθαμφεταμ'],
    personal: ['προσωπικ','ατομικ','ιδια','δικ'],
    sale: ['πωλ','πουλ','διακιν','διανομ','διενειμ','μοιραζ','παραδιδ','παραδωσ','διεθετ','διαθετ','μεταπωλ','προσφερ'],
    weapon: ['οπλο','πυροβολ','πιστολ','περιστροφ','καραμπιν','κυνηγετικο','μαχαιρ','ξιφο','σπαθ'],
    carry: ['οπλοφορια','φερε','εφερε','φορουσε','επανω','τσεπ','δρομ','δημοσιο','μετεφερε'],
    possess: ['οπλοκατοχη','κατοχη','φυλασσ','αποθηκευ','σπιτι','οικια','εντοσ'],
    migrant: ['αλλοδαπ','μεταναστ','πολιτητριτησχωρασ','διαβατηρ','ταξιδιωτικοεγγραφο','συνορ','εισοδο'],
    transport: ['μεταφερ','μετεφερ','μεταφορε','οδηγ','σκαφο','βαρκα','κρυβ','κρυμ','αποκρυπτ','παραλαμβ','προωθ','διευκολυν'],
    forged: ['πλαστο','νοθευ','παραποιημενο','ψευδεσ'],
    building: ['οικοδομ','κατασκευ','κτισμα','ανεγερ','εργασιεσ','δομησ','αυθαιρετ','αλλαγηχρησησ'],
    noPermit: ['χωρισ','ανευ','μηαδειοδοτημεν']
  };

  var RULES = {
    dog: {
      id: 'dog-bite', label: 'Πιθανό περιστατικό δαγκώματος ανθρώπου από σκύλο',
      primaryEntryIds: ['zoa-16'], relatedEntryIds: ['zoa-12'],
      notice: 'Η αναγνώριση αφορά θεματικές διατάξεις· το δάγκωμα δεν αποτελεί αυτομάτως ποινικό αδίκημα.'
    },
    animalCruelty: {
      id: 'animal-cruelty', label: 'Πιθανό περιστατικό κακοποίησης ή βάναυσης μεταχείρισης ζώου',
      primaryEntryIds: ['zoa-1'], relatedEntryIds: ['zoa-10', 'zoa-8'],
      notice: 'Οι εγγραφές καλύπτουν τη βασική απαγόρευση και, συμπληρωματικά, τη βαρύτερη μορφή και τη διαδικασία. Η διάκριση εξαρτάται από τις συγκεκριμένες πράξεις, τα αποτελέσματα και τις αποδείξεις.'
    },
    animalNeglect: {
      id: 'animal-neglect', label: 'Πιθανό περιστατικό παραμέλησης ή μη τήρησης συνθηκών ευζωίας',
      primaryEntryIds: ['zoa-11'], relatedEntryIds: ['zoa-6', 'zoa-12'],
      notice: 'Εμφανίζονται οι καταχωρίσεις για συνθήκες ευζωίας, υποχρεώσεις ιδιοκτήτη και τη διοικητική διαβίβαση όπου συντρέχει σχετική παράβαση.'
    },
    animalOwner: {
      id: 'animal-owner-obligations', label: 'Πιθανή παράβαση υποχρεώσεων ιδιοκτήτη ζώου',
      primaryEntryIds: ['zoa-6'], relatedEntryIds: ['zoa-9', 'zoa-12'],
      notice: 'Η αντιστοίχιση είναι θεματική. Ελέγχονται η συγκεκριμένη υποχρέωση, οι εξαιρέσεις και η αρμόδια διαδικασία· δεν προκύπτει κάθε φορά ποινική παράβαση.'
    },
    animalTrade: {
      id: 'animal-trade', label: 'Πιθανό περιστατικό παράνομης εμπορίας ζώου συντροφιάς',
      primaryEntryIds: ['zoa-5'], relatedEntryIds: ['zoa-8', 'zoa-12'],
      notice: 'Απαιτείται έλεγχος των προϋποθέσεων νόμιμης εμπορίας, της ιδιότητας των εμπλεκομένων και των συγκεκριμένων πράξεων.'
    },
    animalTheft: {
      id: 'animal-theft', label: 'Πιθανό περιστατικό κλοπής ζώου συντροφιάς',
      primaryEntryIds: ['zoa-4'], relatedEntryIds: [],
      notice: 'Η περιγραφή αποτελεί αφετηρία αναζήτησης· ο ποινικός χαρακτηρισμός εξαρτάται από τα αποδεικτικά στοιχεία και τις περιστάσεις.'
    },
    animalNoise: {
      id: 'animal-noise', label: 'Πιθανή διατάραξη κοινής ησυχίας από ζώο',
      primaryEntryIds: ['zoa-15'], relatedEntryIds: [],
      notice: 'Ελέγχονται οι ώρες, η ισχύουσα αστυνομική διάταξη, η πραγματική διατάραξη και οι προϋποθέσεις εφαρμογής.'
    },
    animalTransport: {
      id: 'animal-transport', label: 'Πιθανό περιστατικό ακατάλληλης μεταφοράς ή μεταχείρισης ζώου',
      primaryEntryIds: ['zoa-13'], relatedEntryIds: ['zoa-11'],
      notice: 'Η αξιολόγηση εξαρτάται από το μέσο, τις συνθήκες μεταφοράς, την κατάσταση του ζώου και τις εφαρμοστέες ειδικές διατάξεις.'
    },
    drugPersonal: {
      id: 'drugs-personal-use', label: 'Πιθανή περίπτωση κατοχής/προμήθειας για προσωπική χρήση',
      primaryEntryIds: ['special-drugs-29'], relatedEntryIds: [],
      notice: 'Η ρητή αναφορά σε προσωπική χρήση δεν αρκεί για νομικό χαρακτηρισμό. Η ποσότητα μόνη της δεν αρκεί· απαιτείται συνεκτίμηση όλων των νόμιμων κριτηρίων και των αποδείξεων.'
    },
    drugTrafficking: {
      id: 'drugs-trafficking-indicators', label: 'Περιστατικό με ενδείξεις πράξεων διακίνησης ναρκωτικών',
      primaryEntryIds: ['special-drugs-20'], relatedEntryIds: ['special-drugs-29'],
      notice: 'Εμφανίζεται το άρθρο 20 ως σχετική θεματική λόγω ρητής περιγραφής πράξης διάθεσης/διακίνησης. Δεν τεκμαίρεται αδίκημα από κατοχή, ποσότητα ή μία μόνο ένδειξη.'
    },
    weaponCarry: {
      id: 'weapon-carrying', label: 'Πιθανό περιστατικό οπλοφορίας',
      primaryEntryIds: ['special-weapons-10'], relatedEntryIds: ['special-weapons-7'],
      notice: 'Η οπλοφορία διακρίνεται από την οπλοκατοχή. Απαιτείται εξακρίβωση του αντικειμένου, του τόπου, του σκοπού, της άδειας και των νόμιμων εξαιρέσεων.'
    },
    weaponPossess: {
      id: 'weapon-possession', label: 'Πιθανό περιστατικό οπλοκατοχής',
      primaryEntryIds: ['special-weapons-7'], relatedEntryIds: [],
      notice: 'Η ονομασία ενός αντικειμένου δεν αρκεί για να χαρακτηριστεί ως όπλο ή παράνομη κατοχή· ελέγχονται οι νόμιμοι ορισμοί, άδειες και εξαιρέσεις.'
    },
    migrationTransport: {
      id: 'migration-transport', label: 'Περιστατικό μεταφοράς/διευκόλυνσης εισόδου πολιτών τρίτων χωρών',
      primaryEntryIds: ['special-migration-25'], relatedEntryIds: ['special-migration-24'],
      notice: 'Η αντιστοίχιση αφορά τη συμπεριφορά μεταφοράς/διευκόλυνσης που περιγράφεται. Δεν αποτελεί αυτόματη υπαγωγή ή οδηγία σύλληψης/κράτησης.'
    },
    migrationDocuments: {
      id: 'migration-documents', label: 'Περιστατικό με ενδείξεις πλαστών ταξιδιωτικών εγγράφων',
      primaryEntryIds: ['special-migration-24'], relatedEntryIds: [],
      notice: 'Απαιτείται εξακρίβωση γνησιότητας και των συγκεκριμένων πράξεων/παραγράφων. Δεν προκύπτει αυτομάτως αδίκημα μόνο από αμφιβολία για έγγραφο.'
    },
    migrationStay: {
      id: 'migration-stay-status', label: 'Έλεγχος διοικητικού καθεστώτος εισόδου/διαμονής',
      primaryEntryIds: ['special-migration'], relatedEntryIds: [],
      notice: 'Η απλή παράνομη είσοδος ή διαμονή δεν πρέπει να συγχέεται με τα ποινικά αδικήματα διευκόλυνσης τρίτων. Δεν αποτελεί οδηγία σύλληψης, κράτησης ή επιστροφής.'
    },
    building: {
      id: 'building-without-permit', label: 'Πιθανό περιστατικό οικοδομικών εργασιών/κατασκευής χωρίς άδεια',
      primaryEntryIds: ['building-unauthorized'], relatedEntryIds: ['building-nok'],
      notice: 'Η τεχνική διαπίστωση και ο χαρακτηρισμός αυθαιρεσίας ανήκουν στις αρμόδιες πολεοδομικές/ελεγκτικές αρχές. Δεν αποδίδεται αυτομάτως ποινική ευθύνη ή αστυνομική αρμοδιότητα.'
    }
  };

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
    var text = normalize(query);
    var words = tokens(text);
    var has = function (concept) { return hasConcept(words, CONCEPTS[concept]); };

    if (has('dog') && has('bite') && has('person')) return RULES.dog;

    if (has('animal')) {
      if (has('animalHarm')) return RULES.animalCruelty;
      if (has('animalNeglect')) return RULES.animalNeglect;
      if (has('animalTrade')) return RULES.animalTrade;
      if (has('animalTheft')) return RULES.animalTheft;
      if (has('animalNoise')) return RULES.animalNoise;
      if (has('animalTransport')) return RULES.animalTransport;
      if (has('animalOwner')) return RULES.animalOwner;
    }

    if (has('drug')) {
      var explicitPersonal = has('personal') && (hasConcept(words, ['χρηση','χρησ']) || text.indexOf('δικη μου χρηση') !== -1);
      var explicitDistribution = has('sale');
      if (explicitDistribution) return RULES.drugTrafficking;
      if (explicitPersonal) return RULES.drugPersonal;
    }

    if (has('weapon')) {
      var carrying = has('carry') || (has('migrant') === false && hasConcept(words, ['στηντσέπη','στητσέπη','επανωτου']));
      if (carrying) return RULES.weaponCarry;
      if (has('possess')) return RULES.weaponPossess;
    }

    if (has('migrant')) {
      if (has('transport') && (hasConcept(words, ['αλλοδαπ','μεταναστ','πολιτητριτησχωρασ']) || hasConcept(words, ['συνορ','εισοδο']))) {
        return RULES.migrationTransport;
      }
      if (has('forged') && hasConcept(words, ['διαβατηρ','ταξιδιωτικοεγγραφο','εγγραφο'])) return RULES.migrationDocuments;
      var noResidencePermit = hasConcept(words, ['χωρισ','ανευ']) && hasConcept(words, ['αδεια']) && hasConcept(words, ['διαμον']);
      var expiredResidencePermit = hasConcept(words, ['ληξ']) && hasConcept(words, ['αδεια']) && hasConcept(words, ['διαμον']);
      var irregularStay = hasConcept(words, ['παρανομη']) && hasConcept(words, ['παραμον','διαμον']);
      if (noResidencePermit || expiredResidencePermit || irregularStay) return RULES.migrationStay;
    }

    if (has('building')) {
      var construction = hasConcept(words, ['οικοδομ','κατασκευ','ανεγερ','εργασιεσ','κτισμα','δομησ']);
      var unauthorized = hasConcept(words, ['αυθαιρετ']) || (has('noPermit') && hasConcept(words, ['αδεια']) && construction);
      if (unauthorized) return RULES.building;
    }
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

  root.AXYPIncidentSearch = { normalize: normalize, tokens: tokens, classify: classify, hasCoverage: hasCoverage };
})(window);
