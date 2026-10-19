import { createTerrainHeightStore } from "./terrain-height.mjs";

const [map = "nasdara", x = "11933", z = "11163"] = process.argv.slice(2);
const store = createTerrainHeightStore(new URL("./terrain-heightmaps/", import.meta.url));
try {
  const groundY = await store.lookupTerrainHeight(map, x, z);
  console.log(JSON.stringify({ map, x: Number(x), z: Number(z), groundY }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ code: error.code, message: error.message }));
  process.exitCode = 1;
} finally {
  await store.close();
}
