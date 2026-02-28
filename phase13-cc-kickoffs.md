# Phase 13 — CC Kickoff Prompts

> Paste one of these into CC to start each session.
> Order: 13a → 13b → 13c → 13d → 13e
> (13d can run as a baseline BEFORE 13a if you want, then re-run after each phase)

---

## Session 1: Phase 13a — unenv Integration

```
Read catalyst-upgrade-spec.md, Phase 13a section (full section, don't skim).
Read catalyst-roadmap.md and append a one-line note at the bottom:
  "Phase 13: See catalyst-upgrade-spec.md (unenv, real Hono, Worker isolation, security, journal tests)"

Then read these source files to understand current state:
- packages/core/src/engine/host-bindings/index.ts
- packages/core/src/engine/host-bindings/crypto.ts
- packages/core/src/engine/require.ts

Install: pnpm add unenv

Execute Phase 13a per spec. Key points:
1. Create unenv-bridge.ts with UNENV_MODULES registry
2. DELETE crypto.ts (the fake FNV-1a one)
3. Update require.ts: custom → unenv → stubs → relative → node_modules
4. Create PROVIDER_REGISTRY for compat report tagging
5. Augment process.ts with unenv methods (keep custom cwd/env/exit)
6. Litmus test: crypto.createHash('sha256').update('hello').digest('hex')
   MUST equal 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824

Run pnpm test:all after. Commit: "Phase 13a: unenv integration — real crypto, stream, http, os"
```

---

## Session 2: Phase 13b — Real Hono

```
Read catalyst-upgrade-spec.md, Phase 13b section (full section).

Then read these source files:
- packages/core/src/dev/HonoIntegration.ts
- packages/core/src/dev/BuildPipeline.ts
- packages/core/src/net/PreviewSW.ts

Install: pnpm add hono

Execute Phase 13b per spec. Key points:
1. Create scripts/bundle-hono.ts (pre-bundle Hono at Catalyst build time)
2. Create packages/core/src/dev/hono-bundle.ts (static bundle strings)
3. Rewrite HonoIntegration.ts:
   - DELETE wrapForServiceWorker() entirely (the 280-line fake router)
   - Add ensureHono() — writes pre-bundled Hono to CatalystFS
   - Add createSWEntryWrapper() — uses real hono/service-worker adapter
   - Build via esbuild, not string concatenation
4. Update PreviewSW.ts: self.__catalystApiHandler from real Hono app
5. Test: app.use(cors()) must actually set CORS headers

Run pnpm test:all after. Commit: "Phase 13b: real Hono — delete toy router, use official SW adapter"
```

---

## Session 3: Phase 13c — Worker Isolation + StdioBatcher

```
Read catalyst-upgrade-spec.md, Phase 13c section (full section — it's the longest).

Then read these source files:
- packages/core/src/proc/ProcessManager.ts
- packages/core/src/proc/CatalystProcess.ts
- packages/core/src/proc/worker-template.ts

Execute Phase 13c per spec. Key points:
1. Create WorkerPool.ts — Blob URL Workers, pool limits, fallback detection
2. Create WorkerBridge.ts — handles BOTH 'stdout-batch' (batched from StdioBatcher)
   AND 'stdout' (single, fallback) message types
3. Upgrade worker-template.ts:
   - StdioBatcher: accumulate chunks, flush on 4KB or 16ms or exit
   - Console wires through pushStdout/pushStderr, NOT direct postMessage
   - flushStdio() called before EVERY exit message (no lost output)
   - Config accepts stdioBatchBytes/stdioBatchMs from init message
4. Rewrite ProcessManager.startProcess():
   - Try Worker first (WorkerPool.spawn), fall back to inline CatalystEngine
   - kill(SIGKILL) = Worker.terminate(), kill(SIGTERM) = MessagePort signal
5. Add _pushStdout, _pushStderr, _setState to CatalystProcess.ts
6. Test: 200 console.log()s must produce <10 MessagePort messages

Run pnpm test:all after. Commit: "Phase 13c: Worker isolation + StdioBatcher — true thread separation"
```

---

## Session 4: Phase 13d — Security Smoke Suite

```
Read catalyst-upgrade-spec.md, Phase 13d section.

Create packages/core/src/security/security.browser.test.ts per spec.

Three test groups:

1. CatalystFS path traversal:
   - ../../etc/passwd → TRAVERSAL error (not "file not found")
   - null byte injection → throws
   - ../../../escape via mkdir, rename → throws

2. CatalystEngine sandbox escape:
   - Function('return this')() → QuickJS global, NOT window
   - typeof window → 'undefined'
   - while(true){} → terminated by timeout
   - memory bomb → terminated by memory limit
   - require('child_process') → stub error

3. CatalystNet domain filtering:
   - fetch to blocked domain → rejected
   - fetch to allowed domain (esm.sh, npmjs.org) → allowed
   - redirect to blocked domain → caught
   - file:// scheme → rejected

If ANY test fails: that's a pre-existing vulnerability. Fix it before proceeding.

Run pnpm test:all after. Commit: "Phase 13d: security smoke suite — prove secure-by-default claim"
```

---

## Session 5: Phase 13e — Journal Compaction Tests

```
Read catalyst-upgrade-spec.md, Phase 13e section.
Read packages/core/src/sync/OperationJournal.ts
Read packages/core/src/sync/ConflictResolver.ts

Create packages/core/src/sync/journal-compaction.test.ts per spec.

Test the five compaction rules:
1. write → write → write  ⟹  final write only
2. write → delete  ⟹  delete only (or nothing if file was created in journal)
3. rename A→B → rename B→C  ⟹  rename A→C
4. write A → rename A→B  ⟹  delete A + write B
5. mkdir → rmdir  ⟹  nothing (if dir created in journal)

Plus:
- Replay idempotency: same journal sent twice, no duplication
- Concurrent edit: client + server edit same file during disconnect → ConflictResolver fires

These are pure logic tests — pnpm test (Node), no browser needed. Should run in <1s.

Run pnpm test:all after. Commit: "Phase 13e: journal compaction correctness — prevent silent sync corruption"
```

---

## Notes

- Sessions 4 and 5 are lightweight (1-2 hours each). Can combine into one CC session if momentum is good.
- If 13d security tests reveal failures, fix them as part of that session before committing.
- After all five sessions, run pnpm test:all one final time and verify the node-compat report shows the provider-tagged format with >80% coverage.
