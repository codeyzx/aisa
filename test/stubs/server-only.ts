// A no-op stand-in for the `server-only` package, wired up in vitest.config.ts.
//
// The real package has no runtime behaviour at all: it ships an export map whose
// only resolvable condition is `react-server`, so importing it anywhere else is
// a RESOLUTION ERROR. That is the whole trick — it makes a client component that
// reaches for a server module fail the BUILD.
//
// Vitest is neither, so `import 'server-only'` there is an unresolvable import
// that kills the whole test file at collection. Since a file that fails to
// collect contributes zero tests while the run still reports the others as
// passed, the effect is silent: the data layer — repos, pagination, the
// converter, collections — would have no tests, and nothing would say so.
//
// Stubbing it costs nothing that matters. The guard is enforced at build time by
// `next build`, which still resolves the real package and still fails; a test
// process is not a bundle and has no client boundary to violate.
export {}
