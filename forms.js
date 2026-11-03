// Κατάλογος πηγών εντύπων. Δεν αντιγράφεται το πρωτότυπο αρχείο· κάθε εγγραφή
// συνδέεται με την αρχική σελίδα και περιγράφει τα πεδία της μελλοντικής φόρμας.
const FORMS_DATA = {
  source: "https://proanakrisi.gr/",
  updated: "2026-11-03",
  commonFields: [
    { id: "personName", label: "Ονοματεπώνυμο", type: "text", sensitive: true },
    { id: "fatherName", label: "Πατρώνυμο", type: "text", sensitive: true },
    { id: "idNumber", label: "Αριθμός ταυτότητας", type: "text", sensitive: true },
    { id: "address", label: "Διεύθυνση", type: "text", sensitive: true },
    { id: "incidentDate", label: "Ημερομηνία περιστατικού", type: "date" },
    { id: "incidentTime", label: "Ώρα περιστατικού", type: "time" },
    { id: "location", label: "Τόπος περιστατικού", type: "text" },
    { id: "service", label: "Υπηρεσία / Τμήμα", type: "text" },
    { id: "officer", label: "Συντάκτης / υπάλληλος", type: "text" }
  ],
  categories: [
    { id: "series-d", title: "Έντυπα – Υποδείγματα Σειράς Δ΄", description: "Υποδείγματα που εμφανίζονται στη σχετική ενότητα του site.", countLabel: "100+ υποδείγματα", source: "https://proanakrisi.gr/", fields: ["personName", "incidentDate", "incidentTime", "location", "service", "officer"] },
    { id: "preliminary", title: "Έντυπα προανάκρισης", description: "Βασικός κορμός για εκθέσεις, καταθέσεις, βεβαιώσεις και διαβιβάσεις.", countLabel: "Συλλογή εντύπων", source: "https://proanakrisi.gr/", fields: ["personName", "fatherName", "idNumber", "incidentDate", "location", "service", "officer"] },
    { id: "security-bodies", title: "Σώματα ασφαλείας", description: "Έντυπα και υποδείγματα ανά υπηρεσιακό σώμα και αρμοδιότητα.", countLabel: "Θεματική συλλογή", source: "https://proanakrisi.gr/", fields: ["personName", "idNumber", "incidentDate", "service", "officer"] },
    { id: "cooperation", title: "Συνεργασία υπηρεσιών", description: "Έγγραφα επικοινωνίας, αιτήματα, διαβιβαστικά και απαντήσεις.", countLabel: "Θεματική συλλογή", source: "https://proanakrisi.gr/", fields: ["personName", "incidentDate", "service", "officer"] },
    { id: "used-forms", title: "Χρησιμοποιούμενα έντυπα", description: "Συχνά χρησιμοποιούμενα υπηρεσιακά έντυπα για γρήγορη πρόσβαση.", countLabel: "Θεματική συλλογή", source: "https://proanakrisi.gr/", fields: ["personName", "incidentDate", "location", "service"] },
    { id: "ede", title: "Ένορκη διοικητική εξέταση", description: "Υποδείγματα και βασικά στάδια για ΕΔΕ, με δυνατότητα κοινών στοιχείων.", countLabel: "Θεματική συλλογή", source: "https://proanakrisi.gr/", fields: ["personName", "fatherName", "incidentDate", "location", "service", "officer"] }
  ]
};
