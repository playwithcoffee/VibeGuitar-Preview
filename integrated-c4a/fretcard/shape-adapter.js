/** C4-A: internally admitted VibeGuitar technique -> VGFretCard SVG specification.
 * Pure: no browser, storage, history, audio, network, catalogue selection, or R9 data.
 * Rendering a digital candidate does NOT certify physical technique or production admission.
 */
import { planChordDiagram } from '../app/diagram-plan.js';
import { SCHEMA, inspectSpec, planSurface } from './core.js';

// C4-A only: the current sixteen reserved internal-digital identities.
const idPattern=/^vg\.shape\.(?:000[1-9]|001[0-6])$/u;
const fail=reason=>{ throw Error('C4A_FRETCARD_HOLD:'+reason); };
// Redundant consumer-boundary pin, derived from the M1-02 identity ledger.
// Build admission checks the source provenance separately. This renderer must
// not accept modified frets, fingers or barre intent under an existing ID.
// No catalogue research data, rights claim or production-admission status here.
const EXACT_DIGITAL_TECHNIQUES = new Map([
  ['vg.shape.0001', 'C|x.3.2.0.1.0|-.3.2.-.1.-|-'],
  ['vg.shape.0002', 'C|x.3.5.5.5.3|-.1.2.3.4.1|1@3:5-1'],
  ['vg.shape.0003', 'G|3.2.0.0.0.3|2.1.-.-.-.3|-'],
  ['vg.shape.0004', 'G|x.x.5.7.8.7|-.-.1.2.4.3|-'],
  ['vg.shape.0005', 'Am|x.0.2.2.1.0|-.-.2.3.1.-|-'],
  ['vg.shape.0006', 'Am|x.0.7.9.10.8|-.-.1.3.4.2|-'],
  ['vg.shape.0007', 'F|1.3.3.2.1.1|1.3.4.2.1.1|1@1:6-1'],
  ['vg.shape.0008', 'F|x.x.3.5.6.5|-.-.1.2.4.3|-'],
  ['vg.shape.0009', 'D|x.x.0.2.3.2|-.-.-.1.3.2|-'],
  ['vg.shape.0010', 'E|0.2.2.1.0.0|-.2.3.1.-.-|-'],
  ['vg.shape.0011', 'A|x.0.2.2.2.0|-.-.1.2.3.-|-'],
  ['vg.shape.0012', 'Dm|x.x.0.2.3.1|-.-.-.2.3.1|-'],
  ['vg.shape.0013', 'Em|0.2.2.0.0.0|-.2.3.-.-.-|-'],
  ['vg.shape.0014', 'A7|x.0.2.0.2.0|-.-.2.-.3.-|-'],
  ['vg.shape.0015', 'D7|x.x.0.2.1.2|-.-.-.2.1.3|-'],
  ['vg.shape.0016', 'G7|3.2.0.0.0.1|3.2.-.-.-.1|-'],
]);

function techniqueToken(shape) {
  const strings=shape?.voicing?.strings;
  if(!Array.isArray(strings)||strings.length!==6||!Array.isArray(shape.fingers)||
     shape.fingers.length!==6||!Array.isArray(shape.barres)) return null;
  const frets=strings.map(s=>s?.kind==='muted'?'x':s?.kind==='open'?'0':
    s?.kind==='fretted'?String(s.fret):'?').join('.');
  const fingers=shape.fingers.map(f=>f===null?'-':String(f)).join('.');
  const barres=shape.barres.map(b=>
    String(b?.finger)+'@'+String(b?.fret)+':'+String(b?.fromString)+'-'+String(b?.toString)).join(',');
  return shape.chord+'|'+frets+'|'+fingers+'|'+(barres||'-');
}

export function specFromInternalShape(shape) {
  if(typeof shape?.id!=='string' || !idPattern.test(shape.id) ||
     shape.verification!=='digital-source-check-only')fail('unqualified-shape');
  if(techniqueToken(shape)!==EXACT_DIGITAL_TECHNIQUES.get(shape.id))fail('historical-technique-mismatch');
  const p=planChordDiagram(shape);
  if(p.kind!=='diagram-ready')fail('diagram-'+p.reason);
  const marks=p.points.map(q=>{
    const base={id:`string-${q.physicalString}`,role:q.kind==='muted'?'muted':q.kind==='open'?'open':'primary',string:q.physicalString};
    if(q.kind==='muted')return {...base,kind:'mute',ariaLabel:`Muted string ${q.physicalString}`};
    if(q.kind==='open')return {...base,kind:'open',fret:0,ariaLabel:`Open string ${q.physicalString}`};
    return {...base,kind:'point',fret:q.fret,glyph:'dot',label:String(q.finger),
      ariaLabel:`String ${q.physicalString}, fret ${q.fret}, finger ${q.finger}`};
  });
  p.barres.forEach((b,i)=>marks.push({id:`barre-${i}`,kind:'span',glyph:'barre',role:'primary',
    fret:b.fret,fromString:b.fromString,toString:b.toString,
    ariaLabel:`Finger ${b.finger} barre on fret ${b.fret}, strings ${b.fromString} to ${b.toString}`}));
  const spec={schema:SCHEMA,cardId:shape.id,
    board:{boardId:'vg.board.standard6',profileId:'guitar.standard6',stringCount:6,
      orientation:'vertical',handedness:'right',firstFret:p.firstFret,fretCount:5,blankCellActions:false},
    layers:[{layerId:'digitally-checked-technique',order:0,visible:true,interactive:false,marks}],
    context:{shapeId:shape.id,verification:shape.verification}};
  const checked=inspectSpec(spec);
  if(!checked.ok)fail('spec-'+checked.code);
  const surface=planSurface(spec);
  if(!surface.ok || surface.marks.length!==6+p.barres.length)fail('surface');
  return spec;
}

export function describeInternalShape(shape, chordLabel) {
  const p=planChordDiagram(shape);
  if(p.kind!=='diagram-ready' || typeof chordLabel!=='string')fail('description');
  const pattern=shape.voicing.strings.map(s=>s.kind==='muted'?'X':s.kind==='open'?'0':String(s.fret)).join(' · ');
  return [`${chordLabel} digitally checked position`, `strings low E to high e: ${pattern}`,
    ...p.points.filter(x=>x.kind==='fretted').map(x=>`string ${x.physicalString}, fret ${x.fret}, finger ${x.finger}`),
    ...p.barres.map(x=>`finger ${x.finger} barre on fret ${x.fret}, strings ${x.fromString} to ${x.toString}`),
    'physical technique not instrument verified'].join('; ');
}
