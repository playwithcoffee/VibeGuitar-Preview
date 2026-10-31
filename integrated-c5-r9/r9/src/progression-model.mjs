/** R9 research-preview progression semantics. No DOM, storage or C5 production IDs. */
export const R9_SESSION_FORMAT = 'vg.r9.expanded-progression.r1';
export const R9_SOURCE_SHA = 'ed8a3c3fb34b431a276e5b7341066723427279dc4d3397a9c222dfd478abfed7';
const ROOT_LABELS = Object.freeze({ Csharp:'C#', Fsharp:'F#' });
export const groupLabel = g => (ROOT_LABELS[g.root] || g.root) +
  (g.suffix === 'major' ? '' : g.suffix === 'minor' ? 'm' : g.suffix);
const fold=s=>s.replaceAll('♯','#').replaceAll('♭','b').trim().toLowerCase();
export function makeR9Lookup(groups){
  if(!Array.isArray(groups)||groups.length!==645)throw Error('R9_BAD_GROUP_POOL');
  const byName=new Map(),byIndex=new Map();
  for(const group of groups){
    if(!Number.isInteger(group.groupIndex)||!Array.isArray(group.positionIndices)||!group.positionIndices.length||byIndex.has(group.groupIndex))throw Error('R9_BAD_GROUP');
    const name=fold(groupLabel(group));
    if(byName.has(name))throw Error('R9_AMBIGUOUS_GROUP_LABEL:'+name);
    byName.set(name,group);byIndex.set(group.groupIndex,group);
  }
  return Object.freeze({byName,byIndex});
}
export function parseR9Progression(raw,lookup){
  if(typeof raw!=='string'||raw.length>4096)return {kind:'error',reason:'too-long'};
  const pieces=raw.split(',');
  if(pieces.length<1||pieces.length>32)return {kind:'error',reason:'too-many-chords'};
  const rows=[];
  for(let i=0;i<pieces.length;i++){
    const label=pieces[i].trim();
    if(!label)return {kind:'error',reason:'empty-chord',index:i+1};
    const group=lookup.byName.get(fold(label));
    if(!group)return {kind:'error',reason:'not-in-qualified-r9-pool',index:i+1,label};
    rows.push({label:groupLabel(group),groupIndex:group.groupIndex,positionIndex:group.positionIndices[0]});
  }
  return {kind:'valid',rows};
}
export function qualifyR9Snapshot(value,lookup){
  if(!value||typeof value!=='object'||Array.isArray(value)||value.version!==1||value.format!==R9_SESSION_FORMAT||value.pack!==R9_SOURCE_SHA||
    !Number.isSafeInteger(value.lastIssued)||value.lastIssued<1||!Array.isArray(value.entries)||!value.entries.length||value.entries.length>32)
    return null;
  const seen=new Set();let max=0;
  for(const row of value.entries){
    if(!row||typeof row!=='object'||typeof row.id!=='string'||!/^r9-occ-[1-9][0-9]*$/.test(row.id)||seen.has(row.id)||
       !Number.isInteger(row.groupIndex)||!Number.isInteger(row.positionIndex))return null;
    const number=Number(row.id.slice(7));
    if(!Number.isSafeInteger(number)||number<1||number>value.lastIssued)return null;
    const group=lookup.byIndex.get(row.groupIndex);
    if(!group||!group.positionIndices.includes(row.positionIndex))return null;
    max=Math.max(max,number);seen.add(row.id);
  }
  if(max>value.lastIssued)return null;
  return Object.freeze({version:1,format:R9_SESSION_FORMAT,pack:R9_SOURCE_SHA,lastIssued:value.lastIssued,
    entries:value.entries.map(row=>Object.freeze({id:row.id,groupIndex:row.groupIndex,positionIndex:row.positionIndex}))});
}
export function nextPosition(entry,direction,lookup){
  if(!entry||![-1,1].includes(direction))return null;
  const group=lookup.byIndex.get(entry.groupIndex),index=group?.positionIndices.indexOf(entry.positionIndex)??-1;
  if(index<0)return null;
  const next=group.positionIndices[(index+direction+group.positionIndices.length)%group.positionIndices.length];
  return {...entry,positionIndex:next};
}
