// Απλός client-side PIN gate για λειτουργίες Admin· πρακτικό εμπόδιο, όχι ισχυρή πιστοποίηση.
// Όλοι οι αστυνομικοί έχουν άμεση πρόσβαση στις υποθέσεις της υπηρεσίας.
(function () {
  var ADMIN_HASH = '9bb57ad97e489bd8b1485fa383c4ab9db5bfdc88a4ba46f7c808ddc6cec23b02';
  var role = sessionStorage.getItem('axyp-role') === 'admin' ? 'admin' : 'user';
  var login = document.getElementById('admin-login');
  var logout = document.getElementById('admin-logout');
  var roleStatus = document.getElementById('role-status');
  function renderRole() {
    var isAdmin = role === 'admin';
    if (roleStatus) roleStatus.textContent = 'Ρόλος: ' + (isAdmin ? 'Admin' : 'Χρήστης');
    if (login) login.hidden = isAdmin;
    if (logout) logout.hidden = !isAdmin;
    document.documentElement.dataset.role = role;
    var templatesMode = document.getElementById('templates-mode');
    if (templatesMode) templatesMode.hidden = !isAdmin;
    var importArea = document.querySelector('.template-import');
    if (importArea) importArea.hidden = !isAdmin;
  }
  async function digest(value) {
    var bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes)).map(function (byte) { return byte.toString(16).padStart(2, '0'); }).join('');
  }
  if (login) login.addEventListener('click', async function () {
    var password = window.prompt('Κωδικός admin');
    if (password === null) return;
    if (await digest(password) !== ADMIN_HASH) { window.alert('Λάθος κωδικός admin.'); return; }
    role = 'admin'; sessionStorage.setItem('axyp-role', role); renderRole();
  });
  if (logout) logout.addEventListener('click', function () { role = 'user'; sessionStorage.removeItem('axyp-role'); renderRole(); });
  window.AXYP_ROLE = { isAdmin: function () { return role === 'admin'; }, render: renderRole };
  renderRole();
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
          }).catch(function (error) {
            window.alert('Δεν επιβεβαιώθηκε η εκκαθάριση των τοπικών δεδομένων. Δεν έγινε επαναφόρτωση: ' + (error.message || 'Άγνωστο σφάλμα.'));
          });
        }
      }
    }
  };
})();
