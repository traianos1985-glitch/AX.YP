// Central metadata for category-specific fields introduced through the schema-driven form.
const defineDossierField = (path, group, label, type = 'text', required = true, extra = {}) => Object.freeze({
  path, group, label, type, required, cardinality: 'single',
  maxLength: type === 'textarea' ? 3000 : 200,
  ...extra
});

// Existing specialist forms remain compatible and are migrated only after their source DOCX
// templates have been inspected and their mappings have been verified.
export const DOSSIER_FIELD_SCHEMA_VERSION = 1;

export const DOSSIER_CATEGORY_FIELDS = Object.freeze({
  narcotics: Object.freeze([
    defineDossierField('narcotics.policeWitness.fullName', 'Αστυνομικός μάρτυρας', 'Ονοματεπώνυμο αστυνομικού μάρτυρα'),
    defineDossierField('narcotics.policeWitness.fatherNameGenitive', 'Αστυνομικός μάρτυρας', 'Πατρώνυμο (γενική)'),
    defineDossierField('narcotics.policeWitness.motherNameGenitive', 'Αστυνομικός μάρτυρας', 'Μητρώνυμο (γενική)'),
    defineDossierField('narcotics.policeWitness.birthDate', 'Αστυνομικός μάρτυρας', 'Ημερομηνία γέννησης', 'date'),
    defineDossierField('narcotics.policeWitness.birthPlace', 'Αστυνομικός μάρτυρας', 'Τόπος γέννησης'),
    defineDossierField('narcotics.policeWitness.idNumber', 'Αστυνομικός μάρτυρας', 'Αριθμός δελτίου ταυτότητας'),
    defineDossierField('narcotics.policeWitness.idYear', 'Αστυνομικός μάρτυρας', 'Έτος έκδοσης ταυτότητας'),
    defineDossierField('narcotics.policeWitness.profession', 'Αστυνομικός μάρτυρας', 'Ιδιότητα / επάγγελμα'),
    defineDossierField('narcotics.policeWitness.rank', 'Αστυνομικός μάρτυρας', 'Βαθμός'),
    defineDossierField('narcotics.policeWitness.dutyStartTime', 'Αστυνομικός μάρτυρας', 'Ώρα έναρξης διατεταγμένης υπηρεσίας', 'time'),
    defineDossierField('narcotics.policeWitness.dutyEndTime', 'Αστυνομικός μάρτυρας', 'Ώρα λήξης διατεταγμένης υπηρεσίας', 'time'),
    defineDossierField('narcotics.policeWitness.patrolOtherService', 'Αστυνομικός μάρτυρας', 'Άλλη περιοχή / υπηρεσία περιπολίας'),
    defineDossierField('narcotics.apprehendingOfficer.rank', 'Συλλαβών αστυνομικός', 'Βαθμός'),
    defineDossierField('narcotics.apprehendingOfficer.fullName', 'Συλλαβών αστυνομικός', 'Ονοματεπώνυμο'),
    defineDossierField('narcotics.apprehendingOfficer.fatherNameGenitive', 'Συλλαβών αστυνομικός', 'Πατρώνυμο (γενική)'),
    defineDossierField('narcotics.apprehendingOfficer.motherNameGenitive', 'Συλλαβών αστυνομικός', 'Μητρώνυμο (γενική)'),
    defineDossierField('narcotics.apprehendingOfficer.birthDate', 'Συλλαβών αστυνομικός', 'Ημερομηνία γέννησης', 'date'),
    defineDossierField('narcotics.apprehendingOfficer.birthPlace', 'Συλλαβών αστυνομικός', 'Τόπος γέννησης'),
    defineDossierField('narcotics.apprehendingOfficer.city', 'Συλλαβών αστυνομικός', 'Τόπος κατοικίας'),
    defineDossierField('narcotics.apprehendingOfficer.education', 'Συλλαβών αστυνομικός', 'Γραμματικές γνώσεις'),
    defineDossierField('narcotics.apprehendingOfficer.profession', 'Συλλαβών αστυνομικός', 'Επάγγελμα'),
    defineDossierField('narcotics.apprehendingOfficer.idNumber', 'Συλλαβών αστυνομικός', 'Αριθμός δελτίου ταυτότητας'),
    defineDossierField('narcotics.apprehendingOfficer.idDate', 'Συλλαβών αστυνομικός', 'Ημερομηνία έκδοσης ταυτότητας', 'date'),
    defineDossierField('narcotics.apprehendingOfficer.idService', 'Συλλαβών αστυνομικός', 'Αρχή έκδοσης ταυτότητας'),
    defineDossierField('narcotics.apprehendingOfficer.service', 'Συλλαβών αστυνομικός', 'Υπηρεσία'),
    defineDossierField('narcotics.offender.fullNameAccusative', 'Κατηγορούμενος · γραμματικοί τύποι', 'Ονοματεπώνυμο (αιτιατική)'),
    defineDossierField('narcotics.offender.fullNameGenitive', 'Κατηγορούμενος · γραμματικοί τύποι', 'Ονοματεπώνυμο (γενική)'),
    defineDossierField('narcotics.offender.fatherNameGenitive', 'Κατηγορούμενος · γραμματικοί τύποι', 'Πατρώνυμο (γενική)'),
    defineDossierField('narcotics.offender.motherNameGenitive', 'Κατηγορούμενος · γραμματικοί τύποι', 'Μητρώνυμο (γενική)'),
    defineDossierField('narcotics.offender.previousHistory', 'Κατηγορούμενος · δηλώσεις', 'Προηγούμενο ποινικό ιστορικό / απάντηση', 'textarea', true, { rows: 2 }),
    defineDossierField('narcotics.offender.rightsResponse', 'Κατηγορούμενος · δηλώσεις', 'Απάντηση για τη χρήση των δικαιωμάτων', 'textarea', true, { rows: 3 }),
    defineDossierField('narcotics.offender.statement', 'Κατηγορούμενος · δηλώσεις', 'Απολογία / δήλωση κατηγορουμένου', 'textarea', true, { rows: 5 }),
    defineDossierField('narcotics.exhibits.cannabis.quantity', 'Κατασχεθέντα', 'Ποσότητα κάνναβης (γραμμάρια)', 'number', true, { step: '0.01', min: 0 }),
    defineDossierField('narcotics.exhibits.cigarette.quantity', 'Κατασχεθέντα', 'Αριθμός αυτοσχέδιων τσιγάρων (τεμάχια)', 'number', true, { step: '1', min: 0 }),
    defineDossierField('narcotics.policeUnit', 'Υπόθεση · αστυνομική υπηρεσία', 'Αστυνομική ομάδα / υπηρεσία ελέγχου'),
    defineDossierField('narcotics.case.noticeResponse', 'Υπόθεση · γνωστοποίηση', 'Απάντηση για αμφισβήτηση της ιδιότητας των ουσιών'),
    defineDossierField('narcotics.case.releaseTime', 'Υπόθεση · εισαγγελική εντολή', 'Ώρα απόλυσης', 'time'),
    defineDossierField('narcotics.case.chemicalProtocolNumber', 'Υπόθεση · πρωτόκολλα', 'Αριθμός πρωτοκόλλου αποστολής στο Χημείο'),
    defineDossierField('narcotics.prosecutor.surname', 'Υπόθεση · εισαγγελική εντολή', 'Επώνυμο εισαγγελικού λειτουργού'),
    defineDossierField('narcotics.service.commanderFullName', 'Υπηρεσία · πρόσθετα στοιχεία', 'Ονοματεπώνυμο διοικητή'),
    defineDossierField('narcotics.service.postalCode', 'Υπηρεσία · πρόσθετα στοιχεία', 'Ταχυδρομικός κώδικας υπηρεσίας'),
    defineDossierField('narcotics.service.chemicalServiceCity', 'Υπηρεσία · Χημική Υπηρεσία', 'Πόλη Χημικής Υπηρεσίας'),
    defineDossierField('narcotics.service.chemicalServicePostalCode', 'Υπηρεσία · Χημική Υπηρεσία', 'Ταχυδρομικός κώδικας Χημικής Υπηρεσίας')
  ]),
  counterfeit: Object.freeze([]),
  environment: Object.freeze([]),
  health: Object.freeze([]),
  noise: Object.freeze([]),
  camping: Object.freeze([]),
  domestic: Object.freeze([]),
  'sudden-death': Object.freeze([
    defineDossierField('suddenDeath.deceased.surname', 'Θανών · στοιχεία ταυτότητας', 'Επώνυμο θανόντος'),
    defineDossierField('suddenDeath.deceased.givenName', 'Θανών · στοιχεία ταυτότητας', 'Όνομα θανόντος'),
    defineDossierField('suddenDeath.deceased.age', 'Θανών · στοιχεία ταυτότητας', 'Ηλικία', 'number', true, { min: 0, step: '1' }),
    defineDossierField('suddenDeath.deceased.nationalityGenitive', 'Θανών · στοιχεία ταυτότητας', 'Υπηκοότητα (γενική)'),
    defineDossierField('suddenDeath.deceased.country', 'Θανών · στοιχεία ταυτότητας', 'Χώρα καταγωγής'),
    defineDossierField('suddenDeath.deceased.residence', 'Θανών · στοιχεία ταυτότητας', 'Τόπος διαμονής'),
    defineDossierField('suddenDeath.deceased.residenceGenitive', 'Θανών · στοιχεία ταυτότητας', 'Τόπος διαμονής (γενική)'),
    defineDossierField('suddenDeath.deceased.yearsInResidence', 'Θανών · στοιχεία ταυτότητας', 'Έτη διαμονής στην περιοχή', 'number', false, { min: 0, step: '1' }),
    defineDossierField('suddenDeath.deceased.relativePhone', 'Θανών · στοιχεία ταυτότητας', 'Πιθανό τηλέφωνο συγγενών', 'text', false),
    defineDossierField('suddenDeath.deceased.healthHistory', 'Θανών · πληροφορίες προανάκρισης', 'Πληροφορίες υγείας από κατάθεση μάρτυρα', 'textarea', false, { rows: 3 }),
    defineDossierField('suddenDeath.documents.embassyDateGreek', 'Ημερομηνίες εγγράφων', 'Ημερομηνία εγγράφου προς πρεσβεία (όπως θα εμφανιστεί)'),
    defineDossierField('suddenDeath.documents.eventDateGreek', 'Ημερομηνίες εγγράφων', 'Ημερομηνία εγγράφου νοσοκομείου / μεταφοράς (όπως θα εμφανιστεί)'),
    defineDossierField('suddenDeath.documents.forensicDateGreek', 'Ημερομηνίες εγγράφων', 'Ημερομηνία ιατροδικαστικής παραγγελίας (όπως θα εμφανιστεί)'),
    defineDossierField('suddenDeath.event.date', 'Συμβάν · εντοπισμός', 'Ημερομηνία εντοπισμού / θανάτου', 'date'),
    defineDossierField('suddenDeath.event.dateGreek', 'Συμβάν · εντοπισμός', 'Ημερομηνία εξέτασης μάρτυρα (μορφή εγγράφου)'),
    defineDossierField('suddenDeath.event.discoveryTime', 'Συμβάν · εντοπισμός', 'Ώρα εντοπισμού', 'time'),
    defineDossierField('suddenDeath.event.ekabTime', 'Συμβάν · εντοπισμός', 'Ώρα διαπίστωσης από ΕΚΑΒ', 'time'),
    defineDossierField('suddenDeath.event.lastSeenLocation', 'Συμβάν · εντοπισμός', 'Σημείο τελευταίας θέασης'),
    defineDossierField('suddenDeath.interpreter.surname', 'Διερμηνέας', 'Επώνυμο διερμηνέα'),
    defineDossierField('suddenDeath.interpreter.givenName', 'Διερμηνέας', 'Όνομα διερμηνέα'),
    defineDossierField('suddenDeath.interpreter.fatherName', 'Διερμηνέας', 'Πατρώνυμο διερμηνέα'),
    defineDossierField('suddenDeath.interpreter.motherName', 'Διερμηνέας', 'Μητρώνυμο διερμηνέα'),
    defineDossierField('suddenDeath.interpreter.birthDate', 'Διερμηνέας', 'Ημερομηνία γέννησης διερμηνέα', 'date'),
    defineDossierField('suddenDeath.interpreter.idDate', 'Διερμηνέας', 'Ημερομηνία έκδοσης ταυτότητας διερμηνέα', 'date'),
    defineDossierField('suddenDeath.interpreter.idNumber', 'Διερμηνέας', 'Αριθμός ταυτότητας διερμηνέα'),
    defineDossierField('suddenDeath.interpreter.language', 'Διερμηνέας', 'Γλώσσα διερμηνείας (γενική)'),
    defineDossierField('suddenDeath.interpreter.phone', 'Διερμηνέας', 'Τηλέφωνο διερμηνέα', 'text', false),
    defineDossierField('suddenDeath.interpreter.address', 'Διερμηνέας', 'Διεύθυνση διερμηνέα', 'text', false),
    defineDossierField('suddenDeath.interpreter.city', 'Διερμηνέας', 'Πόλη κατοικίας διερμηνέα'),
    defineDossierField('suddenDeath.recipients.embassy', 'Αποδέκτες εγγράφων', 'Πρεσβεία / προξενική αρχή'),
    defineDossierField('suddenDeath.recipients.embassyEmail', 'Αποδέκτες εγγράφων', 'Email πρεσβείας / προξενικής αρχής', 'text', false),
    defineDossierField('suddenDeath.recipients.forensicCity', 'Αποδέκτες εγγράφων', 'Πόλη αρμόδιας ιατροδικαστικής υπηρεσίας'),
    defineDossierField('suddenDeath.recipients.forensicDoctorGivenName', 'Αποδέκτες εγγράφων', 'Όνομα ιατροδικαστή'),
    defineDossierField('suddenDeath.recipients.forensicDoctorSurname', 'Αποδέκτες εγγράφων', 'Επώνυμο ιατροδικαστή'),
    defineDossierField('suddenDeath.recipients.forensicService', 'Αποδέκτες εγγράφων', 'Αρμόδια ιατροδικαστική υπηρεσία'),
    defineDossierField('suddenDeath.recipients.funeralContact', 'Αποδέκτες εγγράφων', 'Υπεύθυνος γραφείου τελετών'),
    defineDossierField('suddenDeath.recipients.funeralHome', 'Αποδέκτες εγγράφων', 'Γραφείο τελετών'),
    defineDossierField('suddenDeath.recipients.hospital', 'Αποδέκτες εγγράφων', 'Νοσοκομείο / νοσηλευτική μονάδα'),
    defineDossierField('suddenDeath.references.embassyProtocol', 'Αριθμοί πρωτοκόλλου', 'Πρωτόκολλο εγγράφου πρεσβείας'),
    defineDossierField('suddenDeath.references.forensicProtocol', 'Αριθμοί πρωτοκόλλου', 'Πρωτόκολλο ιατροδικαστικής παραγγελίας'),
    defineDossierField('suddenDeath.references.hospitalProtocol', 'Αριθμοί πρωτοκόλλου', 'Πρωτόκολλο εγγράφου νοσοκομείου'),
    defineDossierField('suddenDeath.references.transportProtocol', 'Αριθμοί πρωτοκόλλου', 'Πρωτόκολλο μεταφοράς πτώματος'),
    defineDossierField('suddenDeath.service.alternatePhone', 'Υπηρεσία · πρόσθετα στοιχεία', 'Εναλλακτικό τηλέφωνο υπηρεσίας', 'text', false),
    defineDossierField('suddenDeath.service.commanderGivenName', 'Υπηρεσία · πρόσθετα στοιχεία', 'Όνομα διοικητή'),
    defineDossierField('suddenDeath.service.commanderSurname', 'Υπηρεσία · πρόσθετα στοιχεία', 'Επώνυμο διοικητή'),
    defineDossierField('suddenDeath.service.locationGenitive', 'Υπηρεσία · γραμματικοί τύποι', 'Τόπος υπηρεσίας (γενική)'),
    defineDossierField('suddenDeath.service.municipalityGenitive', 'Υπηρεσία · γραμματικοί τύποι', 'Δήμος / περιοχή υπηρεσίας (γενική)'),
    defineDossierField('suddenDeath.service.regionGenitive', 'Υπηρεσία · γραμματικοί τύποι', 'Περιφερειακή ενότητα (γενική)'),
    defineDossierField('suddenDeath.service.postalCode', 'Υπηρεσία · γραμματικοί τύποι', 'Ταχυδρομικός κώδικας υπηρεσίας'),
    defineDossierField('suddenDeath.service.locationUpper', 'Υπηρεσία · γραμματικοί τύποι', 'Τόπος υπηρεσίας (κεφαλαία)'),
    defineDossierField('suddenDeath.witness.birthDate', 'Μάρτυρας', 'Ημερομηνία γέννησης μάρτυρα', 'date'),
    defineDossierField('suddenDeath.witness.examinationEndTime', 'Μάρτυρας', 'Ώρα περάτωσης εξέτασης', 'time'),
    defineDossierField('suddenDeath.witness.examinationStartTime', 'Μάρτυρας', 'Ώρα έναρξης εξέτασης', 'time'),
    defineDossierField('suddenDeath.witness.fatherName', 'Μάρτυρας', 'Πατρώνυμο μάρτυρα'),
    defineDossierField('suddenDeath.witness.givenName', 'Μάρτυρας', 'Όνομα μάρτυρα'),
    defineDossierField('suddenDeath.witness.motherName', 'Μάρτυρας', 'Μητρώνυμο μάρτυρα'),
    defineDossierField('suddenDeath.witness.surname', 'Μάρτυρας', 'Επώνυμο μάρτυρα'),
    defineDossierField('suddenDeath.witness.residence', 'Μάρτυρας', 'Τόπος κατοικίας μάρτυρα'),
    defineDossierField('suddenDeath.witness.yearsInResidence', 'Μάρτυρας', 'Έτη διαμονής μάρτυρα στην περιοχή', 'number', false, { min: 0, step: '1' })
  ]),
  migration: Object.freeze([
    // Κατηγορούμενος / αλλοδαπός (ειδικά στοιχεία εισόδου, παραμονής και δηλώσεων)
    defineDossierField('migration.offender.entryPoint', 'Κατηγορούμενος · είσοδος & παραμονή', 'Σημείο παράνομης εισόδου στη Χώρα'),
    defineDossierField('migration.offender.stayDuration', 'Κατηγορούμενος · είσοδος & παραμονή', 'Χρόνος παραμονής στη Χώρα (κατά δήλωσή του)'),
    defineDossierField('migration.offender.rightsResponse', 'Κατηγορούμενος · δηλώσεις', 'Δήλωση χρήσης δικαιωμάτων', 'textarea', true, { rows: 2 }),
    defineDossierField('migration.offender.previousHistory', 'Κατηγορούμενος · δηλώσεις', 'Προηγούμενο ποινικό ιστορικό / απάντηση'),
    defineDossierField('migration.offender.statement', 'Κατηγορούμενος · δηλώσεις', 'Απολογία / δήλωση κατηγορουμένου', 'textarea', true, { rows: 4 }),

    // Διερμηνέας
    defineDossierField('migration.interpreter.surname', 'Διερμηνέας', 'Επώνυμο διερμηνέα'),
    defineDossierField('migration.interpreter.name', 'Διερμηνέας', 'Όνομα διερμηνέα'),
    defineDossierField('migration.interpreter.fatherName', 'Διερμηνέας', 'Πατρώνυμο διερμηνέα'),
    defineDossierField('migration.interpreter.motherName', 'Διερμηνέας', 'Μητρώνυμο διερμηνέα'),
    defineDossierField('migration.interpreter.birthDate', 'Διερμηνέας', 'Ημερομηνία γέννησης διερμηνέα', 'date'),
    defineDossierField('migration.interpreter.birthPlace', 'Διερμηνέας', 'Τόπος γέννησης διερμηνέα'),
    defineDossierField('migration.interpreter.city', 'Διερμηνέας', 'Τόπος κατοικίας διερμηνέα'),
    defineDossierField('migration.interpreter.idNumber', 'Διερμηνέας', 'Αριθμός διαβατηρίου / ταυτότητας διερμηνέα'),
    defineDossierField('migration.interpreter.idDate', 'Διερμηνέας', 'Ημερομηνία έκδοσης διαβατηρίου διερμηνέα', 'date'),
    defineDossierField('migration.interpreter.idService', 'Διερμηνέας', 'Αρχή έκδοσης διαβατηρίου διερμηνέα'),
    defineDossierField('migration.interpreter.nationality', 'Διερμηνέας', 'Υπηκοότητα διερμηνέα'),
    defineDossierField('migration.interpreter.profession', 'Διερμηνέας', 'Επάγγελμα διερμηνέα'),
    defineDossierField('migration.interpreter.language', 'Διερμηνέας', 'Γλώσσα διερμηνείας'),

    // Αστυνομικός μάρτυρας
    defineDossierField('migration.policeWitness.fullName', 'Αστυνομικός μάρτυρας', 'Ονοματεπώνυμο αστυνομικού μάρτυρα'),
    defineDossierField('migration.policeWitness.fatherNameGenitive', 'Αστυνομικός μάρτυρας', 'Πατρώνυμο (γενική)'),
    defineDossierField('migration.policeWitness.motherNameGenitive', 'Αστυνομικός μάρτυρας', 'Μητρώνυμο (γενική)'),
    defineDossierField('migration.policeWitness.birthDate', 'Αστυνομικός μάρτυρας', 'Ημερομηνία γέννησης', 'date'),
    defineDossierField('migration.policeWitness.birthPlace', 'Αστυνομικός μάρτυρας', 'Τόπος γέννησης'),
    defineDossierField('migration.policeWitness.residence', 'Αστυνομικός μάρτυρας', 'Τόπος κατοικίας'),
    defineDossierField('migration.policeWitness.idNumber', 'Αστυνομικός μάρτυρας', 'Αριθμός δελτίου ταυτότητας'),
    defineDossierField('migration.policeWitness.idYear', 'Αστυνομικός μάρτυρας', 'Έτος έκδοσης ταυτότητας'),
    defineDossierField('migration.policeWitness.idService', 'Αστυνομικός μάρτυρας', 'Αρχή έκδοσης ταυτότητας'),
    defineDossierField('migration.policeWitness.profession', 'Αστυνομικός μάρτυρας', 'Επάγγελμα / ιδιότητα'),
    defineDossierField('migration.policeWitness.religion', 'Αστυνομικός μάρτυρας', 'Θρήσκευμα'),
    defineDossierField('migration.policeWitness.rank', 'Αστυνομικός μάρτυρας', 'Βαθμός'),
    defineDossierField('migration.policeWitness.unit', 'Αστυνομικός μάρτυρας', 'Υπηρεσία / ομάδα περιπολίας'),
    defineDossierField('migration.policeWitness.dutyStartTime', 'Αστυνομικός μάρτυρας', 'Ώρα έναρξης υπηρεσίας', 'time'),
    defineDossierField('migration.policeWitness.dutyEndTime', 'Αστυνομικός μάρτυρας', 'Ώρα λήξης υπηρεσίας', 'time'),
    defineDossierField('migration.policeWitness.patrolArea', 'Αστυνομικός μάρτυρας', 'Περιοχή εκτέλεσης περιπολίας'),

    // Συλλαβών αστυνομικός
    defineDossierField('migration.arrestingOfficer.rank', 'Συλλαβών αστυνομικός', 'Βαθμός συλλαβόντος'),
    defineDossierField('migration.arrestingOfficer.fullName', 'Συλλαβών αστυνομικός', 'Ονοματεπώνυμο συλλαβόντος'),
    defineDossierField('migration.arrestingOfficer.unit', 'Συλλαβών αστυνομικός', 'Υπηρεσία / ομάδα συλλαβόντος'),

    // Διοικητική διαδικασία & Εισαγγελία
    defineDossierField('migration.prosecutor.title', 'Εισαγγελική αρχή & εντολή', 'Εισαγγελική αρχή / δικαστικός λειτουργός'),
    defineDossierField('migration.case.releaseDate', 'Εισαγγελική αρχή & εντολή', 'Ημερομηνία προφορικής εντολής απόλυσης', 'date'),
    defineDossierField('migration.case.releaseTime', 'Εισαγγελική αρχή & εντολή', 'Ώρα προφορικής εντολής απόλυσης', 'time'),
    defineDossierField('migration.case.destinationKyt', 'Διοικητική διαδικασία επιστροφής / ασύλου', 'Δομή / Κ.Υ.Τ. προορισμού καταγραφής'),
    defineDossierField('migration.case.geeDocumentProtocol', 'Διοικητική διαδικασία επιστροφής / ασύλου', 'Αριθμός εγγράφου Γ.Ε.Ε.'),
    defineDossierField('migration.case.handlingOfficer', 'Διοικητική διαδικασία επιστροφής / ασύλου', 'Αρμόδιος χειριστής εγγράφου'),
    defineDossierField('migration.recipients.policeDirectorateGaa', 'Αποδέκτες εγγράφων', 'Υπηρεσία αποδέκτης (π.χ. Δ.Α. / Γ.Α.Α.)'),
    defineDossierField('migration.recipients.prosecution', 'Αποδέκτες εγγράφων', 'Εισαγγελία αποδέκτης υποβολής')
  ]),
  violence: Object.freeze([
    defineDossierField('violence.accused.birthDate', 'Κατηγορούμενος', 'Ημερομηνία γέννησης κατηγορουμένου', 'date', false),
    defineDossierField('violence.accused.birthPlace', 'Κατηγορούμενος', 'Τόπος γέννησης κατηγορουμένου', 'text', false),
    defineDossierField('violence.accused.fatherName', 'Κατηγορούμενος', 'Πατρώνυμο κατηγορουμένου', 'text', false),
    defineDossierField('violence.accused.fatherNameUpper', 'Κατηγορούμενος', 'Πατρώνυμο κατηγορουμένου (κεφαλαία)', 'text', false),
    defineDossierField('violence.accused.fullNameGenitive', 'Κατηγορούμενος', 'Ονοματεπώνυμο κατηγορουμένου (γενική)', 'text', false),
    defineDossierField('violence.accused.givenNameUpper', 'Κατηγορούμενος', 'Όνομα κατηγορουμένου (κεφαλαία)', 'text', false),
    defineDossierField('violence.accused.idDate', 'Κατηγορούμενος', 'Ημερομηνία έκδοσης ταυτότητας', 'date', false),
    defineDossierField('violence.accused.idNumber', 'Κατηγορούμενος', 'Αριθμός ταυτότητας κατηγορουμένου', 'text', false),
    defineDossierField('violence.accused.idService', 'Κατηγορούμενος', 'Αρχή έκδοσης ταυτότητας', 'text', false),
    defineDossierField('violence.accused.motherName', 'Κατηγορούμενος', 'Μητρώνυμο κατηγορουμένου', 'text', false),
    defineDossierField('violence.accused.motherNameGenitive', 'Κατηγορούμενος', 'Μητρώνυμο κατηγορουμένου (γενική)', 'text', false),
    defineDossierField('violence.accused.phone', 'Κατηγορούμενος', 'Τηλέφωνο κατηγορουμένου', 'text', false),
    defineDossierField('violence.accused.profession', 'Κατηγορούμενος', 'Επάγγελμα κατηγορουμένου', 'text', false),
    defineDossierField('violence.accused.residenceLocality', 'Κατηγορούμενος', 'Τόπος κατοικίας κατηγορουμένου (όπως στο συγκεκριμένο έγγραφο)', 'text', false),
    defineDossierField('violence.accused.surname', 'Κατηγορούμενος', 'Επώνυμο κατηγορουμένου', 'text', false),
    defineDossierField('violence.accused.taxId', 'Κατηγορούμενος', 'Α.Φ.Μ. κατηγορουμένου', 'text', false),
    defineDossierField('violence.accused.taxOffice', 'Κατηγορούμενος', 'Δ.Ο.Υ. κατηγορουμένου', 'text', false),
    defineDossierField('violence.duty.previousDateGreek', 'Υπηρεσία / λοιπά στοιχεία', 'Προηγούμενη ημερομηνία υπηρεσίας', 'date', false),
    defineDossierField('violence.investigators.accusedExaminerSurname', 'Ανακριτικοί υπάλληλοι — ανά έγγραφο', 'Επώνυμο ανακριτικού υπαλλήλου στην εξέταση κατηγορουμένου', 'text', false),
    defineDossierField('violence.investigators.witnessAExaminerGivenName', 'Ανακριτικοί υπάλληλοι — ανά έγγραφο', 'Όνομα ανακριτικού υπαλλήλου στην κατάθεση Α', 'text', false),
    defineDossierField('violence.investigators.witnessAExaminerGivenNameGenitive', 'Ανακριτικοί υπάλληλοι — ανά έγγραφο', 'Όνομα ανακριτικού υπαλλήλου (γενική) στην κατάθεση Α', 'text', false),
    defineDossierField('violence.investigators.witnessAExaminerSurname', 'Ανακριτικοί υπάλληλοι — ανά έγγραφο', 'Επώνυμο ανακριτικού υπαλλήλου στην κατάθεση Α', 'text', false),
    defineDossierField('violence.investigators.witnessAExaminerSurnameUpper', 'Ανακριτικοί υπάλληλοι — ανά έγγραφο', 'Επώνυμο ανακριτικού υπαλλήλου (κεφαλαία) στην κατάθεση Α', 'text', false),
    defineDossierField('violence.investigators.witnessBExaminerGivenNameGenitive', 'Ανακριτικοί υπάλληλοι — ανά έγγραφο', 'Όνομα ανακριτικού υπαλλήλου (γενική) στην κατάθεση Β', 'text', false),
    defineDossierField('violence.investigators.witnessBExaminerSurnameUpper', 'Ανακριτικοί υπάλληλοι — ανά έγγραφο', 'Επώνυμο ανακριτικού υπαλλήλου (κεφαλαία) στην κατάθεση Β', 'text', false),
    defineDossierField('violence.vehicle.make', 'Όχημα', 'Μάρκα οχήματος', 'text', false),
    defineDossierField('violence.vehicle.registration', 'Όχημα', 'Αριθμός κυκλοφορίας οχήματος', 'text', false),
    defineDossierField('violence.witness.birthPlace', 'Υπηρεσία / λοιπά στοιχεία', 'Τόπος γέννησης αστυνομικού μάρτυρα', 'text', false),
    defineDossierField('violence.witnessA.birthDate', 'Αστυνομικός μάρτυρας Α', 'Ημερομηνία γέννησης αστυνομικού μάρτυρα Α', 'date', false),
    defineDossierField('violence.witnessA.fatherNameGenitive', 'Αστυνομικός μάρτυρας Α', 'Πατρώνυμο αστυνομικού μάρτυρα Α (γενική)', 'text', false),
    defineDossierField('violence.witnessA.givenName', 'Αστυνομικός μάρτυρας Α', 'Όνομα αστυνομικού μάρτυρα Α', 'text', false),
    defineDossierField('violence.witnessA.idNumber', 'Αστυνομικός μάρτυρας Α', 'Αριθμός ταυτότητας αστυνομικού μάρτυρα Α', 'text', false),
    defineDossierField('violence.witnessA.motherNameGenitive', 'Αστυνομικός μάρτυρας Α', 'Μητρώνυμο αστυνομικού μάρτυρα Α (γενική)', 'text', false),
    defineDossierField('violence.witnessA.surname', 'Αστυνομικός μάρτυρας Α', 'Επώνυμο αστυνομικού μάρτυρα Α', 'text', false),
    defineDossierField('violence.witnessB.birthDate', 'Αστυνομικός μάρτυρας Β', 'Ημερομηνία γέννησης αστυνομικού μάρτυρα Β', 'date', false),
    defineDossierField('violence.witnessB.fatherNameGenitive', 'Αστυνομικός μάρτυρας Β', 'Πατρώνυμο αστυνομικού μάρτυρα Β (γενική)', 'text', false),
    defineDossierField('violence.witnessB.givenName', 'Αστυνομικός μάρτυρας Β', 'Όνομα αστυνομικού μάρτυρα Β', 'text', false),
    defineDossierField('violence.witnessB.idNumber', 'Αστυνομικός μάρτυρας Β', 'Αριθμός ταυτότητας αστυνομικού μάρτυρα Β', 'text', false),
    defineDossierField('violence.witnessB.motherNameGenitive', 'Αστυνομικός μάρτυρας Β', 'Μητρώνυμο αστυνομικού μάρτυρα Β (γενική)', 'text', false),
    defineDossierField('violence.witnessB.surname', 'Αστυνομικός μάρτυρας Β', 'Επώνυμο αστυνομικού μάρτυρα Β', 'text', false),
    defineDossierField('violence.service.areaGenitive', 'Στοιχεία υπηρεσίας', 'Περιοχή υπηρεσίας (γενική)', 'text', false),
    defineDossierField('violence.service.directorateGenitive', 'Στοιχεία υπηρεσίας', 'Διεύθυνση Αστυνομίας (γενική)', 'text', false)
  ]),
  traffic: Object.freeze([]),
  kok: Object.freeze([
    Object.freeze({
      path: 'kok.vehicle.registration',
      group: 'Στοιχεία οχήματος',
      label: 'Αριθμός κυκλοφορίας οχήματος',
      type: 'text',
      maxLength: 20,
      placeholder: 'π.χ. ΚΥΑ 1234',
      helpText: 'Καταχώρισε τον αριθμό ακριβώς όπως αναγράφεται στην πινακίδα. Το πεδίο είναι προαιρετικό και διατηρεί αρχικά μηδενικά.',
      required: false,
      role: 'vehicle',
      cardinality: 'single'
    })
  ]),
  animal: Object.freeze([]),
  commerce: Object.freeze([]),
  generic: Object.freeze([])
});

// Dormant repeatable-entity support. No controls are rendered while enabled=false.
// These collections remain separate from legacy single-offender and single-vehicle
// fields until real multi-person DOCX examples define their semantics.
export const DOSSIER_REPEATABLE_GROUPS = Object.freeze({
  offenders: Object.freeze({
    path: 'entities.offenders',
    label: 'Δράστες / εμπλεκόμενα πρόσωπα',
    role: 'offender',
    cardinality: 'many',
    enabled: false,
    minItems: 1,
    maxItems: null
  }),
  vehicles: Object.freeze({
    path: 'entities.vehicles',
    label: 'Οχήματα',
    role: 'vehicle',
    cardinality: 'many',
    enabled: false,
    minItems: 0,
    maxItems: null
  })
});

export function getRepeatableGroupDefinition(groupId) {
  const definition = DOSSIER_REPEATABLE_GROUPS[groupId];
  return definition ? { ...definition } : null;
}

export function appendRepeatableEntry(data, groupId, entry) {
  const definition = DOSSIER_REPEATABLE_GROUPS[groupId];
  if (!definition) throw new TypeError('Άγνωστη ομάδα επαναλαμβανόμενων στοιχείων.');
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new TypeError('Η εγγραφή πρέπει να είναι αντικείμενο.');
  }
  const current = getDossierFieldValue(data, definition.path);
  if (current !== '' && !Array.isArray(current)) {
    throw new TypeError('Η αποθηκευμένη ομάδα δεν είναι έγκυρη λίστα.');
  }
  const entries = Array.isArray(current) ? current.slice() : [];
  entries.push(JSON.parse(JSON.stringify(entry)));
  setDossierFieldValue(data, definition.path, entries);
  return entries.length;
}

export function getDossierFieldDefinitions(category) {
  return (DOSSIER_CATEGORY_FIELDS[category] || []).map((field) => ({ ...field }));
}

export function getDossierFieldValue(data, path) {
  if (!data || typeof data !== 'object' || typeof path !== 'string') return '';
  return path.split('.').reduce((value, key) => (
    value && typeof value === 'object' ? value[key] : undefined
  ), data) ?? '';
}

export function setDossierFieldValue(data, path, value) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new TypeError('Τα δεδομένα πεδίων πρέπει να είναι αντικείμενο.');
  }
  if (typeof path !== 'string' || !path.trim()) {
    throw new TypeError('Απαιτείται έγκυρη διαδρομή πεδίου.');
  }
  const parts = path.split('.');
  if (parts.some((part) => !part || ['__proto__', 'prototype', 'constructor'].includes(part))) {
    throw new TypeError('Μη επιτρεπτή διαδρομή πεδίου.');
  }
  let target = data;
  parts.slice(0, -1).forEach((part) => {
    if (!target[part] || typeof target[part] !== 'object' || Array.isArray(target[part])) {
      target[part] = {};
    }
    target = target[part];
  });
  const storedValue = value && typeof value === 'object'
    ? JSON.parse(JSON.stringify(value))
    : String(value ?? '');
  target[parts[parts.length - 1]] = storedValue;
  return data;
}
