"use strict";

/**
 * FontAwesome ships Babel's `_wrapRegExp` helper, which assigns `exec` and
 * `Symbol.replace` on a RegExp subclass. Under SES lockdown RegExp.prototype
 * is frozen and no override taming covers it, so the assignment throws and the
 * module fails to load. Production never runs the helper: terser drops the
 * unused regexps that call it. Development does, so there the two methods are
 * defined instead of assigned, which a frozen prototype up the chain allows.
 */
const PAIRS = [
  [
    "BabelRegExp.prototype.exec = function (r) {",
    'Object.defineProperty(BabelRegExp.prototype, "exec", { configurable: true, writable: true, value: function (r) {',
  ],
  [
    "}, BabelRegExp.prototype[Symbol.replace] = function (t, p) {",
    "} }), Object.defineProperty(BabelRegExp.prototype, Symbol.replace, { configurable: true, writable: true, value: function (t, p) {",
  ],
  ["  }, _wrapRegExp.apply(this, arguments);", "  } }), _wrapRegExp.apply(this, arguments);"],
];

module.exports = function fontawesomeRegExpLoader(source) {
  if (!source.includes("function _wrapRegExp()")) return source;
  let out = source;
  for (const [from, to] of PAIRS) {
    if (!out.includes(from)) {
      this.emitError(new Error(`fontawesomeRegExpLoader: the helper changed, "${from}" is gone`));
      return source;
    }
    out = out.replace(from, to);
  }
  return out;
};
