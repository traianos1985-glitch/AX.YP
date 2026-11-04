// Ασφάλεια και ιδιωτικότητα: κοινόχρηστη λειτουργία σε υπηρεσιακό υπολογιστή χωρίς κλείδωμα PIN.
// Όλοι οι αστυνομικοί έχουν άμεση πρόσβαση στις υποθέσεις της υπηρεσίας.
(function () {
  var lock = document.getElementById('lock-screen');
  if (lock) {
    lock.hidden = true;
    lock.style.display = 'none';
  }

  // Ασφαλής διαγραφή τοπικών δεδομένων εφόσον ζητηθεί με ρητή επιβεβαίωση
  window.AXYP_SECURITY = {
    clearAllData: function () {
      if (window.confirm('ΠΡΟΣΟΧΗ: Θα διαγραφούν οριστικά όλες οι αποθηκευμένες υποθέσεις, πρότυπα και ρυθμίσεις από αυτή τη συσκευή.\n\nΕίσαι βέβαιος;')) {
        if (window.confirm('Τελική επιβεβαίωση: Επιβεβαιώνεις τη διαγραφή όλων των τοπικών στοιχείων;')) {
          if (window.AXYP_STORAGE) {
            window.AXYP_STORAGE.clear();
          } else {
            localStorage.clear();
          }
          location.reload();
        }
      }
    }
  };
})();
