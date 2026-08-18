// Shim that ensures asmcrypto does not try to require Node's 'crypto' module when bundling
// in React Native. It removes `process` global if present so asmcrypto will use the
// browser-friendly fallback for getRandomValues.

// Attempt to delete process to avoid asmcrypto's Node detect
try {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  if (typeof global !== "undefined" && (global as any).process) {
    try {
      // prefer delete
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      delete (global as any).process;
    } catch (e) {
      // fallback: set to undefined
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      (global as any).process = undefined;
    }
  }
} catch (e) {
  // ignore
}

// Require the standalone ES5 build which is friendlier in some bundlers
// (we already removed the direct import to this file elsewhere)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const asm = require("asmcrypto.js/asmcrypto.all.es5.js");

export default asm;
