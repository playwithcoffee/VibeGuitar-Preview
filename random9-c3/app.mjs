/** VGFretCard Random-9 isolated browser demo. No storage, audio, worker or app imports. */
const $=id=>document.getElementById(id);
const PINS=Object.freeze({
  './assets/chords.vgc':'ed8a3c3fb34b431a276e5b7341066723427279dc4d3397a9c222dfd478abfed7',
  './assets/decoder.r9.mjs':'b3be95ac83b9d6d0737b6cf2aacc23474aff1c23639e2b6cce42bcf0c89a568a',
  './r3/core.mjs':'a3bd256e2b24d9e34804f8fcd6a9ca8614c07279080fa6392ece00d90454d05c',
  './src/adapter.mjs':'0f8f5538c7571aa6c6e5e3f46fbbb8ca8f9788afadd3d173d1da575072f1ae4e',
  './src/random9.mjs':'ea40524b869ae3224ea2a4d29a89a4c153bd544a1b8fadb3b07a86e8d0b8b20d',
  './r3/dom-render.mjs':'c42595460f227301a273f23bd5ba0f431fc1a5986fffc9d87c9b7c30ab5aecae',
  './src/runtime-index.mjs':'b8d709b9848d50a0b0af36c18f1017ad9ff25df23981c5d9878acc71fcdb0548',
  './eligible-index.json':'b0641578b3de6a542a78d9b30e33565b5ea203a7fa0a76b05d6af4f0d3aca51b'
});
const SHA_RE=/^[0-9a-f]{64}$/;
const hex=buffer=>Array.from(new Uint8Array(buffer),x=>x.toString(16).padStart(2,'0')).join('');
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=String(text);return node;};
const readableRoot=root=>({Csharp:'C#',Fsharp:'F#'})[root]||root;
function chordName(c){const suffix=c.sourceSuffix;return readableRoot(c.sourceRoot)+(suffix==='major'?'':suffix==='minor'?'m':suffix);}
const setStatus=(message,error=false)=>{const target=$('status');target.textContent=message;target.dataset.error=String(error);};
let loaded=null,loading=null,activeRender=null,focusReturn=null,numberOfEvents=0,currentGrid=null;
async function checkedFile(path){
  const expected=PINS[path];if(!SHA_RE.test(expected))throw Error('C2_UNPINNED_ASSET:'+path);
  const response=await fetch(path,{cache:'no-store'});
  if(!response.ok||response.redirected)throw Error('C2_FETCH_HOLD:'+path+':'+response.status);
  const bytes=await response.arrayBuffer();
  const digest=hex(await crypto.subtle.digest('SHA-256',bytes));
  if(digest!==expected)throw Error('C2_ASSET_SHA_HOLD:'+path);
  return bytes;
}
async function init(){
  if(loaded)return loaded;
  if(loading)return loading;
  loading=(async()=>{
    if(!crypto?.subtle||!crypto?.getRandomValues)throw Error('C2_SECURE_CONTEXT_REQUIRED');
    const checks=await Promise.all(Object.keys(PINS).map(async path=>[path,await checkedFile(path)]));
    const assets=new Map(checks);
    const [codec,adapter,sampler,indexing,renderer]=await Promise.all([
      import('./assets/decoder.r9.mjs'),import('./src/adapter.mjs'),import('./src/random9.mjs'),
      import('./src/runtime-index.mjs'),import('./r3/dom-render.mjs')
    ]);
    const decoded=codec.decodeVGC9(new Uint8Array(assets.get('./assets/chords.vgc')));
    const index=JSON.parse(new TextDecoder().decode(assets.get('./eligible-index.json')));
    if(index.adapterSHA256!==PINS['./src/adapter.mjs']||index.samplerSHA256!==PINS['./src/random9.mjs'])
      throw Error('C2_INDEX_CODE_PIN_HOLD');
    const pool=indexing.poolFromQualifiedIndex(decoded,index);
    loaded=Object.freeze({pool,sampler,renderer});
    return loaded;
  })().catch(err=>{loading=null;throw err;});
  return loading;
}
function eventTrace(evt){
  $('event').textContent=JSON.stringify({eventNumber:++numberOfEvents,...evt},null,2);
  if(activeRender && evt.kind==='mark.activate')activeRender.update({selectedMarkIds:[evt.targetId]});
}
function closeInspector(){
  $('inspector').hidden=true;document.body.classList.remove('inspect-open');
  $('inspectBoard').replaceChildren();activeRender=null;
  if(focusReturn?.isConnected)focusReturn.focus();focusReturn=null;
}
function openInspector(card,button,renderer){
  focusReturn=button;
  $('inspectTitle').textContent=chordName(card);
  $('inspectDescription').textContent='Explore the exact source markings. Touch or focus a note to inspect its semantic event.';
  $('inspectIdentity').textContent=`${card.sourceId} · Base fret ${card.sourceBaseFret} · ${card.sourceMidi.length} sounding notes · No synthesized technique`;
  activeRender=renderer.renderFretSurface(card.spec,{},eventTrace);
  $('inspectBoard').replaceChildren(activeRender.element);
  $('inspector').hidden=false;document.body.classList.add('inspect-open');$('close').focus();
}
function createTile(card,index,renderer){
  const tile=el('button','random-card');tile.type='button';tile.setAttribute('aria-label',`Inspect ${chordName(card)}, ${card.sourceId}`);
  const top=el('span','random-card-top'),name=el('span','tile-title',chordName(card)),num=el('span','tile-num',String(index+1).padStart(2,'0')+'/09');
  top.append(name,num);tile.append(top,el('span','tile-sub','Verified R9 source position'));
  const visual=renderer.renderFretSurface(card.spec,{},()=>{});
  const svg=visual.element;svg.setAttribute('aria-hidden','true');svg.querySelectorAll('[tabindex]').forEach(n=>n.setAttribute('tabindex','-1'));
  const holder=el('span','tile-svg');holder.append(svg);tile.append(holder,el('span','tile-footer',`Position ${card.positionIndex+1} · Tap to inspect`));
  tile.addEventListener('click',()=>openInspector(card,tile,renderer));
  return tile;
}
function drawGrid(grid,renderer){
  if(grid.cards?.length!==9||new Set(grid.cards.map(c=>c.groupIndex)).size!==9)throw Error('C2_GRID_INVALID');
  const fragment=document.createDocumentFragment();
  for(const [i,card] of grid.cards.entries())fragment.append(createTile(card,i,renderer));
  $('grid').replaceChildren(fragment);currentGrid=grid;
  $('seed').value=String(grid.seed);
  $('poolStats').textContent=`${grid.eligibleGroups} eligible groups · ${grid.eligiblePositions} positions`;
  setStatus(`Ready — seed ${grid.seed}, 9 distinct groups. All markings originate from pinned R9 data.`);
  window.__VG_RANDOM9_READY={seed:grid.seed,groups:grid.cards.map(x=>x.groupIndex),sourceIds:grid.cards.map(x=>x.sourceId),cards:9,
    poolGroups:grid.eligibleGroups,poolPositions:grid.eligiblePositions,algorithm:grid.algorithm};
}
const randomSeed=()=>{let x=0;do{x=crypto.getRandomValues(new Uint32Array(1))[0];}while(x===0);return x;};
function inputSeed(){const value=$('seed').value.trim();if(!/^[1-9][0-9]{0,9}$/.test(value))throw Error('C2_INVALID_SEED');const seed=Number(value);if(!Number.isInteger(seed)||seed>4294967295)throw Error('C2_INVALID_SEED');return seed;}
async function run(seedFactory){
  const btn=$('shuffle'),replay=$('replay');btn.disabled=true;replay.disabled=true;
  try{
    setStatus('Verifying pinned assets, decoding R9, and preparing the candidate pool…');
    const {pool,sampler,renderer}=await init();
    const seed=seedFactory();
    drawGrid(sampler.sampleNine(pool,seed),renderer);
  }catch(error){setStatus('Could not generate verified chords: '+(error?.message||String(error)),true);}
  finally{btn.disabled=false;replay.disabled=false;}
}
$('shuffle').addEventListener('click',()=>run(randomSeed));
$('replay').addEventListener('click',()=>run(inputSeed));
$('theme').addEventListener('change',()=>{document.documentElement.dataset.theme=$('theme').value;});
$('close').addEventListener('click',closeInspector);
$('closeBottom').addEventListener('click',closeInspector);
$('inspector').addEventListener('click',ev=>{if(ev.target===$('inspector'))closeInspector();});
document.addEventListener('keydown',ev=>{
  if($('inspector').hidden)return;
  if(ev.key==='Escape'){ev.preventDefault();closeInspector();return;}
  if(ev.key!=='Tab')return;
  const focusable=[...$('inspector').querySelectorAll('button,[tabindex="0"]')].filter(x=>x.getClientRects().length);
  if(!focusable.length)return;
  const first=focusable[0],last=focusable[focusable.length-1];
  if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last.focus();}
  else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus();}
});
