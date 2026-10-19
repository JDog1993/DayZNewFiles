/**
 * Local-only, operator-enrolled terrain grids. No Nitrado/HTTP requests.
 * Source and bundled server entry both sit two levels below artifacts/app.
 * Metadata/handles (including missing-data results) are cached until restart.
 * Only four floats are read per lookup; large maps aren't held in memory.
 */
import { open, readFile, stat, type FileHandle } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { coordinate, ShopPositionError } from "../../shared/shop-position";

// esbuild sets this only for published bundles; source execution keeps its
// existing directory. Published grids are explicit build outputs beside app.js.
declare const __REAPER_BUNDLED_SERVER__: boolean;

export const TERRAIN_MAPS = {
  chernarusplus: 15360,
  enoch: 12800,
  sakhal: 15360,
  nasdara: 16384,
} as const;
export type TerrainMap = keyof typeof TERRAIN_MAPS;
export type TerrainInterpolation = "bilinear" | "diagonal-bc";
export type TerrainMetadata = {
  format: "dayz-height-f32-v1";
  map: TerrainMap;
  gameVersion: string;
  source: string;
  approved: true;
  verifiedAt: string;
  maxErrorMeters: number;
  step: number;
  columns: number;
  rows: number;
  sha256: string;
  /** Legacy enrolled grids omit this and use bilinear interpolation. */
  interpolation?: TerrainInterpolation;
};
export function terrainMap(raw: unknown): TerrainMap | null {
  const name = String(raw ?? "").trim().toLowerCase();
  if (name === "chernarus" || name === "chernarusplus") return "chernarusplus";
  if (name === "livonia" || name === "enoch") return "enoch";
  if (name === "nasdara" || name === "badlands" || name === "nasdara (badlands)") return "nasdara";
  return name === "sakhal" ? "sakhal" : null;
}
export function validateTerrainMetadata(m: TerrainMetadata, map: TerrainMap) {
  if (m.format !== "dayz-height-f32-v1" || m.map !== map || m.approved !== true
      || typeof m.gameVersion !== "string" || !m.gameVersion.trim()
      || typeof m.source !== "string" || !m.source.trim()
      || !Number.isFinite(Date.parse(m.verifiedAt))
      || !Number.isFinite(m.maxErrorMeters) || m.maxErrorMeters < 0 || m.maxErrorMeters > 0.25
      || !Number.isFinite(m.step) || m.step <= 0 || m.step > 10
      || !Number.isInteger(m.columns) || !Number.isInteger(m.rows)
      || m.columns < 2 || m.rows < 2
      || Math.abs((m.columns - 1) * m.step - TERRAIN_MAPS[map]) > 0.001
      || Math.abs((m.rows - 1) * m.step - TERRAIN_MAPS[map]) > 0.001
      || !/^[a-f0-9]{64}$/.test(m.sha256)
       || (m.interpolation !== undefined && m.interpolation !== "bilinear" && m.interpolation !== "diagonal-bc")
      || m.columns * m.rows * 4 > 256 * 1024 * 1024) {
    throw new Error("Terrain dataset metadata is invalid or not approved.");
  }
}
export function interpolateHeight(values: readonly number[], tx: number, tz: number,
  method: TerrainInterpolation = "bilinear") {
  if (values.length !== 4 || values.some(y => !Number.isFinite(y))
      || ![tx, tz].every(t => Number.isFinite(t) && t >= 0 && t <= 1)
      || (method !== "bilinear" && method !== "diagonal-bc")) {
    throw new ShopPositionError("TERRAIN_DATA_INVALID", "Terrain height data is invalid. Enter Y or save your full in-game position.");
  }
  const [a, b, c, d] = values;
  if (method === "diagonal-bc") {
    return tx + tz <= 1 ? a + (b - a) * tx + (c - a) * tz
      : d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
  }
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

type Grid = { meta: TerrainMetadata; file: FileHandle };
async function load(map: TerrainMap, directory: URL): Promise<Grid | null> {
  let handle: FileHandle | undefined;
  try {
    const manifest = new URL(`${map}.json`, directory);
    if ((await stat(manifest)).size > 16384) throw new Error("Terrain manifest exceeds size limit.");
    const meta = JSON.parse(await readFile(manifest, "utf8")) as TerrainMetadata;
    validateTerrainMetadata(meta, map);
    const path = new URL(`${map}.f32`, directory);
    handle = await open(path, "r");
    if ((await handle.stat()).size !== meta.columns * meta.rows * 4) throw new Error("Terrain grid size mismatch.");
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path, { fd: handle.fd, autoClose: false, start: 0 })) hash.update(chunk);
    if (hash.digest("hex") !== meta.sha256) throw new Error("Terrain checksum mismatch.");
    return { meta, file: handle };
  } catch (err) {
    if (handle) await handle.close();
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.error(`[terrain-height] ${map}: approved runtime dataset is missing`);
    } else {
      console.error(`[terrain-height] ${map}: dataset rejected`, (err as Error).message);
    }
    return null;
  }
}
export function createTerrainHeightStore(directory: URL) {
const cache = new Map<TerrainMap, Promise<Grid | null>>();
function grid(map: TerrainMap) {
  let result = cache.get(map);
  if (!result) { result = load(map, directory); cache.set(map, result); }
  return result;
}
async function terrainHeightStatus(rawMap: unknown) {
  const map = terrainMap(rawMap);
  const found = map ? await grid(map) : null;
  return { available: !!found, gameVersion: found?.meta.gameVersion ?? null };
}
async function lookupTerrainElevation(rawMap: unknown, rawX: unknown, rawZ: unknown) {
  const map = terrainMap(rawMap);
  const x = coordinate(rawX), z = coordinate(rawZ);
  if (!map) throw new ShopPositionError("TERRAIN_MAP_UNSUPPORTED",
    "Automatic ground height is not available for this map. Enter Y or save your full in-game position.");
  if (x === null || z === null || x < 0 || z < 0 || x > TERRAIN_MAPS[map] || z > TERRAIN_MAPS[map]) {
    throw new ShopPositionError("INVALID_COORDINATES", "X and Z must be inside this map's boundaries.", 400);
  }
  const found = await grid(map);
  if (!found) throw new ShopPositionError("TERRAIN_DATA_UNAVAILABLE",
    "Verified ground-height data is not installed for this map yet. Enter Y or use your full last-known in-game position.");
  const { meta, file } = found;
  const column = Math.min(Math.floor(x / meta.step), meta.columns - 2);
  const row = Math.min(Math.floor(z / meta.step), meta.rows - 2);
  const buffers = [Buffer.alloc(8), Buffer.alloc(8)];
  const reads = await Promise.all(buffers.map((buffer, i) =>
    file.read(buffer, 0, 8, ((row + i) * meta.columns + column) * 4)));
  if (reads.some(result => result.bytesRead !== 8)) {
    throw new ShopPositionError("TERRAIN_DATA_INVALID", "Could not read terrain height. Enter Y or save your full in-game position.");
  }
  const y = interpolateHeight(buffers.flatMap(b => [b.readFloatLE(0), b.readFloatLE(4)]),
     x / meta.step - column, z / meta.step - row, meta.interpolation);
  return y;
}
async function lookupTerrainHeight(rawMap: unknown, rawX: unknown, rawZ: unknown) {
  const y = await lookupTerrainElevation(rawMap, rawX, rawZ);
  if (y < 0) throw new ShopPositionError("TERRAIN_BELOW_SEA_LEVEL",
    "This point is below sea level. Choose a dry-land drop or save your full in-game position.");
  return y;
}
async function close() {
  for (const pending of cache.values()) {
    const found = await pending;
    if (found) await found.file.close();
  }
  cache.clear();
}
return { terrainHeightStatus, lookupTerrainHeight, lookupTerrainElevation, close };
}
export const terrainDataDirectory = new URL(
  typeof __REAPER_BUNDLED_SERVER__ !== "undefined" && __REAPER_BUNDLED_SERVER__
    ? "./terrain-heightmaps/" : "../../terrain-heightmaps/",
  import.meta.url);
const store = createTerrainHeightStore(terrainDataDirectory);
export const terrainHeightStatus = store.terrainHeightStatus;
export const lookupTerrainHeight = store.lookupTerrainHeight;
/** Signed elevation, including seabed. Placement callers must use lookupTerrainHeight. */
export const lookupTerrainElevation = store.lookupTerrainElevation;
