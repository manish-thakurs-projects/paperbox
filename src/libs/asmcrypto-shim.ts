// asmcrypto checks for Node globals at module-load time. We temporarily hide
// `process` only while requiring the library so the shim does not leave a
// permanent app-wide mutation behind.
const asm = (() => {
  const globalAny = typeof global !== "undefined" ? (global as any) : undefined;
  const previousProcess = globalAny?.process;
  const hadProcess = !!previousProcess;

  try {
    if (hadProcess) {
      try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        delete globalAny.process;
      } catch {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        globalAny.process = undefined;
      }
    }

    // Require the standalone ES5 build which is friendlier in some bundlers.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("asmcrypto.js/asmcrypto.all.es5.js");
  } finally {
    if (hadProcess) {
      try {
        globalAny.process = previousProcess;
      } catch {
        // If restoration fails, leave the environment as-is; the shim has
        // already completed its best-effort compatibility work.
      }
    }
  }
})();

export default asm;
