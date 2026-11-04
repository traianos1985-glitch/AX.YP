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
          var clearing = window.AXYP_STORAGE
            ? window.AXYP_STORAGE.clear()
            : Promise.resolve().then(function () {
                for (var i = localStorage.length - 1; i >= 0; i--) {
                  var key = localStorage.key(i);
                  if (key && key.indexOf('axyp-') === 0) localStorage.removeItem(key);
                }
              });
          Promise.resolve(clearing).then(function () {
            location.reload();
          });
        }
      }
    }
  };
})();
