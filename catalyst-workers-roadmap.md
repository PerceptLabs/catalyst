# Catalyst — Combined Roadmap: Workers + Monorepo + Reaction

> **Companion docs:**  
> - `catalyst-workers-plan.md` (Phase 14 architecture, bindings, Nitro, adapters)  
> - `catalyst-monorepo-plan.md` (engine abstraction, IEngine/IModuleLoader, terminal, Reaction features)  
> - `phase14-cc-kickoffs.md` (Phase 14 session prompts)  
>
> **CC Kickoffs:** Phase 14 prompts in `phase14-cc-kickoffs.md`. Phases 15+ kickoffs to be written per-phase.  
> **Starting point:** Phase 13 complete — 648 tests passing, unenv integrated, Hono in SW, Worker isolation.

---

# PART 1: WORKERS COMPATIBILITY (PHASE 14)

> 6 CC sessions. Bindings emulation, runtime shell, Nitro preset, framework adapters.

---

## PHASE MAP

```
Phase 14a-1: CatalystKV + CatalystR2                  (1 session, 4-6 hrs)
Phase 14a-2: CatalystD1 (wa-sqlite)                   (1 session, 4-6 hrs)
Phase 14b:   CatalystWorkers Runtime Shell             (1 session, 4-6 hrs)
Phase 14c:   Nitro Preset + Unstorage Driver           (1 session, 3-5 hrs)
Phase 14d:   Framework Adapters (Astro + SvelteKit)    (1 session, 4-6 hrs)
Phase 14e:   Integration Tests + Example Apps          (1 session, 4-6 hrs)
```

**Total: 6 CC sessions, ~24-34 hrs**

---

## DEPENDENCY GRAPH

```
Phase 14a-1 (KV + R2)
    |
    +-- Phase 14a-2 (D1)
            |
            v
      Phase 14b (CatalystWorkers runtime shell)
            |
            +--------> Phase 14c (Nitro preset)
            |               |
            +--------> Phase 14d (Framework adapters)
                            |
                            v
                      Phase 14e (Integration + examples)
```

- 14a-1 must come first — KV and R2 are the simplest bindings, establish patterns
- 14a-2 depends on 14a-1 — follows same patterns, adds wa-sqlite complexity
- 14b depends on all of 14a — runtime shell constructs bindings
- 14c and 14d are independent of each other, both depend on 14b
- 14e depends on everything

---

## PHASE 14a-1: CatalystKV + CatalystR2

### Scope

Pure IndexedDB/OPFS wrappers with no external WASM dependencies. Establish the bindings package structure.

### Files to Create

```
packages/catalyst-workers/
├── src/
│   ├── bindings/
│   │   ├── kv.ts              # CatalystKV class
│   │   ├── kv.browser.test.ts
│   │   ├── r2.ts              # CatalystR2 class
│   │   ├── r2.browser.test.ts
│   │   └── types.ts           # Shared types (D1Result, R2Object, etc.)
│   └── index.ts               # Package entry (re-exports)
├── package.json
└── tsconfig.json
```

### Verification Gates

- [ ] CatalystKV: get/put/delete basic cycle
- [ ] CatalystKV: get with type options (text, json, arrayBuffer, stream)
- [ ] CatalystKV: put with expiration (TTL and absolute)
- [ ] CatalystKV: get expired key returns null + auto-deletes
- [ ] CatalystKV: list with prefix filtering
- [ ] CatalystKV: list with cursor pagination
- [ ] CatalystKV: getWithMetadata returns value + metadata
- [ ] CatalystKV: large values (1MB+)
- [ ] CatalystR2: put/get text content
- [ ] CatalystR2: put/get binary content (ArrayBuffer)
- [ ] CatalystR2: put/get stream content (ReadableStream)
- [ ] CatalystR2: metadata sidecar round-trips (httpMetadata + customMetadata)
- [ ] CatalystR2: list with prefix and delimiter
- [ ] CatalystR2: list with pagination
- [ ] CatalystR2: head returns metadata without body
- [ ] CatalystR2: nested key paths (foo/bar/baz.txt)
- [ ] All tests pass in browser runner

### Test Count: ~36 new tests → ~684 total

### Commit

```
Phase 14a-1: CatalystKV + CatalystR2 — KV and R2 bindings emulation
```

---

## PHASE 14a-2: CatalystD1

### Scope

wa-sqlite integration with OPFS persistence. Separate lazy-loadable package due to 940KB WASM dependency.

### Files to Create

```
packages/catalyst-workers-d1/
├── src/
│   ├── d1.ts                          # CatalystD1 + PreparedStatement
│   ├── d1.browser.test.ts             # SQL operation tests
│   ├── d1-persistence.browser.test.ts # Write → close → reopen tests
│   └── index.ts
├── package.json
└── tsconfig.json
```

### Files to Modify

```
packages/catalyst-workers/src/bindings/types.ts  — add D1 type exports
packages/catalyst-workers/src/index.ts           — add lazy D1 import path
```

### Dependencies

- `wa-sqlite` — MIT licensed, WASM SQLite with JSPI + OPFS support

### Verification Gates

- [ ] wa-sqlite JSPI build loads (no COOP/COEP headers needed)
- [ ] CREATE TABLE / INSERT / SELECT / UPDATE / DELETE cycle
- [ ] prepare().bind().first() returns single row or null
- [ ] prepare().bind().all() returns { results: [...], success, meta }
- [ ] prepare().bind().raw() returns array of arrays
- [ ] prepare().bind().run() for mutations (returns changes count)
- [ ] batch() executes all statements atomically
- [ ] batch() rolls back ALL on error (verify no partial writes)
- [ ] exec() handles DDL statements
- [ ] SQL injection safety (bound parameters)
- [ ] Multiple tables with foreign keys
- [ ] NULL, integer, float, text, blob column types
- [ ] Empty result sets return { results: [] }
- [ ] Large result sets (1000+ rows)
- [ ] dump() exports valid ArrayBuffer
- [ ] Persistence: write → destroy → recreate → read → data intact
- [ ] Dynamic import from catalyst-workers works (lazy loading)
- [ ] Falls back to IDBBatchAtomicVFS if OPFS SAH unavailable

### Test Count: ~28 new tests → ~712 total

### Commit

```
Phase 14a-2: CatalystD1 — SQLite database via wa-sqlite + OPFS
```

---

## PHASE 14b: CatalystWorkers Runtime Shell

### Scope

The orchestrator that loads Worker bundles, constructs env with bindings, routes fetch events, and parses wrangler.toml.

### Files to Create

```
packages/catalyst-workers/src/
├── runtime.ts                  # CatalystWorkers class
├── context.ts                  # CatalystExecutionContext
├── globals.ts                  # Workers compat globals injection
├── wrangler-config.ts          # wrangler.toml/jsonc parser
├── runtime.browser.test.ts
└── wrangler-config.test.ts
```

### Test Fixtures

```
packages/catalyst-workers/test/fixtures/
├── minimal-worker.js           # Hand-written: export default { fetch(req, env) {...} }
├── kv-worker.js                # Uses env.MY_KV
├── d1-worker.js                # Uses env.MY_DB
├── multi-route-worker.js       # Multiple route patterns
└── sample-wrangler.toml        # Binding config for parsing tests
```

### Verification Gates

- [ ] Load module-format Worker, verify fetch routing returns response
- [ ] env contains KV binding, Worker reads from it
- [ ] env contains D1 binding, Worker queries it
- [ ] env contains R2 binding, Worker reads from it
- [ ] env contains secret/var bindings as plain strings
- [ ] ExecutionContext.waitUntil extends SW lifetime
- [ ] ExecutionContext.passThroughOnException sets fallthrough flag
- [ ] Route pattern: exact match (/api/health)
- [ ] Route pattern: prefix match (/api/*)
- [ ] Route pattern: wildcard match (/**)
- [ ] Non-matching requests fall through (not intercepted)
- [ ] Worker error → 500 response (not crash)
- [ ] Parse wrangler.toml → WorkerConfig (kv_namespaces, d1_databases, r2_buckets, vars)
- [ ] Parse wrangler.jsonc → WorkerConfig
- [ ] destroy() cleans up all bindings and resources

### Test Count: ~15 new tests → ~727 total

### Commit

```
Phase 14b: CatalystWorkers — runtime shell loads and executes Worker bundles
```

---

## PHASE 14c: Nitro Preset + Unstorage Driver

### Scope

Nitro integration that unlocks Nuxt, SolidStart, Analog, standalone H3.

### Files to Create

```
packages/nitro-preset-catalyst/
├── src/
│   ├── preset.ts           # NitroPreset config
│   ├── entry.ts            # Runtime entry (SW fetch handler)
│   └── storage-driver.ts   # Unstorage CatalystKV driver
├── package.json
├── tsconfig.json
└── README.md
```

### Test Fixtures

```
packages/catalyst-workers/test/fixtures/
├── nitro-basic/
│   ├── nitro.config.ts
│   ├── routes/
│   │   ├── index.ts           # GET / → HTML
│   │   └── api/hello.ts       # GET /api/hello → JSON
│   ├── .output/               # Pre-built (committed to repo)
│   └── package.json
└── build-fixtures.sh          # Script to rebuild fixtures
```

### Test Approach

Build the fixture externally (Node.js + Nitro CLI). Commit the `.output/` directory. Browser tests load the pre-built bundle into CatalystWorkers.

### Verification Gates

- [ ] Nitro build with preset: 'catalyst' produces valid ES module
- [ ] Output has `export default { fetch }` entry
- [ ] Bundle loads in CatalystWorkers
- [ ] GET / returns Nitro-rendered HTML
- [ ] GET /api/hello returns JSON { hello: 'world' }
- [ ] useStorage('data').setItem() writes via CatalystKV driver
- [ ] useStorage('data').getItem() reads via CatalystKV driver
- [ ] event.context.catalyst.env accessible in route handlers
- [ ] Static + dynamic routes coexist

### Test Count: ~8 new tests → ~735 total

### Commit

```
Phase 14c: nitro-preset-catalyst — Nuxt/SolidStart/Analog run in browser
```

---

## PHASE 14d: Framework Adapters — Astro + SvelteKit

### Scope

Individual adapters for non-Nitro frameworks. Same runtime (CatalystWorkers), different build integration.

### Files to Create

```
packages/catalyst-astro/
├── src/
│   ├── index.ts           # Astro integration
│   └── server.ts          # Server entry (fetch handler wrapping Astro App)
├── package.json
└── README.md

packages/catalyst-sveltekit/
├── src/
│   └── index.ts           # SvelteKit adapter
├── package.json
└── README.md
```

### Test Fixtures

```
packages/catalyst-workers/test/fixtures/
├── astro-basic/
│   ├── astro.config.mjs
│   ├── src/pages/index.astro
│   ├── src/pages/api/hello.ts
│   └── .output/              # Pre-built with @aspect/catalyst-astro
└── sveltekit-basic/
    ├── svelte.config.js
    ├── src/routes/+page.svelte
    ├── src/routes/api/hello/+server.ts
    └── .output/              # Pre-built with @aspect/catalyst-sveltekit
```

### Verification Gates

- [ ] Astro adapter builds without errors
- [ ] Astro SSR bundle loads in CatalystWorkers
- [ ] Astro page renders HTML correctly
- [ ] Astro API route returns JSON
- [ ] Astro `Astro.locals.catalyst.env` provides bindings
- [ ] SvelteKit adapter builds without errors
- [ ] SvelteKit bundle loads in CatalystWorkers
- [ ] SvelteKit page renders correctly
- [ ] SvelteKit API route returns JSON
- [ ] SvelteKit `platform.catalyst.env` provides bindings
- [ ] Both frameworks' bundles coexist in separate CatalystWorkers instances

### Test Count: ~10 new tests → ~745 total

### Commit

```
Phase 14d: Astro + SvelteKit adapters — framework bundles run in browser
```

---

## PHASE 14e: Integration Tests + Example Apps

### Scope

End-to-end validation. A real Nuxt app demonstrating D1 + KV + R2 running entirely in the browser. Raw Workers compat test.

### Files to Create

```
packages/catalyst-workers/test/
├── integration/
│   ├── full-stack-nuxt.browser.test.ts    # Nuxt CRUD app (D1 + KV + R2)
│   ├── full-stack-astro.browser.test.ts   # Astro SSR app (D1)
│   └── workers-compat.browser.test.ts     # Raw Workers bundle (no framework)
└── fixtures/
    ├── nuxt-fullstack/
    │   ├── nuxt.config.ts
    │   ├── server/api/
    │   │   ├── todos.get.ts       # GET /api/todos → D1 query
    │   │   ├── todos.post.ts      # POST /api/todos → D1 insert
    │   │   └── upload.post.ts     # POST /api/upload → R2 put
    │   ├── wrangler.toml          # Defines KV + D1 + R2 bindings
    │   └── .output/               # Pre-built
    └── raw-worker/
        ├── index.js               # Pure Workers code, no framework
        └── wrangler.toml
```

### Verification Gates

- [ ] Nuxt app: create todo (POST → D1 insert)
- [ ] Nuxt app: list todos (GET → D1 select)
- [ ] Nuxt app: update todo (PUT → D1 update)
- [ ] Nuxt app: delete todo (DELETE → D1 delete)
- [ ] Nuxt app: session persistence (KV set → refresh → KV get)
- [ ] Nuxt app: file upload (POST → R2 put → GET → R2 get)
- [ ] wrangler.toml auto-configures all bindings
- [ ] Raw Worker bundle (no framework) processes requests correctly
- [ ] Raw Worker uses KV + D1 from env
- [ ] All data persists across CatalystWorkers destroy/recreate (OPFS)
- [ ] Full app works offline after initial load

### Test Count: ~11 new tests → ~756 total

### Commits

```
Phase 14e: Integration tests + full-stack Nuxt example app
```

---

## SUMMARY TABLE

| Phase | Session | Scope | New Tests | Cumulative |
|---|---|---|---|---|
| 14a-1 | 1 | CatalystKV + CatalystR2 | ~36 | ~684 |
| 14a-2 | 2 | CatalystD1 (wa-sqlite) | ~28 | ~712 |
| 14b | 3 | CatalystWorkers runtime | ~15 | ~727 |
| 14c | 4 | Nitro preset + unstorage | ~8 | ~735 |
| 14d | 5 | Astro + SvelteKit adapters | ~10 | ~745 |
| 14e | 6 | Integration + examples | ~11 | ~756 |

---

## MILESTONES

**M9 "Platform bindings"** (Phase 14a): KV, D1, R2 emulation working. Can store/query/upload from browser.  
**M10 "Workers runtime"** (Phase 14b): Any Cloudflare Workers bundle runs unmodified. wrangler.toml auto-configures.  
**M11 "Framework multiplier"** (Phase 14c): Nuxt/SolidStart/Analog in the browser via one Nitro preset.  
**M12 "Full framework support"** (Phase 14d): Astro + SvelteKit adapters. Every major framework covered.  
**M13 "Proof of platform"** (Phase 14e): Full-stack Nuxt todo app with D1+KV+R2, entirely in browser.

---
---

# PART 2: MONOREPO RESTRUCTURE + REACTION

> **Companion doc:** `catalyst-monorepo-plan.md` (architecture, IEngine/IModuleLoader interfaces, terminal design, Reaction features)  
> **Starting point:** Phase 14 complete — Workers mode fully operational, ~756 tests.  
> **Goal:** Restructure to pluggable engine monorepo, then build Reaction (Deno-in-WASM, full npm, terminal, Vite).

---

## DEPENDENCY GRAPH (PHASES 15-21)

```
Phase 15 (Extract interfaces)
    |
    v
Phase 16 (Monorepo restructure)
    |
    +──> Phase 17 (Lockfile enforcement)
    |
    +──> Phase 18 (Workers compliance gate)
    |
    v
Phase 19 (Deno-WASM engine)     ← THE BIG ONE
    |
    +──> Phase 20 (Terminal + Shell)
    |
    +──> Phase 21 (Vite + Framework dev mode)
    |
    v
Phase 22 (Reaction stabilization)
```

- 15 must come first — defines the contract
- 16 depends on 15 — reorganizes around the contract
- 17 and 18 are independent, both depend on 16
- 19 depends on 16 — the Deno engine implements the extracted interface
- 20 and 21 depend on 19 — they need Deno running
- 22 depends on everything

---

## PHASE 15: EXTRACT IEngine + IModuleLoader INTERFACES

### Scope

Pure refactor. Define the abstraction boundary. No behavior change. All existing tests pass.

### What Happens

1. Create `packages/shared/engine-interface/` with `IEngine` and `IModuleLoader` contracts
2. Refactor current QuickJS engine to implement `IEngine`
3. Extract current require() chain into `NodeCompatLoader` implementing `IModuleLoader`
4. Refactor `CatalystProc` to accept `engineFactory` + `moduleLoaderFactory` instead of hardcoded QuickJS
5. Wire everything through `createRuntime()` factory function

### Critical Rule

**No behavior changes.** This is purely mechanical extraction. If any test breaks, the refactor is wrong. The goal is to introduce the seam, not to use it.

### Verification Gates

- [ ] `IEngine` interface defined with eval, evalFile, createInstance, destroy, events
- [ ] `IModuleLoader` interface defined with resolve, availableBuiltins, capabilities
- [ ] QuickJS engine implements `IEngine` — passes all existing engine tests
- [ ] `NodeCompatLoader` implements `IModuleLoader` — passes all existing module resolution tests
- [ ] `CatalystProc` uses `engineFactory.createInstance()` — passes all existing process tests
- [ ] `createRuntime()` wires engine + loader + fs + net + proc + pkg + dev
- [ ] Distribution package `@aspect/catalyst` re-exports everything — zero API change for consumers
- [ ] Full test suite passes unchanged (~756 tests)

### Estimated Effort: 1 CC session, 4-6 hrs

### Commit

```
Phase 15: Extract IEngine + IModuleLoader interfaces — engine-agnostic seam
```

---

## PHASE 16: MONOREPO RESTRUCTURE

### Scope

Directory reorganization. Move packages into `shared/`, `engines/`, `workers/`, `adapters/`, `distributions/` structure. Update all import paths.

### What Happens

```
BEFORE (flat):                    AFTER (structured):
packages/                         packages/
  catalyst-engine/     →            shared/engine-interface/
  catalyst-fs/         →            shared/fs/
  catalyst-net/        →            shared/net/
  catalyst-proc/       →            shared/proc/
  catalyst-pkg/        →            shared/pkg/
  catalyst-dev/        →            shared/dev/
  catalyst-workers/    →            workers/catalyst-workers/
  catalyst-workers-d1/ →            workers/catalyst-workers-d1/
                                    engines/quickjs/
                                    distributions/catalyst/
```

Add `pnpm-workspace.yaml` and `turbo.json` for monorepo tooling.

### Critical Rule

**Still no behavior change.** Just directory moves + import path updates. Same packages, same code, new addresses.

### Verification Gates

- [ ] All packages moved to new directory structure
- [ ] `pnpm-workspace.yaml` lists all package paths
- [ ] `turbo.json` configured for build/test pipeline
- [ ] All internal imports updated to new paths
- [ ] `@aspect/catalyst` distribution package re-exports correctly
- [ ] Full test suite passes unchanged (~756 tests)
- [ ] `pnpm build` succeeds across all packages
- [ ] `pnpm test` runs all tests from monorepo root

### Estimated Effort: 1 CC session, 3-5 hrs

### Commit

```
Phase 16: Monorepo restructure — packages reorganized into shared/engines/workers/distributions
```

---

## PHASE 17: CATALYSTPKG LOCKFILE ENFORCEMENT

### Scope

Add determinism gates to package resolution. Dev mode allows live fetch. Locked mode requires lockfile + integrity verification.

### What Happens

1. `catalyst-lock.json` schema with version pins and SHA-256 integrity hashes
2. Dev mode: resolve from esm.sh, cache to OPFS, auto-generate/update lockfile
3. Locked mode: lockfile required, integrity verification on every cache load, unknown specifiers = hard error
4. `CatalystPkg.create({ mode: 'dev' | 'locked' })` — distribution package sets the mode

### Verification Gates

- [ ] Dev mode: package resolves from esm.sh on first request
- [ ] Dev mode: subsequent requests served from OPFS cache
- [ ] Dev mode: lockfile auto-generated with version + integrity hash
- [ ] Locked mode: missing lockfile → clear error message
- [ ] Locked mode: package in lockfile resolves from cache or esm.sh with pinned version
- [ ] Locked mode: package NOT in lockfile → hard error
- [ ] Locked mode: integrity hash mismatch → hard error
- [ ] Lockfile survives round-trip: generate → read → resolve → all hashes match
- [ ] Existing package resolution tests still pass (dev mode is backward-compatible)

### Estimated Effort: 1 CC session, 3-4 hrs

### Commit

```
Phase 17: CatalystPkg lockfile enforcement — deterministic package resolution
```

---

## PHASE 18: WORKERS COMPLIANCE GATE

### Scope

Test suite validating that the Worker execution context (CatalystWorkers loading bundles in Service Worker) matches Cloudflare Workers behavior.

### What Happens

1. Create `packages/shared/compliance/` with test suite
2. Test runtime APIs present (Request, Response, fetch, crypto.subtle, caches, streams)
3. Test execution context (waitUntil, passThroughOnException, module format loading)
4. Test bindings API shape (KV, D1, R2 match Cloudflare's published TypeScript types)
5. Test forbidden APIs absent in Worker scope (fs, child_process, net NOT available unless nodejs_compat)
6. Test error isolation (Worker crash → 500 response, not Service Worker death)

### Verification Gates

- [ ] Runtime API tests: all Web APIs present and functional in Worker scope
- [ ] Execution context tests: waitUntil extends lifetime, passThroughOnException works
- [ ] KV binding tests: get/put/delete/list/getWithMetadata match Cloudflare types
- [ ] D1 binding tests: prepare/exec/batch/dump match Cloudflare types
- [ ] R2 binding tests: get/put/delete/list/head match Cloudflare types
- [ ] Forbidden API tests: require('fs') etc. fail or are absent in Worker scope
- [ ] Error isolation tests: Worker throw → 500, Service Worker continues
- [ ] Compliance suite runs in CI as part of `pnpm test`
- [ ] Both Catalyst and future Reaction pass the same compliance suite

### Estimated Effort: 1 CC session, 3-5 hrs

### Commit

```
Phase 18: Workers compliance gate — conformance test suite for Worker execution context
```

---

## PHASE 19: DENO-WASM ENGINE

### Scope

THE BIG ONE. Compile Deno to WASM with JSPI. Implement `IEngine` and `DenoNativeLoader`. This is the Reaction engine.

### What Happens

This phase is multiple sessions and may need to be broken into sub-phases during execution. The major work items:

1. **V8 jitless → WASM:** Compile V8's interpreter (no JIT) to WASM via Emscripten. V8 has `--jitless` flag for this. Output: V8 WASM module (~10-15MB).

2. **Deno Rust runtime → WASM:** Compile Deno's Rust runtime layer (ops system, module loader, Node compat) to WASM via wasm-bindgen. The ops system is the key — it's how Deno exposes host functions to JavaScript.

3. **Ops bridge:** Replace Deno ops that call OS APIs with browser API calls:
   - `op_read_file` etc. → CatalystFS (OPFS)
   - `op_fetch` → CatalystNet (fetch proxy)
   - `op_spawn` → CatalystProc (Web Worker)
   - `op_crypto_*` → Web Crypto API (native)
   - `op_net_listen` → CatalystNet SW server

4. **JSPI sync bridge:** Where Deno's Rust code expects sync returns from ops, JSPI suspends the WASM execution while the browser resolves the async operation. Same pattern as QuickJS Phase 4, but at the Deno ops level.

5. **Tokio replacement:** Deno's async runtime (Tokio) assumes real OS threads and I/O. Replace the I/O reactor with browser API calls, keep the task scheduler. The Rust-WASM community has precedent here.

6. **DenoNativeLoader:** Implements `IModuleLoader` using Deno's built-in `npm:` and `node:` resolution. Falls back to CatalystPkg cache for OPFS storage.

7. **`engines/deno/` package:** Full IEngine implementation, ops bridge, loader, worker entry point.

8. **`distributions/reaction/` package:** Wires DenoEngine + DenoNativeLoader + all shared packages.

### Verification Gates

- [ ] V8 jitless WASM module loads in browser (no COOP/COEP required)
- [ ] Deno runtime WASM module loads (JSPI for sync bridge)
- [ ] Basic `eval('1 + 1')` returns 2 via Deno-WASM
- [ ] `evalFile('/project/index.js')` reads from CatalystFS via ops bridge
- [ ] `require('fs').readFileSync('/project/file.txt')` works via Deno's node:fs → ops → CatalystFS
- [ ] `import express from 'npm:express'` resolves and loads via Deno's native npm resolver
- [ ] `createInstance()` spawns new Web Worker with new Deno-WASM instance
- [ ] Deno engine passes all IEngine contract tests
- [ ] DenoNativeLoader passes all IModuleLoader contract tests
- [ ] `@aspect/reaction` distribution package creates runtime successfully
- [ ] Workers compliance gate passes with Reaction (same CatalystWorkers shell)
- [ ] Boot time measured and documented (target: <3s cold, <500ms warm/cached)
- [ ] WASM binary size measured (target: <30MB compressed, cached after first load)

### Estimated Effort: 3-6 CC sessions, multiple weeks of iteration

### Commits (incremental)

```
Phase 19a: V8 jitless WASM compilation — V8 interpreter runs in browser
Phase 19b: Deno ops bridge — OS operations routed to browser APIs
Phase 19c: DenoEngine implements IEngine — eval, evalFile, createInstance working
Phase 19d: DenoNativeLoader — npm: and node: resolution via Deno internals
Phase 19e: Reaction distribution — @aspect/reaction package ships
```

---

## PHASE 20: TERMINAL + SHELL

### Scope

xterm.js integration with PTY adapter and interactive shell. Reaction-only feature — not used in Workers mode.

### What Happens

1. **CatalystTerminal:** xterm.js wrapper with WebGL renderer, fit addon, web-links addon. ~500KB, lazy-loaded only when terminal panel opens.

2. **PTY Adapter:** Bridges CatalystProc stdio streams with xterm.js input/output. Handles Ctrl+C (SIGINT), Ctrl+Z (SIGTSTP), Ctrl+D (EOF), window resize (SIGWINCH).

3. **CatalystShell:** Interactive shell running inside Deno. Command parsing, environment variables, command history (persisted to OPFS), tab completion (filenames from CatalystFS), pipes and redirects, job control (background `&`, `fg`, `bg`), prompt customization.

4. **Shell builtins:** `cd`, `export`, `history`, `pwd`, `echo`, `exit`, `clear`, `env`, `which`, `alias`.

### Verification Gates

- [ ] xterm.js renders in container with WebGL addon
- [ ] Typing in terminal sends keystrokes to shell process stdin
- [ ] Shell process stdout renders in terminal with correct ANSI formatting
- [ ] Ctrl+C sends SIGINT to foreground process
- [ ] Ctrl+D sends EOF, shell exits gracefully
- [ ] Window resize propagates to process (SIGWINCH)
- [ ] `cd /project && pwd` works (directory navigation)
- [ ] `export FOO=bar && echo $FOO` works (environment variables)
- [ ] `node -e "console.log('hello')"` runs and outputs correctly
- [ ] `npm install express` resolves and installs via Deno's npm resolver
- [ ] Command history persists across shell sessions (OPFS)
- [ ] Tab completion suggests filenames from CatalystFS
- [ ] `cat file.txt | grep pattern` works (pipes)
- [ ] `node server.js &` backgrounds process, shell returns to prompt
- [ ] Terminal not loaded in Catalyst Workers mode (lazy, Reaction only)

### Estimated Effort: 2 CC sessions, 6-10 hrs

### Commits

```
Phase 20a: CatalystTerminal — xterm.js + PTY adapter + bidirectional stdio
Phase 20b: CatalystShell — interactive shell with builtins, history, tab completion
```

---

## PHASE 21: VITE + FRAMEWORK DEV MODE

### Scope

Run actual Vite dev server inside Deno-WASM. This is the unlock for `nuxt dev`, `astro dev`, `svelte-kit dev` running live in the browser with hot module replacement.

### What Happens

1. **Vite in Deno:** Vite is JavaScript. It runs inside V8 jitless via Deno. Vite uses Rollup (JavaScript), esbuild for transforms (esbuild-wasm from CatalystDev). Vite's dev server needs `http.createServer` (Deno's `node:http` provides it), `fs.watch` (Deno's `node:fs` + CatalystFS FileSystemObserver), WebSocket (Deno native + CatalystNet).

2. **Dev server → CatalystNet:** Vite's dev server listens on a port. CatalystNet's Service Worker intercepts requests to that port and routes them through. The preview iframe loads from the SW-served URL.

3. **HMR pipeline:** File edit in IDE → CatalystFS write → FileSystemObserver fires → Vite HMR detects change → WebSocket pushes update → preview iframe hot-reloads. Same flow as local development, same Vite config, zero changes to the user's project.

4. **Framework dev commands:** `npm run dev` in the terminal → shell dispatches to Deno → Deno runs Vite → Vite runs framework dev server. Full edit-build-preview cycle without leaving the browser.

### Verification Gates

- [ ] `npx vite` starts dev server inside Deno-WASM
- [ ] Vite dev server serves index.html through CatalystNet SW
- [ ] Preview iframe loads and renders the Vite-served page
- [ ] File edit triggers HMR update in preview iframe
- [ ] `vite.config.ts` is read and applied (plugins, aliases, etc.)
- [ ] `nuxt dev` starts Nuxt development server (end-to-end)
- [ ] `astro dev` starts Astro development server (end-to-end)
- [ ] Nuxt/Astro page edit → HMR update in preview (hot reload working)
- [ ] `npm run build` produces production output to CatalystFS
- [ ] Error overlay displays Vite build errors in preview iframe

### Estimated Effort: 2-3 CC sessions, 8-15 hrs

### Commits

```
Phase 21a: Vite-in-Deno — Vite dev server runs inside browser WASM runtime
Phase 21b: Framework dev mode — nuxt dev / astro dev live in browser with HMR
```

---

## PHASE 22: REACTION STABILIZATION

### Scope

Full test suite validation across both engines. Performance benchmarking. Gap identification. Documentation.

### What Happens

1. Run ALL existing tests against Reaction (Deno engine) — identify failures
2. Run Workers compliance gate against Reaction — verify Worker execution context unchanged
3. Performance benchmarks: boot time, eval speed, npm install time, HMR latency
4. Fix Deno-specific edge cases surfaced by test suite
5. Safari fallback testing (Asyncify if JSPI unavailable)
6. Document "When to use which" with measured data, not estimates
7. Bundle size optimization (tree-shaking, compression, Workbox caching strategy)

### Verification Gates

- [ ] All existing tests pass on both QuickJS and Deno engines
- [ ] Workers compliance gate passes on both engines
- [ ] Boot time measured: QuickJS <200ms, Deno <3s cold / <500ms warm
- [ ] npm install benchmark: time to install express (Deno native vs esm.sh)
- [ ] HMR latency benchmark: file edit → preview update <500ms
- [ ] Safari tested with Asyncify fallback (if JSPI unavailable)
- [ ] WASM binary cached via Workbox — second load instant
- [ ] Documentation: mode comparison table with real measurements
- [ ] CI runs test suite against both engines on every PR

### Estimated Effort: 2 CC sessions, 6-10 hrs

### Commits

```
Phase 22a: Dual-engine test validation — all tests pass on QuickJS and Deno
Phase 22b: Benchmarks + Safari fallback + caching + documentation
```

---

## COMBINED SUMMARY TABLE

| Phase | Sessions | Scope | New Tests | Cumulative |
|---|---|---|---|---|
| **Phase 14 — Workers Compatibility** | | | | |
| 14a-1 | 1 | CatalystKV + CatalystR2 | ~36 | ~684 |
| 14a-2 | 1 | CatalystD1 (wa-sqlite) | ~28 | ~712 |
| 14b | 1 | CatalystWorkers runtime | ~15 | ~727 |
| 14c | 1 | Nitro preset + unstorage | ~8 | ~735 |
| 14d | 1 | Astro + SvelteKit adapters | ~10 | ~745 |
| 14e | 1 | Integration + examples | ~11 | ~756 |
| **Phase 15-18 — Monorepo + Gates** | | | | |
| 15 | 1 | Extract IEngine + IModuleLoader | 0 (refactor) | ~756 |
| 16 | 1 | Monorepo restructure | 0 (refactor) | ~756 |
| 17 | 1 | Lockfile enforcement | ~12 | ~768 |
| 18 | 1 | Workers compliance gate | ~30 | ~798 |
| **Phase 19-22 — Reaction** | | | | |
| 19 | 3-6 | Deno-WASM engine | ~40 | ~838 |
| 20 | 2 | Terminal + Shell | ~20 | ~858 |
| 21 | 2-3 | Vite + Framework dev mode | ~15 | ~873 |
| 22 | 2 | Stabilization + benchmarks | ~10 | ~883 |

**Total: ~18-24 CC sessions**

---

## COMBINED MILESTONES

### Workers Mode (Phase 14)
**M9 "Platform bindings":** KV, D1, R2 emulation working.  
**M10 "Workers runtime":** Any Workers bundle runs unmodified.  
**M11 "Framework multiplier":** Nuxt/SolidStart/Analog via one Nitro preset.  
**M12 "Full framework support":** Astro + SvelteKit adapters.  
**M13 "Proof of platform":** Full-stack Nuxt todo app entirely in browser.

### Monorepo (Phases 15-18)
**M14 "Pluggable engine":** IEngine + IModuleLoader interfaces extracted. Engine is a configuration choice.  
**M15 "Monorepo":** Structured packages. pnpm workspace. Turbo build pipeline.  
**M16 "Deterministic packages":** Lockfile-gated resolution with integrity verification.  
**M17 "Workers certified":** Compliance test suite validates Cloudflare Workers conformance.

### Reaction (Phases 19-22)
**M18 "Deno in the browser":** V8 jitless + Deno Rust runtime compiled to WASM. 100% Node compat.  
**M19 "Real terminal":** xterm.js with interactive shell. Users type `npm run dev`.  
**M20 "Full IDE":** Vite dev server runs inside browser. `nuxt dev` / `astro dev` with live HMR.  
**M21 "Ship it":** Both engines tested, benchmarked, documented. Safari fallback. WASM caching.
