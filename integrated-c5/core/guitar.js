/** VibeGuitar I0 fixed-tuning pure pitch/eligibility rules. D009-D010. */
import { requiredPitchClasses,                   } from './music.js';

export const STANDARD_TUNING_MIDI                    = Object.freeze([40, 45, 50, 55, 59, 64]);

/** Physical six-string data is always low E (string 6) through high e (string 1). */
                         
                              
                             
                                                        

                          
                                           
 

                           
                                                                                                
                                                                                                                

                               
                                                                                                                               
                                                                                                                                           

/** Never normalizes malformed frets by truncation or clipping. */
export function evaluateVoicing(voicing         )                {
  if (!Array.isArray(voicing.strings) || voicing.strings.length !== 6) {
    return { kind: 'invalid', reason: 'not-six-strings' };
  }
  const soundingMidi           = [];
  for (let i = 0; i < 6; i++) {
    const state = voicing.strings[i];
    if (!state || typeof state !== 'object') return { kind: 'invalid', reason: 'invalid-string' };
    if (state.kind === 'muted') continue;
    if (state.kind === 'open') { soundingMidi.push(STANDARD_TUNING_MIDI[i]); continue; }
    if (state.kind !== 'fretted' || !Number.isInteger(state.fret) || state.fret < 1 || state.fret > 24) {
      return { kind: 'invalid', reason: 'invalid-string' };
    }
    soundingMidi.push(STANDARD_TUNING_MIDI[i] + state.fret);
  }
  if (soundingMidi.length === 0) return { kind: 'invalid', reason: 'no-sounding-strings' };
  return { kind: 'ok', soundingMidi, bassMidi: Math.min(...soundingMidi) };
}

/** A complete declared triad/seventh with no outside tones; slash uses ACTUAL lowest note. */
export function evaluateEligibility(request              , voicing         )                    {
  const notes = evaluateVoicing(voicing);
  if (notes.kind === 'invalid') return { kind: 'ineligible', reason: 'invalid-voicing' };
  const required = new Set(requiredPitchClasses(request));
  const actual = new Set(notes.soundingMidi.map(n => n % 12));
  if ([...required].some(pc => !actual.has(pc))) {
    return { kind: 'ineligible', reason: 'missing-required-tone' };
  }
  if ([...actual].some(pc => !required.has(pc))) {
    return { kind: 'ineligible', reason: 'outside-tone' };
  }
  const bassPc = notes.bassMidi % 12;
  if (request.slashBassPc !== null && bassPc !== request.slashBassPc) {
    return { kind: 'ineligible', reason: 'slash-bass-mismatch' };
  }
  return { kind: 'eligible', bassMidi: notes.bassMidi, bassPc, soundingMidi: notes.soundingMidi };
}
