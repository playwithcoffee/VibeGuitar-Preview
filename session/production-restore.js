/** M3-P production-shape exact restore QUALIFIER. Pure read-only; no app wiring.
 * Accepts only admitted digital vg.shape.* runtime geometry, never demo IDs.
 */
import { parseChordSymbol } from '../core/music.js';
import { evaluateEligibility, evaluateVoicing } from '../core/guitar.js';
import { planChordDiagram } from '../app/diagram-plan.js';
import { validateProductionSessionV2 } from './production-contract.js';

const own = x => x!==null && typeof x==='object' && !Array.isArray(x) &&
  (Object.getPrototypeOf(x)===Object.prototype || Object.getPrototypeOf(x)===null);
const validRequestKey=k=>{
  if(typeof k!=='string') return null;
  const m=/^(0|[1-9]|1[01]):(major|minor|dominant7|major7|minor7):(\*|0|[1-9]|1[01])$/u.exec(k);
  return m?{rootPc:Number(m[1]),quality:m[2],slashBassPc:m[3]==='*'?null:Number(m[3])}:null;
};
export function inspectProductionCatalogue(catalogue) {
  if(catalogue?.kind==='unavailable') return {kind:'foundation-failure',reason:'catalogue-unavailable'};
  if(!own(catalogue) || catalogue.kind!=='ready' ||
     !Array.isArray(catalogue.shapes) || catalogue.shapes.length<1 ||
     !own(catalogue.defaults) || Object.keys(catalogue.defaults).length<1)
    return {kind:'foundation-failure',reason:'catalogue-invalid'};
  const byId=new Map();
  for(const shape of catalogue.shapes){
    if(!own(shape) || typeof shape.id!=='string' ||
       !/^vg\.shape\.[0-9]{4,}$/u.test(shape.id) || byId.has(shape.id) ||
       shape.verification!=='digital-source-check-only' ||
       !own(shape.voicing) || evaluateVoicing(shape.voicing).kind!=='ok' ||
       planChordDiagram(shape).kind!=='diagram-ready')
      return {kind:'foundation-failure',reason:'catalogue-invalid'};
    byId.set(shape.id,shape);
  }
  for(const [key,id] of Object.entries(catalogue.defaults)){
    const req=validRequestKey(key), shape=byId.get(id);
    if(!req || !shape || evaluateEligibility(req,shape.voicing).kind!=='eligible')
      return {kind:'foundation-failure',reason:'catalogue-invalid'};
  }
  return {kind:'ok',byId};
}
/** readResult is a typed future storage result. No I/O or controller mutation. */
export function qualifyProductionRestore(readResult,catalogue) {
  if(!own(readResult)) return {kind:'storage-failure',reason:'invalid-read-result'};
  if(readResult.kind==='inaccessible') return {kind:'storage-failure',reason:'inaccessible'};
  if(readResult.kind==='corrupt') return {kind:'protected-recovery',reason:'corrupt-record'};
  if(readResult.kind==='unsupported-schema') return {kind:'protected-recovery',reason:'unsupported-schema'};
  if(readResult.kind!=='absent' && readResult.kind!=='record')
    return {kind:'storage-failure',reason:'invalid-read-result'};
  const checkedCatalogue=inspectProductionCatalogue(catalogue);
  if(checkedCatalogue.kind!=='ok') return checkedCatalogue;
  if(readResult.kind==='absent') return {kind:'absent'};
  const checked=validateProductionSessionV2(readResult.session);
  if(checked.kind==='unsupported-schema')
    return {kind:'protected-recovery',reason:'unsupported-schema'};
  if(checked.kind!=='ok') return {kind:'protected-recovery',reason:'corrupt-record'};
  const arrangement=[];
  for(const e of checked.session.occurrences) {
    const parsed=parseChordSymbol(e.label);
    if(parsed.kind!=='ok' || parsed.request.label!==e.label)
      return {kind:'protected-recovery',reason:'incompatible-label'};
    const shape=checkedCatalogue.byId.get(e.selectedShapeId);
    if(!shape || evaluateEligibility(parsed.request,shape.voicing).kind!=='eligible')
      return {kind:'protected-recovery',reason:'incompatible-selection'};
    arrangement.push({id:e.occurrenceId,label:e.label,shapeId:e.selectedShapeId});
  }
  return {kind:'restore-ready', arrangement,
    lastIssuedOccurrenceNumber:checked.session.lastIssuedOccurrenceNumber,
    savedCatalogueRevision:checked.session.catalogueRevision};
}
