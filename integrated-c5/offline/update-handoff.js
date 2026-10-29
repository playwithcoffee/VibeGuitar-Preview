// M4-U2: presentation-only safety policy for a verified waiting release.
// Does not update a registration, activate workers, reload, or read/write storage.
const RELEASE = /^[a-f0-9]{64}$/;
const HIDE = Object.freeze({ visible:false, phase:'hidden', message:'' });
export function describeUpdateHandoff(candidate, session, { pendingDraft = false, inspectorOpen = false } = {}) {
  // An incomplete waiting cache is a failed update, not a new release.
  // Show a truthful, non-actionable warning; the active app has its own
  // independently verified offline status and saved-session indicator.
  if (candidate?.phase === 'incomplete') return Object.freeze({visible:true,
    phase:'failed',message:'A replacement offline release could not be verified. No update is ready. Keep using this version only if its offline files are verified; your saved-session status is separate. No update was forced.'});
  if (!candidate || candidate.phase !== 'ready' || !RELEASE.test(candidate.release || '') ||
      !Number.isSafeInteger(candidate.assets) || candidate.assets < 1) return HIDE;
  const phase = session?.phase;
  const safeToClose = (phase === 'saved' || phase === 'first-use') &&
    !pendingDraft && !inspectorOpen;
  if (safeToClose) return Object.freeze({visible:true, phase:'ready',
    message:'New offline release verified. When you are finished, close every VibeGuitar tab and window, then reopen to allow the browser to update. No switch will be forced; other open tabs can delay it.'});
  return Object.freeze({visible:true, phase:'deferred',
    message:'New offline release verified, but the update can wait. Current work or session saving needs attention before closing. Do not close to update until your changes are safely saved and any drafts are finished.'});
}
