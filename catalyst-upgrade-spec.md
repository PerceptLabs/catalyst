# Catalyst — Phase 13: The Real Deal Upgrade

> **Companion docs:** `catalyst-spec.md` (architecture), `catalyst-roadmap.md` (phases 0-12)  
> **Codebase:** `repomix-output-claude-catalyst-phase-0-SyoeR.md` (full dump)  
> **Scope:** Three upgrades that replace toy implementations with production libraries.

---

## CLEANROOM NOTICE — STILL APPLIES

```
Same rules as catalyst-roadmap.md. Do NOT reference WebContainers, StackBlitz,
bolt.new, or any competing product internals. Implement from public API docs,
npm package READMEs, and MDN.
```

---

## OVERVIEW

Phase 13 is three independent upgrades that can be done in separate CC sessions. Each replaces a gap identified in the Phase 0-12 audit with a real, battle-tested library.

```
Phase 13a: unenv Integration — Node.js Polyfills           (1 session, 4-6 hrs)
Phase 13b: Real Hono — Service Worker Backend              (1 session, 3-5 hrs)
Phase 13c: ProcessManager Worker Isolation — True Threads   (1 session, 6-8 hrs)
```

### Dependency Order

```
13a (unenv) and 13b (Hono) are independent — can run in parallel or either order.
13c (Worker isolation) is independent but benefits from 13a being done first
(Workers need the same host bindings, and unenv provides them).

Recommended order: 13a → 13b → 13c
```

---

## PHASE 13a: unenv INTEGRATION — NODE.JS POLYFILLS

### The Problem

CC hand-rolled 10 host bindings in `packages/core/src/engine/host-bindings/`:
path, console, process, buffer, events, timers, url, assert, crypto, util.

**What's missing entirely:** stream, http, os, querystring, string_decoder, zlib.

**What's fake:** crypto.createHash uses FNV-1a (non-cryptographic). createHmac concatenates key+data with no inner/outer padding. Any package doing real cryptography (JWT validation, integrity checks, password hashing) gets wrong results.

### The Solution

**unenv** (https://github.com/unjs/unenv) — MIT license, maintained by UnJS (Nuxt/Nitro team). Used in production by Cloudflare Workers, Vercel Edge, Deno Deploy, Nuxt, and Nitro. Cloudflare is actively contributing to it. Provides drop-in Node.js module polyfills for any JavaScript runtime.

**npm:** `unenv` (current: v2.x on main branch)

### What unenv Provides

Each module is importable individually:

| Module | Import | Implementation |
|--------|--------|----------------|
| crypto | `unenv/node/crypto` | Real SHA-256/SHA-1/MD5/HMAC via WebCrypto |
| stream | `unenv/node/stream` | Full Readable/Writable/Transform/Duplex/PassThrough |
| http | `unenv/node/http` | createServer, IncomingMessage, ServerResponse |
| os | `unenv/node/os` | platform, tmpdir, homedir, cpus, hostname |
| querystring | `unenv/node/querystring` | parse, stringify, escape, unescape |
| string_decoder | `unenv/node/string_decoder` | StringDecoder class |
| zlib | `unenv/node/zlib` | gzip/gunzip via DecompressionStream |
| net | `unenv/node/net` | Stubs with helpful "[unenv] not implemented" errors |
| tls | `unenv/node/tls` | Stubs with helpful errors |
| dns | `unenv/node/dns` | Stubs with helpful errors |
| path | `unenv/node/path` | Full posix + win32 |
| buffer | `unenv/node/buffer` | Full Buffer including allocUnsafe, concat, etc. |
| events | `unenv/node/events` | Full EventEmitter |
| util | `unenv/node/util` | inspect, promisify, inherits, types, TextEncoder/Decoder |
| assert | `unenv/node/assert` | Full assert + assert.strict |

### What Stays Custom (MUST NOT Replace)

| Module | Why Custom |
|--------|-----------|
| `fs` host binding | Talks directly to CatalystFS (OPFS/IndexedDB). unenv's fs is a mock/stub — useless for Catalyst. |
| `fetch` host binding | Routes through CatalystNet's MessageChannel proxy. unenv doesn't touch fetch. |
| `console` host binding | Routes through CatalystEngine's console capture for stdout/stderr streaming. |
| `process` host binding | Custom: cwd() reads from CatalystFS state, env from config, exit() triggers process lifecycle. Keep but augment with unenv's process polyfill for missing methods (hrtime.bigint, memoryUsage, etc.) |

### Implementation Plan

**Files to modify:**

1. `packages/core/src/engine/host-bindings/index.ts` — the binding registry
2. `packages/core/src/engine/host-bindings/crypto.ts` — DELETE, replace with unenv
3. `packages/core/src/engine/require.ts` — update require chain to check unenv modules
4. `packages/core/package.json` — add `unenv` dependency

**Files to create:**

5. `packages/core/src/engine/host-bindings/unenv-bridge.ts` — adapter that exposes unenv modules as QuickJS host bindings

**The require() chain after upgrade:**

```
require('crypto')
  → 1. Check custom host binding registry (fs, console, process, fetch)
  → 2. Check unenv registry (crypto, stream, http, os, zlib, querystring, etc.)
  → 3. Check relative path against CatalystFS
  → 4. Check /node_modules/{name} (PackageManager cache)
  → 5. Auto-install via PackageManager if configured
  → 6. throw MODULE_NOT_FOUND
```

**Implementation detail — the unenv bridge:**

unenv modules export standard JavaScript objects. But CatalystEngine runs user code inside QuickJS-WASM, which has its own memory space. Host bindings must marshal data between the browser's JS and QuickJS's VM.

The bridge pattern:

```typescript
// packages/core/src/engine/host-bindings/unenv-bridge.ts

import { createHash, createHmac, randomBytes, randomUUID } from 'unenv/node/crypto';
import { Readable, Writable, Transform, Duplex, PassThrough } from 'unenv/node/stream';
import { platform, tmpdir, homedir, cpus, hostname, type as osType } from 'unenv/node/os';

/**
 * Registry of unenv-backed modules.
 * Each entry returns a JavaScript object that gets injected
 * into QuickJS as a host binding via ctx.newObject() + setProp().
 *
 * The pattern is the same as existing host bindings:
 * - Create QuickJS object
 * - For each method: create host function that calls the unenv implementation
 * - Return the object handle
 */
export const UNENV_MODULES: Record<string, () => Record<string, any>> = {
  crypto: () => ({
    createHash: (algorithm: string) => {
      const hash = createHash(algorithm);
      return {
        update: (data: string) => { hash.update(data); return hash; },
        digest: (encoding: string) => hash.digest(encoding),
      };
    },
    createHmac: (algorithm: string, key: string) => {
      const hmac = createHmac(algorithm, key);
      return {
        update: (data: string) => { hmac.update(data); return hmac; },
        digest: (encoding: string) => hmac.digest(encoding),
      };
    },
    randomBytes: (size: number) => randomBytes(size),
    randomUUID: () => randomUUID(),
  }),

  os: () => ({
    platform: () => 'browser',
    type: () => 'Browser',
    tmpdir: () => '/tmp',
    homedir: () => '/home',
    hostname: () => 'catalyst',
    cpus: () => [{ model: 'browser', speed: 0 }],
    arch: () => 'wasm32',
    release: () => '0.0.0',
    totalmem: () => (navigator?.deviceMemory ?? 4) * 1024 * 1024 * 1024,
    freemem: () => (navigator?.deviceMemory ?? 4) * 512 * 1024 * 1024,
    uptime: () => Math.floor(performance.now() / 1000),
    EOL: '\n',
  }),

  stream: () => ({
    Readable,
    Writable,
    Transform,
    Duplex,
    PassThrough,
    Stream: Readable, // base class
  }),

  // http module — unenv provides the shapes, but actual server
  // creation routes through the preview Service Worker
  http: () => {
    // Import unenv's http for IncomingMessage/ServerResponse shapes
    // The actual createServer is handled by HonoIntegration
    return {
      createServer: () => {
        throw new Error(
          'http.createServer() is not available in browser. ' +
          'Use Hono routes in /src/api/ instead. ' +
          'See: catalyst-spec.md Phase 12.'
        );
      },
      // Request/response objects for packages that just import the types
      IncomingMessage: class {},
      ServerResponse: class {},
      STATUS_CODES: { 200: 'OK', 404: 'Not Found', 500: 'Internal Server Error' },
    };
  },

  querystring: () => {
    // unenv/node/querystring or inline — it's trivial
    return {
      parse: (str: string) => Object.fromEntries(new URLSearchParams(str)),
      stringify: (obj: Record<string, string>) => new URLSearchParams(obj).toString(),
      escape: encodeURIComponent,
      unescape: decodeURIComponent,
    };
  },

  string_decoder: () => {
    return {
      StringDecoder: class StringDecoder {
        private encoding: string;
        constructor(encoding = 'utf-8') { this.encoding = encoding; }
        write(buffer: Uint8Array) {
          return new TextDecoder(this.encoding).decode(buffer);
        }
        end(buffer?: Uint8Array) {
          return buffer ? this.write(buffer) : '';
        }
      },
    };
  },

  zlib: () => ({
    // Bridge to browser DecompressionStream/CompressionStream
    gzip: () => { throw new Error('[catalyst] zlib.gzip — use DecompressionStream API directly'); },
    gunzip: () => { throw new Error('[catalyst] zlib.gunzip — use DecompressionStream API directly'); },
    createGzip: () => new CompressionStream('gzip'),
    createGunzip: () => new DecompressionStream('gzip'),
    createDeflate: () => new CompressionStream('deflate'),
    createInflate: () => new DecompressionStream('deflate'),
  }),
};

/** List of modules that exist but cannot work in browser — stub with clear errors */
export const STUB_MODULES = ['net', 'tls', 'dns', 'dgram', 'cluster', 'worker_threads', 'v8', 'child_process'];
```

**How it wires into require.ts:**

The existing `require.ts` (line 314 in roadmap) checks built-in modules first. After this upgrade:

```typescript
// In require.ts — updated resolution order
function resolveModule(name: string): ModuleResult {
  // 1. Custom host bindings (fs, console, process, fetch)
  if (CUSTOM_BINDINGS[name]) return CUSTOM_BINDINGS[name];

  // 2. unenv-backed modules (crypto, stream, http, os, etc.)
  if (UNENV_MODULES[name]) return UNENV_MODULES[name]();

  // 3. Stub modules (net, tls, dns — clear error messages)
  if (STUB_MODULES.includes(name)) {
    return createStubModule(name);
  }

  // 4. Relative path → CatalystFS
  // 5. /node_modules/{name} → PackageManager cache
  // 6. Auto-install → PackageManager
  // 7. throw MODULE_NOT_FOUND
}
```

### What Gets Deleted

| File | Reason |
|------|--------|
| `host-bindings/crypto.ts` | Replace entirely with unenv crypto (real hashes) |

### What Gets Augmented

| File | Change |
|------|--------|
| `host-bindings/process.ts` | Merge with unenv/node/process for hrtime.bigint, memoryUsage, etc. Keep custom cwd(), env, exit(). |
| `host-bindings/buffer.ts` | Evaluate: if unenv's Buffer is more complete, swap. If CC's works, keep. |
| `host-bindings/events.ts` | Same: compare completeness, swap if unenv is better. |
| `host-bindings/util.ts` | Merge: keep CC's working methods, add unenv's missing ones (types, TextEncoder). |

### Tests

**New test file:** `packages/core/src/engine/host-bindings/unenv-bridge.test.ts`

```
- crypto.createHash('sha256').update('hello').digest('hex')
  → MUST equal 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
  → This is the litmus test. CC's FNV-1a returns a WRONG value. unenv returns the RIGHT one.
- crypto.createHmac('sha256', 'key').update('data').digest('hex') → real HMAC
- crypto.randomBytes(16).length === 16
- crypto.randomUUID() matches UUID v4 pattern
- require('stream').Readable is a constructor
- require('stream').Transform pipe works
- require('os').platform() returns 'browser'
- require('os').cpus() returns array with at least one entry
- require('querystring').parse('a=1&b=2') → { a: '1', b: '2' }
- require('http').createServer → throws with helpful error message
- require('net') → stub with "[catalyst] net module not available in browser"
```

**Update existing test:** `packages/core/src/compat/node-compat.browser.test.ts`

After unenv integration, re-run the compatibility matrix. Expected improvement:

```
BEFORE (hand-rolled):
  crypto:        5/10 methods (50.0%) ← WRONG RESULTS
  stream:        0/12 methods (0%)
  http:          0/8 methods (0%)
  os:            0/10 methods (0%)
  TOTAL:       117/170 (68.8%)

AFTER (unenv):
  crypto:        8/10 methods (80.0%) ← CORRECT RESULTS
  stream:       10/12 methods (83.3%)
  http:          4/8 methods (50.0%) — shapes + STATUS_CODES, no real server
  os:            8/10 methods (80.0%)
  querystring:   4/4 methods (100%)
  string_decoder: 2/2 methods (100%)
  zlib:          4/6 methods (66.7%) — CompressionStream/DecompressionStream
  TOTAL:       ~155/180 (~86%)
```

**CRITICAL ADDITION: Provider-tagged compat report**

The current compat test reports binary PASS/FAIL per method. After unenv, this hides crucial information — *which layer* is providing each API. When something breaks, you need to know whether it's CC's custom binding, unenv's polyfill, or a browser native API. This matters for debugging, and it matters architecturally when deciding what to upgrade next.

Change the report output from:

```
fs:    22/26 methods (84.6%) — PASS
crypto: 8/10 methods (80.0%) — PASS
```

To a structured format with provider attribution:

```typescript
interface CompatResult {
  module: string;
  method: string;
  status: 'PASS' | 'FAIL' | 'NOT_IMPLEMENTED' | 'NOT_POSSIBLE';
  provider: 'catalyst' | 'unenv' | 'stub' | 'not_possible';
}
```

Which produces:

```
=== Catalyst Node.js Compatibility Report ===
fs:           22/26 (84.6%)  [catalyst: 22, unenv: 0, stub: 4]
path:         18/18 (100%)   [catalyst: 0, unenv: 18]
crypto:        8/10 (80.0%)  [catalyst: 0, unenv: 8, stub: 2]
stream:       10/12 (83.3%)  [catalyst: 0, unenv: 10, stub: 2]
os:            8/10 (80.0%)  [catalyst: 2, unenv: 6, stub: 2]
http:          4/8 (50.0%)   [catalyst: 0, unenv: 4, stub: 4]
net:           0/8 (0%)      [not_possible: 8]
---
TOTAL:       155/180 (86.1%)
Providers: catalyst 24, unenv 46, stub 12, not_possible 8
```

**Why this matters:** When Ralph's generated code calls `require('crypto').createHash('sha256')` and gets wrong output, the report immediately tells you "crypto is backed by unenv" — so you look at the unenv bridge, not CC's deleted hand-rolled binding. When someone asks "what happens if unenv drops support for X?" the report shows exactly which 46 methods depend on it. This is the difference between a test report and an architectural audit tool.

**Implementation:** Add a `PROVIDER_REGISTRY` map alongside the existing `UNENV_MODULES` and `CUSTOM_BINDINGS` maps in the require chain. The compat test reads this registry to tag results. Minimal code — the data already exists, it just needs to be exposed.

```typescript
// In host-bindings/index.ts or a new registry.ts
export const PROVIDER_REGISTRY: Record<string, Record<string, string>> = {
  fs: { readFileSync: 'catalyst', writeFileSync: 'catalyst', /* ... */ },
  crypto: { createHash: 'unenv', createHmac: 'unenv', randomBytes: 'unenv', /* ... */ },
  path: { join: 'unenv', resolve: 'unenv', /* ... */ },
  stream: { Readable: 'unenv', Writable: 'unenv', /* ... */ },
  net: { connect: 'not_possible', createServer: 'not_possible', /* ... */ },
};
```

### Verification Checklist

- [ ] `pnpm add unenv` succeeds
- [ ] crypto.createHash('sha256') produces correct SHA-256 (THE key test)
- [ ] crypto.createHmac('sha256', key) produces correct HMAC
- [ ] require('stream').Readable works, can pipe data through Transform
- [ ] require('os').platform() returns string, cpus() returns array
- [ ] require('querystring').parse round-trips
- [ ] require('http').createServer throws helpful error pointing to Hono
- [ ] require('net') throws helpful error (not silent failure)
- [ ] All existing Phase 0-12 tests still pass
- [ ] node-compat matrix shows improvement (target: >80% overall)
- [ ] Bundle size delta: log how much unenv adds (target: <50KB gzipped)

### CC Kickoff

```
Read: catalyst-upgrade-spec.md, Phase 13a section
Read: packages/core/src/engine/host-bindings/index.ts (current binding registry)
Read: packages/core/src/engine/host-bindings/crypto.ts (the fake one to delete)
Read: packages/core/src/engine/require.ts (require chain to update)

Install: pnpm add unenv

Do:
1. Create packages/core/src/engine/host-bindings/unenv-bridge.ts per spec
2. Delete packages/core/src/engine/host-bindings/crypto.ts
3. Update host-bindings/index.ts to include unenv modules in registry
4. Update require.ts resolution order: custom → unenv → stubs → relative → node_modules
5. Augment process.ts with unenv's missing methods (keep custom cwd/env/exit)
6. Create unenv-bridge.test.ts with SHA-256 litmus test
7. Update node-compat.browser.test.ts to test new modules
8. Run pnpm test:all — everything must pass
```

---

## PHASE 13b: REAL HONO — SERVICE WORKER BACKEND

### The Problem

`packages/core/src/dev/HonoIntegration.ts` lines 158-283 contain `wrapForServiceWorker()`, a hand-rolled 280-line mini-router that mimics ~5% of Hono's API surface. Users write code expecting Hono, but get a toy with:
- No middleware chaining (`.use()` exists but `next()` is a no-op)
- No typed route parameters
- No Zod validation
- No helper middleware (cors, jwt, logger, etag, etc.)
- No basePath support
- No error boundary
- No c.set()/c.get() for request-scoped state
- Wildcard routes don't work

### The Solution

**Hono already has an official Service Worker adapter** since v4.5.0:

```typescript
import { Hono } from 'hono'
import { handle } from 'hono/service-worker'

const app = new Hono().basePath('/api')
app.get('/hello', (c) => c.json({ message: 'Hello World' }))

self.addEventListener('fetch', handle(app))
```

Hono is 18KB minified, zero dependencies, built on Web Standards (Request/Response). All 20+ built-in middleware work. The RPC client (`hc`) provides end-to-end type safety.

### Architecture Change

**BEFORE:**

```
User writes /src/api/index.ts with Hono-like code
  → HonoIntegration.build() reads source
  → wrapForServiceWorker() wraps in IIFE with fake router
  → Writes to /dist/api-sw.js
  → Preview SW loads api-sw.js via importScripts()
  → self.catalystApiHandler() handles /api/* requests with toy router
```

**AFTER:**

```
User writes /src/api/index.ts with REAL Hono code
  → HonoIntegration.build() reads source
  → esbuild-wasm bundles user code + hono from /node_modules/
  → Output format: IIFE that registers fetch handler via hono/service-worker
  → Writes to /dist/api-sw.js
  → Preview SW loads api-sw.js via importScripts()
  → Real Hono router handles /api/* requests with full middleware support
```

### Implementation Plan

**Step 1: Ensure Hono is available in the virtual filesystem**

When HonoIntegration detects API routes, it must ensure `hono` is installed in `/node_modules/hono/`. Two strategies:

**Strategy A (preferred): Pre-bundle Hono into Catalyst**
- Hono is 18KB. Bundle it as a static asset in `@aspect/catalyst-core`.
- When HonoIntegration initializes, write the Hono bundle to `/node_modules/hono/` in CatalystFS.
- Zero network cost, instant availability, deterministic version.
- User's `import { Hono } from 'hono'` resolves from CatalystFS.

**Strategy B: Install via PackageManager**
- HonoIntegration calls `PackageManager.install('hono')` on first API build.
- Cached in OPFS after first install.
- Requires network on first run.

**Recommendation:** Strategy A. Hono is a framework dependency of Catalyst itself, not a user choice. Pre-bundle it.

**Step 2: Rewrite HonoIntegration.ts**

Delete the entire `wrapForServiceWorker()` method (lines 158-283). Replace with an esbuild-based build that bundles the user's API code with real Hono.

```typescript
// packages/core/src/dev/HonoIntegration.ts — rewritten

export class HonoIntegration {
  // ... constructor, hasApiRoutes(), findEntryPoint(), collectApiFiles() STAY THE SAME

  /**
   * Build API routes for Service Worker.
   * Uses esbuild to bundle user code + real Hono into IIFE format.
   */
  async build(): Promise<HonoBuildResult> {
    if (!this.hasApiRoutes()) {
      return { hasApi: false, outputPath: null, errors: [] };
    }

    const entryPath = this.findEntryPoint();
    if (!entryPath) {
      return { hasApi: false, outputPath: null, errors: ['No API entry point found'] };
    }

    try {
      // Ensure Hono is available in virtual filesystem
      await this.ensureHono();

      // Read user's API source
      const source = this.fs.readFileSync(entryPath, 'utf-8') as string;

      // Create the SW entry wrapper that imports the user's app and wires it up
      const swEntry = this.createSWEntryWrapper(source, entryPath);

      // Write temp entry file
      const tempEntryPath = '/tmp/_catalyst_api_entry.ts';
      this.fs.writeFileSync(tempEntryPath, swEntry);

      // Build with esbuild — bundle everything into single IIFE
      const result = await this.pipeline.build({
        entryPoint: tempEntryPath,
        outfile: this.outputPath,
        format: 'iife',
        bundle: true,
        // Resolve hono from /node_modules/hono/ in CatalystFS
        platform: 'browser',
        target: 'es2020',
      });

      if (result.errors.length > 0) {
        return { hasApi: true, outputPath: null, errors: result.errors };
      }

      return { hasApi: true, outputPath: this.outputPath, errors: [] };
    } catch (err: any) {
      return { hasApi: true, outputPath: null, errors: [err?.message ?? String(err)] };
    }
  }

  /**
   * Create the Service Worker entry wrapper.
   *
   * This wraps the user's Hono app with the official hono/service-worker adapter.
   * The user exports `app` (or default exports a Hono instance),
   * and we wire it into the SW fetch event.
   */
  private createSWEntryWrapper(source: string, filePath: string): string {
    // The wrapper expects the user's API file to export a Hono app instance.
    // Convention: export default app OR export const app = new Hono()
    return `
// Catalyst API SW Entry — Auto-generated
// Source: ${filePath}
import { handle } from 'hono/service-worker';

// --- User API code (inlined) ---
${source}
// --- End user API code ---

// Wire the Hono app to the SW fetch event.
// The user's code should have created and exported 'app'.
// If they used 'export default', it's available as the default export.
if (typeof app !== 'undefined') {
  self.addEventListener('fetch', handle(app));
  // Also expose for direct testing
  self.__catalystApiHandler = app.fetch.bind(app);
} else {
  console.error('[catalyst] No Hono app found in API entry. Export your app as "app" or use default export.');
}
`;
  }

  /**
   * Ensure Hono package is available in CatalystFS /node_modules/hono/.
   * Pre-bundled with Catalyst — no network needed.
   */
  private async ensureHono(): Promise<void> {
    const honoIndex = '/node_modules/hono/dist/index.js';
    if (this.fs.existsSync(honoIndex)) return;

    // Write the pre-bundled Hono files to CatalystFS
    // HONO_BUNDLE is a static import compiled into Catalyst
    this.fs.mkdirSync('/node_modules/hono/dist', { recursive: true });
    this.fs.mkdirSync('/node_modules/hono/dist/adapter/service-worker', { recursive: true });

    // These come from a build-time step that bundles Hono into Catalyst
    this.fs.writeFileSync('/node_modules/hono/package.json', HONO_PACKAGE_JSON);
    this.fs.writeFileSync(honoIndex, HONO_CORE_BUNDLE);
    this.fs.writeFileSync(
      '/node_modules/hono/dist/adapter/service-worker/index.js',
      HONO_SW_ADAPTER_BUNDLE,
    );
  }
}
```

**Step 3: Build-time Hono bundling**

Add a build step to Catalyst's own build process that pre-bundles Hono:

```typescript
// scripts/bundle-hono.ts — runs during Catalyst's own build
// Produces static string constants that get compiled into HonoIntegration

import { build } from 'esbuild';

// Bundle hono core
const coreResult = await build({
  entryPoints: ['node_modules/hono/dist/index.js'],
  bundle: true,
  format: 'esm',
  write: false,
  minify: true,
});

// Bundle hono/service-worker adapter
const swResult = await build({
  entryPoints: ['node_modules/hono/dist/adapter/service-worker/index.js'],
  bundle: true,
  format: 'esm',
  write: false,
  external: ['hono'],
  minify: true,
});

// Write as TypeScript constants
const output = `
export const HONO_CORE_BUNDLE = ${JSON.stringify(coreResult.outputFiles[0].text)};
export const HONO_SW_ADAPTER_BUNDLE = ${JSON.stringify(swResult.outputFiles[0].text)};
export const HONO_PACKAGE_JSON = ${JSON.stringify(JSON.stringify({
  name: 'hono',
  version: '4.6.0',
  main: './dist/index.js',
  module: './dist/index.js',
  exports: {
    '.': './dist/index.js',
    './service-worker': './dist/adapter/service-worker/index.js',
  },
}))};
`;

writeFileSync('packages/core/src/dev/hono-bundle.ts', output);
```

**Step 4: Update Preview Service Worker**

The existing `PreviewSW.ts` needs to handle the new Hono format:

```typescript
// In PreviewSW.ts — updated /api/* handling

// OLD: self.catalystApiHandler is a function set by the IIFE
// NEW: Hono's handle() already registered a fetch listener via self.addEventListener

// The simplest approach: the api-sw.js IIFE registers its own fetch listener
// via hono/service-worker's handle(). The PreviewSW just needs to load it.

// In the SW's install/activate:
if (apiSwExists) {
  importScripts('/dist/api-sw.js');
  // Hono's handle() is now registered as a fetch listener
}
```

Actually, there's a subtlety: we need the PreviewSW to control routing priority. Static files should be checked first, then API routes. The cleanest approach:

```typescript
// PreviewSW fetch handler — updated
self.addEventListener('fetch', async (event) => {
  const url = new URL(event.request.url);

  // 1. /api/* → delegate to Hono app (loaded from api-sw.js)
  if (url.pathname.startsWith('/api/') && self.__catalystApiHandler) {
    event.respondWith(self.__catalystApiHandler(event.request));
    return;
  }

  // 2. Static files → serve from CatalystFS
  // ... existing static file serving logic
});
```

This keeps `self.__catalystApiHandler` as the integration point, but now it's `app.fetch.bind(app)` from a real Hono instance instead of the toy router.

### What Gets Deleted

| Code | Location | Lines |
|------|----------|-------|
| `wrapForServiceWorker()` | HonoIntegration.ts | Lines 158-283 (~125 lines of fake router) |
| Toy `app` object | Inside wrapForServiceWorker | The fake get/post/put/delete/patch/all/use |
| Toy `createContext()` | Inside wrapForServiceWorker | The fake c.req, c.json, c.text, c.html, c.status |
| Toy `matchRoute()` | Inside wrapForServiceWorker | The fake path parameter matcher |
| Toy middleware runner | Inside wrapForServiceWorker | The fake next() that does nothing |

### What the User Gets

**BEFORE:** User writes Hono-like code, but `app.use(cors())` silently does nothing. Route parameters work only for simple `:param` patterns. No middleware chaining. No error boundaries.

**AFTER:** Real Hono. All of this works:

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

const app = new Hono().basePath('/api')

app.use('*', cors())
app.use('*', logger())

app.get('/todos', async (c) => {
  const data = await c.env.fs.readFile('/data/todos.json', 'utf-8');
  return c.json(JSON.parse(data));
})

app.post('/todos',
  zValidator('json', z.object({ title: z.string(), done: z.boolean() })),
  async (c) => {
    const todo = c.req.valid('json');
    // ... write to CatalystFS
    return c.json(todo, 201);
  }
)

// Typed RPC client (for frontend)
export type AppType = typeof app;
```

### Tests

**Update:** `packages/core/src/dev/HonoIntegration.browser.test.ts`

```
Existing tests (update to work with new build):
- API detection still works
- Build produces /dist/api-sw.js
- GET /api/hello returns response
- POST with JSON body works
- Route parameters (/api/todos/:id) work

New tests (proving real Hono):
- app.use(cors()) → response has Access-Control-Allow-Origin header
- app.use(logger()) → no crash (logger outputs to console)
- basePath('/api') → routes match under /api prefix
- Error in handler → 500 with error message (Hono error boundary)
- c.set('key', 'value') → c.get('key') returns 'value' in same request
- Middleware chain: use() → next() → handler → response (real next() works)
- Wildcard route /api/* matches all sub-paths
- 404 for unmatched routes returns proper JSON error
```

### Verification Checklist

- [ ] wrapForServiceWorker() deleted
- [ ] Build uses esbuild to bundle user code + real Hono
- [ ] Pre-bundled Hono written to CatalystFS /node_modules/hono/ on init
- [ ] GET /api/hello works end-to-end in browser test
- [ ] POST with JSON body works
- [ ] app.use(cors()) actually sets CORS headers
- [ ] Middleware next() function actually chains
- [ ] Route params (/api/todos/:id) → c.req.param('id') works
- [ ] Error boundary: thrown error → 500 JSON response
- [ ] All existing Phase 0-12 tests still pass

### CC Kickoff

```
Read: catalyst-upgrade-spec.md, Phase 13b section
Read: packages/core/src/dev/HonoIntegration.ts (the file to rewrite)
Read: packages/core/src/net/PreviewSW.ts (SW to update)
Read: packages/core/src/dev/BuildPipeline.ts (for esbuild integration)

Explore: https://hono.dev/docs/getting-started/service-worker (official adapter docs)

Install: pnpm add hono (as a bundled dependency of Catalyst, not a peer dep)

Do:
1. Create scripts/bundle-hono.ts — pre-bundles Hono at Catalyst build time
2. Create packages/core/src/dev/hono-bundle.ts — static Hono bundle strings
3. Rewrite HonoIntegration.ts:
   - Delete wrapForServiceWorker() entirely
   - Add ensureHono() that writes pre-bundled Hono to CatalystFS
   - Add createSWEntryWrapper() that uses hono/service-worker adapter
   - Update build() to use esbuild bundling
4. Update PreviewSW.ts to use self.__catalystApiHandler from real Hono
5. Update HonoIntegration.browser.test.ts — test real middleware, real routing
6. Run pnpm test:all — everything must pass
```

---

## PHASE 13c: PROCESSMANAGER WORKER ISOLATION — TRUE THREADS

### The Problem

The roadmap spec says (Phase 6): "Each process = new Worker with its own QuickJS-WASM instance."

CC built `worker-template.ts` — a complete Worker entry point that boots QuickJS, wires console to postMessage, handles exec/kill/stdin messages. It's correct and ready to use.

But `ProcessManager.ts` line 156 calls `CatalystEngine.create()` on the **main thread**:

```typescript
// ProcessManager.ts, startProcess() — THE PROBLEM
const engine = await CatalystEngine.create({
  fs: this.fs,
  env: options.env,
});
proc._setEngine(engine);
await engine.eval(code);  // ← BLOCKS MAIN THREAD
```

This means:
- CPU-heavy child processes (linters, formatters, test runners) **freeze the UI**
- No true memory isolation — one process's memory bomb could affect the main thread
- No true CPU isolation — infinite loop in child blocks parent
- Process.kill(SIGKILL) disposes QuickJS context but can't interrupt a sync loop

### The Solution

Wire up the existing `worker-template.ts`. Each spawned process gets its own Web Worker with its own QuickJS-WASM instance.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│ MAIN THREAD                                             │
│                                                         │
│  ProcessManager                                         │
│  ├── spawn(code) ──────────┬──────────┬─────────────┐   │
│  │                         │          │             │   │
│  │                    ┌────┴────┐ ┌───┴────┐ ┌──────┴─┐ │
│  │                    │Worker 1 │ │Worker 2│ │Worker 3│ │
│  │                    │(PID 1)  │ │(PID 2) │ │(PID 3) │ │
│  │                    │         │ │        │ │        │ │
│  │                    │QuickJS  │ │QuickJS │ │QuickJS │ │
│  │                    │Instance │ │Instance│ │Instance│ │
│  │                    │         │ │        │ │        │ │
│  │                    │CatalystFS via      │ │        │ │
│  │                    │MessagePort         │ │        │ │
│  │                    └─────────┘ └────────┘ └────────┘ │
│  │                         ▲          ▲          ▲      │
│  │ MessageChannel:         │          │          │      │
│  │  stdout/stderr ◄────────┤          │          │      │
│  │  stdin ────────────────►│          │          │      │
│  │  exit code ◄────────────┘          │          │      │
│  │  fs operations ◄──────────────────►│          │      │
│  │                                               │      │
│  └───────────────────────────────────────────────┘      │
│                                                         │
│  CatalystFS (OPFS) ◄────── Port backend ────► Workers   │
│                         (ZenFS MessagePort)             │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

**1. Worker creation via Blob URL**

Workers need a JavaScript entry point. Since Catalyst runs in-browser with no server to serve worker files, we create Workers from Blob URLs:

```typescript
const source = getWorkerSource(); // from worker-template.ts
const blob = new Blob([source], { type: 'application/javascript' });
const url = URL.createObjectURL(blob);
const worker = new Worker(url, { type: 'classic' }); // classic, not module — importScripts compat
```

**2. CatalystFS access via MessagePort**

Workers can't access OPFS directly (they can access SyncAccessHandle, but not the same OPFS root as the main thread). Instead, CatalystFS exposes a Port backend via ZenFS — the Worker sends fs operation requests over a MessagePort, the main thread executes them against CatalystFS, and returns results.

This is already how the Preview Service Worker accesses CatalystFS (Phase 3). Same pattern.

**3. Worker lifecycle**

```
SPAWN:
  Main thread creates Worker from Blob URL
  Main thread creates MessageChannel pair (control, fs)
  Main thread sends 'init' with MessagePort for fs access
  Worker boots QuickJS-WASM (async — ~100ms)
  Worker sends 'ready' when QuickJS is booted
  Main thread sends 'exec' with code
  Worker evaluates code
  Worker streams stdout/stderr via postMessage
  Worker sends 'exit' with code when done

KILL (SIGTERM):
  Main thread sends 'kill' message with signal=15
  Worker disposes QuickJS context (graceful cleanup)
  Worker sends 'exit' with code 128+15=143
  Worker calls self.close()
  Main thread calls URL.revokeObjectURL(blobUrl)

KILL (SIGKILL):
  Main thread calls worker.terminate() (IMMEDIATE — no cleanup)
  Main thread marks process as killed(SIGKILL), exitCode=137
  Main thread calls URL.revokeObjectURL(blobUrl)
  Worker thread is destroyed by the browser — no message needed
```

**4. Resource limits**

Each Worker gets its own QuickJS instance with independent limits:

```typescript
interface WorkerProcessConfig {
  memoryLimit: number;    // QuickJS memory limit per worker (default: 256MB)
  stackSize: number;      // QuickJS stack size per worker (default: 1MB)
  timeout: number;        // Execution timeout per exec (default: 30s)
  maxWorkers: number;     // ProcessManager pool limit (default: 8)
}
```

The `maxWorkers` limit is critical — each Worker loads a full QuickJS-WASM binary (~600KB), so 8 workers = ~5MB of WASM memory. Beyond 8 concurrent workers, performance degrades.

**5. Fallback: inline mode**

If Worker creation fails (some sandboxed environments block `new Worker(blobUrl)`), fall back to the existing inline CatalystEngine approach. Log a warning.

```typescript
private async createWorkerProcess(proc: CatalystProcess, code: string): Promise<void> {
  try {
    const worker = this.createWorker();
    // ... Worker-based execution
  } catch (err) {
    console.warn('[catalyst] Worker creation failed, falling back to inline mode:', err);
    await this.createInlineProcess(proc, code);
  }
}
```

**6. Batched stdio (StdioBatcher)**

The naive approach sends one `postMessage` per `console.log` call. A test runner dumping 500 lines of output means 500 MessagePort messages — 500 structured clones, 500 microtasks on the main thread, 500 `onmessage` event handler invocations. This is the same problem James Snell identified in the Cloudflare "Better Streams API" post (Feb 2025): per-item async overhead dominates when you have many small chunks. His solution — batched `Uint8Array[]` arrays that amortize the async cost across multiple chunks — applies directly to our Worker stdio protocol.

**StdioBatcher** accumulates stdout/stderr chunks inside the Worker and flushes them as a single `postMessage` containing an array of strings. Flushing triggers on whichever comes first:
- **Byte threshold:** 4KB of accumulated data (tunable)
- **Time threshold:** 16ms since first unflushed chunk (~1 frame at 60fps)
- **Explicit flush:** process exit, kill signal, or `end()` call

This reduces MessagePort traffic from N messages to roughly N/50 for chatty processes while keeping latency under 16ms for interactive output.

```
// Inside Worker: instead of direct postMessage per line
stdioBatcher.push('stdout', 'test 1 passed\n');
stdioBatcher.push('stdout', 'test 2 passed\n');
stdioBatcher.push('stdout', 'test 3 failed\n');
// ... 47 more lines ...
// One postMessage fires: { type: 'stdout-batch', chunks: [...50 strings...] }
```

On the main thread, WorkerBridge unpacks the batch and calls `onStdout` per chunk for API compatibility. The CatalystProcess consumer sees the same stream of individual chunks — the batching is invisible above the bridge layer.

**Why 16ms and 4KB:** 16ms aligns with `requestAnimationFrame` cadence — if the UI is rendering at 60fps, flushing once per frame is the fastest rate that matters visually. 4KB is the threshold where structured clone overhead starts to dominate over the actual data transfer (below 4KB, the overhead per message is comparable to the payload). These are tunable via `WorkerProcessConfig`.

```typescript
interface WorkerProcessConfig {
  memoryLimit: number;       // QuickJS memory limit per worker (default: 256MB)
  stackSize: number;         // QuickJS stack size per worker (default: 1MB)
  timeout: number;           // Execution timeout per exec (default: 30s)
  maxWorkers: number;        // ProcessManager pool limit (default: 8)
  stdioBatchBytes: number;   // Flush stdio after N bytes accumulated (default: 4096)
  stdioBatchMs: number;      // Flush stdio after N ms since first chunk (default: 16)
}
```

### Implementation Plan

**Files to modify:**

1. `packages/core/src/proc/ProcessManager.ts` — rewrite `startProcess()` to use Workers
2. `packages/core/src/proc/CatalystProcess.ts` — add Worker handle, update kill() for Worker.terminate()
3. `packages/core/src/proc/worker-template.ts` — upgrade: add fs MessagePort, host bindings, unenv modules, StdioBatcher

**Files to create:**

4. `packages/core/src/proc/WorkerPool.ts` — manages Worker lifecycle, limits, Blob URL cleanup
5. `packages/core/src/proc/WorkerBridge.ts` — MessageChannel protocol between main thread and Worker
6. `packages/core/src/proc/worker-fs-proxy.ts` — fs operations over MessagePort (Worker side)
7. `packages/core/src/proc/StdioBatcher.ts` — batched stdio for Worker→main thread efficiency

### WorkerPool.ts

```typescript
/**
 * WorkerPool — Manages the lifecycle of Worker-based processes.
 *
 * Responsibilities:
 * - Create Workers from Blob URL (generated from worker-template.ts)
 * - Track active Workers against maxWorkers limit
 * - Clean up: revoke Blob URLs, terminate orphaned Workers
 * - Provide fallback detection (can Workers be created?)
 */
export class WorkerPool {
  private activeWorkers = new Map<number, WorkerHandle>();
  private blobUrl: string | null = null;
  private workerSupported: boolean | null = null;
  private readonly maxWorkers: number;

  constructor(config: { maxWorkers?: number } = {}) {
    this.maxWorkers = config.maxWorkers ?? 8;
  }

  /** Detect if Blob URL Workers are supported in this environment */
  async isWorkerSupported(): Promise<boolean> {
    if (this.workerSupported !== null) return this.workerSupported;

    try {
      const testSource = 'self.postMessage("ok"); self.close();';
      const blob = new Blob([testSource], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);

      const result = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 2000);
        worker.onmessage = () => { clearTimeout(timer); resolve(true); };
        worker.onerror = () => { clearTimeout(timer); resolve(false); };
      });

      worker.terminate();
      URL.revokeObjectURL(url);
      this.workerSupported = result;
      return result;
    } catch {
      this.workerSupported = false;
      return false;
    }
  }

  /** Get or create the Worker Blob URL (shared across all Workers) */
  private getWorkerBlobUrl(): string {
    if (!this.blobUrl) {
      const source = getEnhancedWorkerSource(); // upgraded worker-template
      const blob = new Blob([source], { type: 'application/javascript' });
      this.blobUrl = URL.createObjectURL(blob);
    }
    return this.blobUrl;
  }

  /** Spawn a new Worker for a process */
  async spawn(pid: number): Promise<WorkerHandle> {
    if (this.activeWorkers.size >= this.maxWorkers) {
      throw new Error(
        `Worker pool limit reached (${this.maxWorkers}). ` +
        `Kill existing processes before spawning new ones.`
      );
    }

    const url = this.getWorkerBlobUrl();
    const worker = new Worker(url);

    // Create MessageChannels for different concerns
    const controlChannel = new MessageChannel(); // exec, kill, stdin
    const fsChannel = new MessageChannel();       // CatalystFS operations
    const stdioChannel = new MessageChannel();    // stdout, stderr streaming

    const handle: WorkerHandle = {
      pid,
      worker,
      controlPort: controlChannel.port1,
      fsPort: fsChannel.port1,
      stdioPort: stdioChannel.port1,
      state: 'initializing',
    };

    // Send init message with ports
    worker.postMessage(
      {
        type: 'init',
        pid,
        config: {
          memoryLimit: 256 * 1024 * 1024,
          stackSize: 1024 * 1024,
        },
      },
      [controlChannel.port2, fsChannel.port2, stdioChannel.port2]
    );

    this.activeWorkers.set(pid, handle);
    return handle;
  }

  /** Terminate a Worker immediately (SIGKILL) */
  terminate(pid: number): boolean {
    const handle = this.activeWorkers.get(pid);
    if (!handle) return false;

    handle.worker.terminate();
    handle.state = 'terminated';
    this.activeWorkers.delete(pid);
    return true;
  }

  /** Send graceful kill signal (SIGTERM) */
  signal(pid: number, signal: number): boolean {
    const handle = this.activeWorkers.get(pid);
    if (!handle || handle.state !== 'running') return false;

    handle.controlPort.postMessage({ type: 'kill', signal });
    return true;
  }

  /** Clean up a completed Worker */
  release(pid: number): void {
    const handle = this.activeWorkers.get(pid);
    if (handle) {
      handle.controlPort.close();
      handle.fsPort.close();
      handle.stdioPort.close();
      this.activeWorkers.delete(pid);
    }
  }

  /** Terminate all Workers */
  terminateAll(): void {
    for (const [pid] of this.activeWorkers) {
      this.terminate(pid);
    }
  }

  /** Clean up the shared Blob URL (call on ProcessManager dispose) */
  dispose(): void {
    this.terminateAll();
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
  }

  get activeCount(): number {
    return this.activeWorkers.size;
  }
}

interface WorkerHandle {
  pid: number;
  worker: Worker;
  controlPort: MessagePort;
  fsPort: MessagePort;
  stdioPort: MessagePort;
  state: 'initializing' | 'ready' | 'running' | 'terminated';
}
```

### WorkerBridge.ts

```typescript
/**
 * WorkerBridge — Protocol between main thread and Worker process.
 *
 * Wraps the raw MessageChannel communication into a typed, promise-based API.
 * Handles:
 * - Waiting for Worker 'ready' signal
 * - Sending 'exec' and receiving stdout/stderr/exit
 * - Forwarding CatalystFS operations
 * - Timeout enforcement
 */
export class WorkerBridge {
  private readonly handle: WorkerHandle;
  private readonly fs?: CatalystFS;
  private readyPromise: Promise<void>;

  constructor(handle: WorkerHandle, fs?: CatalystFS) {
    this.handle = handle;
    this.fs = fs;

    // Wire up CatalystFS proxy on the fs MessagePort
    if (fs) {
      this.handle.fsPort.onmessage = (event) => {
        this.handleFsRequest(event.data);
      };
    }

    // Wait for Worker to boot QuickJS and signal ready
    this.readyPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Worker boot timeout')), 10000);

      this.handle.worker.onmessage = (event) => {
        if (event.data.type === 'ready') {
          clearTimeout(timeout);
          this.handle.state = 'ready';
          resolve();
        } else if (event.data.type === 'error') {
          clearTimeout(timeout);
          reject(new Error(event.data.data));
        }
      };
    });
  }

  /** Wait for the Worker to finish booting QuickJS */
  async waitReady(): Promise<void> {
    return this.readyPromise;
  }

  /** Execute code in the Worker, streaming stdio back via callbacks */
  exec(
    code: string,
    callbacks: {
      onStdout?: (data: string) => void;
      onStderr?: (data: string) => void;
    } = {}
  ): Promise<{ exitCode: number }> {
    return new Promise((resolve) => {
      // Listen for stdio and exit on the stdio port.
      // Worker sends batched chunks via StdioBatcher — we unpack them
      // and call onStdout/onStderr per chunk for API compatibility.
      // The batching is invisible to CatalystProcess consumers.
      this.handle.stdioPort.onmessage = (event) => {
        const msg = event.data;
        switch (msg.type) {
          // Batched messages from StdioBatcher (primary path)
          case 'stdout-batch':
            if (callbacks.onStdout) {
              for (const chunk of msg.chunks) callbacks.onStdout(chunk);
            }
            break;
          case 'stderr-batch':
            if (callbacks.onStderr) {
              for (const chunk of msg.chunks) callbacks.onStderr(chunk);
            }
            break;
          // Single messages (fallback compat, exit signals)
          case 'stdout':
            callbacks.onStdout?.(msg.data);
            break;
          case 'stderr':
            callbacks.onStderr?.(msg.data);
            break;
          case 'exit':
            this.handle.state = 'terminated';
            resolve({ exitCode: msg.code ?? 0 });
            break;
        }
      };

      // Send exec command
      this.handle.controlPort.postMessage({ type: 'exec', code });
      this.handle.state = 'running';
    });
  }

  /** Handle CatalystFS proxy requests from the Worker */
  private async handleFsRequest(request: FsProxyRequest): Promise<void> {
    if (!this.fs) {
      this.handle.fsPort.postMessage({
        id: request.id,
        error: 'No CatalystFS available',
      });
      return;
    }

    try {
      let result: any;

      switch (request.method) {
        case 'readFileSync':
          result = this.fs.readFileSync(request.args[0], request.args[1]);
          break;
        case 'writeFileSync':
          this.fs.writeFileSync(request.args[0], request.args[1], request.args[2]);
          result = undefined;
          break;
        case 'existsSync':
          result = this.fs.existsSync(request.args[0]);
          break;
        case 'mkdirSync':
          this.fs.mkdirSync(request.args[0], request.args[1]);
          result = undefined;
          break;
        case 'readdirSync':
          result = this.fs.readdirSync(request.args[0]);
          break;
        case 'statSync':
          result = this.fs.statSync(request.args[0]);
          break;
        case 'unlinkSync':
          this.fs.unlinkSync(request.args[0]);
          result = undefined;
          break;
        default:
          throw new Error(`Unknown fs method: ${request.method}`);
      }

      this.handle.fsPort.postMessage({ id: request.id, result });
    } catch (err: any) {
      this.handle.fsPort.postMessage({
        id: request.id,
        error: err?.message ?? String(err),
      });
    }
  }
}

interface FsProxyRequest {
  id: number;
  method: string;
  args: any[];
}
```

### Enhanced Worker Template

Upgrade `worker-template.ts` to support MessagePort-based fs and the full host binding set:

```typescript
// worker-template.ts — enhanced version

export function getEnhancedWorkerSource(): string {
  return `
// CatalystProc Worker — Enhanced with MessagePort FS and host bindings
// This runs in its own thread with its own QuickJS-WASM instance

let ctx = null;
let runtime = null;
let controlPort = null;
let fsPort = null;
let stdioPort = null;
let fsRequestId = 0;
let fsPendingRequests = new Map();

// ---- FS Proxy: synchronous-looking fs calls over MessagePort ----
// Uses SharedArrayBuffer + Atomics for sync-over-async when available,
// falls back to async-only when not.

function fsProxy(method, ...args) {
  return new Promise((resolve, reject) => {
    const id = ++fsRequestId;
    fsPendingRequests.set(id, { resolve, reject });
    fsPort.postMessage({ id, method, args });
  });
}

// Wire fs port responses
function initFsPort(port) {
  fsPort = port;
  port.onmessage = function(event) {
    const { id, result, error } = event.data;
    const pending = fsPendingRequests.get(id);
    if (pending) {
      fsPendingRequests.delete(id);
      if (error) pending.reject(new Error(error));
      else pending.resolve(result);
    }
  };
}

// ---- Stdio Batcher: amortize MessagePort overhead ----
// Instead of one postMessage per console.log, accumulate chunks
// and flush as a batch on time or byte threshold.

var stdoutBuffer = [];
var stderrBuffer = [];
var stdoutBytes = 0;
var stderrBytes = 0;
var flushTimer = null;
var BATCH_BYTES = 4096;  // flush after 4KB accumulated
var BATCH_MS = 16;       // flush after 16ms (~1 frame)

function flushStdio() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (stdoutBuffer.length > 0) {
    stdioPort.postMessage({ type: 'stdout-batch', chunks: stdoutBuffer.splice(0) });
    stdoutBytes = 0;
  }
  if (stderrBuffer.length > 0) {
    stdioPort.postMessage({ type: 'stderr-batch', chunks: stderrBuffer.splice(0) });
    stderrBytes = 0;
  }
}

function scheduleFlush() {
  if (!flushTimer) {
    flushTimer = setTimeout(flushStdio, BATCH_MS);
  }
}

function pushStdout(data) {
  stdoutBuffer.push(data);
  stdoutBytes += data.length;
  if (stdoutBytes >= BATCH_BYTES) flushStdio();
  else scheduleFlush();
}

function pushStderr(data) {
  stderrBuffer.push(data);
  stderrBytes += data.length;
  if (stderrBytes >= BATCH_BYTES) flushStdio();
  else scheduleFlush();
}

// ---- QuickJS Boot ----

async function boot(config) {
  // Apply batch config if provided
  if (config.stdioBatchBytes) BATCH_BYTES = config.stdioBatchBytes;
  if (config.stdioBatchMs) BATCH_MS = config.stdioBatchMs;

  try {
    const { getQuickJS } = await import('quickjs-emscripten');
    const QuickJS = await getQuickJS();
    runtime = QuickJS.newRuntime();
    runtime.setMemoryLimit(config.memoryLimit || 256 * 1024 * 1024);
    runtime.setMaxStackSize(config.stackSize || 1024 * 1024);
    ctx = runtime.newContext();

    // Wire console → StdioBatcher (NOT direct postMessage)
    var consoleObj = ctx.newObject();
    ['log', 'info', 'debug', 'warn'].forEach(function(level) {
      var fn = ctx.newFunction('console_' + level, function() {
        var args = [];
        for (var i = 0; i < arguments.length; i++) {
          try { args.push(ctx.dump(arguments[i])); }
          catch(e) { args.push(String(arguments[i])); }
        }
        pushStdout(args.join(' ') + '\\n');
      });
      ctx.setProp(consoleObj, level, fn);
      fn.dispose();
    });

    var errorFn = ctx.newFunction('console_error', function() {
      var args = [];
      for (var i = 0; i < arguments.length; i++) {
        try { args.push(ctx.dump(arguments[i])); }
        catch(e) { args.push(String(arguments[i])); }
      }
      pushStderr(args.join(' ') + '\\n');
    });
    ctx.setProp(consoleObj, 'error', errorFn);
    errorFn.dispose();
    ctx.setProp(ctx.global, 'console', consoleObj);
    consoleObj.dispose();

    // TODO: Wire require() with fs proxy + unenv modules
    // This is where Phase 13a's unenv bridge gets injected into each Worker

    self.postMessage({ type: 'ready' });
  } catch (e) {
    self.postMessage({ type: 'error', data: 'Boot failed: ' + (e.message || e) });
  }
}

// ---- Message Handler ----

self.addEventListener('message', function(event) {
  var msg = event.data;

  if (msg.type === 'init') {
    // Receive MessagePorts via transfer
    // event.ports[0] = controlPort, [1] = fsPort, [2] = stdioPort
    controlPort = event.ports[0];
    initFsPort(event.ports[1]);
    stdioPort = event.ports[2];

    // Wire control port
    controlPort.onmessage = function(e) {
      var cmd = e.data;
      if (cmd.type === 'exec' && ctx) {
        try {
          var result = ctx.evalCode(cmd.code || '', '<process>');
          if (result.error) {
            var err = ctx.dump(result.error);
            result.error.dispose();
            pushStderr(String(err) + '\\n');
            flushStdio(); // Drain all buffered output before exit
            stdioPort.postMessage({ type: 'exit', code: 1 });
          } else {
            result.value.dispose();
            flushStdio(); // Drain all buffered output before exit
            stdioPort.postMessage({ type: 'exit', code: 0 });
          }
        } catch (e) {
          pushStderr((e.message || String(e)) + '\\n');
          flushStdio(); // Drain all buffered output before exit
          stdioPort.postMessage({ type: 'exit', code: 1 });
        }
      }

      if (cmd.type === 'kill') {
        flushStdio(); // Drain remaining output before death
        try {
          if (ctx) { ctx.dispose(); ctx = null; }
          if (runtime) { runtime.dispose(); runtime = null; }
        } catch(e) {}
        var exitCode = 128 + (cmd.signal || 15);
        stdioPort.postMessage({ type: 'exit', code: exitCode });
        self.close();
      }
    };

    // Boot QuickJS
    boot(msg.config || {});
  }
});
`;
}
```

### Updated ProcessManager.ts

The key change: `startProcess()` creates a Worker instead of an inline engine.

```typescript
// ProcessManager.ts — updated spawn flow

export class ProcessManager {
  private readonly pool: WorkerPool;
  private readonly bridges = new Map<number, WorkerBridge>();
  // ... existing fields

  constructor(config: ProcessManagerConfig = {}) {
    this.fs = config.fs;
    this.maxProcesses = config.maxProcesses ?? 32;
    this.pool = new WorkerPool({ maxWorkers: config.maxWorkers ?? 8 });
  }

  spawn(code: string, options: ProcessOptions = {}): CatalystProcess {
    // ... existing limit check, PID allocation, process creation

    // Start asynchronously — Worker or inline fallback
    this.startProcess(proc, code, options).catch((err) => {
      if (proc.state === 'starting' || proc.state === 'running') {
        proc._exit(1);
      }
    });

    return proc;
  }

  private async startProcess(
    proc: CatalystProcess,
    code: string,
    options: ProcessOptions,
  ): Promise<void> {
    if (proc.state === 'killed' || proc.state === 'exited') return;

    // Try Worker-based isolation first
    const canUseWorker = await this.pool.isWorkerSupported();

    if (canUseWorker) {
      await this.startWorkerProcess(proc, code, options);
    } else {
      console.warn('[catalyst] Workers unavailable, using inline process (no thread isolation)');
      await this.startInlineProcess(proc, code, options);
    }
  }

  private async startWorkerProcess(
    proc: CatalystProcess,
    code: string,
    options: ProcessOptions,
  ): Promise<void> {
    const handle = await this.pool.spawn(proc.pid);
    const bridge = new WorkerBridge(handle, this.fs);
    this.bridges.set(proc.pid, bridge);

    // Wait for QuickJS to boot in the Worker
    await bridge.waitReady();

    if (proc.state === 'killed' || proc.state === 'exited') {
      this.pool.terminate(proc.pid);
      return;
    }

    proc._setState('running');

    // Execute code, streaming stdio back
    const result = await bridge.exec(code, {
      onStdout: (data) => proc._pushStdout(data),
      onStderr: (data) => proc._pushStderr(data),
    });

    proc._exit(result.exitCode);
    this.pool.release(proc.pid);
    this.bridges.delete(proc.pid);
  }

  private async startInlineProcess(
    proc: CatalystProcess,
    code: string,
    options: ProcessOptions,
  ): Promise<void> {
    // Existing inline CatalystEngine approach — kept as fallback
    const engine = await CatalystEngine.create({
      fs: this.fs,
      env: options.env,
    });

    if (proc.state === 'killed' || proc.state === 'exited') {
      engine.dispose();
      return;
    }

    proc._setEngine(engine);

    try {
      await engine.eval(code);
      if (proc.state === 'running') proc._exit(0);
    } catch {
      if (proc.state === 'running') proc._exit(1);
    }
  }

  kill(pid: number, signal: Signal = 'SIGTERM'): boolean {
    const proc = this.processes.get(pid);
    if (!proc) return false;

    if (signal === 'SIGKILL') {
      // Immediate: terminate the Worker thread
      this.pool.terminate(pid);
      this.bridges.delete(pid);
      proc._killed(signal);
      return true;
    }

    // Graceful: send kill signal to Worker
    const bridge = this.bridges.get(pid);
    if (bridge) {
      this.pool.signal(pid, SIGNALS[signal] ?? 15);
    }
    proc._killed(signal);
    return true;
  }

  dispose(): void {
    this.pool.dispose();
  }
}
```

### CatalystProcess.ts Updates

Minor updates to support the Worker-based flow:

```typescript
// Add to CatalystProcess:

/** Push stdout data from Worker bridge */
_pushStdout(data: string): void {
  this._stdoutChunks.push(data);
  this._emit('stdout', data);
}

/** Push stderr data from Worker bridge */
_pushStderr(data: string): void {
  this._stderrChunks.push(data);
  this._emit('stderr', data);
}

/** Set state directly (used by Worker flow which doesn't have an engine reference) */
_setState(state: ProcessState): void {
  this._state = state;
}
```

### Tests

**Update:** `packages/core/src/proc/ProcessManager.browser.test.ts`

```
Existing tests (must still pass):
- exec returns stdout
- exec returns stderr on error
- exec respects timeout
- spawn streams stdout chunks
- spawn streams stderr chunks
- Process isolation: spawned process can't access parent variables
- kill(SIGTERM) graceful termination
- kill(SIGKILL) immediate termination
- CatalystFS access from child process

New tests (Worker-specific):
- Worker detection: isWorkerSupported() returns true in Chromium
- Worker spawn: process runs in separate thread (main thread not blocked)
- Worker isolation proof: spawn CPU-heavy loop, verify main thread stays responsive
  (spawn process that does `while(true){}`, verify parent can still kill it)
- Worker memory isolation: child process memory bomb doesn't affect main thread
- Worker kill(SIGKILL) via Worker.terminate(): immediate, no cleanup message needed
- Worker kill(SIGTERM) via MessagePort: graceful, Worker disposes QuickJS and exits
- Worker CatalystFS access: child reads file written by parent via MessagePort proxy
- Worker CatalystFS write: child writes file, parent reads it after exit
- Fallback: when Worker creation fails, falls back to inline (mock Worker constructor to throw)
- Pool limit: spawn more than maxWorkers → error with clear message
- Pool cleanup: after all processes exit, no orphaned Workers
- Multiple concurrent Workers: 4 parallel exec() calls complete independently
- StdioBatcher: spawn process that console.log()s 200 lines, verify main thread
  receives <10 MessagePort messages (not 200) — proves batching works
- StdioBatcher flush on exit: process prints 3 lines and exits, all 3 lines
  appear in stdout (batch flushed before exit message, not lost)
- StdioBatcher ordering: stdout and stderr interleaved in correct order
  (batch boundaries don't reorder output across streams)
- StdioBatcher byte threshold: process prints one 8KB string, triggers
  immediate flush (exceeds 4KB threshold), received without 16ms delay
```

### Verification Checklist

- [ ] WorkerPool.isWorkerSupported() returns true in Chromium
- [ ] spawn() creates a real Web Worker (verify via browser DevTools Workers panel)
- [ ] exec() returns stdout from Worker-based process
- [ ] Main thread stays responsive during CPU-heavy child process
- [ ] kill(SIGKILL) calls Worker.terminate() — instant, no message needed
- [ ] kill(SIGTERM) sends message, Worker gracefully exits
- [ ] CatalystFS read/write works from Worker via MessagePort proxy
- [ ] Inline fallback works when Workers are blocked
- [ ] Pool limit enforced — error at maxWorkers+1
- [ ] Blob URLs cleaned up after Workers terminate
- [ ] StdioBatcher: 200 console.log()s produce <10 MessagePort messages
- [ ] StdioBatcher: no output lost on process exit (flush before exit message)
- [ ] StdioBatcher: configurable via stdioBatchBytes/stdioBatchMs
- [ ] All existing Phase 0-12 tests still pass

### CC Kickoff

```
Read: catalyst-upgrade-spec.md, Phase 13c section
Read: packages/core/src/proc/ProcessManager.ts (rewrite startProcess)
Read: packages/core/src/proc/CatalystProcess.ts (add _pushStdout, _pushStderr, _setState)
Read: packages/core/src/proc/worker-template.ts (upgrade to enhanced version)

Do:
1. Create packages/core/src/proc/WorkerPool.ts per spec
2. Create packages/core/src/proc/WorkerBridge.ts per spec — handle both
   'stdout-batch'/'stderr-batch' (batched) and 'stdout'/'stderr' (single) messages
3. Upgrade packages/core/src/proc/worker-template.ts with:
   - MessagePort FS proxy
   - StdioBatcher (accumulate chunks, flush on 4KB/16ms/exit)
   - Console wiring through pushStdout/pushStderr, NOT direct postMessage
   - flushStdio() call before every exit message
4. Rewrite ProcessManager.ts:
   - Add WorkerPool as a dependency
   - startProcess() tries Worker first, falls back to inline
   - kill() uses Worker.terminate() for SIGKILL, MessagePort for SIGTERM
   - Add dispose() that cleans up WorkerPool
   - Pass stdioBatchBytes/stdioBatchMs config through to Worker init
5. Update CatalystProcess.ts with _pushStdout, _pushStderr, _setState
6. Update ProcessManager.browser.test.ts with Worker-specific tests
   including StdioBatcher message count verification
7. Run pnpm test:all — everything must pass
```

---

## PHASE 13d: SECURITY SMOKE SUITE

### Why This Exists

The Catalyst spec claims "secure by default." The codebase has zero tests proving it. Every layer — CatalystFS, CatalystEngine, CatalystNet — makes security assumptions that are completely unverified. This isn't a hardening phase, it's proving that the existing security surface isn't broken. If these tests fail, we have real vulnerabilities, not aspirational TODOs.

This is a short session — we're not building new security features, we're writing tests against what's already there. If tests fail, that's the point — we fix before shipping.

### Why Now (Not Later)

Phase 13a replaces the require chain (unenv modules get injected). Phase 13c puts user code in Workers with MessagePort-based fs access. Both of these change the attack surface. If we write security tests *after* those changes, we don't know whether a failure was pre-existing or introduced. Writing them now creates a baseline. Running them again after 13a/13b/13c proves the upgrades didn't open holes.

**Recommended order: Run 13d AFTER 13a/13b/13c, but write the test file NOW as part of Phase 13a and run it as a baseline before any changes.**

### Test File

`packages/core/src/security/security.browser.test.ts`

**CatalystFS — Path Traversal & Injection**

```
These test that the filesystem layer doesn't let user code escape its sandbox.
Ralph generates code that writes to CatalystFS. If a malicious or buggy
generated path can escape the virtual root, the entire security model breaks.

Tests:
- fs.readFileSync('../../etc/passwd') → throws (not "file not found" — TRAVERSAL error)
- fs.readFileSync('/etc/passwd') → throws (absolute path outside mount)
- fs.writeFileSync('../../../tmp/evil', 'data') → throws
- fs.readFileSync('file\x00.txt') → throws (null byte injection)
- fs.readFileSync('file%00.txt') → throws (URL-encoded null byte)
- fs.mkdirSync('/project/../../../escape') → throws, does NOT create dir
- fs.renameSync('/project/safe.txt', '../../outside.txt') → throws
- fs.readdirSync('/') → returns only mounted paths, not host FS
- Symlink escape: if symlinks supported, can't follow link outside mount
```

**Why these specific tests:** Path traversal is the #1 filesystem vulnerability. Null byte injection is #2 (C-based systems truncate at null, JS doesn't — mismatch = escape). Every browser-based filesystem that claims security needs these. If ZenFS handles them correctly, great — now we have proof. If it doesn't, we catch it before users do.

**CatalystEngine — Sandbox Escape**

```
These test that code running inside QuickJS-WASM can't reach the browser's
global scope. If a user's npm package contains malicious code, it must be
contained inside the QuickJS VM.

Tests:
- eval("Function('return this')()") → returns QuickJS global, NOT window/self
- eval("this.constructor.constructor('return this')()") → contained
- eval("typeof window") → 'undefined' (not accessible from QuickJS)
- eval("typeof document") → 'undefined'
- eval("typeof globalThis.fetch") → 'undefined' (uses CatalystNet proxy, not browser fetch)
- eval("while(true){}") → terminated by timeout (30s default), not infinite hang
- eval("var a = []; while(true) a.push(new Array(1000000))") → terminated by memory limit
- eval with 100 nested requires → doesn't stack overflow or hang
- eval("process.exit(0)") → exits the QuickJS context, does NOT exit the browser tab
- eval("require('child_process').exec('rm -rf /')") → throws MODULE_NOT_FOUND or stub error
```

**Why these specific tests:** `Function('return this')()` is the classic sandbox escape — it returns the true global in most JS environments. QuickJS should prevent this, but we have zero proof. The memory bomb and infinite loop tests verify that resource limits actually fire (the spec says 256MB / 30s defaults, but are they wired?). The `process.exit()` test verifies it exits the VM context, not the browser — a subtle but critical distinction.

**CatalystNet — Domain & Request Filtering**

```
These test that the fetch proxy doesn't let user code reach arbitrary domains.
Without this, a malicious package could exfiltrate data to any server.

Tests:
- fetch('https://evil.com/steal') → rejected (not in allowlist)
- fetch('https://registry.npmjs.org/lodash') → allowed (in default allowlist)
- fetch('https://esm.sh/lodash') → allowed
- fetch('http://localhost:3000') → behavior documented (allowed or blocked?)
- fetch('https://xn--80ak6aa92e.com') → punycode domain → verify against allowlist
- fetch with 302 redirect to blocked domain → blocked (redirect target checked)
- fetch that returns 500MB response → truncated or rejected (memory protection)
- fetch('file:///etc/passwd') → rejected (non-http scheme)
- fetch('data:text/html,<script>alert(1)</script>') → rejected or handled safely
```

**Why redirect-to-blocked-domain matters:** A sophisticated attack serves an allowed URL that 302-redirects to an attacker-controlled domain. If the fetch proxy only checks the initial URL, the exfiltration succeeds. This is a real attack vector used against server-side request forgery (SSRF) defenses.

**Why punycode matters:** `xn--80ak6aa92e.com` is the punycode encoding of a Cyrillic domain that visually resembles a Latin domain. If the allowlist checks the ASCII form but the user sees the Unicode form (or vice versa), there's a mismatch that allows bypasses. This is a known IDN homograph attack.

### Verification Checklist

- [ ] All path traversal tests pass (FS rejects escape attempts)
- [ ] All sandbox escape tests pass (QuickJS contains user code)
- [ ] All domain filtering tests pass (fetch proxy blocks unauthorized domains)
- [ ] Timeout actually fires on infinite loop (not just logged — process terminated)
- [ ] Memory limit actually fires on memory bomb (not just logged — process terminated)
- [ ] Redirect-to-blocked-domain is caught
- [ ] Tests run in <30s total (security tests should be fast)

### CC Kickoff

```
Read: catalyst-upgrade-spec.md, Phase 13d section

Create: packages/core/src/security/security.browser.test.ts

Run BEFORE any Phase 13a/b/c changes to establish baseline.
Run AGAIN after each of 13a, 13b, 13c to verify no regressions.

If any test fails: STOP. Fix before proceeding. A security
failure in the baseline is a pre-existing vulnerability.
```

---

## PHASE 13e: SYNC JOURNAL COMPACTION CORRECTNESS

### Why This Exists

The OperationJournal in Phase 11 compacts filesystem mutations before replay. If compaction is wrong, reconnecting after offline work corrupts state. This is the kind of bug that's invisible in testing (because it only manifests after disconnect → offline edits → reconnect) and catastrophic in production (because it silently destroys or duplicates user files).

CC built the journal and the compaction logic. But compaction has specific algebraic rules that need explicit verification:

### Compaction Rules (must be tested individually)

```
Rule 1: write → write → write  ⟹  final write only
  Journal: [write /a.txt "v1", write /a.txt "v2", write /a.txt "v3"]
  Compacted: [write /a.txt "v3"]
  Why: Intermediate versions never persisted to server. Only final state matters.

Rule 2: write → delete  ⟹  delete only (if file existed before journal start)
  Journal: [write /a.txt "data", delete /a.txt]
  Compacted: [delete /a.txt]
  Why: Net effect is file is gone. The write was wasted work.

Rule 2b: create → write → delete  ⟹  nothing (if file didn't exist before journal start)
  Journal: [write /new.txt "data", delete /new.txt]
  Compacted: [] (empty — file never existed on server)
  Why: File was created and destroyed locally. Server never needs to know.

Rule 3: rename A→B → rename B→C  ⟹  rename A→C
  Journal: [rename /a.txt → /b.txt, rename /b.txt → /c.txt]
  Compacted: [rename /a.txt → /c.txt]
  Why: Intermediate name was transient. Server sees single rename.

Rule 4: write A → rename A→B  ⟹  delete A + write B
  Journal: [write /a.txt "data", rename /a.txt → /b.txt]
  Compacted: [delete /a.txt, write /b.txt "data"]
  Why: Server needs to know A is gone and B has the content.

Rule 5: mkdir → rmdir  ⟹  nothing (if dir didn't exist before)
  Journal: [mkdir /tmp/work, rmdir /tmp/work]
  Compacted: []
  Why: Transient directory. Server never needs to know.
```

### Replay Idempotency (must be tested)

```
Scenario: Client sends journal, network drops before ack, client retries.
Server receives the same operations twice.

Test:
1. Client sends [write /a.txt "hello"]
2. Server applies, file exists
3. Client sends [write /a.txt "hello"] again (retry)
4. Server applies again — file still contains "hello", no corruption
5. Version counter increments once, not twice

Why: Network unreliability is guaranteed. If replay isn't idempotent,
every dropped ack creates a divergence.
```

### Ordering Under Concurrent Edits

```
Scenario: Client and server both edit during disconnect.

Test:
1. Client writes /a.txt "client version" (offline)
2. Server writes /a.txt "server version" (during disconnect)
3. Client reconnects, pushes journal
4. ConflictResolver fires with both versions
5. Resolution strategy produces deterministic result
6. Both sides converge to same state

Why: This is the entire point of sync. If this case isn't tested,
sync is cosmetic.
```

### Test File

`packages/core/src/sync/journal-compaction.test.ts` (Node — pure logic, no browser needed)

This is a fast, pure-logic test file. No browser APIs, no WASM, no async. It tests the OperationJournal's compaction algorithm directly. Should run in <1s.

### CC Kickoff

```
Read: catalyst-upgrade-spec.md, Phase 13e section
Read: packages/core/src/sync/OperationJournal.ts (the compaction logic)
Read: packages/core/src/sync/ConflictResolver.ts (for concurrent edit test)

Create: packages/core/src/sync/journal-compaction.test.ts

These are pure logic tests — pnpm test (Node), no browser needed.
If any compaction rule fails, fix the OperationJournal before
the sync layer goes anywhere near real users.
```

---

## SUMMARY

| Phase | What | Replaces | Key Library | Impact |
|-------|------|----------|-------------|--------|
| 13a | unenv integration | Fake crypto, missing stream/http/os | `unenv` | Node.js compat: 69% → 86% |
| 13b | Real Hono | 280-line toy router | `hono` + `hono/service-worker` | Full middleware, typed RPC, cors/jwt/zod |
| 13c | Worker isolation | Inline main-thread execution | Web Workers API | True thread isolation, non-blocking UI |
| 13d | Security smoke suite | Zero security tests | None (test-only) | Proves "secure by default" claim |
| 13e | Journal compaction tests | Untested compaction rules | None (test-only) | Prevents silent data corruption on reconnect |

### What We Explicitly Keep

- **CatalystFS** — OPFS/IndexedDB filesystem (better than any library for our use case)
- **WASIBindings.ts** — cleanroom WASI Preview 1 (already talks to CatalystFS, better than library alternatives that have their own in-memory FS)
- **CatalystEngine** — QuickJS-WASM integration (no library replacement exists)
- **PackageManager + NpmResolver** — npm resolution + esm.sh CDN (custom to Catalyst's architecture)
- **SyncClient/SyncServer** — Deno sync protocol (custom to Catalyst)
- **Custom fs/console/process host bindings** — talk to Catalyst internals, can't be replaced

### Estimated Total

```
Phase 13a (unenv):     4-6 hours  (1 CC session)
Phase 13b (Hono):      3-5 hours  (1 CC session)
Phase 13c (Workers):   6-8 hours  (1 CC session)
Total:                13-19 hours (3 CC sessions)
```
