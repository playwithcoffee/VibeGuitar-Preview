/** C4-A: internally admitted VibeGuitar technique -> VGFretCard SVG specification.
 * Pure: no browser, storage, history, audio, network, catalogue selection, or R9 data.
 * Rendering a digital candidate does NOT certify physical technique or production admission.
 */
import { planChordDiagram } from '../app/diagram-plan.js';
import { SCHEMA, inspectSpec, planSurface, coordinate } from './core.js';

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


/** C5 presentation only: derive note spelling and relative chord tones from
 * the already pinned digital shape. Does not alter technique or eligibility.
 * The 16-shape admission boundary above remains authoritative. */
const C5_LETTERS = 'CDEFGAB';
const C5_PCS = Object.freeze({C:0,D:2,E:4,F:5,G:7,A:9,B:11});
const C5_OPEN_MIDI = Object.freeze([40,45,50,55,59,64]);
const C5_INTERVALS = Object.freeze({
  '':[[0,'1'],[4,'3'],[7,'5']],
  maj:[[0,'1'],[4,'3'],[7,'5']],
  M:[[0,'1'],[4,'3'],[7,'5']],
  m:[[0,'1'],[3,'♭3'],[7,'5']],
  min:[[0,'1'],[3,'♭3'],[7,'5']],
  '7':[[0,'1'],[4,'3'],[7,'5'],[10,'♭7']],
  maj7:[[0,'1'],[4,'3'],[7,'5'],[11,'7']],
  M7:[[0,'1'],[4,'3'],[7,'5'],[11,'7']],
  m7:[[0,'1'],[3,'♭3'],[7,'5'],[10,'♭7']],
  min7:[[0,'1'],[3,'♭3'],[7,'5'],[10,'♭7']],
});
const c5Pc = value => (value % 12 + 12) % 12;

export function musicalNotesForShape(shape) {
  // Reuse the strict C4 pin before deriving any presentation data.
  specFromInternalShape(shape);
  const match=/^([A-G])([#b♯♭]?)(.*)$/u.exec(shape.chord);
  if(!match || !Object.hasOwn(C5_INTERVALS,match[3])) fail('c5-chord-spelling');
  const rootLetter=match[1], rootIndex=C5_LETTERS.indexOf(rootLetter);
  const rootAccidental=match[2]==='#'||match[2]==='♯'?1:match[2]==='b'||match[2]==='♭'?-1:0;
  const rootPc=c5Pc(C5_PCS[rootLetter]+rootAccidental);
  const tones=C5_INTERVALS[match[3]].map(([semitones,degree],index)=>{
    const letter=C5_LETTERS[(rootIndex+index*2)%7];
    const pc=c5Pc(rootPc+semitones);
    const delta=c5Pc(pc-C5_PCS[letter]);
    if(delta!==0 && delta!==1 && delta!==11) fail('c5-unsupported-spelling');
    return {pc, degree, note:letter+(delta===1?'♯':delta===11?'♭':''),
      root:index===0};
  });
  const notes=shape.voicing.strings.map((string,index)=>{
    if(string.kind==='muted')return null;
    const fret=string.kind==='open'?0:string.fret;
    const midi=C5_OPEN_MIDI[index]+fret;
    const tone=tones.find(t=>t.pc===c5Pc(midi));
    if(!tone)fail('c5-note-outside-chord');
    return Object.freeze({...tone,midi,fret,string:6-index,
      finger:shape.fingers[index],open:string.kind==='open'});
  });
  const bass=notes.find(Boolean);
  if(!bass)fail('c5-empty-voicing');
  return Object.freeze({notes:Object.freeze(notes),bass});
}

/** C5 Note-mode-only silhouette. Center coordinates stay exactly on C4
 * string/fret centers. The rounded pear occupies 28 x 34 SVG units; the
 * unchanged 40 x 35 grid never gets reflowed for presentation. */
export const C5_PEAR_PATH =
  'M 0 -17 C -8 -17 -14 -13 -14 -5 C -14 2 -10 8 -6 12 '+
  'Q -2 17 0 17 Q 2 17 6 12 C 10 8 14 2 14 -5 '+
  'C 14 -13 8 -17 0 -17 Z';

/** Turn a C4-generated mark into a self-contained pear-shaped teaching marker.
 * Finger mode remains the original renderer. No new root satellite, external
 * degree label, fret movement, or dependence on a user storage capability. */
export function projectFretCardDisplay(svg,shape,mode) {
  const analysis=musicalNotesForShape(shape);
  if(mode!=='note')return analysis;
  const spec=specFromInternalShape(shape);
  const groups=[...svg.querySelectorAll('.vg-mark-wrap')];
  if(groups.length!==6)fail('c5-render-shape-mismatch');
  const NS='http://www.w3.org/2000/svg';
  const create=(tag,attrs,text)=>{
    const element=document.createElementNS(NS,tag);
    for(const [name,value] of Object.entries(attrs))element.setAttribute(name,String(value));
    if(text!==undefined)element.textContent=text;
    return element;
  };
  for(let i=0;i<6;i++){
    const note=analysis.notes[i];
    if(!note)continue; // Muted strings remain the original ×.
    const group=groups[i],p=coordinate(spec.board,note.string,note.fret);
    const original=group.querySelector(note.open?'.vg-open':'.vg-dot');
    const fingerText=group.querySelector('.vg-dot-text');
    if(!original || (!note.open && !fingerText))fail('c5-marker-mismatch');
    const style='vg-pear-marker '+(note.open?'vg-pear-open':'vg-pear-fretted')+
      (note.root?' vg-pear-root':'');
    const pear=create('path',{d:C5_PEAR_PATH,
      transform:'translate('+p.x+' '+p.y+')',class:style});
    original.replaceWith(pear);
    if(fingerText)fingerText.remove();
    // Two labels, both *inside* one marker: musical note above degree.
    group.append(
      create('text',{x:p.x,y:p.y-1,'text-anchor':'middle',
        class:'vg-pear-note'+(note.note.length>1?' vg-pear-accidental':''),
        'pointer-events':'none'},note.note),
      create('text',{x:p.x,y:p.y+11,'text-anchor':'middle',
        class:'vg-pear-degree'+(note.degree.length>1?' vg-pear-degree-long':''),
        'pointer-events':'none'},note.degree)
    );
  }
  svg.classList.add('vg-note-mode','vg-pear-note-mode');
  return analysis;
}
