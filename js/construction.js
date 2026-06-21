/**
 * construction.js
 * ---------------
 * Construction algorithms build a tour from scratch (no starting tour
 * required). Each is written as a generator function that `yield`s a
 * small "step" object after every meaningful unit of work — this is what
 * lets the controller pause, step, or speed up/down playback without any
 * change to the algorithm logic itself.
 *
 * A step object always has the shape:
 *   {
 *     order:   number[]        current partial-or-full tour (city indices)
 *     active:  number[]        indices currently being considered/compared
 *     done:    boolean         true on the final yielded step
 *     label:   string          short human-readable description of the move
 *   }
 *
 * All functions take (points, distanceMatrix, options) and are registered
 * in window.TSPConstruction at the bottom of the file.
 */

/**
 * Nearest Neighbor: start at a city, always hop to the nearest unvisited
 * city, repeat until all are visited.
 */
function* nearestNeighbor(points, distanceMatrix, options = {}) {
  const n = points.length;
  const start = options.start ?? 0;
  const visited = new Array(n).fill(false);
  const order = [start];
  visited[start] = true;

  yield { order: [...order], active: [start], done: false, label: `Start at city ${start}` };

  let current = start;
  while (order.length < n) {
    let best = -1;
    let bestDist = Infinity;
    for (let j = 0; j < n; j++) {
      if (visited[j]) continue;
      const d = distanceMatrix[current][j];
      if (d < bestDist) {
        bestDist = d;
        best = j;
      }
    }
    visited[best] = true;
    order.push(best);
    yield {
      order: [...order],
      active: [current, best],
      done: false,
      label: `Nearest unvisited city to ${current} is ${best}`,
    };
    current = best;
  }

  yield { order: [...order], active: [], done: true, label: "Nearest Neighbor tour complete" };
}

/**
 * Greedy Edge: sort all edges by length ascending, add an edge if it does
 * not give any city degree > 2 and does not close a sub-cycle early.
 * Reconstructs the final tour order from the accepted edge set.
 */
function* greedyEdge(points, distanceMatrix, options = {}) {
  const n = points.length;
  const edges = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      edges.push([i, j, distanceMatrix[i][j]]);
    }
  }
  edges.sort((a, b) => a[2] - b[2]);

  const degree = new Array(n).fill(0);
  // union-find to detect/prevent premature sub-cycles
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => {
    parent[find(a)] = find(b);
  };

  const adjacency = Array.from({ length: n }, () => []);
  let acceptedCount = 0;

  for (const [a, b, dist] of edges) {
    if (acceptedCount === n) break;
    if (degree[a] >= 2 || degree[b] >= 2) continue;
    const rootA = find(a);
    const rootB = find(b);
    // Allow closing a cycle only on the very last edge.
    if (rootA === rootB && acceptedCount < n - 1) continue;

    degree[a]++;
    degree[b]++;
    adjacency[a].push(b);
    adjacency[b].push(a);
    union(a, b);
    acceptedCount++;

    yield {
      order: edgesToOrder(adjacency, n),
      active: [a, b],
      done: false,
      label: `Accepted edge ${a}–${b} (${dist.toFixed(2)})`,
    };
  }

  yield { order: edgesToOrder(adjacency, n), active: [], done: true, label: "Greedy Edge tour complete" };
}

/** Helper: walk an adjacency list (each node degree <= 2) into a tour order. */
function edgesToOrder(adjacency, n) {
  // Find any node to start from (prefer one with degree < 2, i.e. a tour end,
  // so the partial path renders left-to-right instead of as an arbitrary loop).
  let start = 0;
  for (let i = 0; i < n; i++) {
    if (adjacency[i].length < 2) {
      start = i;
      break;
    }
  }
  const order = [start];
  const visited = new Set([start]);
  let current = start;
  let previous = -1;
  while (true) {
    const neighbors = adjacency[current].filter((x) => x !== previous);
    const next = neighbors.find((x) => !visited.has(x));
    if (next === undefined) break;
    order.push(next);
    visited.add(next);
    previous = current;
    current = next;
  }
  return order;
}

/**
 * Cheapest (Christofides-style approximate) Insertion: start with a
 * 3-city loop, repeatedly insert the unvisited city + position that
 * increases total tour length the least.
 */
function* cheapestInsertion(points, distanceMatrix, options = {}) {
  const n = points.length;
  if (n < 3) {
    const order = points.map((_, i) => i);
    yield { order, active: [], done: true, label: "Too few cities for insertion" };
    return;
  }

  const inTour = new Array(n).fill(false);
  // Seed with the 3 cities that form the largest triangle-ish loop (0,1,2 for simplicity/determinism)
  const order = [0, 1, 2];
  order.forEach((i) => (inTour[i] = true));
  yield { order: [...order], active: [...order], done: false, label: "Seed loop with first 3 cities" };

  while (order.length < n) {
    let bestCity = -1;
    let bestPos = -1;
    let bestIncrease = Infinity;

    for (let c = 0; c < n; c++) {
      if (inTour[c]) continue;
      for (let p = 0; p < order.length; p++) {
        const a = order[p];
        const b = order[(p + 1) % order.length];
        const increase = distanceMatrix[a][c] + distanceMatrix[c][b] - distanceMatrix[a][b];
        if (increase < bestIncrease) {
          bestIncrease = increase;
          bestCity = c;
          bestPos = p;
        }
      }
    }

    order.splice(bestPos + 1, 0, bestCity);
    inTour[bestCity] = true;
    yield {
      order: [...order],
      active: [bestCity],
      done: false,
      label: `Inserted city ${bestCity} (cheapest increase ${bestIncrease.toFixed(2)})`,
    };
  }

  yield { order: [...order], active: [], done: true, label: "Cheapest Insertion tour complete" };
}

window.TSPConstruction = {
  nearestNeighbor,
  greedyEdge,
  cheapestInsertion,
};
