// Coordinates stay on the device; distance is used to rank existing inventory.
export function distanceKm(origin, destination) {
  const rad = (value) => (value * Math.PI) / 180;
  const dLat = rad(destination[0] - origin[0]);
  const dLng = rad(destination[1] - origin[1]);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(origin[0])) *
      Math.cos(rad(destination[0])) *
      Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}
export const nearbyRadiusKm = 10;
