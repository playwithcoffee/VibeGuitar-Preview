/** M1-03B: pure physical string / fret window / finger / barre diagram geometry. */
const invalid = reason => ({ kind: 'diagram-invalid', reason });
export function planChordDiagram(shape) {
  const strings = shape?.voicing?.strings;
  if (!Array.isArray(strings) || strings.length !== 6 ||
      !Array.isArray(shape.fingers) || shape.fingers.length !== 6 ||
      !Array.isArray(shape.barres)) return invalid('shape-structure');
  const frets = strings.filter(s => s?.kind === 'fretted').map(s => s.fret);
  if (frets.some(f => !Number.isInteger(f) || f < 1 || f > 24)) return invalid('fret');
  const minFret = frets.length ? Math.min(...frets) : 1;
  const firstFret = minFret >= 3 ? minFret : 1;
  if (frets.some(f => f < firstFret || f > firstFret + 4)) return invalid('window');
  const top = 60, step = 35;
  const points = [];
  for (let i = 0; i < 6; i++) {
    const s = strings[i]; const finger = shape.fingers[i];
    const x = 50 + i * 40;
    if (s?.kind === 'muted' || s?.kind === 'open') {
      if (finger !== null) return invalid('unfretted-finger');
      points.push(Object.freeze({ kind:s.kind, x, physicalString:6-i }));
    } else if (s?.kind === 'fretted') {
      if (!Number.isInteger(finger) || finger < 1 || finger > 4) return invalid('finger');
      points.push(Object.freeze({ kind:'fretted', x, fret:s.fret, finger,
        y: top + (s.fret - firstFret + .5) * step, physicalString:6-i }));
    } else return invalid('string-state');
  }
  const barres=[];
  for(const b of shape.barres) {
    if (!Number.isInteger(b?.finger) || b.finger < 1 || b.finger > 4 ||
        !Number.isInteger(b?.fret) || b.fret < firstFret || b.fret > firstFret + 4 ||
        !Number.isInteger(b?.fromString) || !Number.isInteger(b?.toString) ||
        b.fromString > 6 || b.toString < 1 || b.fromString <= b.toString) return invalid('barre');
    const start=6-b.fromString, end=6-b.toString;
    if (points[start].kind !== 'fretted' || points[end].kind !== 'fretted' ||
        points[start].finger !== b.finger || points[end].finger !== b.finger ||
        points[start].fret !== b.fret || points[end].fret !== b.fret) return invalid('barre-endpoint');
    barres.push(Object.freeze({ finger:b.finger, fret:b.fret,
      fromString:b.fromString, toString:b.toString,
      x1:50 + start*40, x2:50+end*40,
      y:top+(b.fret-firstFret+.5)*step }));
  }
  return Object.freeze({kind:'diagram-ready', firstFret,
    points:Object.freeze(points), barres:Object.freeze(barres)});
}
