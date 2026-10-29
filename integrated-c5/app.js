import { makeController, explainProgressionFailure } from './app/controller.js';
import { RUNTIME_CATALOGUE, RUNTIME_CATALOGUE_REVISION } from './app/runtime-catalogue.js';
import { createLiveSession } from './session/live-session.js';
import { planChordDiagram } from './app/diagram-plan.js';
import { specFromInternalShape, describeInternalShape, musicalNotesForShape, projectFretCardDisplay } from './fretcard/shape-adapter.js';
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
  const previewKeyPrefix='vg.preview.integrated-c5.v1.';
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
const activeGestureCancels = new Set();
const viewSelect = $('card-view-select');
const VIEW_KEY = 'vg.preview.integrated-c5.view.v1';
let preferredView = 'finger';
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
const THEME_KEY = 'vg.ui.theme.v1';
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
try { if(window.localStorage.getItem(VIEW_KEY)==='note')preferredView='note'; } catch { /* Optional preference. */ }
viewSelect.value=preferredView;
viewSelect.addEventListener('change',()=>{
  preferredView=viewSelect.value==='note'?'note':'finger';
  try{ window.localStorage.setItem(VIEW_KEY,preferredView); }catch{ /* Memory-only display setting. */ }
  renderCards();
  if(dialog.open)renderInspector();
});

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
function diagram(shape,chordLabel,mode=preferredView) {
  const spec=specFromInternalShape(shape);
  const {element}=renderFretSurface(spec);
  element.classList.add('diagram');
  const info=projectFretCardDisplay(element,shape,mode);
  element.setAttribute('role','img');
  const noteDetail=info.notes.filter(Boolean).map(n=>
    'string '+n.string+', '+n.note+', degree '+n.degree+
    (n.open?', open':', fret '+n.fret)).join('; ');
  element.setAttribute('aria-label',mode==='note'
    ? chordLabel+' chord notes: '+noteDetail+'; digital fingering only'
    : describeInternalShape(shape,chordLabel));
  return element;
}
function presentationMeta(shape) {
  const spec=specFromInternalShape(shape), info=musicalNotesForShape(shape);
  return 'Bass '+info.bass.note+' · '+
    (spec.board.firstFret===1?'Open position':spec.board.firstFret+'fr');
}
function cardButton(label,className,callback) {
  const button=node('button',{className,text:label});
  button.type='button';button.addEventListener('click',callback);
  return button;
}
/** Gallery navigation now commits immediately; inspector retains deliberate
 * preview/Apply/Cancel for its own editing flow. */
function browseShape(entry,delta,focusDirection=null) {
  const result=controller.selectAdjacentShape(entry.id,delta);
  if(result.kind==='changed') {
    if(renderCards()) {
      liveSession.acceptedChange();
      renderSessionStatus();
      setFeedback('');
      // A pager click replaces the card DOM; restore its keyboard focus.
      if(focusDirection) cards.querySelector('[data-vg-gallery="'+entry.id+':'+focusDirection+'"]')?.focus({preventScroll:true});
    } else renderUpdateStatus();
  } else if(result.kind==='rejected') {
    setFeedback('Could not change this chord: '+result.reason);
  }
}
// A short, stationary hold peeks at the opposite display. Prepare both SVG
// modes once per card so the 200ms gesture threshold is the only planned delay.
const CARD_HOLD_PEEK_MS = 100;
function attachCardGestures(zone,entry,shape) {
  let pointer=null,timer=null,peek=false,suppressClick=false;
  const primary=zone.firstElementChild;
  const alternate=diagram(shape,entry.label,preferredView==='finger'?'note':'finger');
  const clear=()=>{if(timer!==null){clearTimeout(timer);timer=null;}};
  const show=mode=>zone.replaceChildren(mode===preferredView?primary:alternate);
  const restore=()=>{
    if(peek){peek=false;show(preferredView);}
  };
  zone.addEventListener('pointerdown',event=>{
    if(!event.isPrimary||event.button!==0||pointer)return;
    // A gesture may generate no click; a fresh pointer sequence must not inherit suppression.
    suppressClick=false;
    pointer={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
    if(typeof zone.setPointerCapture==='function') {
      try{zone.setPointerCapture(event.pointerId);}catch{ /* Passive fallback. */ }
    }
    timer=setTimeout(()=>{
      timer=null;
      if(!pointer||pointer.moved)return;
      peek=true;suppressClick=true;
      show(preferredView==='finger'?'note':'finger');
    },CARD_HOLD_PEEK_MS);
  });
  zone.addEventListener('pointermove',event=>{
    if(!pointer||pointer.id!==event.pointerId)return;
    if(Math.abs(event.clientX-pointer.x)>10||Math.abs(event.clientY-pointer.y)>10){
      pointer.moved=true;clear();restore();
    }
  });
  zone.addEventListener('pointerup',event=>{
    if(!pointer||pointer.id!==event.pointerId)return;
    const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
    clear();
    const held=peek;
    pointer=null;restore();
    if(Math.abs(dx)>38&&Math.abs(dx)>Math.abs(dy)*1.25){
      suppressClick=true;
      browseShape(entry,dx<0?1:-1);
    } else if(held) {
      suppressClick=true;
    }
  });
  const cancelGesture=()=>{pointer=null;clear();restore();suppressClick=true;};
  activeGestureCancels.add(cancelGesture);
  zone.addEventListener('pointercancel',cancelGesture);
  zone.addEventListener('contextmenu',event=>{if(pointer||peek)event.preventDefault();});
  zone.addEventListener('lostpointercapture',()=>{clear();pointer=null;restore();});
  zone.addEventListener('click',event=>{
    if(suppressClick){suppressClick=false;event.preventDefault();return;}
    showInspector(entry.id);
  });
  zone.addEventListener('keydown',event=>{
    if(event.key==='Enter'||event.key===' '){event.preventDefault();showInspector(entry.id);}
  });
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
  activeGestureCancels.clear();
  cards.replaceChildren();
  const arr=controller.state().arrangement;
  const resolved=arr.map(entry=>({
    entry,shape:controller.getShape(entry.shapeId)
  }));
  if(resolved.some(({shape})=>!shape||planChordDiagram(shape).kind!=='diagram-ready')){
    $('progression-count').textContent='Catalogue unavailable';
    cards.append(node('p',{className:'feedback',
      text:'Chord catalogue integrity failure. No partial progression was displayed.'}));
    setFeedback('Chord catalogue integrity failure. Accepted choices were preserved.');
    return false;
  }
  $('progression-count').textContent=arr.length+' chord'+(arr.length===1?'':'s');
  for(const [index,{entry,shape}] of resolved.entries()){
    const choices=controller.eligibleShapes(entry.label);
    const selected=choices.findIndex(s=>s.id===shape.id);
    const card=node('article',{className:'chord-card'});
    const top=node('div',{className:'card-top'});
    top.append(node('h3',{className:'card-name',text:entry.label}),
      node('span',{className:'card-index',text:'#'+(index+1)}));
    const caption=node('p',{className:'chord-sub',text:presentationMeta(shape)});
    const zone=node('div',{className:'card-gesture-zone'});
    zone.tabIndex=0;zone.setAttribute('role','button');
    zone.setAttribute('aria-label','Inspect chord '+(index+1)+', '+entry.label+
      '. Hold to peek at '+(preferredView==='finger'?'notes':'fingering')+
      '; swipe to select and save another eligible shape.');
    zone.append(diagram(shape,entry.label));
    attachCardGestures(zone,entry,shape);
    card.append(top,caption,zone,node('span',{className:'card-pattern',text:pattern(shape)}));
    if(choices.length>1){
      const pager=node('div',{className:'card-pager'});
      const prev=cardButton('‹','pager-arrow',()=>browseShape(entry,-1,'prev'));
      prev.setAttribute('aria-label','Select previous shape for chord '+(index+1));
      prev.setAttribute('data-vg-gallery',entry.id+':prev');
      const next=cardButton('›','pager-arrow',()=>browseShape(entry,1,'next'));
      next.setAttribute('aria-label','Select next shape for chord '+(index+1));
      next.setAttribute('data-vg-gallery',entry.id+':next');
      const dots=node('div',{className:'pager-dots'});
      dots.setAttribute('aria-hidden','true');
      for(let i=0;i<choices.length;i++){
        const dot=node('span',{className:'pager-dot'+(i===selected?' active':'')});
        dots.append(dot);
      }
      const count=node('span',{className:'pager-count',text:(selected+1)+' / '+choices.length});
      pager.append(prev,dots,count,next);
      card.append(pager);
    }
    cards.append(card);
  }
  return true;
}
function renderInspector() {
  const current=controller.state().inspector;
  if(!current)return;
  $('dialog-title').textContent=current.label+' — choose position';
  const shape=controller.getShape(current.selectedShapeId);
  const preview=$('dialog-preview');preview.replaceChildren();
  const svg=diagram(shape,current.label);
  svg.setAttribute('role','group');svg.style.pointerEvents='auto';
  const noteInfo=musicalNotesForShape(shape);
  const detail=node('p',{className:'note-detail',text:'Tap a sounding note to see its string, fret and chord degree.'});
  detail.setAttribute('aria-live','polite');
  const groups=[...svg.querySelectorAll('.vg-mark-wrap')];
  for(let i=0;i<groups.length;i++){
    const note=noteInfo.notes[i];if(!note)continue;
    const g=groups[i];
    g.style.pointerEvents='auto';g.setAttribute('role','button');
    g.setAttribute('tabindex','0');
    g.setAttribute('aria-label','Note '+note.note+', degree '+note.degree+', string '+note.string);
    const show=()=>{
      detail.textContent=note.note+' · '+note.degree+' · String '+note.string+
        (note.open?' · Open':' · Fret '+note.fret+' · Finger '+note.finger)+
        (note.root?' · Root':'')+(note.midi===noteInfo.bass.midi&&
          note.string===noteInfo.bass.string?' · Bass':'');
    };
    g.addEventListener('click',show);
    g.addEventListener('keydown',event=>{
      if(event.key==='Enter'||event.key===' '){event.preventDefault();show();}
    });
  }
  preview.append(node('h3',{text:shape.name}),svg,
    node('span',{className:'card-pattern',text:pattern(shape)}),detail);
  const options=$('dialog-options');options.replaceChildren();
  for(const choice of controller.eligibleShapes(current.label)){
    const selected=choice.id===current.selectedShapeId;
    const button=node('button',{className:'option'});button.type='button';
    button.setAttribute('aria-pressed',String(selected));
    button.setAttribute('aria-label','Preview '+choice.name+', '+pattern(choice));
    const title=node('span');title.append(node('strong',{text:choice.name}),
      node('small',{text:pattern(choice)}));
    button.append(title,node('span',{className:'tick',text:selected?'✓':'○'}));
    button.addEventListener('click',()=>{
      const result=controller.preview(choice.id);
      if(result.kind==='previewed')renderInspector();
    });
    options.append(button);
  }
  $('dialog-apply').disabled=false;
}
function showInspector(id) {
  const result=controller.openInspector(id);
  if(result.kind!=='opened'){setFeedback('This chord can no longer be edited.');return;}
  renderInspector();
  if(!dialog.open)dialog.showModal();
  renderUpdateStatus();
}
function dismissInspector() {
  // Inspector Cancel discards only its own draft; gallery choices were committed.
  controller.cancel();
  if(dialog.open)dialog.close();
  renderCards();renderUpdateStatus();
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
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){for(const cancel of activeGestureCancels)cancel();}
  else{void offlineStatus.inspect();void updateCandidate.inspect();}
});
window.addEventListener('blur',()=>{for(const cancel of activeGestureCancels)cancel();});
