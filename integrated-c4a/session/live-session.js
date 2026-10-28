/** M3-L live coordinator; pure except for its injected Storage port.
 * Never persists startup demo or an inspector draft. Explicit recovery
 * replacement requires a separately confirmed user action in the browser.
 */
import { createProductionSessionPort } from './production-storage.js';
import { captureProductionSessionV2 } from './production-contract.js';
import { qualifyProductionRestore } from './production-restore.js';

export function createLiveSession({storage,controller,catalogue,catalogueRevision}) {
  const port=createProductionSessionPort(storage);
  let phase='unstarted';
  let acceptedByUser=false;
  let detail='';
  function status() {
    const messages={
      'unstarted':'Session not initialized.',
      'first-use':'Not yet saved. Accepted changes will be saved in this browser.',
      'saved':'Accepted progression saved in this browser; drafts are not saved (immediate readback verified, browser data may still be cleared).',
      'protected':'Protected saved session detected. No automatic saving. Edit your progression, then explicitly replace to begin a new saved session.',
      'memory-only':'Memory-only: storage unavailable. Changes will not survive a reload.',
      'unsaved':'Unsaved: storage write could not be verified. Current chords remain in memory.',
      'foundation-error':'Catalogue unavailable. Session storage is disabled.',
    };
    return {phase,message:messages[phase],detail,
      canRetry:acceptedByUser && (phase==='unsaved'||phase==='memory-only'),
      canReplace:acceptedByUser && phase==='protected'};
  }
  function start() {
    if(phase!=='unstarted') return {kind:'rejected',reason:'already-started'};
    const result=qualifyProductionRestore(port.read(),catalogue);
    if(result.kind==='restore-ready') {
      const installed=controller.installQualifiedRestore(result);
      if(installed.kind!=='restored') {
        phase='foundation-error';detail='controller-restore-rejected';
      } else {phase='saved';detail='exact-session-restored';}
    } else if(result.kind==='absent') {phase='first-use';}
    else if(result.kind==='protected-recovery') {phase='protected';detail=result.reason;}
    else if(result.kind==='foundation-failure') {phase='foundation-error';detail=result.reason;}
    else {phase='memory-only';detail=result.reason||'storage-failure';}
    return {kind:phase,restored:phase==='saved',status:status()};
  }
  function snapshot() {
    const captured=captureProductionSessionV2(controller.persistenceSnapshot(),catalogueRevision);
    return captured.kind==='ok'?captured.session:null;
  }
  function tryWrite(replacement=false) {
    const value=snapshot();
    if(!value) {phase='unsaved';detail='invalid-accepted-arrangement';return status();}
    const result=replacement?port.replaceProtected(value):port.write(value);
    if(result.kind==='saved') {phase='saved';detail=replacement?'explicit-replacement-recovery-copy-retained':'';}
    else {phase=replacement?'protected':'unsaved';detail=result.reason||result.kind;}
    return status();
  }
  function acceptedChange() {
    if(phase==='unstarted') return status();
    acceptedByUser=true;
    if(phase==='first-use'||phase==='saved') return tryWrite();
    return status();
  }
  function retry() {
    if(!acceptedByUser || !['unsaved','memory-only'].includes(phase)) return status();
    if(phase==='memory-only') {
      const outcome=qualifyProductionRestore(port.read(),catalogue);
      if(outcome.kind!=='absent') {
        phase=outcome.kind==='protected-recovery'||outcome.kind==='restore-ready'?'protected':'memory-only';
        detail=outcome.reason||'storage-has-changed';return status();
      }
    }
    return tryWrite();
  }
  function replaceSavedAfterConfirmation() {
    if(phase!=='protected'||!acceptedByUser) return status();
    return tryWrite(true);
  }
  return Object.freeze({start,status,acceptedChange,retry,replaceSavedAfterConfirmation});
}
