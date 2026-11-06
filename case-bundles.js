if (window.AXYP_STORAGE && window.AXYP_STORAGE.ready) await window.AXYP_STORAGE.ready;

const KEY = 'axyp-case-bundles';
const $ = (id) => document.getElementById(id);
const storage = () => window.AXYP_STORAGE || localStorage;
const read = () => { try { return JSON.parse(storage().getItem(KEY) || '[]'); } catch (_) { return []; } };
const write = (value) => storage().setItem(KEY, JSON.stringify(value));
const uid = () => `bundle-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);

function render() {
  const root = $('bundles-list');
  if (!root) return;
  root.textContent = '';
  const activeProfile = window.HypothesesView && window.HypothesesView.getActiveProfileFilter ? window.HypothesesView.getActiveProfileFilter() : null;
  const bundles = read().filter((bundle) => !activeProfile || bundle.profile === activeProfile);
  if (!bundles.length) {
    root.textContent = activeProfile ? 'Δεν υπάρχει ακόμη αποθηκευμένο πρότυπο για αυτή την κατηγορία.' : 'Δεν έχει αποθηκευτεί ακόμη ολοκληρωμένη δικογραφία-πρότυπο.';
    return;
  }
  bundles.forEach((bundle, index) => {
    const card = document.createElement('article');
    card.className = 'bundle-card';
    const files = bundle.documents || [];
    card.innerHTML = `<div class="bundle-card-head"><div><h3></h3><p class="muted"></p></div><span class="mapping-status">${files.length} έγγραφα</span></div><p class="muted bundle-description"></p><ul>${files.map((file) => `<li>${escapeHtml(file.name)} <small>(${Math.round(file.size / 1024)} KB)</small></li>`).join('')}</ul><div class="bundle-actions"><button type="button" class="mini-button use">Νέα υπόθεση από αυτό</button><button type="button" class="text-button remove">Διαγραφή προτύπου</button></div>`;
    card.querySelector('h3').textContent = bundle.title;
    card.querySelector('p').textContent = `${bundle.profile} · αρχική έκδοση ${new Date(bundle.createdAt).toLocaleDateString('el-GR')}`;
    card.querySelector('.bundle-description').textContent = bundle.description || 'Χωρίς περιγραφή.';
    card.querySelector('.use').onclick = async () => {
      try { await useBundle(bundle); }
      catch (error) { $('case-flash').textContent = 'Δεν αποθηκεύτηκε η νέα υπόθεση από το πρότυπο: ' + error.message; }
    };
    card.querySelector('.remove').onclick = () => {
      if (!window.confirm('Να διαγραφεί μόνο το αποθηκευμένο πρότυπο δικογραφίας;')) return;
      const all = read();
      all.splice(index, 1);
      write(all);
      render();
    };
    root.appendChild(card);
  });
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, data: reader.result });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function save(event) {
  event.preventDefault();
  const files = [...$('bundle-files').files];
  if (!files.length) {
    $('case-flash').textContent = 'Πρόσθεσε τουλάχιστον ένα έγγραφο στη δικογραφία.';
    return;
  }
  const bundle = {
    id: uid(),
    title: $('bundle-title').value.trim(),
    profile: $('bundle-profile').value,
    description: $('bundle-description').value.trim(),
    createdAt: new Date().toISOString(),
    documents: await Promise.all(files.map(readFile))
  };
  write([bundle, ...read()]);
  if (window.AXYP_STORAGE && window.AXYP_STORAGE.flush) await window.AXYP_STORAGE.flush();
  $('bundle-form').reset();
  $('bundle-form').hidden = true;
  $('case-flash').textContent = 'Η δικογραφία-πρότυπο αποθηκεύτηκε τοπικά.';
  render();
}

async function useBundle(bundle) {
  const cases = (() => {
    try { return JSON.parse(storage().getItem('axyp-hypotheses') || '[]'); } catch (_) { return []; }
  })();
  const caseData = {
    id: `yp-${Date.now().toString(36)}`,
    title: `Νέα υπόθεση από «${bundle.title}»`,
    offence: bundle.profile === 'narcotics' ? 'Νόμος περί ναρκωτικών' : '',

    status: 'Νέα',
    date: new Date().toISOString().slice(0, 10),
    profile: bundle.profile,
    people: '',
    evidence: '',
    notes: '',
    documents: bundle.documents.map((file) => ({
      name: file.name,
      type: file.type,
      sourceBundleId: bundle.id,
      status: 'Προς συμπλήρωση'
    })),
    snapshots: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sourceBundleId: bundle.id
  };
  storage().setItem('axyp-hypotheses', JSON.stringify([caseData, ...cases]));
  if (window.AXYP_STORAGE && window.AXYP_STORAGE.flush) await window.AXYP_STORAGE.flush();
  if (window.HypothesesView) window.HypothesesView.refresh();
  $('case-flash').textContent = `Δημιουργήθηκε νέα υπόθεση από «${bundle.title}». Τα αρχικά έγγραφα παραμένουν ανέγγιχτα.`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$('bundle-new')?.addEventListener('click', () => { $('bundle-form').hidden = false; $('bundle-title').focus(); });
$('bundle-cancel')?.addEventListener('click', () => { $('bundle-form').reset(); $('bundle-form').hidden = true; });
$('bundle-form')?.addEventListener('submit', save);
window.CaseBundles = { refresh: render };
render();
