// Deterministic, local-only incident recognition. Rules identify relevant legal topics;
// they never determine that an offence has occurred or prescribe an unverified police action.
(function (root) {
  var STOPWORDS = ['και','να','με','για','σε','στο','στη','στον','στην','τον','την','του','της','των','τα','το','ο','η','οι','ως','απο','που','ειναι','κατα','προς','περι','μετα','παρα','δια','υπο','επι','ενωπιον','λογω'];
  var CONCEPTS = {
    dog: ['σκυλο','σκυλων','σκυλι','κυνο','κυνα','ζωοσυντροφιας'],
    animal: ['ζωο','ζωων','ζωα','σκυλο','σκυλων','σκυλι','γατα','γατεσ','ζωοσυντροφιασ','κουταβ','γατακι','αιγοπροβατ','ιππο','αλογ','αγριο','αγρια','ενδημ','εξωτικ','γερακ','πτηνο','πουλερικ','ορνιθ','πουλια'],
    animalHarm: ['κακοποι','βασαν','χτυπ','δηλητηρ','πυροβολ','τραυματ','θανατ','θανατω'],
    animalNeglect: ['παραμελ','πεινα','διψ','αλυσιδ','δεμεν','καταλυμ','ευζω'],
    animalOwner: ['λουρι','συνοδευ','ελευθερ','μικροτσιπ','τσιπ','σημανσ','στειρωσ','dna','ανεμβολιαστ'],
    animalTrade: ['εμπορ','πωλ','πουλ','αγοραπωλη','αγγελι','εκτροφ','κουταβ'],
    animalTheft: ['κλοπ','εκλεψ','αφαιρεσ','αρπαγ'],
    animalNoise: ['γαβγ','υλακ','θορυβ','κοινηησυχ','διαταραξη'],
    animalTransport: ['μεταφορ','μετεφερ','οχημα','φορτηγ','πλοιο','αεροπλανο','ταξιδευ'],
    animalMutilation: ['ακρωτηριασ','κοψιμοουρασ','κομμενηουρα','κομμενααυτια','φωνητικωνχορδων','ονυχ','δοντι'],
    animalMedia: ['βιντεο','οπτικοακουσ','φωτογραφ','υλικο','διακιν','παρουσιασ','κατοχη'],
    animalSexual: ['κτηνοβασ','σεξουαλ','συνευρεσ'],
    animalDoping: ['ντοπινγκ','doping','αναβολικ','υπερβολικηασκηση','εξαντλητικηασκηση','εκγυμνασ','ουσι'],
    animalTradition: ['πανηγυρ','παραδοσ','εθιμο','τοπικη','λαϊκη','λαικη'],
    animalChipAction: ['αφαιρεσ','βγαλε','εβγαλε','αφαιρεθηκε','αφαιρει'],
    animalEscape: ['δραπετευ','ξεφυγ','εφυγε','εξοδο','περιφραξ','αυλη'],
    animalWild: ['αγριαπανιδ','αγριοειδο','αγριο','αγρια','ενδημ','εξωτικ','γερακ'],
    animalBird: ['πουλερικ','ορνιθ','πτηνο','πουλια','πτηνα','κοκορ','παπια','περιστερ'],
    animalInspection: ['παρεμποδ','αρνηθ','αρνηση','δυσχερ','ελεγχ','επιθεωρ'],
    animalComplaint: ['καταγγελ','αναφορ','ανωνυμ','ανωνυμη'],
    animalRoad: ['τροχαι','ατυχημ','παρασυρ'],
    animalPoliceDog: ['αστυνομικ','ελασ','εργασιασ','υπηρεσιακ','k9'],
    animalAbandonment: ['εγκαταλειπ','εγκατελειψ','παρατησ','παρατησε'],
    animalSurrender: ['παρεδωσε','παρεδωσ','παραδωσε','παραδιδ','παραδοση'],
    animalPublicDisplay: ['κληρω','λοταρ','διαγωνισμ','επαθλο'],
    animalExhibition: ['εκθεση','εκδηλωσ','θεαμα','τσιρκο','μορφολογια','petshop'],
    animalOutdoorDog: ['αλυσιδ','δεμεν','προσδεσ','καταλυμ','αυλη','εξωτερικοχωρο','ασκηση'],
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
    noPermit: ['χωρισ','ανευ','μηαδειοδοτημεν'],
    assault: ['χτυπ','γρονθοκοπ','κλωτσ','εδειρ','τραυματ','επιτεθ','επιθεση','σωματικηβλαβη'],
    threat: ['απειλ','φοβερισ','εκφοβισ'],
    coercion: ['εξαναγκασ','αναγκασ','παρανομηβια'],
    theft: ['εκλεψ','κλοπ','αφαιρεσ','αρπαξ'],
    propertyDamage: ['εσπασε','κατεστρεψ','φθορα','ζημιωσ','κατεστραμ'],
    fraud: ['απατη','εξαπατ','παραπλαν','ψευδηπαρασταση','phishing','ηλεκτρονικηαπατη'],
    official: ['αστυνομικ','αστυνομια','υπαλληλ','οργανο','δικαστικο','δημοσιολειτουργ'],
    falseReport: ['ψευδωσ','ψευδησκαταμηνυσ','ψευδηκαταγγελ','κατηγορησεψευδωσ','ενγνωσειψευδωσ'],
    preliminary: ['προκαταρκτικ'],
    inquiry: ['προανακρι'],
    investigatorDuties: ['ανακριτικ','καθηκον','αναλογικοτ','συλλογη','αποδειξ'],
    arrest: ['συλληψ','συνεληφ','συλλαμβαν'],
    autoforo: ['αυτοφωρ'],
    warrant: ['ενταλμα'],
    custody: ['κρατητηρ','κρατηση','προσαγωγ'],
    evidenceSeizure: ['κατασχε','πειστηρ'],
    complaintFiling: ['μηνυση','εγκληση','εγκαλων','εγκαλουσα'],
    complaintProcess: ['παραβολο','ανακληση','παραιτηση','προσφυγη','απορριψη','προθεσμια'],
    complaintTime: ['μηνων','μηνεσ','μηνα'],
    prosecutionAction: ['διωξ','αρχειοθετ','αρχειο','ανασυρ'],
    reportDuty: ['ανακοινωσ','αναγγελια','ανακριτικ','υπαλληλ','αξιοποινη'],
    authorityApplication: ['αιτηση','διωξ','αρχη','υπηρεσια'],
    prosecutionPermission: ['αδεια','διωξ','χορηγηθ','αρνηση'],
    resJudicata: ['δεδικασμεν','εκκρεμοδικ','αμετακλητ','αθωωθ'],
    proceduralDefect: ['ελλειψ','παρατυπ','απαραδεκτ','νεα','επαν','ξανα'],
    scenePreservation: ['τοποεγκληματος','σκηνηεγκληματος','σφραγιδ','φυλακ','αλλοιωσ','απομακρυνθ'],
    searchOperation: ['ερευν','ερευνα','ερευνων','ερευνησ'],
    residence: ['κατοικ','οικια','σπιτι','διαμερισμα'],
    nightSearch: ['νυχτεριν','νυχτα','βραδυ'],
    bodilySearch: ['σωματικ','σωμα','ενδυμα','τσεπεσ'],
    digitalEvidence: ['ψηφιακ','ηλεκτρονικ','υπολογιστ','κινητοτηλεφωνο','σκληροδισκο','αποθηκευτικομεσο','cloud','νεφοϋπολογιστικ','δεδομενα'],
    evidenceSeizureFormal: ['κατασχε','αντιγραφ','ακεραιοτ','αυθεντικοτ','πειστηρ','μεσεγγυηση','ειδικηεκθεση']
  };

  var RULES = {
    dog: {
      id: 'dog-bite', label: 'Πιθανό περιστατικό δαγκώματος ανθρώπου από σκύλο',
      primaryEntryIds: ['zoa-16'], relatedEntryIds: ['zoa-12'],
      notice: 'Η αναγνώριση αφορά θεματικές διατάξεις· το δάγκωμα δεν αποτελεί αυτομάτως ποινικό αδίκημα.'
    },
    animalMutilation: {
      id: 'animal-nontherapeutic-mutilation', label: 'Πιθανό περιστατικό μη θεραπευτικού ακρωτηριασμού ή συμμετοχής ακρωτηριασμένου ζώου σε έκθεση',
      primaryEntryIds: ['zoa-17'], relatedEntryIds: ['zoa-10', 'zoa-9'],
      notice: 'Ελέγχεται αν υπήρχε θεραπευτικός σκοπός και, χωριστά, αν το ζώο συμμετείχε σε έκθεση/εκδήλωση. Η εξωτερική εικόνα δεν αρκεί για νομικό χαρακτηρισμό.'
    },
    animalMedia: {
      id: 'animal-violent-audiovisual-material', label: 'Πιθανό περιστατικό υλικού που απεικονίζει βία ή σεξουαλικές πράξεις με ζώα',
      primaryEntryIds: ['zoa-18'], relatedEntryIds: ['zoa-10'],
      notice: 'Απαιτούνται τα ειδικά στοιχεία του άρθρου 24 §2, ιδίως το περιεχόμενο και ο σκοπός. Εξετάζεται η εξαίρεση εκπαιδευτικού οπτικοακουστικού υλικού.'
    },
    animalDoping: {
      id: 'animal-doping-or-excessive-exercise', label: 'Πιθανό περιστατικό ντόπινγκ ή υπερβολικής εκγύμνασης ζώου',
      primaryEntryIds: ['zoa-19'], relatedEntryIds: ['zoa-7'],
      notice: 'Η χορήγηση ουσίας ή η άσκηση αξιολογείται με βάση τον σκοπό, τον κίνδυνο και τις ειδικές προϋποθέσεις της Σύμβασης.'
    },
    animalTradition: {
      id: 'animal-local-traditional-event', label: 'Εκδήλωση με ζώα στο πλαίσιο τοπικής ή λαϊκής παράδοσης',
      primaryEntryIds: ['zoa-20'], relatedEntryIds: ['zoa-3', 'zoa-9'],
      notice: 'Ελέγχονται σωρευτικά η απόφαση δημοτικού συμβουλίου, η παρουσία κτηνιάτρου και οι εκθέσεις πριν και μετά την εκδήλωση.'
    },
    animalChipRemoval: {
      id: 'animal-microchip-removal', label: 'Πιθανή παράνομη αφαίρεση ηλεκτρονικής σήμανσης ζώου',
      primaryEntryIds: ['zoa-21'], relatedEntryIds: ['zoa-9', 'zoa-12'],
      notice: 'Ελέγχεται αν υπήρχαν και κτηνιατρική γνωμάτευση αναγκαιότητας και εντολή αρμόδιου εισαγγελέα.'
    },
    animalEscape: {
      id: 'animal-escape-prevention', label: 'Πιθανή παράλειψη μέτρων αποτροπής εξόδου σκύλου από ιδιοκτησία',
      primaryEntryIds: ['zoa-22'], relatedEntryIds: ['zoa-6', 'zoa-9'],
      notice: 'Η έξοδος/διαφυγή δεν αποδεικνύει μόνη της παράβαση· εξετάζονται τα πραγματικά μέτρα πρόληψης και η ευθύνη του υπόχρεου.'
    },
    animalWild: {
      id: 'wildlife-possession-or-trade', label: 'Πιθανή κατοχή ή εμπορία είδους άγριας πανίδας',
      primaryEntryIds: ['zoa-23'], relatedEntryIds: [],
      notice: 'Απαιτείται ασφαλής ταυτοποίηση είδους και έλεγχος προστατευτικού καθεστώτος, προέλευσης και αδειών από την αρμόδια αρχή.'
    },
    animalBirdTrade: {
      id: 'bird-or-poultry-outdoor-trade', label: 'Πιθανή υπαίθρια πώληση ή μεταφορά πτηνών χωρίς τα απαιτούμενα έγγραφα',
      primaryEntryIds: ['zoa-24'], relatedEntryIds: ['zoa-13'],
      notice: 'Οι ακριβείς ισχύουσες κτηνιατρικές/εμπορικές απαιτήσεις δεν έχουν ακόμη πλήρως επαληθευτεί· δεν εμφανίζεται ποσό προστίμου.'
    },
    animalInspection: {
      id: 'animal-inspection-obstruction', label: 'Πιθανή άρνηση ή παρεμπόδιση επίσημου ελέγχου προστασίας ζώων',
      primaryEntryIds: ['zoa-25'], relatedEntryIds: ['zoa-9'],
      notice: 'Εξετάζεται αν πρόκειται για επίσημο έλεγχο αρμόδιας αρχής στους τομείς που καλύπτει ο ν. 4235/2014 και αν υπήρξε συγκεκριμένη παρεμπόδιση.'
    },
    animalComplaint: {
      id: 'animal-report-or-anonymous-complaint', label: 'Αναφορά περιστατικού κακοποίησης ζώου',
      primaryEntryIds: ['zoa-34'], relatedEntryIds: ['zoa-29', 'zoa-8'],
      notice: 'Η ανώνυμη καταγγελία διερευνάται μόνο αν περιέχει συγκεκριμένα στοιχεία που παρέχουν επαρκή βάση. Το άρθρο 25 δεν θεσπίζει από μόνο του ειδική αστυνομική διαδικασία.'
    },
    animalPoliceDog: {
      id: 'animal-police-working-dog', label: 'Ειδικό καθεστώς σκύλου εργασίας της Ελληνικής Αστυνομίας',
      primaryEntryIds: ['zoa-33'], relatedEntryIds: ['zoa-6', 'zoa-22', 'zoa-27'],
      notice: 'Οι εξαιρέσεις ισχύουν μόνο για επίσημο σκύλο εργασίας της ΕΛ.ΑΣ. και, όπου ο νόμος το ορίζει, μόνο κατά την εκτέλεση υπηρεσίας. Δεν αφορούν ιδιωτικό ζώο αστυνομικού.'
    },
    animalRoad: {
      id: 'animal-road-traffic-injury', label: 'Τραυματισμός ζώου σε τροχαίο ατύχημα',
      primaryEntryIds: ['zoa-30'], relatedEntryIds: ['zoa-13'],
      notice: 'Ελέγχεται αν ο υπαίτιος ειδοποίησε άμεσα τον δήμο ή την Ελληνική Αστυνομία ώστε να παρασχεθεί κτηνιατρική φροντίδα. Το πρόστιμο της α/α 45 αφορά εγκατάλειψη τραυματισμένου ζώου και δεν εφαρμόζεται αυτομάτως σε κάθε τροχαίο.'
    },
    animalAbandonment: {
      id: 'animal-abandonment-or-lawful-surrender', label: 'Πιθανή εγκατάλειψη ζώου ή νόμιμη παράδοσή του στον δήμο',
      primaryEntryIds: ['zoa-31'], relatedEntryIds: ['zoa-10', 'zoa-9', 'zoa-8'],
      notice: 'Διακρίνεται η απαγορευμένη εγκατάλειψη από τη νόμιμη παράδοση στον δήμο μετά την προβλεπόμενη διαδικασία. Η περιγραφή από μόνη της δεν αποδεικνύει εγκατάλειψη.'
    },
    animalPublicDisplay: {
      id: 'animal-public-display-or-prize', label: 'Χρήση ζώου σε υπαίθρια δημόσια έκθεση ή ως έπαθλο',
      primaryEntryIds: ['zoa-29'], relatedEntryIds: ['zoa-3', 'zoa-9'],
      notice: 'Ελέγχεται ο σκοπός οικονομικού οφέλους, το είδος της εκδήλωσης και αν συντρέχει νόμιμη εξαίρεση ή ειδική άδεια.'
    },
    animalExhibition: {
      id: 'animal-exhibition-requirements', label: 'Έκθεση ή εκδήλωση με ζώα συντροφιάς',
      primaryEntryIds: ['zoa-28'], relatedEntryIds: ['zoa-17', 'zoa-9'],
      notice: 'Ελέγχονται η άδεια, η επίβλεψη, η παρουσία κτηνιάτρου όπου απαιτείται, τα έγγραφα υγείας/σήμανσης και η απαγόρευση συμμετοχής ακρωτηριασμένων ζώων.'
    },
    animalOutdoorDog: {
      id: 'dog-outdoor-welfare-duties', label: 'Συνθήκες διαβίωσης και πρόσδεσης σκύλου σε εξωτερικό χώρο',
      primaryEntryIds: ['zoa-32'], relatedEntryIds: ['zoa-11', 'zoa-6'],
      notice: 'Ελέγχονται τα ειδικά όρια πρόσδεσης, το κατάλυμα, η καθαριότητα και η δυνατότητα κίνησης/άσκησης. Δεν αποδίδεται παράβαση μόνο από τη διαπίστωση ότι ο σκύλος βρίσκεται στην αυλή.'
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
      primaryEntryIds: ['zoa-5'], relatedEntryIds: ['zoa-27', 'zoa-8', 'zoa-12'],
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
      primaryEntryIds: ['zoa-13'], relatedEntryIds: ['zoa-26', 'zoa-11'],
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
    },
    bodilyInjury: {
      id: 'penal-bodily-injury', label: 'Πιθανό περιστατικό σωματικής βλάβης',
      primaryEntryIds: ['pk-5'], relatedEntryIds: [],
      notice: 'Η βαρύτητα και ο νομικός χαρακτηρισμός δεν προκύπτουν μόνο από τη φράση της περιγραφής· απαιτείται αξιολόγηση των πραγματικών και ιατρικών στοιχείων.'
    },
    officialViolence: {
      id: 'penal-violence-against-official', label: 'Πιθανό περιστατικό βίας κατά υπαλλήλου ή δικαστικού προσώπου',
      primaryEntryIds: ['pk-6'], relatedEntryIds: [],
      notice: 'Ελέγχονται η ιδιότητα του προσώπου, η νόμιμη υπηρεσιακή ενέργεια και η συγκεκριμένη μορφή βίας ή απειλής. Η διαφωνία ή η απείθεια δεν ταυτίζεται αυτομάτως με το άρθρο 167.'
    },
    threatOrCoercion: {
      id: 'penal-threat-or-unlawful-coercion', label: 'Πιθανή απειλή ή παράνομη βία',
      primaryEntryIds: ['pk-7'], relatedEntryIds: [],
      notice: 'Τα άρθρα 330 και 333 έχουν διαφορετικά στοιχεία. Απαιτείται ακριβής αποτύπωση λόγων, πράξεων και περιστάσεων.'
    },
    theft: {
      id: 'penal-theft-or-property-damage', label: 'Πιθανό περιστατικό κλοπής ή φθοράς ξένης ιδιοκτησίας',
      primaryEntryIds: ['pk-8'], relatedEntryIds: [],
      notice: 'Η αφαίρεση, η ιδιοποίηση και η φθορά είναι διαφορετικές συμπεριφορές. Δεν προκύπτει χαρακτηρισμός χωρίς έλεγχο κυριότητας, κατοχής και πρόθεσης.'
    },
    fraud: {
      id: 'penal-fraud', label: 'Πιθανό περιστατικό απάτης',
      primaryEntryIds: ['pk-9'], relatedEntryIds: [],
      notice: 'Η απλή αθέτηση συμφωνίας δεν αρκεί. Ελέγχονται τα στοιχεία παραπλάνησης, περιουσιακής διάθεσης, οφέλους και ζημίας.'
    },
    falseReport: {
      id: 'penal-false-accusation-or-report', label: 'Ζήτημα προς έλεγχο ως προς ψευδή καταμήνυση ή καταγγελία',
      primaryEntryIds: ['pk-10'], relatedEntryIds: [],
      notice: 'Μια μη αποδειχθείσα ή αρχειοθετημένη καταγγελία δεν είναι αυτομάτως ψευδής. Απαιτείται ειδική απόδειξη των στοιχείων της διάταξης.'
    },
    kpdAuthorityApplication: {
      id: 'kpd-authority-application-for-prosecution', label: 'Ειδική αίτηση αρχής ως προϋπόθεση ποινικής δίωξης',
      primaryEntryIds: ['kpd-16'], relatedEntryIds: ['kpd-12', 'kpd-13'],
      notice: 'Η αίτηση του άρθρου 41 απαιτείται μόνο όταν ειδική διάταξη το προβλέπει. Απευθύνεται σε εκπρόσωπο της εισαγγελικής αρχής και διακρίνεται από μήνυση ή έγκληση.'
    },
    kpdProsecutionPermission: {
      id: 'kpd-permission-before-prosecution', label: 'Ειδική άδεια ως προϋπόθεση δίωξης',
      primaryEntryIds: ['kpd-17'], relatedEntryIds: ['kpd-16'],
      notice: 'Πρέπει να εντοπιστεί η ειδική συνταγματική ή νομοθετική διάταξη που απαιτεί άδεια. Το άρθρο 56 θέτει όρια στις ανακριτικές πράξεις πριν από τη χορήγησή της.'
    },
    kpdResJudicata: {
      id: 'kpd-res-judicata-or-pending-prosecution', label: 'Πιθανό ζήτημα δεδικασμένου ή εκκρεμοδικίας',
      primaryEntryIds: ['kpd-18'], relatedEntryIds: ['kpd-19'],
      notice: 'Ελέγχεται η ταυτότητα προσώπου και πράξης και το περιεχόμενο/στάδιο της προηγούμενης διαδικασίας. Η εφαρμογή δεν αποφαίνεται αν υπάρχει δεδικασμένο.'
    },
    kpdReprosecution: {
      id: 'kpd-new-prosecution-after-procedural-defect', label: 'Νέα δίωξη μετά από θεραπεία έλλειψης έγκλησης, αίτησης ή άδειας',
      primaryEntryIds: ['kpd-19'], relatedEntryIds: ['kpd-16', 'kpd-17', 'kpd-18'],
      notice: 'Το άρθρο 58 αφορά μόνο την ειδική περίπτωση απαραδέκτου λόγω έλλειψης ή πλημμέλειας έγκλησης, αίτησης ή άδειας· δεν παραμερίζει γενικά το δεδικασμένο.'
    },
    kpdScenePreservation: {
      id: 'kpd-scene-and-evidence-preservation', label: 'Διασφάλιση τόπου και αποδεικτικών στοιχείων',
      primaryEntryIds: ['kpd-20'], relatedEntryIds: ['kpd-7', 'kpd-23'],
      notice: 'Τα μέτρα του άρθρου 252 συνδέονται με συγκεκριμένη ανακριτική πράξη και ασκούνται από τα αρμόδια πρόσωπα, με νόμιμη βάση και αναλογικότητα.'
    },
    kpdSearch: {
      id: 'kpd-search-and-home-search-formalities', label: 'Προϋποθέσεις έρευνας και έρευνας κατοικίας',
      primaryEntryIds: ['kpd-21'], relatedEntryIds: ['kpd-20', 'kpd-22', 'kpd-23'],
      notice: 'Ελέγχονται οι ειδικές προϋποθέσεις έρευνας, η παρουσία δικαστικής αρχής όταν αφορά κατοικία, οι διατυπώσεις του άρθρου 256 και οι περιοριστικά οριζόμενες περιπτώσεις νυχτερινής έρευνας.'
    },
    kpdBodySearch: {
      id: 'kpd-personal-search', label: 'Προϋποθέσεις και εγγυήσεις σωματικής έρευνας',
      primaryEntryIds: ['kpd-22'], relatedEntryIds: ['kpd-23'],
      notice: 'Για τρίτο πρόσωπο απαιτείται σοβαρή και βάσιμη υπόνοια ή απόλυτη ανάγκη. Η έρευνα γίνεται χωριστά, με σεβασμό στην υγεία και αξιοπρέπεια και με προηγούμενη πρόσκληση παράδοσης του συγκεκριμένου αντικειμένου όπου αυτό αναζητείται.'
    },
    kpdSearchReport: {
      id: 'kpd-search-report-and-sequestration', label: 'Έκθεση έρευνας και μεσεγγύηση ευρημάτων',
      primaryEntryIds: ['kpd-23'], relatedEntryIds: ['kpd-20', 'kpd-21', 'kpd-24'],
      notice: 'Μετά την έρευνα συντάσσεται έκθεση. Η κατάσχεση και η μεσεγγύηση είναι διακριτές έννοιες και ακολουθούν τις ειδικές διατυπώσεις.'
    },
    kpdDigitalEvidence: {
      id: 'kpd-digital-evidence-seizure', label: 'Κατάσχεση και διατήρηση ψηφιακών αποδεικτικών στοιχείων',
      primaryEntryIds: ['kpd-24'], relatedEntryIds: ['kpd-20', 'kpd-23'],
      notice: 'Το άρθρο 265 προβλέπει ειδικό εξοπλισμό, ειδική έκθεση και διασφάλιση αυθεντικότητας/ακεραιότητας. Η ρύθμιση για απομακρυσμένα συστήματα δεν καλύπτει αυτομάτως cloud δεδομένα.'
    },
    kpdReporting: {
      id: 'kpd-reporting-duty', label: 'Υποχρέωση ανακοίνωσης ή αναγγελίας αξιόποινης πράξης',
      primaryEntryIds: ['kpd-11'], relatedEntryIds: [],
      notice: 'Διακρίνεται η υποχρέωση ανακριτικών/δημοσίων υπαλλήλων κατά το άρθρο 38 από την ειδική υποχρέωση ιδιωτών του άρθρου 40. Ελέγχεται αν η πράξη διώκεται αυτεπαγγέλτως.'
    },
    kpdComplaint: {
      id: 'kpd-criminal-complaint-submission', label: 'Υποβολή μήνυσης για αξιόποινη πράξη',
      primaryEntryIds: ['kpd-12'], relatedEntryIds: ['kpd-11'],
      notice: 'Η μήνυση του άρθρου 42 αφορά αυτεπαγγέλτως διωκόμενη πράξη και δεν ταυτίζεται με την έγκληση του παθόντος. Η υποβολή δεν σημαίνει αυτομάτως ότι ασκήθηκε ποινική δίωξη.'
    },
    kpdProsecution: {
      id: 'kpd-prosecution-and-archiving', label: 'Εισαγγελική κρίση για άσκηση δίωξης ή αρχειοθέτηση',
      primaryEntryIds: ['kpd-13'], relatedEntryIds: ['kpd-11', 'kpd-12'],
      notice: 'Η άσκηση ποινικής δίωξης και η αρχειοθέτηση αποτελούν εισαγγελικές πράξεις. Η εφαρμογή δεν αξιολογεί επάρκεια ενδείξεων και δεν προβλέπει το αποτέλεσμα.'
    },
    kpdComplaintProcess: {
      id: 'kpd-complaint-deadlines-fees-and-withdrawal', label: 'Έγκληση, παράβολο, προθεσμίες, προσφυγή ή ανάκληση',
      primaryEntryIds: ['kpd-14', 'kpd-15'], relatedEntryIds: ['kpd-12', 'kpd-13'],
      notice: 'Διακρίνονται η τρίμηνη προθεσμία αρχικής έγκλησης, η 15ήμερη προσφυγή κατά απόρριψης, η παραίτηση πριν από την άσκηση και η ανάκληση ήδη υποβληθείσας έγκλησης. Ελέγχονται πάντα οι εξαιρέσεις και τα ισχύοντα ποσά παραβόλων.'
    },
    kpdPreliminary: {
      id: 'kpd-preliminary-examination', label: 'Αναζήτηση για προκαταρκτική εξέταση και δικαιώματα υπόπτου',
      primaryEntryIds: ['kpd-4'], relatedEntryIds: ['kpd-5'],
      notice: 'Η προκαταρκτική εξέταση αποσκοπεί στη συλλογή στοιχείων πριν από την κρίση για ποινική δίωξη. Ελέγχονται υποχρεωτικά τα δικαιώματα του υπόπτου και οι ειδικές προθεσμίες.'
    },
    kpdInquiry: {
      id: 'kpd-preliminary-inquiry', label: 'Αναζήτηση για προανάκριση και αυτεπάγγελτες προανακριτικές πράξεις',
      primaryEntryIds: ['kpd-6'], relatedEntryIds: ['kpd-7'],
      notice: 'Διακρίνεται η προανάκριση κατόπιν γραπτής εισαγγελικής παραγγελίας από την αυτεπάγγελτη προανάκριση του άρθρου 245 §2, η οποία επιτρέπεται μόνο υπό συγκεκριμένες προϋποθέσεις.'
    },
    kpdDuties: {
      id: 'kpd-investigator-duties', label: 'Καθήκοντα ανακριτικού υπαλλήλου και αναλογικότητα',
      primaryEntryIds: ['kpd-7'], relatedEntryIds: ['kpd-6'],
      notice: 'Κάθε ανακριτική πράξη απαιτεί ειδική νόμιμη βάση, αρμοδιότητα, προϋποθέσεις και τήρηση της αρχής της αναλογικότητας.'
    },
    kpdArrest: {
      id: 'kpd-arrest-and-detention', label: 'Αναζήτηση για αυτόφωρο, σύλληψη, προσαγωγή και πειστήρια',
      primaryEntryIds: ['kpd-1', 'kpd-2'], relatedEntryIds: ['kpd-8', 'kpd-3', 'kpd-9', 'kpd-10'],
      notice: 'Η αναγνώριση παραπέμπει στις σχετικές δικονομικές διατάξεις· δεν κρίνει αν συντρέχει αυτόφωρο ή νόμιμη βάση σύλληψης. Ελέγχονται χωριστά οι προϋποθέσεις σύλληψης, ο τρόπος εκτέλεσης και οι προθεσμίες προσαγωγής.'
    },
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
      return word.indexOf(concept) === 0 || (word.length >= 4 && concept.length >= 5 && concept.indexOf(word) === 0);
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
      if (has('animalChipAction') && hasConcept(words, ['τσιπ','μικροτσιπ','σημανσ'])) return RULES.animalChipRemoval;
      if (has('animalComplaint') && hasConcept(words, ['ζωο','ζωων','σκυλο','γατα','κακοποι'])) return RULES.animalComplaint;
      if (has('dog') && has('animalPoliceDog') && hasConcept(words, ['εργασιασ','υπηρεσιακ','k9','ελασ'])) return RULES.animalPoliceDog;
      if (has('animalRoad') && hasConcept(words, ['τραυματ','χτυπ','παρασυρ','τραυματισμ'])) return RULES.animalRoad;
      if (has('animalSurrender') && hasConcept(words, ['δημο'])) return null;
      if (has('animalAbandonment')) return RULES.animalAbandonment;
      if (has('animalPublicDisplay') || (hasConcept(words, ['οικονομικ']) && hasConcept(words, ['οφελο']) && (hasConcept(words, ['υπαιθρια']) || hasConcept(words, ['δημοσια']) || hasConcept(words, ['εκθεση'])))) return RULES.animalPublicDisplay;
      if (has('animalExhibition')) return RULES.animalExhibition;
      if (has('dog') && has('animalOutdoorDog') && hasConcept(words, ['αυλη','εξωτερικοχωρο']) && hasConcept(words, ['καταλυμ','προσδεσ','αλυσιδ'])) return RULES.animalOutdoorDog;
      if (has('animalMutilation')) return RULES.animalMutilation;
      if (has('animalMedia') && (has('animalHarm') || has('animalSexual'))) return RULES.animalMedia;
      if (has('animalDoping')) return RULES.animalDoping;
      if (has('animalTradition')) return RULES.animalTradition;
      if (has('animalEscape')) return RULES.animalEscape;
      if (has('animalInspection')) return RULES.animalInspection;
      if (has('animalBird') && (has('animalTrade') || has('animalTransport'))) return RULES.animalBirdTrade;
      if (has('animalWild')) return RULES.animalWild;
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

    if (has('digitalEvidence') && (hasConcept(words, ['κατασχε','αντιγραφ','ακεραιοτ','αυθεντικοτ','πειστηρ']) || hasConcept(words, ['ψηφιακ','ηλεκτρονικ']) && hasConcept(words, ['ερευν','δεδομεν']))) return RULES.kpdDigitalEvidence;
    if (has('bodilySearch') && has('searchOperation')) return RULES.kpdBodySearch;
    if (has('searchOperation') && has('residence')) return RULES.kpdSearch;
    if (has('scenePreservation') && (has('searchOperation') || hasConcept(words, ['πειστηρ','τοπο','σκηνη']))) return RULES.kpdScenePreservation;
    if (has('searchOperation') && hasConcept(words, ['εκθεση','ευρημα','μεσεγγυηση']) && hasConcept(words, ['κατασχε','πειστηρ','αντικειμεν','ευρημα','μεσεγγυηση'])) return RULES.kpdSearchReport;
    if (has('proceduralDefect') && hasConcept(words, ['ελλειψ','παρατυπ']) && hasConcept(words, ['εγκληση','αιτηση','αδεια']) && hasConcept(words, ['διωξ','νεα','επαν'])) return RULES.kpdReprosecution;
    if (has('resJudicata') && (hasConcept(words, ['δεδικασμεν','εκκρεμοδικ']) || (hasConcept(words, ['ιδια']) && hasConcept(words, ['πραξη']) && hasConcept(words, ['αθωωθ','καταδικαστ','παυση'])))) return RULES.kpdResJudicata;
    if (has('authorityApplication') && hasConcept(words, ['αιτηση']) && hasConcept(words, ['διωξ']) && hasConcept(words, ['αρχη','υπηρεσια','υπουργ'])) return RULES.kpdAuthorityApplication;
    if (has('prosecutionPermission') && hasConcept(words, ['αδεια']) && hasConcept(words, ['διωξ'])) return RULES.kpdProsecutionPermission;
    if (has('falseReport') && hasConcept(words, ['καταγγελ','καταμηνυσ','κατηγορησ','κατηγγειλ','μηνυσ'])) return RULES.falseReport;
    if (has('complaintFiling') && (has('complaintProcess') || has('complaintTime') || has('prosecutionAction'))) return RULES.kpdComplaintProcess;
    if (has('complaintFiling')) return RULES.kpdComplaint;
    if (has('prosecutionAction') && hasConcept(words, ['ποινικη','διωξη','αρχειοθετ','αρχειο'])) return RULES.kpdProsecution;
    if (hasConcept(words, ['ανακοινωση','ανακοινωσ','αναγγελια','αναγγελ']) && hasConcept(words, ['αξιοποινη','πραξη']) && hasConcept(words, ['ανακριτικ','υπαλληλ','δημοσιο'])) return RULES.kpdReporting;

    if (has('preliminary')) return RULES.kpdPreliminary;
    if (has('inquiry')) return RULES.kpdInquiry;
    if (has('investigatorDuties') && hasConcept(words, ['ανακριτικ','καθηκον','αναλογικοτ','αποδειξ'])) return RULES.kpdDuties;
    if (has('arrest') && (has('autoforo') || has('warrant') || has('custody') || has('evidenceSeizure'))) return RULES.kpdArrest;

    if (has('official') && has('assault')) return RULES.officialViolence;
    if (has('falseReport') && hasConcept(words, ['καταγγελ','καταμηνυσ','κατηγορησ','κατηγγειλ','μηνυσ'])) return RULES.falseReport;
    if (has('fraud') && hasConcept(words, ['χρημα','τραπεζ','μεταφορ','λογαριασ','περιουσ','εξαπατ','παραπλαν'])) return RULES.fraud;
    if (has('threat') || (has('coercion') && hasConcept(words, ['εξαναγκασ','αναγκασ']))) return RULES.threatOrCoercion;
    if (has('theft') && hasConcept(words, ['αντικειμεν','κινητο','πορτοφολ','χρημα','πραγμα','πραγματα','ιδιοκτησ','αφαιρεσ','εκλεψ'])) return RULES.theft;
    if (has('propertyDamage') && hasConcept(words, ['αυτοκινητ','οχημα','πορτα','τζαμι','περιουσ','αντικειμεν','ξενη','καταστημα'])) return RULES.theft;
    if (has('assault') && has('person')) return RULES.bodilyInjury;
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
