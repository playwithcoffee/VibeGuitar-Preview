/** B1-B isolated research adapter. Never assigns vg.shape.* product identities. */
import {adaptLegacyShape,inspectSpec,planSurface} from '../r3/core.mjs';
export const FORMAT='VGFretCard-B1B-Conservative-R9-1';
export const SOURCE_REV='df06fa7b425cf5fd29485ff6591236b3557e3fac';
export const ROOT_ALIASES=Object.freeze({Csharp:'C#',Fsharp:'F#'});
const TUNING=[40,45,50,55,59,64];
const isInt=n=>Number.isInteger(n);
const proper=a=>Array.isArray(a)&&a.length===6&&a.every(isInt);
const eql=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function absoluteFrets(p){
  if(!p||!proper(p.frets)||!isInt(p.baseFret)||p.baseFret<1||p.baseFret>24)throw Error('R9_BAD_FRETS');
  return p.frets.map(f=>{if(f===-1)return null;if(f===0)return 0;
    const a=p.baseFret+f-1;if(f<1||a>24)throw Error('R9_BAD_ABSOLUTE_FRET');return a;});
}
export function reconstructedMidi(p){
  const a=absoluteFrets(p);return a.flatMap((f,i)=>f===null?[]:[TUNING[i]+f]);
}
/** Four-stage conservative classification. Only the first reason gates admission. */
export function inspectPosition(p){
  let af;
  try {af=absoluteFrets(p);}catch{return {status:'QUARANTINE',reason:'BAD_FRET'};}
  if(!proper(p.fingers)||!Array.isArray(p.barres)||p.barres.some(b=>!isInt(b)||b<1||b>4)||
     (p.capo!==undefined&&typeof p.capo!=='boolean')||!Array.isArray(p.midi)||
     !eql(reconstructedMidi(p),p.midi))return {status:'QUARANTINE',reason:'BAD_STRUCTURE_OR_PITCH'};
  if(p.barres.length)return {status:'DEFER',reason:'BARRE_ENDPOINTS_UNRESOLVED'};
  for(let i=0;i<6;i++){
    if(af[i]===null||af[i]===0){if(p.fingers[i]!==0)return {status:'DEFER',reason:'UNFRETTED_FINGER_CONFLICT'};}
    else if(p.fingers[i]<1||p.fingers[i]>4)return {status:'DEFER',reason:'FRETTED_FINGER_CONFLICT'};
  }
  const fretted=af.filter(f=>f!==null&&f>0);
  if(!fretted.length)return {status:'DEFER',reason:'NO_FRETTED_NOTES'};
  const first=Math.min(...fretted)>=3?Math.min(...fretted):1;
  if(fretted.some(f=>f<first||f>first+4))return {status:'DEFER',reason:'OUTSIDE_FIVE_FRET_WINDOW'};
  return {status:'RENDER_CANDIDATE',reason:'R3_STRUCTURE_ONLY'};
}
export function positionId(gi,pi){
  if(!isInt(gi)||gi<0||gi>=828||!isInt(pi)||pi<0||pi>20)throw Error('R9_BAD_SOURCE_INDEX');
  return `r9.research.g${gi}.p${pi}`;
}
/** No barre guess. An unresolved source record cannot create SVG marks. */
export function adaptPosition(group,gi,pi){
  if(!group||typeof group.root!=='string'||typeof group.suffix!=='string'||!Array.isArray(group.positions)||
     !isInt(pi)||pi<0||pi>=group.positions.length)throw Error('R9_INVALID_GROUP');
  const p=group.positions[pi];const result=inspectPosition(p);
  if(result.status!=='RENDER_CANDIDATE')return {ok:false,sourceId:positionId(gi,pi),...result};
  const id=positionId(gi,pi);const frets=absoluteFrets(p);
  const shape={id,frets,fingers:p.fingers.map((f,i)=>frets[i]===null||frets[i]===0?null:f),barres:[]};
  const spec=adaptLegacyShape(shape,`r9.board.g${gi}.p${pi}`,`r9.card.g${gi}.p${pi}`);
  const marks=spec.layers[0].marks;
  if(marks.length!==6 || !eql(marks.map(m=>m.kind==='mute'?null:m.fret),frets))throw Error('R9_RENDER_MARK_FRET_DRIFT');
  const plan=planSurface(spec);if(!inspectSpec(spec).ok||!plan.ok)throw Error('R9_RENDER_INSPECT_HOLD');
  spec.context.sourceId=id;
  spec.context.sourceRoot=group.root;
  spec.context.sourceSuffix=group.suffix;
  spec.context.sourceRevision=SOURCE_REV;
  return {ok:true,sourceId:id,positionIndex:pi,groupIndex:gi,sourceRoot:group.root,sourceSuffix:group.suffix,
    sourceBaseFret:p.baseFret,sourceCapo:p.capo===true,sourceFrets:[...p.frets],sourceFingers:[...p.fingers],
    sourceBarreFingers:[],sourceMidi:[...p.midi],spec};
}
/** Every source record must match its exact decoded row; no score-like music heuristics. */
export function auditPack(decoded,source){
  if(!decoded||!Array.isArray(decoded.groups)||decoded.groups.length!==828||
      !source?.chords||typeof source.chords!=='object')throw Error('R9_BAD_INPUT');
  // Decoded R9 group order is dictated by its canonical suffix dictionary, not
  // source JSON group array order (e.g. C '7/G' moves ahead of 'alt').
  // Match by unambiguous, exact root+suffix pair, and retain the decoded group index.
  const sourceGroups=new Map();let aliasGroups=0,aliasPositions=0;
  for(const [container,rows] of Object.entries(source.chords)){
    if(!Array.isArray(rows))throw Error('R9_SOURCE_GROUPS_INVALID');
    const root=ROOT_ALIASES[container]||container;
    for(const entry of rows){
      if(entry.key!==root||typeof entry.suffix!=='string')throw Error('R9_SOURCE_KEY_MISMATCH');
      const key=JSON.stringify([container,entry.suffix]);
      if(sourceGroups.has(key))throw Error('R9_SOURCE_DUPLICATE_GROUP');
      sourceGroups.set(key,entry);
      if(container!==root){aliasGroups++;aliasPositions+=entry.positions.length;}
    }
  }
  if(sourceGroups.size!==828)throw Error('R9_SOURCE_GROUP_COUNT_MISMATCH');
  const counts={groups:0,positions:0,eligible:0,eligibleGroups:0,deferred:0,quarantined:0,
    sourceBarrePositions:0,doubleBarrePositions:0,midiMismatches:0,parityMismatches:0,
    reasonCounts:Object.create(null),sourceAliasGroups:0,sourceAliasPositions:0};
  const inventory=[];const failures=[];const eligibleGroups=[];
  counts.sourceAliasGroups=aliasGroups;counts.sourceAliasPositions=aliasPositions;
  for(let gi=0;gi<decoded.groups.length;gi++){
    const g=decoded.groups[gi],sp=sourceGroups.get(JSON.stringify([g.root,g.suffix]));
    if(!sp||sp.key!==(ROOT_ALIASES[g.root]||g.root)||g.suffix!==sp.suffix||!Array.isArray(sp.positions)||g.positions.length!==sp.positions.length)
      throw Error('R9_GROUP_PARITY_HOLD:'+gi);
    counts.groups++;
    let groupEligible=0;
    for(let pi=0;pi<g.positions.length;pi++){
      const p=g.positions[pi],s=sp.positions[pi];counts.positions++;
      if(!eql(p.frets,s.frets)||!eql(p.fingers,s.fingers)||!eql(p.barres,s.barres)||
         p.baseFret!==s.baseFret||p.capo!==(s.capo===true)||!eql(p.midi,s.midi)){
        counts.parityMismatches++;failures.push({gi,pi,code:'R9_DECODE_SOURCE_MISMATCH'});continue;
      }
      const mid=reconstructedMidi(p);if(!eql(mid,s.midi)){
        counts.midiMismatches++;failures.push({gi,pi,code:'R9_MIDI_MISMATCH'});continue;
      }
      if(p.barres.length)counts.sourceBarrePositions++;
      if(p.barres.length===2)counts.doubleBarrePositions++;
      const classification=inspectPosition(p);counts.reasonCounts[classification.reason]=(counts.reasonCounts[classification.reason]||0)+1;
      if(classification.status==='RENDER_CANDIDATE'){
        const result=adaptPosition(g,gi,pi);if(!result.ok)throw Error('R9_ADAPT_REJECTED:'+gi+':'+pi);
        if(!eql(result.spec.layers[0].marks.map(m=>m.kind==='mute'?null:m.fret),absoluteFrets(s)))throw Error('R9_ADAPT_FRET_DRIFT');
        counts.eligible++;groupEligible++;
      }else if(classification.status==='DEFER')counts.deferred++;
      else counts.quarantined++;
      inventory.push({id:positionId(gi,pi),groupIndex:gi,positionIndex:pi,root:g.root,suffix:g.suffix,
        status:classification.status,reason:classification.reason});
    }
    if(groupEligible){counts.eligibleGroups++;eligibleGroups.push({groupIndex:gi,root:g.root,suffix:g.suffix,eligiblePositions:groupEligible});}
  }
  if(counts.groups!==828||counts.positions!==3283||counts.parityMismatches||counts.midiMismatches||
     inventory.length!==3283||counts.eligible+counts.deferred+counts.quarantined!==3283)throw Error('R9_CORPUS_NOT_AUDITED');
  return {format:FORMAT,status:'PASS',scope:'headless research; no product admission',...counts,
    eligibleGroupIndex:eligibleGroups,inventory,failures};
}
