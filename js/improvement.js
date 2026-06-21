/**
 * improvement.js
 * --------------
 * Improvement algorithms take an existing tour (e.g. from construction.js
 * or just the identity order) and try to shorten it. Same generator/step
 * contract as construction.js — see the comment at the top of that file.
 *
 * These algorithms additionally report `improved: boolean` and
 * `length: number` on each step so the UI can show the tour-length ticker.
 */

/**
 * 2-opt: repeatedly pick two edges (i, i+1) and (j, j+1); if reversing the
 * path between them shortens the tour, keep the reversal. Stops when a
 * full pass finds no improving move.
 */
function* twoOpt(points, distanceMatrix, initialOrder, options = {}) {
  let order = [...initialOrder];
  const n = order.length;
  const { getDistanceFn } = window.TSPGeometry;
  const distanceFn = getDistanceFn(options.mode);

  let length = window.TSPGeometry.tourLength(points, order, distanceFn);
  yield { order: [...order], active: [], done: false, improved: false, length, label: "Starting 2-opt" };

  let improvedAny = true;
  while (improvedAny) {
    improvedAny = false;
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // would "reverse" the whole tour, a no-op

        const a = order[i];
        const b = order[i + 1];
        const c = order[j];
        const d = order[(j + 1) % n];

        const before = distanceMatrix[a][b] + distanceMatrix[c][d];
        const after = distanceMatrix[a][c] + distanceMatrix[b][d];

        if (after < before - 1e-9) {
          // Reverse the segment between i+1 and j (inclusive)
          reverseSegment(order, i + 1, j);
          length -= before - after;
          improvedAny = true;
          yield {
            order: [...order],
            active: [a, b, c, d],
            done: false,
            improved: true,
            length,
            label: `2-opt swap: reversed segment between ${b} and ${c}`,
          };
        } else {
          yield {
            order: [...order],
            active: [a, b, c, d],
            done: false,
            improved: false,
            length,
            label: `Checked edges ${a}-${b} / ${c}-${d}: no gain`,
          };
        }
      }
    }
  }

  yield { order: [...order], active: [], done: true, improved: false, length, label: "2-opt converged (local optimum)" };
}

function reverseSegment(order, start, end) {
  while (start < end) {
    const tmp = order[start];
    order[start] = order[end];
    order[end] = tmp;
    start++;
    end--;
  }
}

/**
 * Or-opt: try relocating a short chain (length 1, 2, or 3) of consecutive
 * cities to a different position in the tour. Complements 2-opt by fixing
 * moves 2-opt structurally cannot (it only ever reverses segments).
 */
function* orOpt(points, distanceMatrix, initialOrder, options = {}) {
  let order = [...initialOrder];
  const n = order.length;
  const { getDistanceFn } = window.TSPGeometry;
  const distanceFn = getDistanceFn(options.mode);
  let length = window.TSPGeometry.tourLength(points, order, distanceFn);

  yield { order: [...order], active: [], done: false, improved: false, length, label: "Starting Or-opt" };

  // Minimum gain must be meaningfully positive, not just "greater than a
  // tiny negative epsilon". On very small or degenerate tours, relocating a
  // single city can be a pure relabeling of the same cycle (delta == 0
  // exactly, or off by floating-point noise) — accepting that as
  // "improving" causes an infinite loop of relabelings that never actually
  // shortens the tour.
  const MIN_GAIN = 1e-7;
  // Hard safety cap: real convergence should take far fewer relocations
  // than this even on large instances. If we ever hit it, stop rather than
  // hang the browser tab.
  const MAX_ITERATIONS = Math.max(2000, n * n * 20);
  let iterations = 0;

  let improvedAny = true;
  while (improvedAny) {
    improvedAny = false;

    for (let segLen = 1; segLen <= 3; segLen++) {
      if (segLen >= n - 1) continue; // need at least 2 cities left outside the segment to relocate into
      for (let i = 0; i < n; i++) {
        // Extract segment [i, i+segLen)
        const segIdx = [];
        for (let k = 0; k < segLen; k++) segIdx.push((i + k) % n);
        if (new Set(segIdx).size < segLen) continue; // wrapped over itself, skip

        const prev = order[(i - 1 + n) % n];
        const segStart = order[segIdx[0]];
        const segEnd = order[segIdx[segIdx.length - 1]];
        const next = order[(i + segLen) % n];
        if (prev === segEnd || next === segStart) continue;

        const removalGain =
          distanceMatrix[prev][segStart] + distanceMatrix[segEnd][next] - distanceMatrix[prev][next];

        // Try inserting the segment between every other adjacent pair (j, j+1)
        let bestJ = -1;
        let bestDelta = MIN_GAIN;
        for (let j = 0; j < n; j++) {
          if (segIdx.includes(j) || segIdx.includes((j + 1) % n)) continue;
          if (j === (i - 1 + n) % n) continue; // same spot, no-op

          const a = order[j];
          const b = order[(j + 1) % n];
          const insertionCost =
            distanceMatrix[a][segStart] + distanceMatrix[segEnd][b] - distanceMatrix[a][b];
          const delta = removalGain - insertionCost;
          if (delta > bestDelta) {
            bestDelta = delta;
            bestJ = j;
          }
        }

        if (bestJ !== -1) {
          iterations++;
          if (iterations > MAX_ITERATIONS) {
            yield {
              order: [...order],
              active: [],
              done: true,
              improved: false,
              length,
              label: "Or-opt stopped early (iteration safety limit reached)",
            };
            return;
          }
          order = relocateSegment(order, segIdx, bestJ);
          length -= bestDelta;
          improvedAny = true;
          yield {
            order: [...order],
            active: [prev, segStart, segEnd, next],
            done: false,
            improved: true,
            length,
            label: `Or-opt: relocated chain of ${segLen} starting at ${segStart}`,
          };
        }
      }
    }
  }

  yield { order: [...order], active: [], done: true, improved: false, length, label: "Or-opt converged (local optimum)" };
}

/** Removes the cities at segIdx (original-order indices) and reinserts them right after position afterIdx (in the original order's indexing). */
function relocateSegment(order, segIdx, afterIdx) {
  const n = order.length;
  const segSet = new Set(segIdx);
  const segment = segIdx.map((i) => order[i]);
  const afterCity = order[afterIdx];

  const rest = [];
  for (let i = 0; i < n; i++) {
    if (!segSet.has(i)) rest.push(order[i]);
  }

  const insertAt = rest.indexOf(afterCity) + 1;
  rest.splice(insertAt, 0, ...segment);
  return rest;
}

/**
 * Simulated Annealing: like 2-opt, but occasionally accepts a worse move
 * with probability exp(-delta / temperature), where temperature cools
 * geometrically each iteration. Helps escape local optima that pure 2-opt
 * gets stuck in.
 */
function* simulatedAnnealing(points, distanceMatrix, initialOrder, options = {}) {
  let order = [...initialOrder];
  const n = order.length;
  const { getDistanceFn } = window.TSPGeometry;
  const distanceFn = getDistanceFn(options.mode);
  let length = window.TSPGeometry.tourLength(points, order, distanceFn);

  let bestOrder = [...order];
  let bestLength = length;

  let temperature = options.initialTemperature ?? length / n; // scale to instance size
  const coolingRate = options.coolingRate ?? 0.995;
  const minTemperature = options.minTemperature ?? 1e-3;
  const iterationsPerTemp = options.iterationsPerTemp ?? Math.max(10, n);

  yield {
    order: [...order],
    active: [],
    done: false,
    improved: false,
    length,
    label: `Starting Simulated Annealing (T=${temperature.toFixed(2)})`,
  };

  while (temperature > minTemperature) {
    for (let iter = 0; iter < iterationsPerTemp; iter++) {
      const i = 1 + Math.floor(Math.random() * (n - 1));
      let j = 1 + Math.floor(Math.random() * (n - 1));
      if (i === j) continue;
      const [lo, hi] = i < j ? [i, j] : [j, i];

      const a = order[lo - 1];
      const b = order[lo];
      const c = order[hi];
      const d = order[(hi + 1) % n];

      const before = distanceMatrix[a][b] + distanceMatrix[c][d];
      const after = distanceMatrix[a][c] + distanceMatrix[b][d];
      const delta = after - before;

      const accept = delta < 0 || Math.random() < Math.exp(-delta / temperature);

      if (accept) {
        reverseSegment(order, lo, hi);
        length += delta;
        if (length < bestLength) {
          bestLength = length;
          bestOrder = [...order];
        }
        yield {
          order: [...order],
          active: [a, b, c, d],
          done: false,
          improved: delta < 0,
          length,
          label: `T=${temperature.toFixed(2)}: ${delta < 0 ? "accepted improving move" : "accepted worse move to escape local optimum"}`,
        };
      }
    }
    temperature *= coolingRate;
  }

  yield {
    order: [...bestOrder],
    active: [],
    done: true,
    improved: false,
    length: bestLength,
    label: "Simulated Annealing finished — returning best tour found",
  };
}

window.TSPImprovement = {
  twoOpt,
  orOpt,
  simulatedAnnealing,
};
