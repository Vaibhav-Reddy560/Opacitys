/**
 * `server-only` is supplied by Next's bundler, not by node_modules, so any
 * module that imports it can't be loaded by a plain script runner. Scripts in
 * this directory alias it here (see scripts/tsconfig.json) so the real
 * server modules can be exercised directly, unmodified.
 *
 * Its whole job in the app is to make a build fail when a server module gets
 * pulled into a client bundle, which has no meaning in a CLI script — so an
 * empty module is the correct stub, not a stand-in for missing behaviour.
 */
export {};
