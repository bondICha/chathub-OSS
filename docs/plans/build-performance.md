# Build Performance — Notes for Later

Observed on the netcup VPS: `yarn build` (`tsc && vite build`) takes ~80-90s.
Not obviously abnormal for this project's shape, but noted here in case it's
worth improving.

Likely contributors (not yet profiled/confirmed):
- `tsc` runs a full, non-incremental type check before every build
  (`"build": "tsc && vite build"` in `package.json`). No `--incremental` /
  `.tsbuildinfo` caching is configured.
- `vite build` bundles a large single chunk (3.3MB+ pre-gzip) pulling in
  Mermaid (many diagram-type sub-packages), KaTeX, and cytoscape.esm among
  others — rollup/minify work scales with that.
- Single-threaded Node build step; doesn't obviously parallelize across the
  VPS's cores.

Possible follow-ups if build time becomes a real pain point:
- `tsc --incremental` (persist `.tsbuildinfo`) for local/dev iteration.
- `build.rollupOptions.output.manualChunks` to split the large bundle
  (also addresses the existing "chunks larger than 1000 kB" warning from
  vite itself).

Not investigated or implemented — just a note from observing build times
during the Settings Assistant work.
