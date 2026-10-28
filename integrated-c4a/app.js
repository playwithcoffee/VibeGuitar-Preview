import { makeController, explainProgressionFailure } from './app/controller.js';
import { RUNTIME_CATALOGUE, RUNTIME_CATALOGUE_REVISION } from './app/runtime-catalogue.js';
import { createLiveSession } from './session/live-session.js';
import { planChordDiagram } from './app/diagram-plan.js';
import { specFromInternalShape, describeInternalShape } from './fretcard/shape-adapter.js';
import { renderFretSurface } from './fretcard/dom-render.js';
import { createOfflineStatus } from './offline/offline-status.js';
import { OFFLINE_RELEASE_ID } from './offline/release-info.js';
import { createUpdateCandidate } from './offline/update-candidate.js';
import { describeUpdateHandoff } from './offline/update-handoff.js';

const controller = makeController(RUNTIME_CATALOGUE);
// localStorage itself may throw at property access; use a fail-closed adapter.
let sessionStorage;
try {
  const previewBackingStorage=window.localStorage;
  const previewKeyPrefix='vg.preview.integrated-c4a.v1.';
  sessionStorage=Object.freeze({
    getItem(key){return previewBackingStorage.getItem(previewKeyPrefix+key);},
    setItem(key,value){return previewBackingStorage.setItem(previewKeyPrefix+key,value);},
  });
}
catch { sessionStorage={getItem(){throw Error('storage-denied');},setItem(){throw Error('storage-denied');}}; }
const liveSession=createLiveSession({storage:sessionStorage,controller,
  catalogue:RUNTIME_CATALOGUE,catalogueRevision:RUNTIME_CATALOGUE_REVISION});
const $ = id => document.getElementById(id);
const form = $('progression-form');
const input = $('progression-input');
const cards = $('chord-cards');
const feedback = $('form-feedback');
const dialog = $('shape-dialog');
// An unsubmitted input edit is unsaved work even when the accepted session is Saved.
let pendingInputDraft = false;
let updateCandidate;
function renderUpdateStatus() {
  if (!updateCandidate) return;
  const presentation=describeUpdateHandoff(updateCandidate.status(), liveSession.status(),
    {pendingDraft:pendingInputDraft,inspectorOpen:!!controller.state().inspector});
  const el=$('update-status');
  el.hidden=!presentation.visible;
  el.dataset.phase=presentation.phase;
  el.textContent=presentation.message;
}
// Noncritical UI preference; never touch future saved chord-session records.
const themeSelect = $('theme-select');
const themeMeta = document.querySelector('meta[name="theme-color"]');
const THEME_KEY = 'vg.preview.integrated-c4a.v1.ui.theme';
const THEME_COLORS = Object.freeze({ warm: '#F4F2ED', dark: '#161C20', clean: '#EDF0F5' });
function setTheme(choice, persist = false) {
  const selected = Object.hasOwn(THEME_COLORS, choice) ? choice : 'warm';
  document.documentElement.dataset.theme = selected;
  themeSelect.value = selected;
  if (themeMeta) themeMeta.content = THEME_COLORS[selected];
  if (persist) {
    try { window.localStorage.setItem(THEME_KEY, selected); } catch { /* Appearance stays usable. */ }
  }
}
let storedTheme = 'warm';
try { storedTheme = window.localStorage.getItem(THEME_KEY) || 'warm'; } catch { /* Storage may be blocked. */ }
setTheme(storedTheme);
themeSelect.addEventListener('change', () => setTheme(themeSelect.value, true));

function node(tag, options = {}) {
  const el = document.createElement(tag);
  if (options.className) el.className = options.className;
  if (options.text != null) el.textContent = options.text;
  return el;
}
function svgNode(tag, attrs = {}, content = null) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  if (content != null) el.textContent = content;
  return el;
}
function pattern(shape) {
  return shape.voicing.strings.map(s => s.kind === 'muted' ? 'X' : s.kind === 'open' ? '0' : String(s.fret)).join(' · ');
}
function diagram(shape, chordLabel) {
  // Internal-digital shape identity and physical technique are unchanged.
  // C4-A is a read-only view: occurrence inspector still owns Apply/Cancel.
  const spec=specFromInternalShape(shape);
  const {element}=renderFretSurface(spec);
  element.classList.add('diagram');
  element.setAttribute('role','img');
  element.setAttribute('aria-label',describeInternalShape(shape,chordLabel));
  return element;
}
function setFeedback(message, ok = false) {
  feedback.textContent = message;
  feedback.className = `feedback${ok ? ' ok' : ''}`;
}
function showDraftState(applied) {
  const indicator = $('draft-status');
  indicator.textContent = applied ? '' : 'Draft not applied · Chord cards unchanged';
  indicator.className = applied ? 'draft-status applied' : 'draft-status pending';
}
function renderSessionStatus() {
  const current=liveSession.status();
  const el=$('session-status');
  el.textContent=current.message;
  el.dataset.phase=current.phase;
  $('session-retry').hidden=!current.canRetry;
  $('session-replace').hidden=!current.canReplace;
  renderUpdateStatus();
}
function setInputError(error) {
  input.setAttribute('aria-invalid', error ? 'true' : 'false');
}
function renderCards() {
  cards.replaceChildren();
  const arr = controller.state().arrangement;
  const resolved = arr.map(entry => ({entry, shape:controller.getShape(entry.shapeId)}));
  if (resolved.some(({shape}) => !shape || planChordDiagram(shape).kind !== 'diagram-ready')) {
    $('progression-count').textContent = 'Catalogue unavailable';
    cards.append(node('p', {className:'feedback', text:'Chord catalogue integrity failure. No partial progression was displayed.'}));
    setFeedback('Chord catalogue integrity failure. Accepted choices were preserved.');
    return false;
  }
  $('progression-count').textContent = `${arr.length} chord${arr.length === 1 ? '' : 's'}`;
  for (const [index, {entry, shape}] of resolved.entries()) {
    const card = node('article', { className: 'chord-card' });
    const top = node('div', { className: 'card-top' });
    top.append(node('h3', { className: 'card-name', text: entry.label }));
    top.append(node('span', { className: 'card-index', text: `#${index + 1}` }));
    card.append(top, node('p', { className: 'chord-sub', text: shape.name }), diagram(shape, entry.label));
    card.append(node('span', { className: 'card-pattern', text: pattern(shape) }));
    const button = node('button', { className: 'card-button', text: 'Change shape' });
    button.type = 'button';
    button.setAttribute('aria-label', `Change shape for chord ${index + 1}, ${entry.label}`);
    button.addEventListener('click', () => showInspector(entry.id));
    card.append(button); cards.append(card);
  }
  return true;
}
function renderInspector() {
  const current = controller.state().inspector;
  if (!current) return;
  $('dialog-title').textContent = `${current.label} — choose position`;
  const shape = controller.getShape(current.selectedShapeId);
  const preview = $('dialog-preview');
  preview.replaceChildren();
  preview.append(node('h3', { text: shape.name }), diagram(shape, current.label),
    node('span', { className: 'card-pattern', text: pattern(shape) }));
  const options = $('dialog-options'); options.replaceChildren();
  for (const choice of controller.eligibleShapes(current.label)) {
    const selected = choice.id === current.selectedShapeId;
    const button = node('button', { className: 'option' }); button.type = 'button';
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', `Preview ${choice.name}, ${pattern(choice)}`);
    const title = node('span'); title.append(node('strong', { text: choice.name }),
      node('small', { text: pattern(choice) }));
    button.append(title, node('span', { className: 'tick', text: selected ? '✓' : '○' }));
    button.addEventListener('click', () => {
      const result = controller.preview(choice.id);
      if (result.kind === 'previewed') renderInspector();
    });
    options.append(button);
  }
  // D024: applying an unchanged, eligible selection closes as a no-op.
  $('dialog-apply').disabled = false;
}
function showInspector(id) {
  const result = controller.openInspector(id);
  if (result.kind !== 'opened') { setFeedback('This chord can no longer be edited.'); return; }
  renderInspector();
  if (!dialog.open) dialog.showModal();
  renderUpdateStatus();
}
function dismissInspector() {
  controller.cancel();
  if (dialog.open) dialog.close();
  renderUpdateStatus();
}
form.addEventListener('submit', event => {
  event.preventDefault();
  const outcome = controller.submit(input.value);
  if (outcome.kind !== 'replaced') {
    setInputError(true);
    showDraftState(false);
    setFeedback(explainProgressionFailure(outcome));
    input.focus();
    return;
  }
  if (dialog.open) dialog.close();
  setInputError(false);
  pendingInputDraft=false;
  showDraftState(true);
  if (renderCards()) { setFeedback(''); liveSession.acceptedChange(); renderSessionStatus(); }
  else renderUpdateStatus();
});
$('dialog-cancel').addEventListener('click', dismissInspector);
$('dialog-close').addEventListener('click', dismissInspector);
$('dialog-apply').addEventListener('click', () => {
  const result = controller.apply();
  if (result.kind === 'changed' || result.kind === 'no-op') {
    dialog.close(); if (renderCards()) { setFeedback('');
      if(result.kind==='changed') liveSession.acceptedChange();
      renderSessionStatus(); }
    renderUpdateStatus();
  } else {
    dismissInspector(); setFeedback(`Cannot apply: ${result.reason}`);
  }
});
dialog.addEventListener('cancel', event => { event.preventDefault(); dismissInspector(); });
dialog.addEventListener('close', () => { controller.cancel(); renderUpdateStatus(); });
// Input edits never apply themselves and never mutate the accepted arrangement.
input.addEventListener('input', () => {
  pendingInputDraft=true;
  renderUpdateStatus();
  showDraftState(false);
  setInputError(false);
  setFeedback('');
});
$('session-retry').addEventListener('click',()=>{
  liveSession.retry();renderSessionStatus();
});
$('session-replace').addEventListener('click',()=>{
  const current=liveSession.status();
  if(!current.canReplace) return;
  const permitted=window.confirm('Replace the protected saved session with your currently accepted progression? A recovery copy of the original bytes will be retained if storage permits. Cancel preserves the original.');
  if(!permitted) return;
  liveSession.replaceSavedAfterConfirmation();renderSessionStatus();
});
const startup=liveSession.start();
if(startup.restored) {
  // Never call submit() after restoration: it would replace exact historical IDs.
  input.value=controller.state().arrangement.map(e=>e.label).join(', ');
  setInputError(false);showDraftState(true);renderCards();
} else {
  // Render a first-use or protected-session example only in memory.
  const initial=controller.submit(input.value);
  if (initial.kind === 'replaced') {
    const rendered = renderCards();
    setInputError(false);
    showDraftState(true);
    if (rendered) setFeedback('');
  } else {
    setInputError(true);
    showDraftState(false);
    setFeedback(explainProgressionFailure(initial));
  }
}
renderSessionStatus();

// M4-A: offline completeness has its own visible indicator, never conflated with save state.
const offlineStatus=createOfflineStatus({
  serviceWorker:navigator.serviceWorker,expectedRelease:OFFLINE_RELEASE_ID,
  makeChannel:typeof MessageChannel==='function'?()=>new MessageChannel():undefined,
  onChange:next=>{ const el=$('offline-status');el.dataset.phase=next.phase;el.textContent=next.message; },
});
// Do not prompt until U1 verifies a distinct, complete waiting release. No forced activation.
updateCandidate=createUpdateCandidate({
  serviceWorker:navigator.serviceWorker,
  scopeURL:new URL('./', import.meta.url).href,
  currentRelease:OFFLINE_RELEASE_ID,
  makeChannel:typeof MessageChannel==='function'?()=>new MessageChannel():undefined,
  onChange:()=>renderUpdateStatus(),
});
void offlineStatus.start().then(()=>updateCandidate.start());
renderUpdateStatus();
window.addEventListener('online',()=>{void offlineStatus.inspect();});
window.addEventListener('offline',()=>{void offlineStatus.inspect();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){void offlineStatus.inspect();void updateCandidate.inspect();}});
