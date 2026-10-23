/** VibeGuitar I0 pure fixture-only music semantics. D015-D018. No I/O. */
                                                                                 

                               
                                                                      
                                                       
                                 
                                      
 

                                                                                          
                          
                                                           
                                                                 

const NATURAL_PC                                   = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

const SUFFIX                                         = {
  '': 'major', maj: 'major', M: 'major',
  m: 'minor', min: 'minor',
  '7': 'dominant7', maj7: 'major7', M7: 'major7',
  m7: 'minor7', min7: 'minor7',
};

const INTERVALS                                                    = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  dominant7: [0, 4, 7, 10],
  major7: [0, 4, 7, 11],
  minor7: [0, 3, 7, 10],
};

function pitchClassOfNote(letter        , accidental        )         {
  const natural = NATURAL_PC[letter.toUpperCase()];
  const offset = accidental === '#' || accidental === '♯' ? 1
    : accidental === 'b' || accidental === '♭' ? -1 : 0;
  return (natural + offset + 12) % 12;
}

/** Full-symbol parsing: no fuzzy substrings, implicit aliases, or inferred key. */
export function parseChordSymbol(labelInput        )               {
  const label = labelInput.trim();
  if (!label) return { kind: 'error', reason: 'missing-token' };

  const parts = label.split('/');
  if (parts.length > 2 || parts.some(part => part === '')) {
    return { kind: 'error', reason: 'malformed-token' };
  }

  const rootAndSuffix = /^([A-Ga-g])([#b♯♭]?)(.*)$/u.exec(parts[0]);
  if (!rootAndSuffix) {
    return { kind: 'error', reason: 'unsupported-grammar' };
  }
  const suffix = rootAndSuffix[3];
  if (!Object.hasOwn(SUFFIX, suffix)) {
    return { kind: 'error', reason: 'unsupported-grammar' };
  }
  let slashBassPc                = null;
  if (parts.length === 2) {
    const bass = /^([A-Ga-g])([#b♯♭]?)$/u.exec(parts[1]);
    if (!bass) return { kind: 'error', reason: 'malformed-token' };
    slashBassPc = pitchClassOfNote(bass[1], bass[2]);
  }
  return {
    kind: 'ok',
    request: {
      label,
      rootPc: pitchClassOfNote(rootAndSuffix[1], rootAndSuffix[2]),
      quality: SUFFIX[suffix],
      slashBassPc,
    },
  };
}

export function requiredPitchClasses(chord              )                    {
  return INTERVALS[chord.quality].map(i => (chord.rootPc + i) % 12);
}

/** Canonical *request* key, not a catalogue shape ID or saved chord label. */
export function requestKey(chord              )         {
  return `${chord.rootPc}:${chord.quality}:${chord.slashBassPc ?? '*'}`;
}
