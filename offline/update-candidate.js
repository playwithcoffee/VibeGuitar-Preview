// M4-U1: passive, same-scope waiting-worker discovery. Never activates an update,
// forces a network request, or reads/writes the user's saved session.
const RELEASE = /^[a-f0-9]{64}$/;
const stateText = Object.freeze({
  unknown: 'Update availability could not be verified.',
  unsupported: 'Update checks are unavailable in this browser or context.',
  none: 'No verified replacement release is waiting.',
  checking: 'Checking the waiting release cache.',
  incomplete: 'A waiting release is incomplete or cannot be verified.',
  ready: 'A new offline release is verified and waiting. No update has been activated.',
});

export function createUpdateCandidate({ serviceWorker, scopeURL, currentRelease,
  makeChannel, onChange, afterDelay = (fn, ms) => setTimeout(fn, ms),
  cancelDelay = timer => clearTimeout(timer), timeoutMs = 6000 }) {
  if (!RELEASE.test(currentRelease || '')) throw Error('M4U1_RELEASE_INVALID');
  let scope;
  try {
    scope = new URL(scopeURL);
    if (scope.protocol !== 'https:' && scope.protocol !== 'http:') throw Error('scheme');
    if (!scope.pathname.endsWith('/') || scope.search || scope.hash) throw Error('scope');
  } catch { throw Error('M4U1_SCOPE_INVALID'); }
  if (typeof onChange !== 'function') throw Error('M4U1_CALLBACK_REQUIRED');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
    throw Error('M4U1_TIMEOUT_INVALID');
  if (typeof afterDelay !== 'function' || typeof cancelDelay !== 'function')
    throw Error('M4U1_TIMER_INVALID');

  let latest = Object.freeze({ phase: 'unknown', release: null, assets: 0,
    message: stateText.unknown });
  let epoch = 0;
  let registration = null;
  let disposed = false;
  const listeners = [];

  const status = () => latest;
  const publish = (phase, release = null, assets = 0) => {
    if (disposed) return latest;
    if (latest.phase === phase && latest.release === release && latest.assets === assets)
      return latest;
    latest = Object.freeze({ phase, release, assets, message: stateText[phase] });
    onChange(latest);
    return latest;
  };
  function listen(target, name, fn) {
    if (typeof target?.addEventListener !== 'function') return;
    target.addEventListener(name, fn);
    listeners.push(() => target.removeEventListener?.(name, fn));
  }
  function clearListeners() {
    while (listeners.length) {
      try { listeners.pop()(); } catch { /* Listener removal must not affect user data. */ }
    }
  }
  function observe(reg) {
    clearListeners();
    registration = reg;
    if (!reg) return;
    const onLifecycle = () => {
      if (reg.installing) listen(reg.installing, 'statechange', () => { void inspect(); });
      void inspect();
    };
    listen(reg, 'updatefound', onLifecycle);
    listen(reg.installing, 'statechange', () => { void inspect(); });
    listen(reg.waiting, 'statechange', () => { void inspect(); });
    listen(serviceWorker, 'controllerchange', () => { void inspect(); });
  }
  async function prove(worker) {
    return await new Promise(resolve => {
      let settled = false;
      let channel;
      let timer;
      function done(value) {
        if (settled) return;
        settled = true;
        if (timer !== undefined) {
          try { cancelDelay(timer); } catch { /* Best effort only. */ }
        }
        try { channel?.port1?.close?.(); channel?.port2?.close?.(); } catch { /* Best effort only. */ }
        resolve(value);
      }
      try {
        channel = makeChannel();
        if (!channel?.port1 || !channel?.port2) return done(null);
        channel.port1.onmessage = event => done(event?.data || null);
        timer = afterDelay(() => done(null), timeoutMs);
        worker.postMessage({ kind: 'VG_OFFLINE_VERIFY' }, [channel.port2]);
      } catch { done(null); }
    });
  }
  async function inspect() {
    const serial = ++epoch;
    if (disposed) return latest;
    if (!serviceWorker || typeof serviceWorker.getRegistration !== 'function' ||
        typeof makeChannel !== 'function') return publish('unsupported');
    let reg;
    try { reg = await serviceWorker.getRegistration(scope.href); }
    catch { if (serial === epoch) return publish('unknown'); return latest; }
    if (disposed || serial !== epoch) return latest;
    if (!reg) { if (registration) observe(null); return publish('none'); }
    if (reg.scope !== scope.href) {
      if (registration) observe(null);
      return publish('unknown');
    }
    if (reg !== registration) observe(reg);
    // First install is not an update. Require an old controller and active worker.
    if (!serviceWorker.controller || !reg.active || reg.active.state !== 'activated')
      return publish('none');
    const waiting = reg.waiting;
    if (!waiting) return publish('none');
    if (waiting.state !== 'installed') return publish('none');
    publish('checking');
    const result = await prove(waiting);
    if (disposed || serial !== epoch) return latest;
    // A replaced waiting worker, lifecycle transition, or scope swap invalidates proof.
    if (reg !== registration || reg.waiting !== waiting || waiting.state !== 'installed' ||
        !serviceWorker.controller || reg.active?.state !== 'activated')
      return publish('none');
    const release = result?.release;
    if (result?.kind !== 'VG_OFFLINE_VERIFY_REPLY' || !RELEASE.test(release || '') ||
        release === currentRelease) return publish('unknown');
    // Hashes are unordered. Mere inequality cannot prove forward update direction.
    // Fail closed unless the waiting release explicitly names this exact current
    // release as its predecessor. Old R1 workers without a predecessor are held.
    if (result.predecessor !== currentRelease) return publish('unknown');
    if (result.state !== 'ready') {
      return publish(result.state === 'incomplete' ? 'incomplete' : 'unknown');
    }
    if (!Number.isSafeInteger(result.assets) || result.assets < 1)
      return publish('unknown');
    return publish('ready', release, result.assets);
  }
  async function start() {
    if (disposed) return latest;
    return await inspect();
  }
  function stop() {
    if (disposed) return;
    disposed = true;
    epoch++;
    clearListeners();
    registration = null;
  }
  return Object.freeze({ start, inspect, status, stop });
}
