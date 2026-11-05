import { zipSync } from './vendor/fflate.js';

const escXml = (value) => String(value).replace(/[<&>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));
const toBase64 = (bytes) => { let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary); };
const docx = (title, sections) => {
  const paragraphs = [title, 'ΠΡΟΣΟΧΗ: Το παρόν είναι ανωνυμοποιημένο πρότυπο. Συμπλήρωσε τα πεδία της συγκεκριμένης δικογραφίας και έλεγξε την ισχύουσα νομοθεσία πριν από κάθε χρήση.', ...sections];
  const body = paragraphs.map((text, index) => `<w:p><w:pPr>${index === 0 ? '<w:pStyle w:val="Title"/>' : ''}</w:pPr><w:r><w:t xml:space="preserve">${escXml(text)}</w:t></w:r></w:p>`).join('');
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`
  };
  const bytes = zipSync(Object.fromEntries(Object.entries(files).map(([name, value]) => [name, new TextEncoder().encode(value)])));
  return { dataBase64: toBase64(bytes), size: bytes.length };
};

const commonFields = ['case.title','case.protocolNumber','case.date','case.time','case.location','case.prosecutor','case.offence','case.notes','officerA.fullName','officerA.service','officerB.fullName','officerB.service','offenderA.fullName','offenderA.idNumber','offenderA.address','offenderB.fullName','offenderB.idNumber','offenderB.address','evidence.quantity','timeline.arrest.startTime','timeline.arrest.endTime'];
const mappings = Object.fromEntries(commonFields.map((field) => [field, field]));
const make = (id, name, title, sections) => ({ id, name, category: 'commerce', categoryLabel: 'Παρεμπόριο', fields: commonFields, mappings, mappingConfirmedAt: '2026-11-05T00:00:00.000Z', builtin: true, ...docx(title, sections) });

export const DEFAULT_COMMERCE_TEMPLATES = [
  make('commerce-01','01_ΕΚΘΕΣΗ_ΣΥΛΛΗΨΗΣ_ΔΡΑΣΤΗ_Α.docx','Έκθεση σύλληψης — Δράστης Α', ['Αριθμός πρωτοκόλλου: {{case.protocolNumber}}','Τόπος και χρόνος: {{case.location}}, {{case.date}} {{case.time}}','Στοιχεία Δράστη Α: {{offenderA.fullName}} · Α.Δ.Τ.: {{offenderA.idNumber}} · Διεύθυνση: {{offenderA.address}}','Η σύλληψη έγινε για την ερευνώμενη πράξη, με τήρηση των νόμιμων εγγυήσεων και ενημέρωση για τα δικαιώματα του συλληφθέντος.','Συλλαβών: {{case.arrestingOfficer}}']),
  make('commerce-02','02_ΕΚΘΕΣΗ_ΣΥΛΛΗΨΗΣ_ΔΡΑΣΤΗ_Β.docx','Έκθεση σύλληψης — Δράστης Β', ['Αριθμός πρωτοκόλλου: {{case.protocolNumber}}','Στοιχεία Δράστη Β: {{offenderB.fullName}} · Α.Δ.Τ.: {{offenderB.idNumber}} · Διεύθυνση: {{offenderB.address}}','Η σύλληψη και η εξατομικευμένη αποτύπωση των πραγματικών περιστατικών καταχωρίζονται χωριστά από τη δικογραφία του Δράστη Α.']),
  make('commerce-03','03_ΕΚΘΕΣΗ_ΚΑΤΑΣΧΕΣΗΣ_ΠΑΡΕΜΠΟΡΙΟΥ.docx','Έκθεση κατάσχεσης αντικειμένων παρεμπορίου', ['Αριθμός πρωτοκόλλου: {{case.protocolNumber}}','Περιγραφή και ποσότητα κατασχεθέντων: {{evidence.quantity}}','Τα αντικείμενα περιγράφονται αναλυτικά, φωτογραφίζονται/σημαίνονται όπου απαιτείται και παραδίδονται σύμφωνα με την προβλεπόμενη διαδικασία.']),
  make('commerce-04','04_ΕΚΘΕΣΗ_ΒΕΒΑΙΩΣΗΣ_ΠΑΡΑΒΑΣΗΣ.docx','Έκθεση βεβαίωσης παράβασης', ['Νομικός χαρακτηρισμός / παρατήρηση: {{case.offence}}','Πραγματικά περιστατικά: {{case.notes}}','Η βεβαίωση συντάσσεται με σαφή διαχωρισμό των πράξεων και των αποδιδόμενων περιστατικών για κάθε πρόσωπο.']),
  make('commerce-05','05_ΔΕΛΤΙΟ_ΣΤΟΙΧΕΙΩΝ_ΔΡΑΣΤΗ_Α.docx','Δελτίο στοιχείων — Δράστης Α', ['Στοιχεία προσώπου: {{offenderA.fullName}}','Αριθμός ταυτότητας: {{offenderA.idNumber}}','Διεύθυνση: {{offenderA.address}}']),
  make('commerce-06','06_ΔΕΛΤΙΟ_ΣΤΟΙΧΕΙΩΝ_ΔΡΑΣΤΗ_Β.docx','Δελτίο στοιχείων — Δράστης Β', ['Στοιχεία προσώπου: {{offenderB.fullName}}','Αριθμός ταυτότητας: {{offenderB.idNumber}}','Διεύθυνση: {{offenderB.address}}']),
  make('commerce-07','07_ΑΠΟΛΟΓΙΑ_ΔΡΑΣΤΗ_Α.docx','Απολογία — Δράστης Α', ['Στοιχεία απολογούμενου: {{offenderA.fullName}} · Α.Δ.Τ.: {{offenderA.idNumber}} · Διεύθυνση: {{offenderA.address}}','Ο απολογούμενος ενημερώθηκε για την αποδιδόμενη πράξη και τα δικαιώματά του.','Δήλωση / απολογία: {{case.notes}}']),
  make('commerce-08','08_ΑΠΟΛΟΓΙΑ_ΔΡΑΣΤΗ_Β.docx','Απολογία — Δράστης Β', ['Στοιχεία απολογούμενου: {{offenderB.fullName}} · Α.Δ.Τ.: {{offenderB.idNumber}} · Διεύθυνση: {{offenderB.address}}','Ο απολογούμενος ενημερώθηκε αυτοτελώς για την αποδιδόμενη πράξη και τα δικαιώματά του.','Δήλωση / απολογία: {{case.notes}}'])
];
