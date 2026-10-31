/** Random-9 isolated headless sampler v1. No renderer, DOM, persistence or product IDs. */
import {inspectPosition,adaptPosition,positionId} from './adapter.mjs';

export const RANDOM9_FORMAT='VGFretCard-Random9-C0C1-R1';
export const RANDOM9_ALGORITHM='xorshift32-rejection-partial-fisher-yates-v1';
export const R9_BINARY_SHA256='ed8a3c3fb34b431a276e5b7341066723427279dc4d3397a9c222dfd478abfed7';
const UINT32=4294967296;
const isInt=Number.isInteger;

/** Seed is an explicit nonzero uint32. Host generates seeds, e.g. crypto.getRandomValues. */
export function makeRng(seed){
  if(!isInt(seed)||seed<1||seed>4294967295)throw Error('RANDOM9_BAD_SEED');
  let x=seed>>>0;
  return ()=>{
    x^=x<<13;x^=x>>>17;x^=x<<5;
    return x>>>0;
  };
}
/** Uniform integer in 0..bound-1, using rejection rather than modulo bias. */
export function uniformBelow(next,bound){
  if(!isInt(bound)||bound<1||bound>UINT32)throw Error('RANDOM9_BAD_BOUND');
  if(typeof next!=='function')throw Error('RANDOM9_BAD_RNG');
  const limit=UINT32-(UINT32%bound);
  for(let attempts=0;attempts<1000;attempts++){
    const r=next();
    if(!isInt(r)||r<0||r>=UINT32)throw Error('RANDOM9_BAD_RNG_OUTPUT');
    if(r<limit)return r%bound;
  }
  throw Error('RANDOM9_RNG_STUCK');
}
const strictPositive=n=>isInt(n)&&n>0;
/** Build an immutable eligibility index exactly from the independently audited corpus. */
export function createPool(decoded,audit){
  if(!decoded||!Array.isArray(decoded.groups)||decoded.groups.length!==828||
     decoded.sourcePositionCount!==3283||decoded.sourceGroupCount!==828||
     !audit||audit.status!=='PASS'||audit.groups!==828||audit.positions!==3283||
     audit.parityMismatches!==0||audit.midiMismatches!==0||
     !Array.isArray(audit.inventory)||audit.inventory.length!==3283||
     !Array.isArray(audit.eligibleGroupIndex)||audit.eligibleGroupIndex.length!==645||
     audit.eligible!==1229||audit.eligibleGroups!==645||audit.deferred!==2054||audit.quarantined!==0){
    throw Error('RANDOM9_UNQUALIFIED_AUDIT');
  }
  const grouped=new Map();let count=0;const seenRecords=new Set();
  for(const record of audit.inventory){
    const {groupIndex:gi,positionIndex:pi,status,reason,id,root,suffix}=record;
    if(!isInt(gi)||gi<0||gi>=decoded.groups.length||!isInt(pi)||pi<0||pi>=decoded.groups[gi].positions.length||
       id!==positionId(gi,pi)||root!==decoded.groups[gi].root||suffix!==decoded.groups[gi].suffix){
      throw Error('RANDOM9_BAD_SOURCE_IDENTITY');
    }
    if(seenRecords.has(id))throw Error('RANDOM9_DUPLICATE_AUDIT_IDENTITY');
    seenRecords.add(id);
    const p=decoded.groups[gi].positions[pi];
    const classified=inspectPosition(p);
    if(classified.status!==status||classified.reason!==reason)throw Error('RANDOM9_CLASSIFICATION_DRIFT');
    if(status==='RENDER_CANDIDATE'){
      const list=grouped.get(gi)||[];list.push(pi);grouped.set(gi,list);count++;
    }
  }
  if(seenRecords.size!==3283||count!==1229||grouped.size!==645)throw Error('RANDOM9_POOL_COUNT_HOLD');
  const entries=[];const seen=new Set();
  for(const item of audit.eligibleGroupIndex){
    const gi=item.groupIndex,g=decoded.groups[gi],positions=grouped.get(gi);
    if(seen.has(gi)||!g||!positions||!strictPositive(item.eligiblePositions)||
       positions.length!==item.eligiblePositions||item.root!==g.root||item.suffix!==g.suffix){
      throw Error('RANDOM9_ELIGIBLE_INDEX_HOLD');
    }
    seen.add(gi);
    entries.push(Object.freeze({groupIndex:gi,root:g.root,suffix:g.suffix,positionIndices:Object.freeze([...positions])}));
  }
  if(entries.length<9)throw Error('RANDOM9_INSUFFICIENT_GROUPS');
  return Object.freeze({format:RANDOM9_FORMAT,sourceSHA256:R9_BINARY_SHA256,
    algorithm:RANDOM9_ALGORITHM,eligiblePositions:count,eligibleGroups:entries.length,
    groups:Object.freeze(entries),decoded});
}
/** O(9) group selection via virtual swaps; unbiased group-then-position policy. */
export function sampleNine(pool,seed){
  if(!pool||pool.format!==RANDOM9_FORMAT||pool.algorithm!==RANDOM9_ALGORITHM||
     pool.sourceSHA256!==R9_BINARY_SHA256||!Array.isArray(pool.groups)||pool.groups.length<9||
     !pool.decoded||!Array.isArray(pool.decoded.groups))throw Error('RANDOM9_INVALID_POOL');
  const next=makeRng(seed),selected=[],swaps=new Map(),n=pool.groups.length;
  for(let i=0;i<9;i++){
    const draw=i+uniformBelow(next,n-i);
    const choice=swaps.has(draw)?swaps.get(draw):draw;
    const atI=swaps.has(i)?swaps.get(i):i;
    swaps.set(draw,atI);swaps.delete(i);
    const entry=pool.groups[choice];
    if(!entry||!entry.positionIndices.length)throw Error('RANDOM9_BROKEN_ENTRY');
    const pi=entry.positionIndices[uniformBelow(next,entry.positionIndices.length)];
    const g=pool.decoded.groups[entry.groupIndex];
    const result=adaptPosition(g,entry.groupIndex,pi);
    if(!result.ok||result.sourceId!==positionId(entry.groupIndex,pi)||
       result.sourceRoot!==entry.root||result.sourceSuffix!==entry.suffix)throw Error('RANDOM9_ADAPTER_DRIFT');
    selected.push(Object.freeze(result));
  }
  if(new Set(selected.map(x=>x.groupIndex)).size!==9||
     new Set(selected.map(x=>x.sourceId)).size!==9)throw Error('RANDOM9_DUPLICATE_HOLD');
  return Object.freeze({format:RANDOM9_FORMAT,algorithm:RANDOM9_ALGORITHM,seed,
    sourceSHA256:R9_BINARY_SHA256,eligibleGroups:pool.eligibleGroups,
    eligiblePositions:pool.eligiblePositions,cards:Object.freeze(selected)});
}
export function summaryOf(grid){
  if(!grid||grid.format!==RANDOM9_FORMAT||grid.cards?.length!==9)throw Error('RANDOM9_BAD_GRID');
  return {format:grid.format,algorithm:grid.algorithm,seed:grid.seed,sourceSHA256:grid.sourceSHA256,
    eligibleGroups:grid.eligibleGroups,eligiblePositions:grid.eligiblePositions,
    cards:grid.cards.map(c=>({sourceId:c.sourceId,groupIndex:c.groupIndex,positionIndex:c.positionIndex,
      root:c.sourceRoot,suffix:c.sourceSuffix,absoluteFrets:c.spec.layers[0].marks.map(m=>m.kind==='mute'?null:m.fret)}))};
}
