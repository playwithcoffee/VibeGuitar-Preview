/** VibeGuitar I0 pure progression and exact occurrence operations. D019-D023. */
import { parseChordSymbol, requestKey,                                         } from './music.js';
import { evaluateEligibility, evaluateVoicing,              } from './guitar.js';

/** TEST-ONLY injected shape snapshot. This is NOT a qualified production catalogue. */
                                                                                
                              
                                    
     
                             
                                               
                                                                                    
                                                          
      

                                       
                         
                                 
                                  
 

                          
                                                                
                         
                                                          
  

                           
                                                                                    
                                                                        
                                                                                      
                                                                                                                 

                        
                      
                         
                           
 
                                           

                           
                                                                    
                                                                                                       

                          
                                                                   
                                                                 
                                                                                                                                                                     

function snapshotCheck(catalogue                  )                                           {
  if (catalogue.kind === 'unavailable') return 'unavailable';
  if (catalogue.kind !== 'ready' || !Array.isArray(catalogue.shapes)
    || !catalogue.defaults || typeof catalogue.defaults !== 'object') return 'invalid-fixture';
  const ids = new Set        ();
  for (const shape of catalogue.shapes) {
    if (!shape || typeof shape.id !== 'string' || !shape.id || ids.has(shape.id)
      || !shape.voicing || evaluateVoicing(shape.voicing).kind !== 'ok') return 'invalid-fixture';
    ids.add(shape.id);
  }
  return 'ok';
}

function eligibleFixtureShapes(request              , catalogue                                           )                          {
  return catalogue.shapes.filter(s => evaluateEligibility(request, s.voicing).kind === 'eligible');
}

/** Analysis never generates IDs, saves, edits an arrangement, or reads platform state. */
export function analyzeProgression(raw        , catalogue                  )                {
  // JS string.length counts UTF-16 code units, as explicitly selected in D020.
  if (raw.length > 4096) return { kind: 'bounds-error', reason: 'raw-length' };
  const segments = raw.split(',');
  if (segments.length > 32) return { kind: 'bounds-error', reason: 'segment-count' };
  const check = snapshotCheck(catalogue);
  if (check !== 'ok') return { kind: 'catalogue-error', reason: check };
  // Type guard needed because check string result isn't a discriminant for catalogue.
  if (catalogue.kind !== 'ready') return { kind: 'catalogue-error', reason: 'unavailable' };

  const errors               = [];
  const candidates                         = [];
  for (let i = 0; i < segments.length; i++) {
    const label = segments[i].trim();
    const parsed = parseChordSymbol(label);
    if (parsed.kind === 'error') {
      errors.push({ segment: i + 1, label, reason: parsed.reason });
      continue;
    }
    const eligible = eligibleFixtureShapes(parsed.request, catalogue);
    if (eligible.length === 0) {
      errors.push({ segment: i + 1, label, reason: 'no-supported-shape' });
      continue;
    }
    const key = requestKey(parsed.request);
    const preferred = Object.hasOwn(catalogue.defaults, key) ? catalogue.defaults[key] : null;
    if (preferred === null || !eligible.some(s => s.id === preferred)) {
      return { kind: 'catalogue-error', reason: 'invalid-default' };
    }
    candidates.push({ label, request: parsed.request, defaultShapeId: preferred });
  }
  return errors.length > 0 ? { kind: 'invalid', errors } : { kind: 'valid', candidates };
}

/** Every replacement gets fresh externally supplied IDs; stale or reused IDs reject atomically. */
export function replaceProgression(
  current             ,
  candidates                                 ,
  freshIds                   ,
  /** All known earlier minted IDs; app boundary must supply a complete history for nonreuse. */
  alreadyUsedIds                     ,
)                {
  if (!Array.isArray(candidates) || candidates.length === 0 || candidates.length > 32
    || candidates.some(c => {
      if (!c || typeof c.label !== 'string' || !c.label
        || typeof c.defaultShapeId !== 'string' || !c.defaultShapeId) return true;
      const parsed = parseChordSymbol(c.label);
      return parsed.kind !== 'ok' || !c.request
        || parsed.request.label !== c.request.label
        || parsed.request.rootPc !== c.request.rootPc
        || parsed.request.quality !== c.request.quality
        || parsed.request.slashBassPc !== c.request.slashBassPc;
    })) {
    return { kind: 'rejected', reason: 'invalid-candidate' };
  }
  const seen = new Set        ();
  if (!Array.isArray(freshIds) || freshIds.length !== candidates.length || freshIds.some(id => {
    if (typeof id !== 'string' || !id.trim() || seen.has(id)) return true;
    seen.add(id); return false;
  })) return { kind: 'rejected', reason: 'invalid-ids' };
  if (freshIds.some(id => alreadyUsedIds.has(id) || current.some(e => e.id === id))) {
    return { kind: 'rejected', reason: 'reused-ids' };
  }
  return {
    kind: 'replaced',
    arrangement: candidates.map((c, i) => ({ id: freshIds[i], label: c.label, shapeId: c.defaultShapeId })),
  };
}

/** No index-targeting, shape auto-defaults, saves, clock or random ID generation. */
export function selectOccurrenceShape(
  current             ,
  occurrenceId        ,
  shapeId        ,
  catalogue                  ,
)               {
  const targets = current.filter(e => e.id === occurrenceId);
  if (targets.length !== 1 || current.some(e => !e.id || current.filter(x => x.id === e.id).length !== 1)) {
    return { kind: 'rejected', reason: 'missing-or-ambiguous-target' };
  }
  const target = targets[0];
  const parsed = parseChordSymbol(target.label);
  if (parsed.kind !== 'ok') return { kind: 'rejected', reason: 'invalid-label' };
  if (snapshotCheck(catalogue) !== 'ok' || catalogue.kind !== 'ready') {
    return { kind: 'rejected', reason: 'unavailable-catalogue' };
  }
  const shape = catalogue.shapes.find(s => s.id === shapeId);
  if (!shape) return { kind: 'rejected', reason: 'unknown-shape' };
  if (evaluateEligibility(parsed.request, shape.voicing).kind !== 'eligible') {
    return { kind: 'rejected', reason: 'ineligible-shape' };
  }
  if (target.shapeId === shapeId) return { kind: 'no-op', arrangement: current };
  return {
    kind: 'changed',
    arrangement: current.map(e => e.id === occurrenceId ? { ...e, shapeId } : e),
  };
}
