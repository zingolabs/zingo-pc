# The neon boundary, mapped against ADR 0024

Surveyed 2026-07-28 as phase-3 pre-work for ADR 0024 ("Consumers
converge on a zingolib-owned mixnet surface", recorded in the zingolib
repo at docs/adr/0024). That ADR sequences zingo-pc last. This map
records where its typed contract will land in this codebase, so the
phase-3 implementer starts from facts instead of a fresh audit.

## The call path

Every wallet call crosses three boundaries. The renderer imports
`native` from `src/electronBridge.ts`, which is the preload's
`window.electronAPI.native`. The preload (`public/preload.js`) builds
that object from `_ALL_NATIVE_METHODS`, one `ipcRenderer.invoke("native:X")`
relay per method. The main process (`public/electron.js`) answers each
with an `ipcMain.handle("native:X")` that calls the neon module, and
the neon crate (`native/src/lib.rs`) finally calls zingolib. Adding a
wallet function therefore touches four files: `lib.rs` (the fn and its
`export_function`), `native.node.d.ts`, `preload.js`, and
`electron.js`.

## The surface

`native/src/lib.rs` exports 73 functions. The TypeScript declaration
(`src/native.node.d.ts`) types 58 of them as `Promise<string>`, and the
strings are pretty-printed JSON built ad hoc with the `json::object!`
macro. This is the "stringly JSON boundary" the ADR's audit measured.

Errors are worse than the results: 66 of the export sites end in
`cx.throw_error(err.to_string())`, so every failure crosses as prose
and typed evidence dies at the boundary. ADR 0024 arc 5 lands here.
The convergence keeps neon but carries zingolib's serde serialization
of the wire types (the five mixnet states, the typed status struct,
typed errors), pinned by golden fixtures, with the TS side matching
variants instead of substrings.

## Eventing

There is none. `lib.rs` uses no neon `Channel` and takes no JS
callbacks. All status is polled: `poll_sync`, `status_sync`,
`migration_status`, and the renderer's 5-second `runTaskPromises`
cycle. Arc 2's status-by-subscription therefore needs a new push path:
a neon `Channel` from the driver's subscription into the main process,
then a main-to-renderer IPC event, which must be added to the
preload's `ALLOWED_RECEIVE` allowlist.

## Spawn-versus-attach discrimination

Already plumbed. `public/electron.js` branches on `process.mas` at
runtime in about ten places, and the preload exposes
`isSandboxed = process.platform === "darwin" && process.mas === true`
to the renderer. The attach strategy for the Mac App Store build has
its hook. Flatpak note: the sandbox checks treat `process.mas` and
`FLATPAK_ID` alike, and a Flatpak cannot spawn an arbitrary bundled
binary either, so phase 3 should decide whether Flatpak also attaches.

## Dependencies

`native/Cargo.toml` already pins zingolib by rev (79d575bf), matching
arc 7's rev-not-branch rule. It also declares direct `pepper-sync` and
`zingo-netutils` dependencies. The netutils use is a single import,
`zingo_netutils::{GrpcIndexer, Indexer}` at `lib.rs:68`, which retires
once zingolib's re-exports (the phase-1 funnel on the zls side) reach
a pinned rev. Unlike zingo-mobile, pc compiles exactly one copy of
zingo-netutils, because all its git pins agree on the rev. The
pepper-sync imports (config, keys, wallet, error types) are wider than
the funnel's netutils scope and are not addressed by ADR 0024.

## Price

Dark as of this survey, deliberately, per arc 6 and the ADR's
consequences section. The clearnet fetch is removed end to end: the
renderer's `getZecPrice` scheduler, the `fnSetZecPrice` wiring, the
preload and main relays, the neon `zec_price` export, and its
`.d.ts` declaration. The display machinery stays: `zecPrice` state in
`Routes.tsx` holds 0 and every USD display renders the unified
`USD --` fallback (`src/components/usdValue/UsdValue.tsx`). Phase 3
re-lands price as a typed subscription from zingolib's driver, which
refuses price in every state except ready. The per-transaction
`zec_price` field on value transfers is historical data from the
wallet, not a live fetch, and is untouched.
