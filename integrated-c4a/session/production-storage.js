/** M3-L: small, synchronous, injected browser-Storage journal.
 * Each write stages into the non-active slot, verifies immediate readback,
 * then switches one commit pointer. It does NOT guarantee disk durability,
 * cross-tab atomic transactions, or recoverability after origin data clearing.
 * It NEVER deletes keys, silently overwrites protected records, or migrates V1.
 */
import { decodeProductionSessionV2, encodeProductionSessionV2 } from './production-contract.js';

export const PRODUCTION_SESSION_KEYS = Object.freeze({
  head: 'vg.session.v2.journal.head',
  a: 'vg.session.v2.journal.a',
  b: 'vg.session.v2.journal.b',
  backup: 'vg.session.v2.protected-original',
});
const own = x => x!==null && typeof x==='object' && !Array.isArray(x) &&
  (Object.getPrototypeOf(x)===Object.prototype || Object.getPrototypeOf(x)===null);
function parseHead(raw) {
  if(typeof raw!=='string' || raw.length>200) return null;
  let data;
  try { data=JSON.parse(raw); } catch { return null; }
  if(!own(data) || Object.keys(data).length!==3 || !Object.hasOwn(data,'journalVersion') ||
     !Object.hasOwn(data,'active') || !Object.hasOwn(data,'generation') ||
     data.journalVersion!==1 || !['a','b'].includes(data.active) ||
     !Number.isSafeInteger(data.generation) || data.generation<1 ||
     data.generation>=Number.MAX_SAFE_INTEGER) return null;
  return data;
}
export function createProductionSessionPort(storage) {
  if(!storage || typeof storage.getItem!=='function' || typeof storage.setItem!=='function')
    throw new TypeError('M3L_STORAGE_ADAPTER_REQUIRED');
  let observed=null;
  function rawRead() {
    try {
      const result={};
      for(const [name,key] of Object.entries(PRODUCTION_SESSION_KEYS)) {
        const value=storage.getItem(key);
        if(value!==null && typeof value!=='string') return {kind:'inaccessible'};
        result[name]=value;
      }
      return {kind:'ok',raw:result};
    } catch { return {kind:'inaccessible'}; }
  }
  function classify(raw) {
    if(raw.head===null) {
      if(raw.a!==null || raw.b!==null || raw.backup!==null)
        return {kind:'corrupt',reason:'uncommitted-or-orphaned-record'};
      return {kind:'absent'};
    }
    const head=parseHead(raw.head);
    if(!head || raw[head.active]===null) return {kind:'corrupt',reason:'broken-commit-pointer'};
    const decoded=decodeProductionSessionV2(raw[head.active]);
    if(decoded.kind==='ok') return {kind:'record',session:decoded.session};
    return decoded;
  }
  function read() {
    const outcome=rawRead();
    if(outcome.kind!=='ok') { observed=null; return {kind:'inaccessible'}; }
    const result=classify(outcome.raw);
    observed={raw:outcome.raw,resultKind:result.kind};
    return result;
  }
  function same(a,b) { return a===b; }
  function savedCandidate(text, replacement) {
    if(!observed) return {kind:'write-blocked',reason:'read-required'};
    const current=rawRead();
    if(current.kind!=='ok') return {kind:'write-failed',reason:'storage-inaccessible'};
    const before=observed.raw, now=current.raw;
    // An earlier failed stage may have changed the non-active slot. Only the
    // pointer, active bytes and protected backup must remain identical.
    const active=parseHead(before.head)?.active;
    if(!same(before.head,now.head) || !same(before.backup,now.backup) ||
       (active!==undefined && !same(before[active],now[active])) ||
       (active===undefined && (!same(before.a,now.a) || !same(before.b,now.b))))
      return {kind:'write-blocked',reason:'storage-changed-since-read'};
    if(replacement) {
      if(!['corrupt','unsupported-schema'].includes(observed.resultKind))
        return {kind:'write-blocked',reason:'not-a-protected-record'};
      if(now.backup!==null) return {kind:'write-blocked',reason:'recovery-copy-already-present'};
      const backup=JSON.stringify({version:1,head:now.head,a:now.a,b:now.b});
      try {
        storage.setItem(PRODUCTION_SESSION_KEYS.backup,backup);
        if(storage.getItem(PRODUCTION_SESSION_KEYS.backup)!==backup)
          return {kind:'write-failed',reason:'recovery-copy-readback'};
      } catch { return {kind:'write-failed',reason:'recovery-copy-exception'}; }
    } else if(!['absent','record'].includes(observed.resultKind)) {
      return {kind:'write-blocked',reason:'protected-or-unavailable'};
    }
    const oldHead=parseHead(now.head);
    if(!replacement && now.head!==null && !oldHead)
      return {kind:'write-blocked',reason:'invalid-commit-pointer'};
    if(!replacement && observed.resultKind==='absent' &&
       (now.head!==null || now.a!==null || now.b!==null || now.backup!==null))
      return {kind:'write-blocked',reason:'nonempty-storage'};
    const target=oldHead?.active==='a'?'b':'a';
    const nextGeneration=oldHead?oldHead.generation+1:1;
    if(!Number.isSafeInteger(nextGeneration)) return {kind:'write-blocked',reason:'journal-generation-limit'};
    const newHead=JSON.stringify({journalVersion:1,active:target,generation:nextGeneration});
    const targetKey=PRODUCTION_SESSION_KEYS[target];
    try {
      storage.setItem(targetKey,text);
      if(storage.getItem(targetKey)!==text)
        return {kind:'write-failed',reason:'staging-readback'};
      // Detect interference before committing (not a cross-tab CAS guarantee).
      if(storage.getItem(PRODUCTION_SESSION_KEYS.head)!==now.head)
        return {kind:'write-blocked',reason:'concurrent-head-change'};
      storage.setItem(PRODUCTION_SESSION_KEYS.head,newHead);
      if(storage.getItem(PRODUCTION_SESSION_KEYS.head)!==newHead)
        return {kind:'write-failed',reason:'commit-readback'};
    } catch { return {kind:'write-failed',reason:'storage-exception'}; }
    const after=read();
    if(after.kind!=='record' || JSON.stringify(after.session)!==text)
      return {kind:'write-failed',reason:'postcommit-validation'};
    return {kind:'saved',verifiedByImmediateReadback:true,
      protectedBackup:replacement};
  }
  function write(session) {
    const encoded=encodeProductionSessionV2(session);
    if(encoded.kind!=='ok') return {kind:'rejected',reason:encoded.reason||encoded.kind};
    return savedCandidate(encoded.text,false);
  }
  function replaceProtected(session) {
    const encoded=encodeProductionSessionV2(session);
    if(encoded.kind!=='ok') return {kind:'rejected',reason:encoded.reason||encoded.kind};
    return savedCandidate(encoded.text,true);
  }
  return Object.freeze({read,write,replaceProtected,keys:PRODUCTION_SESSION_KEYS});
}
