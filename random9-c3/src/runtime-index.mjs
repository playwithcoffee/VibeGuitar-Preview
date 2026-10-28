/** Read-only runtime validation of an independently prequalified R9 candidate index.
 * This is NOT a replacement for the B1B source/decoder parity qualification.
 */
import {inspectPosition,positionId} from './adapter.mjs';
import {RANDOM9_ALGORITHM,RANDOM9_FORMAT,R9_BINARY_SHA256} from './random9.mjs';
const strict=n=>Number.isInteger(n);
export function poolFromQualifiedIndex(decoded,index){
  if(!decoded||decoded.format!=='VGC9'||decoded.sourceGroupCount!==828||decoded.sourcePositionCount!==3283||
    !Array.isArray(decoded.groups)||decoded.groups.length!==828||
    !index||index.format!=='VGFretCard-C2-Eligibility-Index-R1'||
    index.qualification!=='B1B_FULL_CORPUS_PARITY_AND_CONSERVATIVE_POLICY'||
    index.binarySHA256!==R9_BINARY_SHA256||index.algorithm!==RANDOM9_ALGORITHM||
    index.sourceGroups!==828||index.sourcePositions!==3283||index.eligibleGroups!==645||
    index.eligiblePositions!==1229||index.deferred!==2054||index.quarantined!==0||
    !Array.isArray(index.groups)||index.groups.length!==645)throw Error('C2_BAD_ELIGIBILITY_INDEX');
  const groups=[];let total=0,seenGroups=new Set(),deferred=0,quarantined=0,sourceCount=0;
  for(let gi=0;gi<decoded.groups.length;gi++){
    const g=decoded.groups[gi];if(!g||!Array.isArray(g.positions))throw Error('C2_BAD_SOURCE_GROUP');
    sourceCount+=g.positions.length;
    const valid=[];
    for(let pi=0;pi<g.positions.length;pi++){
      const c=inspectPosition(g.positions[pi]);
      if(c.status==='RENDER_CANDIDATE')valid.push(pi);
      else if(c.status==='DEFER')deferred++;
      else quarantined++;
    }
    if(!valid.length)continue;
    const e=index.groups[groups.length];
    if(!e||e.groupIndex!==gi||e.root!==g.root||e.suffix!==g.suffix||
       !Array.isArray(e.positionIndices)||e.positionIndices.length!==valid.length||
       valid.some((p,i)=>e.positionIndices[i]!==p)||seenGroups.has(gi))throw Error('C2_ELIGIBILITY_DRIFT');
    seenGroups.add(gi);
    for(const pi of valid)positionId(gi,pi);
    total+=valid.length;
    groups.push(Object.freeze({groupIndex:gi,root:g.root,suffix:g.suffix,positionIndices:Object.freeze([...valid])}));
  }
  if(sourceCount!==3283||total!==1229||groups.length!==645||deferred!==2054||quarantined!==0)
    throw Error('C2_CLASSIFICATION_DRIFT');
  return Object.freeze({format:RANDOM9_FORMAT,sourceSHA256:R9_BINARY_SHA256,
    algorithm:RANDOM9_ALGORITHM,eligiblePositions:total,eligibleGroups:groups.length,
    groups:Object.freeze(groups),decoded});
}
