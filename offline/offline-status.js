// M4-A: offline-asset status is independent of saved-session and catalogue status.
// Registration alone NEVER implies a verified coherent asset cache.
export function createOfflineStatus({serviceWorker, expectedRelease, onChange, makeChannel,
                                    afterDelay = (fn,ms)=>setTimeout(fn,ms), timeoutMs=6000}) {
  if (typeof expectedRelease !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRelease))
    throw Error('OFFLINE_EXPECTED_RELEASE_INVALID');
  if (typeof onChange !== 'function') throw Error('OFFLINE_CALLBACK_REQUIRED');
  let current = Object.freeze({phase:'unknown',message:'Offline files not verified yet.'});
  let sequence = 0;
  const notify=(phase,message)=>{current=Object.freeze({phase,message});onChange(current);return current;};
  const status=()=>current;
  async function inspect() {
    const serial=++sequence;
    if (!serviceWorker || typeof serviceWorker.register !== 'function' ||
        typeof makeChannel !== 'function')
      return notify('unsupported','Offline installation is unavailable in this browser or context.');
    let reg;
    try { reg=await serviceWorker.getRegistration?.(); }
    catch { return notify('unknown','Offline registration status is unavailable.'); }
    const target=serviceWorker.controller || reg?.active;
    if (!target || target.state === 'redundant')
      return notify('preparing','Offline files are being prepared; reconnect and reload if this persists.');
    const reply=await new Promise(resolve=>{
      let finished=false;
      const done=(message)=>{if(finished)return;finished=true;resolve(message);};
      let channel;
      try {
        channel=makeChannel();
        channel.port1.onmessage = event => done(event?.data);
        target.postMessage({kind:'VG_OFFLINE_VERIFY',expectedRelease},[channel.port2]);
      } catch { done(null);return; }
      afterDelay(()=>done(null),timeoutMs);
    });
    if(serial!==sequence)return current;
    if(reply?.kind!=='VG_OFFLINE_VERIFY_REPLY' || reply.release!==expectedRelease)
      return notify('unknown','Offline cache or release identity could not be confirmed.');
    if(reply.state==='ready' && Number.isSafeInteger(reply.assets) && reply.assets>0)
      return notify('ready',`Offline files verified (${reply.assets} assets). Local session saving has separate status.`);
    if(reply.state==='incomplete')
      return notify('incomplete','Offline files are incomplete or damaged; reconnect before relying on offline use.');
    return notify('unknown','Offline file readiness is unknown.');
  }
  async function start() {
    if (!serviceWorker || typeof serviceWorker.register!=='function' || typeof makeChannel!=='function')
      return notify('unsupported','Offline installation is unavailable in this browser or context.');
    notify('preparing','Preparing offline files; not ready yet.');
    try {
      // The source module lives at /offline/offline-status.js; URLs are scope-relative.
      const scriptURL=new URL('../sw.js',import.meta.url);
      const scopeURL=new URL('../',import.meta.url);
      const reg=await serviceWorker.register(scriptURL.href,{scope:scopeURL.href,updateViaCache:'none'});
      const worker=reg.installing||reg.waiting||reg.active;
      if(worker?.addEventListener)worker.addEventListener('statechange',()=>{void inspect();});
      serviceWorker.addEventListener?.('controllerchange',()=>{void inspect();});
      serviceWorker.addEventListener?.('message',event=>{
        if(event?.data?.kind==='VG_OFFLINE_RECHECK')void inspect();
      });
      return await inspect();
    } catch {
      return notify('incomplete','Offline installation failed or is blocked; app remains usable online.');
    }
  }
  return Object.freeze({start,inspect,status});
}
