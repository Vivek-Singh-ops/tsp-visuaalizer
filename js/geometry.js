/**
 * geometry.js
 * -----------
 * Pure math helpers shared by every algorithm: distance functions and
 * tour-length calculations. No DOM access here on purpose, so this file
 * can be tested or reused independently of the rendering layer.
 *
 * Two distance modes:
 *  - euclidean(a, b): plain-canvas mode, coordinates are pixels (x, y)
 *  - haversine(a, b): real-map mode, coordinates are {lat, lng} in degrees
 */

const EARTH_RADIUS_KM = 6371;

/** Straight-line distance between two points with .x/.y (canvas pixels). */
function euclideanDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Great-circle distance in km between two points with .lat/.lng (degrees). */
function haversineDistance(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  return EARTH_RADIUS_KM * c;
}

/**
 * Returns a distance(a, b) function appropriate for the current mode.
 * @param {'canvas'|'map'} mode
 */
function getDistanceFn(mode) {
  return mode === "map" ? haversineDistance : euclideanDistance;
}

/** Total length of a closed tour (returns to the first point at the end). */
function tourLength(points, order, distanceFn) {
  if (order.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < order.length; i++) {
    const a = points[order[i]];
    const b = points[order[(i + 1) % order.length]];
    total += distanceFn(a, b);
  }
  return total;
}

/** Builds a full pairwise distance matrix once, so algorithms can reuse it. */
function buildDistanceMatrix(points, distanceFn) {
  const n = points.length;
  const matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = distanceFn(points[i], points[j]);
      matrix[i][j] = d;
      matrix[j][i] = d;
    }
  }
  return matrix;
}

/** Formats a distance for display: km with 2 decimals on map mode, px otherwise. */
function formatDistance(value, mode) {
  if (mode === "map") return `${value.toFixed(2)} km`;
  return `${value.toFixed(1)} px`;
}

// Exposed as a plain global object so other plain-script files can use it
// without a bundler or module loader.
window.TSPGeometry = {
  euclideanDistance,
  haversineDistance,
  getDistanceFn,
  tourLength,
  buildDistanceMatrix,
  formatDistance,
};
