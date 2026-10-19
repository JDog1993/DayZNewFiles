# Local DayZ ground-height lookup

**All three official maps are enrolled with operator approval.** The source is
the official Experimental engine export (version remains labelled Experimental),
independently checked against 5,000 engine samples per map. The operator also
confirmed four Chernarus, three Livonia and three Sakhal in-game crate placements.
This is sampled evidence, not universal stable-version parity.

Missing/corrupt/unapproved data never silently falls back to zero. Explicit full
XYZ and recent logged positions keep their actual Y without a terrain lookup.
Manual saved drops and shop delivery-zone centres with blank Y use ground height.
Historical saved drops and frozen orders are not automatically rewritten.

Supported identities: Chernarus (`chernarusplus`), Livonia (`enoch`), Sakhal.
Nasdara (`nasdara`, also recognized as Badlands) is now enrolled from an
official PC native export at 4 m spacing: 5,000 independent engine checks,
100 regions, and three owner-confirmed console ground placements. Its selected
triangulation's largest measured independent-check error is approximately
0.005 m. The three console placements share an elevation; this is not a
guarantee across every console terrain point or structure.

Nasdara's immutable, checksum-addressed binary is held in private App Storage.
The small approved manifest is tracked here; its large binary is excluded from
Git and source deployment snapshots. Publish builds hydrate and checksum-verify
it before validation/build. To hydrate a fresh workspace explicitly, run
`pnpm --filter @workspace/scripts exec tsx terrain-height/storage-assets.ts`.
Runtime lookups remain local file reads, with no provider or storage downloads
inside feed/detection ticks. Do not replace unknown or invalid heights with zero.
Data is shared by map, not downloaded separately for each customer server.

Only the validated runtime grid and its small manifest are needed for Nasdara.
Raw captures, sample reports and experiment backups are excluded from Git and
source deployment snapshots. The checksum-addressed private App Storage object
is the durable runtime-grid backup. To verify that backup without uploading or
replacing a local file, run
`pnpm --filter @workspace/scripts exec tsx terrain-height/storage-assets.ts --verify-remote`.
This is terrain only: buildings, player constructions, bridges, platforms,
pond-water surfaces and safe access are not represented. It does not certify
that every selected location is suitable for delivery.

## Prepare each dataset

1. Use a local/offline PC DayZ instance with legitimately available map content
   and the matching game/map version. Do **not** run export code on a customer's
   live or console server.
2. Use the entire `scripts/terrain-height/export.c` as that isolated PC mission's
   `init.c`, not an include in another mission. The experimental default samples
   a map-specific grid (7.5m on Chernarus, 6.25m on Livonia, 3.75m on Sakhal). For production
    enrollment, use the independently validated `diagonal-bc` triangulation,
    or export a finer grid if intentionally using bilinear interpolation.
   This produces a large CSV plus 5,000 independent, off-grid SurfaceY samples
   in the profile directory. Allow disk space/time; it is a one-time operation.
3. Import explicitly from the workspace root:

   ```
   pnpm --filter @workspace/app exec tsx ../../scripts/terrain-height/import.ts \
      --map chernarusplus --step 7.5 --interpolation diagonal-bc \
     --input /path/reaper-terrain-grid.csv \
     --verification /path/reaper-terrain-checks.csv \
     --game-version ACTUAL_VERSION \
     --source "Local SurfaceY export from official Chernarus terrain" --approve
   ```

4. Repeat for `enoch` and `sakhal` with their own exports. Do not rename one map's
   grid as another map. The importer checks world size, orientation, coverage,
   float32 validity, and interpolation error. It requires >=1,000 independent
   samples distributed across all 100 map regions and <=0.25m observed error.
   These are sampled checks, not a mathematical guarantee at every cliff.
   Review representative hills/cliffs against the game before approving.
   Add `--check-only` to validate without installing any dataset files.
    Existing experimental grids can instead be enrolled by the explicit offline
    `scripts/terrain-height/enroll-tested.ts --approve` tool after operator
    approval and in-game confirmation. It checks source evidence, full checksums,
    finite grid values and the runtime triangulation before installing anything.
5. Keep the generated `.json` and `.f32` pairs together in this directory in
   the deployed artifact, then restart the **application**, not customer game
   servers. Missing/unapproved/corrupt datasets fail closed. Cached missing
   results also require an application restart after enrollment.

The runtime validates the file hash once per map/process and retains an open
handle. A lookup reads four floats from disk and interpolates: no Nitrado calls,
no per-customer downloads, no repeated full-map loads, no restart scans.
The existing 0.5m spawn lift remains a separate final projection operation.

Published server builds copy only the four approved JSON/grid pairs into
`dist/server/terrain-heightmaps/`. Compiled lookups use that packaged directory,
not the source cache excluded from snapshots. The build runs a compiled lookup
against all four packaged maps and the three console-tested Nasdara coordinates;
missing, corrupt or unapproved runtime data blocks the build. Raw exports,
experiment files and backup folders are never copied into this runtime package.

## Updates and limits

- Re-export/review affected data after terrain/game updates. Recorded
  `gameVersion` is provenance, **not** automatic detection of each customer's
  running version. Do not enable a grid across mismatched terrain versions.
- Automatic height never repairs historical saved drops or frozen queued
  orders. Those require an owner-approved, individually scoped correction.
- Actual Y=0 is valid when explicitly recorded/supplied; missing Y is not zero.
- For upper floors/roofs/bridges use full logged XYZ or enter their actual Y.
- The older public Sakhal 10m export is useful research, not an approved
  delivery dataset. Sources: https://github.com/ThisIsLoot/DayZ-Elevation and
  https://thisisloot.com/blog/sakhal-elevation-map .
