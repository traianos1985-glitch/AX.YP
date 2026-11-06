// Συντηρητικός έλεγχος καταχώρισης ανά κατηγορία δικογραφίας.
// Οι λίστες είναι βοηθητικές υπενθυμίσεις, όχι νομικές προϋποθέσεις.
export const DOSSIER_COMPLETENESS_RULES = {
  narcotics: { label: 'Ναρκωτικά', guidance: 'Έλεγξε τα στοιχεία ταυτοποίησης, το περιστατικό, τα ευρήματα και τους πραγματικούς χρόνους ενεργειών.', groups: [
    { label: 'Περιστατικό', fields: [['case-location','Τόπος'],['case-incident-date','Ημερομηνία περιστατικού'],['case-incident-time','Ώρα περιστατικού']] },
    { label: 'Εμπλεκόμενο πρόσωπο', fields: [['offender-surname','Επώνυμο'],['offender-name','Όνομα'],['offender-id-number','Αριθμός ταυτότητας']] },
    { label: 'Ενέργειες / ευρήματα', fields: [['case-evidence','Ευρήματα / ποσότητες'],['timeline-witness-start','Έναρξη εξέτασης μάρτυρα'],['timeline-arrest-start','Έναρξη έκθεσης σύλληψης'],['timeline-seizure-start','Έναρξη κατάσχεσης'],['timeline-weighing-start','Έναρξη ζύγισης']] }
  ] },
  counterfeit: { label: 'Πλαστά νομίσματα', guidance: 'Έλεγξε την περιγραφή και τα στοιχεία του νομίσματος, το πρόσωπο που το παρέδωσε, τον μάρτυρα και τους πραγματικούς χρόνους.', groups: [
    { label: 'Νόμισμα / περιστατικό', fields: [['case-location','Τόπος'],['case-incident-date','Ημερομηνία περιστατικού'],['counterfeit-serial-number','Σειριακός αριθμός / αναγνωριστικό']] },
    { label: 'Πρόσωπο που παρέδωσε το νόμισμα', fields: [['offender-surname','Επώνυμο'],['offender-name','Όνομα'],['offender-id-number','Αριθμός ταυτότητας']] },
    { label: 'Μάρτυρας και κατάσχεση', fields: [['counterfeit-witness-surname','Επώνυμο μάρτυρα'],['counterfeit-witness-name','Όνομα μάρτυρα'],['counterfeit-witness-id-number','Ταυτότητα μάρτυρα'],['counterfeit-witness-start','Έναρξη εξέτασης μάρτυρα'],['counterfeit-seizure-start','Έναρξη παράδοσης / κατάσχεσης']] }
  ] },
  environment: { label: 'Ρύπανση περιβάλλοντος', guidance: 'Έλεγξε την περιγραφή του περιστατικού, την τεκμηρίωση, τον τόπο, τα στοιχεία του εμπλεκομένου και τις ώρες των ενεργειών.', groups: [
    { label: 'Περιστατικό / τεκμηρίωση', fields: [['case-location','Τόπος'],['environment-description','Περιγραφή περιστατικού'],['environment-documentation','Τεκμηρίωση / σχετικά έγγραφα']] },
    { label: 'Εμπλεκόμενο πρόσωπο', fields: [['offender-surname','Επώνυμο'],['offender-name','Όνομα'],['offender-id-number','Αριθμός ταυτότητας']] },
    { label: 'Χρόνοι ενεργειών', fields: [['environment-arrest-start','Έναρξη έκθεσης σύλληψης'],['environment-examination-start','Έναρξη εξέτασης']] }
  ] },
  health: { label: 'Υγειονομικός κανονισμός', guidance: 'Έλεγξε την περιγραφή του υγειονομικού περιστατικού, την ταυτοποίηση και τα πραγματικά στοιχεία των ενεργειών.', groups: [
    { label: 'Περιστατικό', fields: [['case-location','Τόπος'],['health-description','Περιγραφή υγειονομικού περιστατικού']] },
    { label: 'Εμπλεκόμενο πρόσωπο', fields: [['offender-surname','Επώνυμο'],['offender-name','Όνομα'],['offender-id-number','Αριθμός ταυτότητας']] },
    { label: 'Χρόνοι ενεργειών', fields: [['health-arrest-start','Έναρξη έκθεσης σύλληψης'],['health-examination-start','Έναρξη εξέτασης']] }
  ] },
  noise: { label: 'Ηχορύπανση από Κ.Υ.Ε.', guidance: 'Έλεγξε τα στοιχεία του καταστήματος, τις μετρήσεις και τα στοιχεία του υπευθύνου. Η ορθότητα των μετρήσεων και της εφαρμοστέας διάταξης απαιτεί αυτοτελή επαλήθευση.', groups: [
    { label: 'Κατάστημα / μέτρηση', fields: [['noise-establishment-name','Επωνυμία καταστήματος'],['noise-description','Περιγραφή'],['noise-measured-decibels','Μετρηθείσα ηχητική ένταση'],['noise-limit-decibels','Όριο αναφοράς'],['noise-legal-provision','Νομική διάταξη προς επαλήθευση'],['noise-regulation-number','Αριθμός κανονιστικής πράξης']] },
    { label: 'Υπεύθυνος καταστήματος', fields: [['noise-owner-full-name','Ονοματεπώνυμο υπευθύνου'],['noise-owner-id-number','Αριθμός ταυτότητας']] }
  ] },
  camping: { label: 'Παράνομο camping', guidance: 'Έλεγξε την πραγματική περιγραφή της πράξης, τον τόπο, τα οχήματα / αντικείμενα και τυχόν στοιχεία διερμηνείας. Η νομική διάταξη χρειάζεται αυτοτελή επαλήθευση.', groups: [
    { label: 'Περιστατικό / τόπος', fields: [['camping-location','Τόπος'],['camping-act-description','Περιγραφή πράξης'],['camping-act-qualifier','Ειδικότερα χαρακτηριστικά πράξης'],['camping-legal-provision','Διάταξη προς επαλήθευση']] },
    { label: 'Κατασκήνωση / οχήματα', fields: [['camping-outdoor-items','Εξωτερικά αντικείμενα'],['camping-no-designated-site','Στοιχεία μη ύπαρξης καθορισμένου χώρου'],['camping-vehicle-type','Τύπος οχήματος'],['camping-vehicle-registration','Αριθμός κυκλοφορίας']] },
    { label: 'Πρόσωπο / διερμηνεία', fields: [['offender-surname','Επώνυμο εμπλεκομένου'],['offender-name','Όνομα εμπλεκομένου'],['camping-interpreter-full-name','Ονοματεπώνυμο διερμηνέα'],['camping-interpreter-language','Γλώσσα διερμηνείας']] }
  ] },
  commerce: { label: 'Παρεμπόριο', guidance: 'Έλεγξε χωριστά τα στοιχεία κάθε εμπλεκομένου και την καταγραφή των αντικειμένων / εμπορευμάτων.', groups: [
    { label: 'Πρώτο εμπλεκόμενο πρόσωπο', fields: [['commerce-offender-a-full-name','Ονοματεπώνυμο'],['commerce-offender-a-id','Αριθμός ταυτότητας'],['commerce-offender-a-address','Διεύθυνση']] },
    { label: 'Δεύτερο εμπλεκόμενο πρόσωπο', fields: [['commerce-offender-b-full-name','Ονοματεπώνυμο'],['commerce-offender-b-id','Αριθμός ταυτότητας'],['commerce-offender-b-address','Διεύθυνση']] },
    { label: 'Εμπορεύματα / ευρήματα', fields: [['case-location','Τόπος'],['case-evidence','Περιγραφή / ποσότητα ευρημάτων']] }
  ] }
};

const GENERIC_LABELS = {
  domestic: 'Ενδοοικογενειακή βία',
  migration: 'Απελάσεις αλλοδαπών',
  traffic: 'Τροχαία ατυχήματα',
  kok: 'Παραβάσεις Κ.Ο.Κ.',
  animal: 'Προστασία ζώων',
  generic: 'Λοιπές υποθέσεις'
};

export function evaluateDossierCompleteness(profile, values = {}, readField = () => '') {
  const known = DOSSIER_COMPLETENESS_RULES[profile];
  const categoryLabel = known ? known.label : (GENERIC_LABELS[profile] || 'Λοιπές υποθέσεις');
  const groups = (known ? known.groups : []).map((group) => {
    const fields = group.fields.map(([id, label]) => ({ id, label, filled: String(readField(id) ?? '').trim().length > 0 }));
    return {
      label: group.label,
      total: fields.length,
      filled: fields.filter((field) => field.filled).length,
      missing: fields.filter((field) => !field.filled)
    };
  });
  const register = {
    persons: Math.max(0, Number(values.register?.persons) || 0),
    evidence: Math.max(0, Number(values.register?.evidence) || 0),
    actions: Math.max(0, Number(values.register?.actions) || 0)
  };
  const guidance = known
    ? known.guidance
    : 'Η κατηγορία δεν διαθέτει ακόμη ειδικό δομημένο checklist. Χρησιμοποίησε το μητρώο προσώπων, πειστηρίων και ενεργειών και επαλήθευσε τα απαιτούμενα έγγραφα με βάση την πραγματική υπόθεση.';
  return { profile, categoryLabel, guidance, groups, register, hasCategoryChecklist: Boolean(known) };
}
