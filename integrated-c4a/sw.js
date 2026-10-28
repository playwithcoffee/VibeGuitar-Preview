/* VibeGuitar M4-A: a full, content-checked cache or no offline claim. */
const RELEASE_SPEC = {"release":"0d692d3d1c04b271efd4a1971419bf0ce58452db8f668525cb623dfd5e254993","predecessor":null,"hashes":{".nojekyll":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","app.js":"3171c27e8cca60d1fc36ccdf884eeaf9ee20921f5f6ac487ed176acded749bd7","app/controller.js":"f71165534dad3ef5990329aaaf5ec2c778fccc68a9ac35235a138513af5753ca","app/diagram-plan.js":"f118badf3dc9e8fc5dbff88f8ceccb34884a1a4dd57c4edbf7b25e48ab17ff21","app/runtime-catalogue.js":"6c9d8dc135f5a007f5ba6db66f151d31deec9039cbd5a1a9232ee04c04589561","core/guitar.js":"d9f4384d7293712daa6d0af7f255f1e7b6d2144a9bc9932d04c129a51a1ccb2d","core/music.js":"e41404209316c76b30d01e8af9c0244b97ac1cd62883c7ed50b380f1930fa3c6","core/progression.js":"292a7288ff2cd4c22cc61dcc8a4bd27fa274debb67b8cf44c3a044dd458aff12","fretcard/core.js":"2b3d3a0be682aa25100c10ebed21e380996512ccfcdda569b1edf1037282fefc","fretcard/dom-render.js":"be9124df634c5db9a76a5ec16f575d2f94473fa87d1440aab7d32d44801d1a35","fretcard/shape-adapter.js":"2ea0bf1b8023786f6a2d2a3407f34cff202278c1ef4a0b9cb4de50fc6928c58d","health.json":"e9f6977ada6aca1df3c33594eb301bc7eca0a8efed22a3d120eec82c097ed310","icons/vibeguitar-192.png":"78a5ecb709af965c7b86a56995533c64a9cf7e435883b7f36f7163963208b7c4","icons/vibeguitar-512.png":"c515e1ad7f0c4de5fe02c1c6986b500a1f29d35745fb4475b9b52524e3782850","index.html":"774c1e01447c84e266f7603555d5f0716fbaaf177dfb5a40b561ec6bba370af4","manifest.webmanifest":"b16b22bb3ea6735566ba4f808dc67a666ede1b2c45a21b13ab047a51cea98fd6","offline/offline-status.js":"ae34ed78fda914f36b0bda3ef8151eea62f12bf2b404062aec9da03e8566a342","offline/update-candidate.js":"963cbe2a693a2592d21410f4b5c24b871cd8c98e8c5b37ea17496d8e116b0747","offline/update-handoff.js":"0444265e123555d2fa9b2453b99f3c33d039084cda6acfcf70969cd54cedac71","session/live-session.js":"928ef04133abac2d248ec041ddb47a2212473f80166b9521e175c56976a59901","session/production-contract.js":"5b03320ad8b3d017169839e9eb60d087ca1d9d4f23e56de51ed34dedd11b7579","session/production-restore.js":"3c907af8438e9d1cdd09d71767856cd233d110c82529cc60b1da9ae5e5328f1c","session/production-storage.js":"7803c2b00aa770f83e9e696c2c6b84c080a98f26748103eabcc626d3c8475eba","styles.css":"2239b0dcc313cb69297418abe01164f48c01385274b2fb3bf0a1d2f7d48c857f","third-party/chords-db-LICENSE.txt":"ca1f5a79ed75347924bba07c979bc7a6d0f7438e82d655f7e8dcdfa32939a3d9","offline/release-info.js":"cd21bd214a35f3898d2a0e050509d16b0cb227c63a325e54783f902783176550"}};
const CACHE_NAME = `vg-assets-${RELEASE_SPEC.release}`;
const EXPECTED = Object.freeze(RELEASE_SPEC.hashes);
const REQUIRED = Object.freeze(Object.keys(EXPECTED).sort());
const SCOPE = self.registration.scope;
const cacheURL = path => new URL(path, SCOPE).href;
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
async function validBytes(response, digest) {
  if (!response || !response.ok || response.type === 'opaque') return false;
  if (!self.crypto || !self.crypto.subtle) return false;
  const actual = hex(new Uint8Array(await self.crypto.subtle.digest('SHA-256', await response.clone().arrayBuffer())));
  return actual === digest;
}
async function allReady() {
  if (!(await caches.has(CACHE_NAME))) return false;
  const cache = await caches.open(CACHE_NAME);
  for (const path of REQUIRED) {
    const response = await cache.match(cacheURL(path));
    if (!(await validBytes(response, EXPECTED[path]))) return false;
  }
  return true;
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // An identical release may already be controlling another tab. Reusing its
    // fully verified cache is safe; rewriting or deleting it is not.
    if (await caches.has(CACHE_NAME)) {
      if (await allReady()) return;
      throw Error('M4U3_PREEXISTING_CACHE_INCOMPLETE_HOLD');
    }
    const cache = await caches.open(CACHE_NAME);
    try {
      for (const path of REQUIRED) {
        const request = new Request(cacheURL(path), {cache:'reload',credentials:'same-origin'});
        const response = await fetch(request);
        if (response.redirected || new URL(response.url).href !== request.url ||
            !(await validBytes(response, EXPECTED[path]))) throw Error(`M4A_ASSET_INTEGRITY_${path}`);
        await cache.put(request, response);
      }
      if (!(await allReady())) throw Error('M4A_INCOMPLETE_STAGE');
      // Do not skipWaiting. M4-U is responsible for user-safe update transitions.
    } catch (e) {
      await caches.delete(CACHE_NAME);
      throw e;
    }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    if (!(await allReady())) throw Error('M4A_ACTIVATE_INCOMPLETE');
    // Preserve older caches for M4-U and existing-client safety.
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.kind !== 'VG_OFFLINE_VERIFY') return;
  const port = event.ports?.[0];
  if (!port) return;
  event.waitUntil((async () => {
    let state = 'incomplete';
    try { state = await allReady() ? 'ready' : 'incomplete'; }
    catch { state = 'unknown'; }
    port.postMessage({kind:'VG_OFFLINE_VERIFY_REPLY',release:RELEASE_SPEC.release,
                      predecessor:RELEASE_SPEC.predecessor ?? null,
                      state,assets:REQUIRED.length});
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const u = new URL(event.request.url);
  if (u.origin !== self.location.origin || !u.href.startsWith(SCOPE)) return;
  const path = u.href.slice(SCOPE.length).split(/[?#]/, 1)[0];
  const key = event.request.mode === 'navigate' && (path === '' || path === 'index.html')
    ? 'index.html' : path;
  if (!Object.prototype.hasOwnProperty.call(EXPECTED,key)) return;
  event.respondWith((async () => {
    try {
      // A cache eviction must not manufacture an empty release cache. Otherwise
      // a later install could mistake that empty cache for an existing release.
      if (!(await caches.has(CACHE_NAME))) throw Error('M4U3_CACHE_MISSING');
      const cache = await caches.open(CACHE_NAME);
      const response = await cache.match(cacheURL(key));
      if (await validBytes(response, EXPECTED[key])) return response;
    } catch { /* An incomplete cache must not mix network or old assets. */ }
    return new Response('Offline release incomplete. Reconnect to reinstall this release.',
      {status:503,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});
  })());
});
