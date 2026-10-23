/* VibeGuitar M4-A: a full, content-checked cache or no offline claim. */
const RELEASE_SPEC = {"release":"7de8db71724227bd642ee465d6824b8d6fe1947aedd682808ff09ca842877c48","predecessor":null,"hashes":{".nojekyll":"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855","app.js":"d5bfca8b60122956df099de3c34e4be96d56f6022953856ac522ed49d4eef936","app/controller.js":"7e266e2abbb68947be2cf4bf37e8d307eab89e8968f24cb4d859850aecee4e5f","app/diagram-plan.js":"d10fbc57cf2a52776a561d21af6a075b3ee5535d138ebd03fc80710edb51affa","app/runtime-catalogue.js":"6c9d8dc135f5a007f5ba6db66f151d31deec9039cbd5a1a9232ee04c04589561","core/guitar.js":"d9f4384d7293712daa6d0af7f255f1e7b6d2144a9bc9932d04c129a51a1ccb2d","core/music.js":"e41404209316c76b30d01e8af9c0244b97ac1cd62883c7ed50b380f1930fa3c6","core/progression.js":"292a7288ff2cd4c22cc61dcc8a4bd27fa274debb67b8cf44c3a044dd458aff12","health.json":"e9f6977ada6aca1df3c33594eb301bc7eca0a8efed22a3d120eec82c097ed310","icons/vibeguitar-192.png":"78a5ecb709af965c7b86a56995533c64a9cf7e435883b7f36f7163963208b7c4","icons/vibeguitar-512.png":"c515e1ad7f0c4de5fe02c1c6986b500a1f29d35745fb4475b9b52524e3782850","index.html":"774c1e01447c84e266f7603555d5f0716fbaaf177dfb5a40b561ec6bba370af4","manifest.webmanifest":"a5111e732226ea745a5b774a1507ad64f5828e243aea1c1e311f052a4b32d669","offline/offline-status.js":"817b2bf4d28bc13c9670569b247e01446d2b28fe69c3f2780b323486f1d89036","offline/update-candidate.js":"909be491147437530960e38bb05ab1a62da1acb3ad28356e97670a63dfe63845","offline/update-handoff.js":"4fd95fed81a685b6e8d659e162b13c6accff66f2a69e9415f72b559e03968bd3","session/live-session.js":"dc71be8532ff4dbe0a97950c8b0ea872a1bccfa376a645b22e5b9ff032151a85","session/production-contract.js":"827ef1830afb08e3a5ab29be534b8c575abcb78874344435ada98f295b521a4b","session/production-restore.js":"f915fc387d198a200e8130389421ea315086018f9f5a21f5203806df0b9653cd","session/production-storage.js":"df3243cc308a53bb0764d5d8d88ae4915ceaede37f1c23c0fe5a7a52bc64c36c","styles.css":"442feda826177041948f92f7563a811cc60787163b468d45e68844d57bfd5d3d","third-party/chords-db-LICENSE.txt":"ca1f5a79ed75347924bba07c979bc7a6d0f7438e82d655f7e8dcdfa32939a3d9","offline/release-info.js":"4db153ee6c0d6142c8cbae6b4edc8a2a6985568845d7955df1dd651ac25e71a9"}};
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
