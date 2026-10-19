/** Unknown altitude must never become sea level through Number(null)/?? 0. */
export class ShopPositionError extends Error {
  constructor(public code: string, message: string, public status = 409) {
    super(message);
    this.name = "ShopPositionError";
  }
}

export function coordinate(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function requireShopPosition(point: { x: unknown; y?: unknown; z: unknown }) {
  const x = coordinate(point.x), y = coordinate(point.y), z = coordinate(point.z);
  if (x === null || z === null) {
    throw new ShopPositionError("INVALID_COORDINATES", "Enter valid X and Z coordinates.", 400);
  }
  if (y === null) {
    throw new ShopPositionError("DELIVERY_HEIGHT_REQUIRED",
      "This delivery location has no valid Y height. Stand at the drop and save your full in-game position, or enter a known Y height.");
  }
  return { x, y, z };
}
