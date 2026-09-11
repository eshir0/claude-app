// Runs once when a new server instance starts, and must complete before the
// server accepts requests (Next.js instrumentation.ts `register()` hook).
// This is the ONLY place secret validation runs — never at module import
// time (that would also run during `next build`, when no secrets need to
// exist yet) and never lazily on first request (that would serve some
// requests before the check ever fires).
//
// The actual check lives in ./instrumentation-node.ts, loaded only via a
// dynamic import gated on the nodejs runtime check below. This app has no
// edge routes, but Next.js still produces an edge-compatible bundle of this
// file by default; a plain top-level `process.exit()` call gets statically
// flagged ("Node.js API used ... not supported in the Edge Runtime") even
// behind an `if` guard, because bundlers analyze reachability, not runtime
// values. Splitting the Node-only code into its own module keeps it out of
// the edge bundle entirely instead of merely being unreachable inside it.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateRequiredEnv, startBackgroundCollector, startLottoScheduler } = await import(
      "./instrumentation-node"
    );
    validateRequiredEnv();
    startBackgroundCollector();
    startLottoScheduler();
  }
}
