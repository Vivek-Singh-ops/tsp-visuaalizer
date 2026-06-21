# Tour Board — Traveling Salesman Problem Visualizer

An interactive, in-browser visualizer for the Traveling Salesman Problem (TSP).
Plot points on a blank canvas **or** on a real street map, then watch
construction and improvement algorithms build and refine a tour step by step.

**Live concept:** plot cities → run a *construction* algorithm to get a
quick starting tour → run an *improvement* algorithm on top of it to shorten
that tour → watch the route length drop in real time.

---

## Features

- **Two map modes**
  - **Blank canvas** — click anywhere to drop points, fastest way to
    experiment with abstract instances.
  - **Real-world map** — powered by [OpenFreeMap](https://openfreemap.org/)
    vector tiles (via [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/))
    rendered from [OpenStreetMap](https://www.openstreetmap.org/) data. Click
    anywhere on the map to drop a city pin with real coordinates, and
    distances are computed with the haversine formula (real kilometers).
- **Construction algorithms** (build an initial tour from scratch)
  - Nearest Neighbor
  - Greedy Edge
  - Christofides-style (cheapest insertion approximation)
- **Improvement algorithms** (refine an existing tour)
  - 2-opt
  - Or-opt (segment relocation)
  - Simulated Annealing
- **Playback controls** — play, pause, step forward one move at a time,
  reset, and a speed slider, so you can watch the algorithm think.
- **Live stats** — current tour length, number of cities, elapsed
  algorithm steps, and best length found so far.
- **Pipeline mode** — chain a construction algorithm straight into an
  improvement algorithm, which is the recommended way to get a good tour
  quickly (e.g. *Nearest Neighbor → 2-opt*).

## Project structure

```
tsp-visualizer/
├── index.html              Page shell — header, sidebar controls, canvas/map mount points
├── css/
│   ├── reset.css           Minimal CSS reset
│   ├── theme.css           Design tokens: color, type, spacing variables
│   └── layout.css          Page layout, sidebar, controls, responsive rules
├── js/
│   ├── geometry.js         Distance math (Euclidean + haversine), tour length helpers
│   ├── construction.js     Nearest Neighbor, Greedy Edge, Cheapest Insertion builders
│   ├── improvement.js      2-opt, Or-opt, Simulated Annealing refiners
│   ├── canvasRenderer.js   Draws points/edges/tour on the blank-canvas mode
│   ├── mapAdapter.js       MapLibre/OpenFreeMap integration + geo<->screen projection
│   ├── controller.js       Algorithm run loop: play/pause/step/speed, state machine
│   └── main.js             Wires up the DOM, event listeners, and starts the app
├── README.md                This file
└── LICENSE
```

Every algorithm is written as a **generator function** that `yield`s after
each meaningful step (each comparison, swap, or insertion). The controller
pulls one step at a time from the generator, which is what makes pause/step/
speed control possible without rewriting the algorithms themselves.

## Running it locally

No build step, no dependencies to install. It's static HTML/CSS/JS.

```bash
git clone https://github.com/<your-username>/tsp-visualizer.git
cd tsp-visualizer
python3 -m http.server 8000
# then open http://localhost:8000
```

(You can also just double-click `index.html`, but serving it over HTTP
avoids any browser quirks with `file://` and the map tiles.)

## Deploying to GitHub Pages

1. Push this folder to a new GitHub repository.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`,
   branch `main`, folder `/ (root)`.
4. Save. Your site will be live at
   `https://<your-username>.github.io/<repo-name>/` within a minute or two.

No API keys are required — OpenFreeMap's tiles are free and don't require
authentication.

## How the algorithms work (short version)

**Construction (build a tour from nothing):**
- *Nearest Neighbor* — start at a city, always travel to the closest
  unvisited city, repeat. Fast, often gives tours 20–25% longer than optimal.
- *Greedy Edge* — sort all possible edges by length, add the shortest edge
  that doesn't create a premature cycle or a degree-3 node, repeat.
- *Cheapest Insertion* — start with a small loop, repeatedly insert the
  unvisited city that increases the tour length the least.

**Improvement (shorten an existing tour):**
- *2-opt* — repeatedly find two edges that cross or are inefficient, and
  reverse the path between them if it shortens the tour.
- *Or-opt* — try relocating a small chain of 1–3 consecutive cities to a
  different position in the tour.
- *Simulated Annealing* — like 2-opt, but occasionally accepts a worse move
  (with a probability that cools over time) to escape local optima.

## Recommended combo

Run a construction algorithm first to get any valid tour quickly, then run
an improvement algorithm on top of it. **Nearest Neighbor → 2-opt** is the
classic combination: it gets you a tour within a few percent of optimal in
a fraction of the time pure 2-opt-from-random-tour would take.

## License

MIT — see `LICENSE`.
