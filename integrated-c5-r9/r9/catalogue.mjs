import {makeR9Lookup,groupLabel,parseR9Progression,qualifyR9Snapshot,nextPosition,R9_SESSION_FORMAT,R9_SOURCE_SHA} from './src/progression-model.mjs';
import {decodeVGC9} from './assets/decoder.r9.mjs';
import {poolFromQualifiedIndex} from './src/runtime-index.mjs';
import {adaptPosition,absoluteFrets,positionId} from './src/adapter.mjs';
import {renderFretSurface} from './r3/dom-render.mjs';
const $=id=>document.getElementById(id);
const BINARY_SHA='ed8a3c3fb34b431a276e5b7341066723427279dc4d3397a9c222dfd478abfed7';
const ROOTS=Object.freeze({Csharp:'C#',Fsharp:'F#'});
const PC=Object.freeze({C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11});
const NOTES=Object.freeze(['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B']);
const PEAR='M 0 -17 C -8 -17 -14 -13 -14 -5 C -14 2 -10 8 -6 12 Q -2 17 0 17 Q 2 17 6 12 C 10 8 14 2 14 -5 C 14 -13 8 -17 0 -17 Z';
const STORE='vg.preview.r9.catalogue.r1';
let pack=null, pool=null, group=null, position=0, saved=Object.create(null),pendingTimer=null;
let pointer=null,peeking=false,swallow=false,primary=null,alternate=null;
const label=g=>(ROOTS[g.root]||g.root)+(g.suffix==='major'?'':g.suffix==='minor'?'m':g.suffix);
const labelGroup=g=>label(g)+' · '+g.positionIndices.length+' position'+(g.positionIndices.length===1?'':'s');
const node=(tag,attrs={},value)=>{const x=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))x.setAttribute(k,v);if(value!==undefined)x.textContent=value;return x;};
const pc=m=>((m%12)+12)%12;
const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
function readSaved(){try {const d=JSON.parse(localStorage.getItem(STORE)||'null');if(d?.version===1&&d?.pack===BINARY_SHA&&d.choices&&typeof d.choices==='object'&&!Array.isArray(d.choices))saved=d.choices;}catch {saved=Object.create(null);}}
function persist(){try {const payload=JSON.stringify({version:1,pack:BINARY_SHA,choices:saved});localStorage.setItem(STORE,payload);if(localStorage.getItem(STORE)!==payload)throw Error('readback');$('save').textContent='Selected position saved in this browser.';}catch{$('save').textContent='Position selected in memory; browser saving unavailable.';}}
function rendering(gi,pi,view){const g=pack.groups[gi],p=g.positions[pi],adapted=adaptPosition(g,gi,pi);if(!adapted.ok)throw Error('C5_R9_UNRENDERABLE');const svg=renderFretSurface(adapted.spec).element;
 if(view!=='note')return svg;
 const rootPc=PC[ROOTS[g.root]||g.root];if(rootPc===undefined)throw Error('R9_BAD_ROOT');
 const notes=absoluteFrets(p),groups=[...svg.querySelectorAll('.vg-mark-wrap')];if(groups.length!==6)throw Error('R9_BAD_RENDER');
 for(let i=0;i<6;i++){const fret=notes[i];if(fret===null)continue;const parent=groups[i];const shape=parent.querySelector(fret===0?'.vg-open':'.vg-dot');if(!shape)throw Error('R9_BAD_MARK');
 const x=50+i*40,y=fret===0?29:60+(fret-adapted.spec.board.firstFret+.5)*35;
 const midi=[40,45,50,55,59,64][i]+fret,interval=pc(midi-rootPc);const pear=node('path',{d:PEAR,transform:`translate(${x} ${y})`,class:'vg-pear'+(interval===0?' root':'')+(fret===0?' open':'')});shape.replaceWith(pear);
 parent.querySelector('.vg-dot-text')?.remove();const name=NOTES[pc(midi)];parent.append(node('text',{x,y:y-1,'text-anchor':'middle',class:'vg-note'+(name.length>1?' small':'')},name),node('text',{x,y:y+11,'text-anchor':'middle',class:'vg-interval'},String(interval)));
 }
 return svg;
}
function current(){const pi=group.positionIndices[position];return {gi:group.groupIndex,pi,p:pack.groups[group.groupIndex].positions[pi]};}
function repaint(){if(!group)return;const g=group,idx=group.groupIndex;
 $('title').textContent=label(g);$('subtitle').textContent='Source group '+idx+' · non-barre structural candidates';
 $('position').textContent=(position+1)+' / '+g.positionIndices.length;
 const {gi,pi}=current();primary=rendering(gi,pi,$('view').value);alternate=rendering(gi,pi,$('view').value==='note'?'finger':'note');$('board').replaceChildren(primary);peeking=false;
 $('prev').disabled=g.positionIndices.length<2;$('next').disabled=g.positionIndices.length<2;
 $('touch').setAttribute('aria-label',label(g)+' position '+(position+1)+'; tap to inspect, hold 100 milliseconds for opposite view, swipe to select');
}
function chooseGroup(gi){const found=pool.groups.find(g=>g.groupIndex===gi);if(!found)return;group=found;const remembered=Number(saved[String(gi)]);position=found.positionIndices.indexOf(remembered);if(position<0)position=0;repaint();}
function step(delta){if(!group||group.positionIndices.length<2)return;position=(position+delta+group.positionIndices.length)%group.positionIndices.length;saved[String(group.groupIndex)]=group.positionIndices[position];repaint();persist();}
function openInspector(){if(!group)return;const {gi,pi,p}=current();$('inspector-title').textContent=label(group)+' · position '+(position+1);$('source-id').textContent=positionId(gi,pi)+' · source base fret '+p.baseFret+' · R9 digital-only';const svg=rendering(gi,pi,$('view').value);const marks=svg.querySelectorAll('.vg-mark-wrap');const frets=absoluteFrets(p);
 for(let i=0;i<marks.length;i++){if(frets[i]===null)continue;const mark=marks[i];mark.setAttribute('pointer-events','auto');mark.style.cursor='pointer';mark.addEventListener('click',()=>{$('note-detail').textContent=`String ${6-i}, fret ${frets[i]}, MIDI ${[40,45,50,55,59,64][i]+frets[i]}`;});}
 $('inspector-board').replaceChildren(svg);$('note-detail').textContent='Tap a sounding mark to inspect its source position.';$('inspector').showModal();}
function makeOptions(search){const q=search.trim().toLowerCase();const matches=pool.groups.filter(g=>label(g).toLowerCase().includes(q)||g.suffix.toLowerCase().includes(q));const select=$('chord'),previous=group?.groupIndex;select.replaceChildren();for(const g of matches){const o=document.createElement('option');o.value=String(g.groupIndex);o.textContent=labelGroup(g);select.append(o);}if(!matches.length){$('status').textContent='No structurally qualified chord groups match your search.';return;}const first=matches.some(g=>g.groupIndex===previous)?previous:matches[0].groupIndex;select.value=String(first);chooseGroup(first);$('counts').textContent=matches.length+' groups found';$('status').textContent='Verified R9 compressed chord catalogue ready.';}
async function init(){try{if(!globalThis.crypto?.subtle)throw Error('secure HTTPS/localhost origin required');const [binary,indexResponse]=await Promise.all([fetch('./assets/chords.vgc',{cache:'no-store'}),fetch('./eligible-index.json',{cache:'no-store'})]);if(!binary.ok||!indexResponse.ok||binary.redirected||indexResponse.redirected)throw Error('asset fetch or redirect');const bytes=await binary.arrayBuffer();if(await hash(bytes)!==BINARY_SHA)throw Error('compressed binary checksum mismatch');pack=decodeVGC9(new Uint8Array(bytes));pool=poolFromQualifiedIndex(pack,await indexResponse.json());if(pool.eligibleGroups!==645||pool.eligiblePositions!==1229)throw Error('eligibility drift');readSaved();makeOptions('');r9Boot();$('status').textContent='Verified R9 compressed ChordDB ready: 645 groups, 1,229 renderable positions. Deferred source positions are not guessed.';}catch(e){$('status').textContent='R9 integration unavailable: '+(e?.message||String(e));$('status').dataset.error='true';}}
$('search').addEventListener('input',e=>{if(pool)makeOptions(e.target.value)});
$('chord').addEventListener('change',e=>{if(pool)chooseGroup(Number(e.target.value))});$('prev').addEventListener('click',()=>step(-1));$('next').addEventListener('click',()=>step(1));$('view').addEventListener('change',repaint);$('theme').addEventListener('change',e=>document.documentElement.dataset.theme=e.target.value);
$('close').addEventListener('click',()=>$('inspector').close());$('inspector').addEventListener('click',e=>{if(e.target===$('inspector'))$('inspector').close()});
// Long-press on a FretCard is an app gesture, not a browser text/context-menu
// action. This catches the catalogue card and every dynamic progression card.
document.addEventListener('contextmenu',event=>{
  if(event.target instanceof Element && event.target.closest('.fret-tap, #inspector-board'))
    event.preventDefault();
});
const touch=$('touch');const cancel=()=>{if(pendingTimer!==null){clearTimeout(pendingTimer);pendingTimer=null;}if(peeking){peeking=false;$('board').replaceChildren(primary)}pointer=null;};
touch.addEventListener('pointerdown',e=>{if(!e.isPrimary||e.button!==0||pointer||!group)return;swallow=false;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};try{touch.setPointerCapture(e.pointerId)}catch{}pendingTimer=setTimeout(()=>{pendingTimer=null;if(pointer&&!pointer.moved){peeking=true;swallow=true;$('board').replaceChildren(alternate);}},100)});
touch.addEventListener('pointermove',e=>{if(!pointer||e.pointerId!==pointer.id)return;if(Math.abs(e.clientX-pointer.x)>10||Math.abs(e.clientY-pointer.y)>10){pointer.moved=true;if(pendingTimer!==null){clearTimeout(pendingTimer);pendingTimer=null;}if(peeking){peeking=false;$('board').replaceChildren(primary)}}});
touch.addEventListener('pointerup',e=>{if(!pointer||e.pointerId!==pointer.id)return;const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y,held=peeking;cancel();if(Math.abs(dx)>38&&Math.abs(dx)>Math.abs(dy)*1.25){swallow=true;step(dx<0?1:-1);}else if(held)swallow=true;});
touch.addEventListener('pointercancel',()=>{cancel();swallow=true});touch.addEventListener('lostpointercapture',cancel);touch.addEventListener('click',e=>{if(swallow){swallow=false;e.preventDefault();return;}openInspector()});touch.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openInspector()}});document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel()});window.addEventListener('blur',cancel);
// Expanded R9 progression workspace. Research-preview storage is intentionally
// independent of the legacy C5 production session V2 journal and shape IDs.
let r9Lookup=null,r9Entries=[],r9LastIssued=0,r9Protected=false;
const R9_PROGRESS_KEY='vg.preview.integrated-c5.r9.progression.v1';
const r9Status=message=>{$('progression-status').textContent=message;};
const r9Envelope=()=>({version:1,format:R9_SESSION_FORMAT,pack:R9_SOURCE_SHA,lastIssued:r9LastIssued,
  entries:r9Entries.map(x=>({id:x.id,groupIndex:x.groupIndex,positionIndex:x.positionIndex}))});
function r9Save(){
  if(r9Protected){r9Status('A previous R9 save needs recovery. This preview will not overwrite it.');return;}
  try{
    const raw=JSON.stringify(r9Envelope());localStorage.setItem(R9_PROGRESS_KEY,raw);
    if(localStorage.getItem(R9_PROGRESS_KEY)!==raw)throw Error('readback-mismatch');
    r9Status('Accepted R9 progression saved in this browser.');
  }catch{r9Status('Changes applied in memory; browser saving is unavailable.');}
}
function r9Restore(){
  let raw;try{raw=localStorage.getItem(R9_PROGRESS_KEY);}catch{r9Status('Browser storage inaccessible; this R9 session is memory-only.');return false;}
  if(raw===null)return false;
  let decoded;try{decoded=JSON.parse(raw);}catch{r9Protected=true;r9Status('Saved R9 progression is protected; invalid JSON was not overwritten.');return false;}
  const restored=qualifyR9Snapshot(decoded,r9Lookup);
  if(!restored){r9Protected=true;r9Status('Saved R9 progression is incompatible. No automatic overwrite.');return false;}
  r9Entries=restored.entries.map(x=>({...x}));r9LastIssued=restored.lastIssued;
  $('progression').value=r9Entries.map(x=>groupLabel(r9Lookup.byIndex.get(x.groupIndex))).join(', ');
  r9Status('Exact R9 progression and positions restored from this browser.');return true;
}
function r9ProgressionApply(raw){
  if(r9Protected){r9Status('Existing saved R9 progression is protected. No changes accepted.');return;}
  const result=parseR9Progression(raw,r9Lookup);
  if(result.kind!=='valid'){r9Status('Nothing applied: '+result.reason+(result.index?' at chord '+result.index:'')+(result.label?' ('+result.label+')':''));return;}
  if(r9LastIssued>Number.MAX_SAFE_INTEGER-32){r9Status('Occurrence identity exhausted; nothing applied.');return;}
  r9Entries=result.rows.map((row,i)=>({id:'r9-occ-'+(r9LastIssued+i+1),groupIndex:row.groupIndex,positionIndex:row.positionIndex}));
  r9LastIssued+=r9Entries.length;r9PaintProgression();r9Save();
}
function r9StepOccurrence(id,direction){
  const index=r9Entries.findIndex(x=>x.id===id);
  if(index<0)return;
  const changed=nextPosition(r9Entries[index],direction,r9Lookup);
  if(!changed||changed.positionIndex===r9Entries[index].positionIndex)return;
  r9Entries=r9Entries.map((r,i)=>i===index?changed:r);
  r9PaintProgression();r9Save();
}
function r9OpenPosition(gi,pi){
  const g=pack.groups[gi],p=g.positions[pi];
  $('inspector-title').textContent=groupLabel(g)+' · source position '+(pi+1);
  $('source-id').textContent=positionId(gi,pi)+' · base fret '+p.baseFret+' · research-only';
  const svg=rendering(gi,pi,$('progression-view').value);
  const frets=absoluteFrets(p);
  const marks=svg.querySelectorAll('.vg-mark-wrap');
  for(let i=0;i<marks.length;i++){
    if(frets[i]===null)continue;
    const mark=marks[i];mark.setAttribute('pointer-events','auto');mark.style.cursor='pointer';
    mark.addEventListener('click',()=>{$('note-detail').textContent=`String ${6-i}, fret ${frets[i]}, MIDI ${[40,45,50,55,59,64][i]+frets[i]}`;});
  }
  $('inspector-board').replaceChildren(svg);
  $('note-detail').textContent='Tap a sounding note to inspect string, fret and MIDI.';
  $('inspector').showModal();
}
function r9Card(entry,index){
  const g=r9Lookup.byIndex.get(entry.groupIndex),p=g.positionIndices.indexOf(entry.positionIndex);
  if(p<0)throw Error('R9_CHOICE_OUTSIDE_GROUP');
  const article=document.createElement('article');article.className='r9-chord-card';
  const heading=document.createElement('h3');heading.textContent=groupLabel(g)+' · '+(index+1);
  const info=document.createElement('p');info.className='tiny';info.textContent='Source position '+(p+1)+' / '+g.positionIndices.length;
  const board=document.createElement('div');board.className='fret-tap r9-card-tap';board.tabIndex=0;board.setAttribute('role','button');
  board.setAttribute('aria-label',groupLabel(g)+' position '+(p+1)+', tap to inspect; hold 100 milliseconds to peek; swipe to select and save');
  const primary=rendering(entry.groupIndex,entry.positionIndex,$('progression-view').value);
  const alternate=rendering(entry.groupIndex,entry.positionIndex,$('progression-view').value==='finger'?'note':'finger');
  board.append(primary);
  let gesture=null,timer=null,peeking=false,suppress=false;
  const clear=()=>{if(timer!==null){clearTimeout(timer);timer=null;}};
  const restore=()=>{clear();if(peeking){board.replaceChildren(primary);peeking=false;}};
  board.addEventListener('pointerdown',event=>{
    if(!event.isPrimary||event.button!==0||gesture)return;
    suppress=false;gesture={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
    try{board.setPointerCapture(event.pointerId);}catch{}
    timer=setTimeout(()=>{timer=null;if(gesture&&!gesture.moved){peeking=true;suppress=true;board.replaceChildren(alternate);}},100);
  });
  board.addEventListener('pointermove',event=>{
    if(!gesture||event.pointerId!==gesture.id)return;
    if(Math.abs(event.clientX-gesture.x)>10||Math.abs(event.clientY-gesture.y)>10){gesture.moved=true;restore();}
  });
  board.addEventListener('pointerup',event=>{
    if(!gesture||event.pointerId!==gesture.id)return;
    const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y,held=peeking;
    gesture=null;restore();
    if(Math.abs(dx)>38&&Math.abs(dx)>1.25*Math.abs(dy)){suppress=true;r9StepOccurrence(entry.id,dx<0?1:-1);}
    else if(held)suppress=true;
  });
  board.addEventListener('pointercancel',()=>{gesture=null;restore();suppress=true;});
  board.addEventListener('lostpointercapture',()=>{gesture=null;restore();});
  board.addEventListener('click',event=>{if(suppress){suppress=false;event.preventDefault();return;}r9OpenPosition(entry.groupIndex,entry.positionIndex);});
  board.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();r9OpenPosition(entry.groupIndex,entry.positionIndex);}});
  const nav=document.createElement('div');nav.className='nav';
  const previous=document.createElement('button');previous.type='button';previous.textContent='‹';previous.setAttribute('aria-label','Previous position for '+groupLabel(g));
  const next=document.createElement('button');next.type='button';next.textContent='›';next.setAttribute('aria-label','Next position for '+groupLabel(g));
  const count=document.createElement('span');count.textContent=(p+1)+' / '+g.positionIndices.length;
  previous.disabled=next.disabled=g.positionIndices.length===1;
  previous.addEventListener('click',()=>r9StepOccurrence(entry.id,-1));next.addEventListener('click',()=>r9StepOccurrence(entry.id,1));
  nav.append(previous,count,next);article.append(heading,info,board,nav);return article;
}
function r9PaintProgression(){
  const output=$('progression-cards');output.replaceChildren();
  for(const [i,entry] of r9Entries.entries())output.append(r9Card(entry,i));
}
function r9Boot(){
  r9Lookup=makeR9Lookup(pool.groups);
  if(!r9Restore()){
    if(!r9Protected){const initial=parseR9Progression($('progression').value,r9Lookup);
      if(initial.kind==='valid'){r9Entries=initial.rows.map((row,i)=>({id:'r9-occ-'+(i+1),groupIndex:row.groupIndex,positionIndex:row.positionIndex}));r9LastIssued=r9Entries.length;
        r9Status('Example loaded in memory. Submit or swipe to save your own R9 progression.');}
    }
  }
  r9PaintProgression();
}
$('progression-form').addEventListener('submit',event=>{event.preventDefault();if(r9Lookup)r9ProgressionApply($('progression').value);});
$('progression-view').addEventListener('change',()=>{if(r9Lookup)r9PaintProgression();});

init();
