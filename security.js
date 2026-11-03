(function () {
  var KEY = 'axyp-pin-hash';
  var lock = document.getElementById('lock-screen');
  var form = document.getElementById('lock-form');
  var input = document.getElementById('lock-pin');
  var title = document.getElementById('lock-title');
  var message = document.getElementById('lock-message');
  var reset = document.getElementById('lock-reset');
  function digest(value) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)).then(function (buffer) { return Array.from(new Uint8Array(buffer)).map(function (byte) { return byte.toString(16).padStart(2, '0'); }).join(''); }); }
  function showSetup() { lock.hidden = false; title.textContent = 'Ορισμός εξαψήφιου PIN'; message.textContent = 'Το PIN παραμένει μόνο σε αυτή τη συσκευή.'; reset.hidden = true; }
  function showUnlock() { lock.hidden = false; title.textContent = 'Ξεκλείδωμα εφαρμογής'; message.textContent = 'Πληκτρολόγησε το εξαψήφιο PIN για πρόσβαση.'; reset.hidden = false; }
  form.addEventListener('submit', function (event) { event.preventDefault(); var pin = input.value; if (!/^\d{6}$/.test(pin)) { message.textContent = 'Το PIN πρέπει να αποτελείται από ακριβώς 6 ψηφία.'; return; } digest(pin).then(function (hash) { var stored = localStorage.getItem(KEY); if (!stored) { localStorage.setItem(KEY, hash); lock.hidden = true; } else if (stored === hash) { lock.hidden = true; input.value = ''; } else { message.textContent = 'Λανθασμένο PIN. Δοκίμασε ξανά.'; input.value = ''; input.focus(); } }); });
  reset.addEventListener('click', function () { if (window.confirm('Να διαγραφεί το PIN και όλα τα τοπικά δεδομένα;')) { localStorage.clear(); location.reload(); } });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && localStorage.getItem(KEY)) { showUnlock(); } });
  if (localStorage.getItem(KEY)) showUnlock(); else showSetup();
})();
