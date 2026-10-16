// Hardened JavaScript for the renderer. ses.umd.min.js, loaded just before
// this file, defines `lockdown`; calling it freezes Object, Array, Promise,
// JSON, Function.prototype and the rest of the language intrinsics before
// the bundle runs, so no dependency can patch them afterwards.
//
// The options match zingo-mobile's: error and console taming off, so stack
// traces and the console stay as they are; override taming severe, so
// assigning `constructor` or `toString` on objects that inherit from a
// frozen prototype keeps working; eval left alone, since the production CSP
// already forbids it and SES must not depend on it.
//
// A dependency that assigns a property its frozen prototype also holds
// fails here with "Cannot assign to read only property" (the override
// mistake). SES cures that only for a fixed list of properties, and it
// refuses an accessor shim on any other, so the remaining cases are
// patched at the source: see patches/@fortawesome+fontawesome-svg-core.
lockdown({
  errorTaming: "unsafe",
  consoleTaming: "unsafe",
  errorTrapping: "none",
  unhandledRejectionTrapping: "none",
  overrideTaming: "severe",
  stackFiltering: "verbose",
  evalTaming: "unsafe-eval",
});
