import fs from "fs";
import path from "path";

/**
 * Every native call is an IPC round-trip: the renderer calls a method on the
 * preload bridge, which forwards it to a handler the main process registered.
 * Nothing type-checks across that gap — the bridge forwards `...args` blindly,
 * and a handler registered with the no-argument shape silently drops whatever
 * it was passed. Neon then answers "not enough arguments" at the one moment
 * that matters, which is what a Flashnet deposit ran into.
 *
 * So the gap is checked here instead, by reading the three sides: the lists in
 * `public/electron.js`, the list in `public/preload.js`, and the argument
 * reads in the native source, found through its export table.
 */

const repoRoot = path.join(__dirname, "..", "..");
const read = (rel: string): string => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const electronSource: string = read("public/electron.js");
const preloadSource: string = read("public/preload.js");
const nativeSource: string = read("native/src/lib.rs");

const namesIn = (block: string): string[] => [...block.matchAll(/^\s*"([a-z0-9_]+)",/gm)].map((m) => m[1]);

// Both loops registering `() => native[method]()` sit between the list and the
// comment that opens the handlers taking parameters.
const noArgumentBlock: string = electronSource.slice(
  electronSource.indexOf("const _NATIVE_NO_PARAM_METHODS"),
  electronSource.indexOf("// Methods with parameters"),
);
const registeredWithoutArguments: string[] = namesIn(noArgumentBlock);

const registeredExplicitly: string[] = [...electronSource.matchAll(/ipcMain\.handle\("native:([a-z0-9_]+)"/g)].map(
  (m) => m[1],
);

const bridgeBlock: string = preloadSource.slice(
  preloadSource.indexOf("const _ALL_NATIVE_METHODS"),
  preloadSource.indexOf("const nativeForRenderer"),
);
const exposedToRenderer: string[] = namesIn(bridgeBlock);

// Where an exported method lives: `cx.export_function("name", function)`
// names a function in `lib.rs`, or `module::function` in that module's file.
const rustFunctionFor = (method: string): { source: string; name: string } | null => {
  const exported = nativeSource.match(new RegExp(`cx\\.export_function\\("${method}", ([a-z0-9_:]+)\\)`));
  if (!exported) return null;
  const segments: string[] = exported[1].split("::");
  const name: string = segments[segments.length - 1];
  return { source: segments.length > 1 ? read(`native/src/${segments[0]}.rs`) : nativeSource, name };
};

const DECLARATION = /^(pub(\([a-z]+\))? )?fn /;

// Highest `cx.argument::<T>(n)` index the Rust function reads, + 1. Scans from
// the declaration to the next top-level `fn`.
const argumentsRead = (method: string): number | null => {
  const rust = rustFunctionFor(method);
  if (!rust) return null;
  const lines: string[] = rust.source.split(/\r?\n/);
  const start: number = lines.findIndex(
    (line) => DECLARATION.test(line) && line.replace(DECLARATION, "").startsWith(`${rust.name}(`),
  );
  if (start < 0) return null;
  let count = 0;
  for (let i = start + 1; i < lines.length; i++) {
    if (DECLARATION.test(lines[i])) break;
    const read = lines[i].match(/cx\.argument(?:_opt)?::<[^>]+>\((\d+)\)/);
    if (read) count = Math.max(count, Number(read[1]) + 1);
  }
  return count;
};

describe("native IPC registration", () => {
  it("registers nothing as no-argument that reads arguments", () => {
    const dropping: string[] = registeredWithoutArguments.filter((method) => {
      const count: number | null = argumentsRead(method);
      return count !== null && count > 0;
    });

    expect(dropping).toEqual([]);
  });

  it("finds every no-argument method in the native source", () => {
    const missing: string[] = registeredWithoutArguments.filter((method) => argumentsRead(method) === null);

    expect(missing).toEqual([]);
  });

  it("gives every bridged method a handler", () => {
    const registered = new Set([...registeredWithoutArguments, ...registeredExplicitly]);
    const unhandled: string[] = exposedToRenderer.filter((method) => !registered.has(method));

    expect(unhandled).toEqual([]);
  });

  // Registering the same channel twice throws on startup, so a method moved
  // between the lists has to leave the old one.
  it("registers each method once", () => {
    const twice: string[] = registeredWithoutArguments.filter((method) => registeredExplicitly.includes(method));

    expect(twice).toEqual([]);
  });
});
