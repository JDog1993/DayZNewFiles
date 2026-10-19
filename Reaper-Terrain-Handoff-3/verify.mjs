import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createTerrainHeightStore, terrainMap, interpolateHeight } from "./terrain-height.mjs";
import { coordinate } from "./shop-position.mjs";

const store = createTerrainHeightStore(new URL("./terrain-heightmaps/", import.meta.url));
let checks = 0;
const check = (condition) => { assert.ok(condition); checks++; };
try {
  for (const map of ["chernarusplus", "enoch", "sakhal", "nasdara"]) {
    check((await store.terrainHeightStatus(map)).available);
  }
  const samples = JSON.parse(await readFile(new URL("./reference-samples.json", import.meta.url)));
  for (const sample of samples) {
    const actual = await store.lookupTerrainElevation(sample.map, sample.x, sample.z);
    check(Math.abs(actual - sample.groundY) < 1e-7);
  }
  check(terrainMap("Badlands") === "nasdara");
  check(terrainMap("Livonia") === "enoch");
  check(terrainMap("../../secret") === null);
  check(coordinate("") === null && coordinate(null) === null && coordinate("0") === 0);
  check(interpolateHeight([10, 20, 30, 50], 0.25, 0.25, "diagonal-bc") === 17.5);
  check(interpolateHeight([10, 20, 30, 50], 0.75, 0.75, "diagonal-bc") === 37.5);
  for (const args of [["unknown", 1, 1], ["nasdara", "", 1], ["nasdara", -1, 1],
    ["nasdara", 16385, 1], ["nasdara", Infinity, 1]]) {
    await assert.rejects(store.lookupTerrainElevation(...args)); checks++;
  }
  await assert.rejects(store.lookupTerrainHeight("chernarusplus", 0, 0),
    { code: "TERRAIN_BELOW_SEA_LEVEL" }); checks++;
  const temp = await mkdtemp(join(tmpdir(), "terrain-handoff-"));
  let broken;
  try {
    const dir = pathToFileURL(temp + "/");
    broken = createTerrainHeightStore(dir);
    await assert.rejects(broken.lookupTerrainElevation("nasdara", 1, 1),
      { code: "TERRAIN_DATA_UNAVAILABLE" }); checks++;
    await broken.close();
    const meta = JSON.parse(await readFile(new URL("./terrain-heightmaps/enoch.json", import.meta.url)));
    await writeFile(join(temp, "enoch.json"), JSON.stringify(meta));
    await writeFile(join(temp, "enoch.f32"), Buffer.alloc(meta.rows * meta.columns * 4));
    broken = createTerrainHeightStore(dir);
    await assert.rejects(broken.lookupTerrainElevation("enoch", 1, 1),
      { code: "TERRAIN_DATA_UNAVAILABLE" }); checks++;
  } finally {
    await broken?.close();
    await rm(temp, { recursive: true, force: true });
  }
  console.log(`PASS: ${checks} checks; all four complete dataset hashes/sizes verified.
Expected missing-file/checksum messages above are negative tests.
Reference samples are regression expectations, not new independent engine checks.`);
} finally {
  await store.close();
}
