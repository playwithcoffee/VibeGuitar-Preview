/** Pure progression controller, catalogue injected by caller. No development data, browser or persistence. */
import { parseChordSymbol, requestKey } from '../core/music.js';
import { evaluateEligibility } from '../core/guitar.js';
import { analyzeProgression, replaceProgression, selectOccurrenceShape } from '../core/progression.js';

export function makeController(catalogue) {
  let arrangement = [];
  let history = new Set();
  let lastNumber = 0;
  let inspector = null;

  function copyArrangement() { return arrangement.map(e => ({ ...e })); }
  // Capture only the accepted arrangement and the high-water mark. Historical IDs
  // <= watermark can never be issued again after a qualified restoration.
  function persistenceSnapshot() {
    return { arrangement: copyArrangement(), lastIssuedOccurrenceNumber:lastNumber };
  }
  function installQualifiedRestore(candidate) {
    // Atomic one-time install, before any initial demo submit or user editing.
    if(arrangement.length || history.size || lastNumber!==0 || inspector)
      return {kind:'rejected',reason:'controller-not-pristine'};
    if(!candidate || candidate.kind!=='restore-ready' ||
       !Array.isArray(candidate.arrangement) || candidate.arrangement.length<1 ||
       candidate.arrangement.length>32 ||
       !Number.isSafeInteger(candidate.lastIssuedOccurrenceNumber) ||
       candidate.lastIssuedOccurrenceNumber<1 ||
       candidate.lastIssuedOccurrenceNumber>Number.MAX_SAFE_INTEGER-32 ||
       catalogue?.kind!=='ready' || !Array.isArray(catalogue.shapes))
      return {kind:'rejected',reason:'invalid-restore-candidate'};
    const seen=new Set(), entries=[];
    for(const e of candidate.arrangement){
      if(!e || typeof e.id!=='string' || !/^i1-occurrence-[1-9][0-9]*$/u.test(e.id) ||
         !Number.isSafeInteger(Number(e.id.slice(14))) ||
         String(Number(e.id.slice(14)))!==e.id.slice(14) ||
         Number(e.id.slice(14))>candidate.lastIssuedOccurrenceNumber ||
         seen.has(e.id) || typeof e.label!=='string' ||
         typeof e.shapeId!=='string')
        return {kind:'rejected',reason:'invalid-restore-candidate'};
      const parsed=parseChordSymbol(e.label);
      const shape=catalogue.shapes.find(s=>s.id===e.shapeId);
      if(parsed.kind!=='ok' || parsed.request.label!==e.label || !shape ||
         evaluateEligibility(parsed.request,shape.voicing).kind!=='eligible')
        return {kind:'rejected',reason:'invalid-restore-candidate'};
      seen.add(e.id);
      entries.push({id:e.id,label:e.label,shapeId:e.shapeId});
    }
    arrangement=entries;
    lastNumber=candidate.lastIssuedOccurrenceNumber;
    history=new Set(seen);
    inspector=null;
    return {kind:'restored',arrangement:copyArrangement()};
  }
  function state() { return { arrangement: copyArrangement(), inspector: inspector ? { ...inspector } : null }; }
  function eligibleShapes(label) {
    const parsed = parseChordSymbol(label);
    if (parsed.kind !== 'ok' || catalogue.kind !== 'ready') return [];
    return catalogue.shapes.filter(s => evaluateEligibility(parsed.request, s.voicing).kind === 'eligible');
  }
  function getShape(id) {
    return catalogue.kind === 'ready' ? catalogue.shapes.find(shape => shape.id === id) || null : null;
  }
  function submit(raw) {
    const analyzed = analyzeProgression(raw, catalogue);
    if (analyzed.kind !== 'valid') return { kind: 'rejected', detail: analyzed };
    if (lastNumber > Number.MAX_SAFE_INTEGER - 32)
      return {kind:'rejected',detail:{kind:'bounds-error',reason:'occurrence-id-exhausted'}};
    const freshIds = analyzed.candidates.map((_, i) => `i1-occurrence-${lastNumber + i + 1}`);
    const result = replaceProgression(arrangement, analyzed.candidates, freshIds, history);
    if (result.kind !== 'replaced') return { kind: 'rejected', detail: result };
    for (const id of freshIds) history.add(id);
    lastNumber += freshIds.length;
    arrangement = result.arrangement;
    inspector = null;
    return { kind: 'replaced', arrangement: copyArrangement() };
  }
  function openInspector(occurrenceId) {
    // One inspector owns its own draft; a second opening cannot replace it.
    if (inspector) return { kind: 'rejected', reason: 'inspector-already-open' };
    const matches = arrangement.filter(e => e.id === occurrenceId);
    if (matches.length !== 1) return { kind: 'rejected', reason: 'missing-target' };
    const target = matches[0];
    const options = eligibleShapes(target.label);
    if (!options.some(s => s.id === target.shapeId)) return { kind: 'rejected', reason: 'invalid-current-shape' };
    inspector = { occurrenceId, label: target.label, baselineShapeId: target.shapeId, selectedShapeId: target.shapeId };
    return { kind: 'opened', inspector: { ...inspector }, options: [...options] };
  }
  function preview(shapeId) {
    if (!inspector) return { kind: 'rejected', reason: 'inspector-closed' };
    if (!eligibleShapes(inspector.label).some(s => s.id === shapeId)) {
      return { kind: 'rejected', reason: 'ineligible-preview' };
    }
    inspector = { ...inspector, selectedShapeId: shapeId };
    return { kind: 'previewed', inspector: { ...inspector } };
  }
  function cancel() {
    inspector = null;
    return { kind: 'cancelled', arrangement: copyArrangement() };
  }
  function apply() {
    if (!inspector) return { kind: 'rejected', reason: 'inspector-closed' };
    const { occurrenceId, label, baselineShapeId, selectedShapeId } = inspector;
    const matches = arrangement.filter(e => e.id === occurrenceId);
    if (matches.length !== 1 || matches[0].label !== label || matches[0].shapeId !== baselineShapeId) {
      inspector = null;
      return { kind: 'rejected', reason: 'stale-target' };
    }
    const result = selectOccurrenceShape(arrangement, occurrenceId, selectedShapeId, catalogue);
    if (result.kind === 'changed' || result.kind === 'no-op') {
      arrangement = result.arrangement;
      inspector = null;
      return { kind: result.kind, arrangement: copyArrangement() };
    }
    return { kind: 'rejected', reason: result.reason };
  }
  return { state, persistenceSnapshot, installQualifiedRestore, submit, eligibleShapes, getShape, openInspector, preview, cancel, apply };
}

/** Pure presentation wording, deliberately separate from musical eligibility decisions. */
export function explainProgressionFailure(result) {
  const issue = result?.kind === 'rejected' && result.detail ? result.detail : result;
  if (issue?.kind === 'bounds-error') {
    return issue.reason === 'raw-length'
      ? 'Input is too long: use at most 4,096 characters. Nothing was applied.'
      : 'Too many chords: use at most 32 comma-separated entries. Nothing was applied.';
  }
  if (issue?.kind === 'catalogue-error') {
    return 'Chord catalogue unavailable or inconsistent. Previous accepted chords were preserved.';
  }
  if (issue?.kind === 'invalid') {
    const reasons = {
      'missing-token': 'Empty chord; remove the extra comma or add a chord.',
      'malformed-token': 'Malformed chord or slash-bass spelling.',
      'unsupported-grammar': 'Unsupported chord syntax or family.',
      'no-supported-shape': 'Recognized chord, but no position in the admitted digital catalogue.',
    };
    const detail = issue.errors.map(e =>
      `Position ${e.segment} (${e.label || 'empty'}): ${reasons[e.reason] || 'Invalid chord.'}`
    );
    return `${issue.errors.length} issue${issue.errors.length === 1 ? '' : 's'}; nothing was applied.\n${detail.join('\n')}`;
  }
  return 'Could not apply the progression. Accepted chords were preserved.';
}
