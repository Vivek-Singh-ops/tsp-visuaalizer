/**
 * main.js
 * -------
 * Wires up the DOM: mode switching (canvas vs map), point plotting,
 * algorithm selection, playback controls, and the construction ->
 * improvement pipeline. This is the only file that touches `document.*`
 * directly outside of the renderer/adapter classes.
 */

(function () {
  "use strict";

  const { getDistanceFn, buildDistanceMatrix, tourLength, formatDistance } = window.TSPGeometry;

  /** ---------------- App state ---------------- */
  const state = {
    mode: "canvas", // "canvas" | "map"
    points: [], // canvas mode: {x,y}; map mode: {lat,lng}
    currentOrder: [], // last rendered tour order (city indices), may be partial
    distanceMatrix: [],
    bestLength: Infinity,
    pipeline: [], // e.g. [{type:'construction', key:'nearestNeighbor'}, {type:'improvement', key:'twoOpt'}]
    pipelineIndex: -1,
    isRunningPipeline: false,
  };

  /** ---------------- DOM refs ---------------- */
  const dom = {
    canvasStage: document.getElementById("canvas-stage"),
    mapStage: document.getElementById("map-stage"),
    canvas: document.getElementById("tsp-canvas"),
    modeButtons: document.querySelectorAll(".mode-toggle button"),
    constructionSelect: document.getElementById("construction-select"),
    improvementSelect: document.getElementById("improvement-select"),
    addToPipelineConstruction: document.getElementById("add-construction"),
    addToPipelineImprovement: document.getElementById("add-improvement"),
    pipelineChain: document.getElementById("pipeline-chain"),
    runPipelineBtn: document.getElementById("run-pipeline"),
    playBtn: document.getElementById("play-btn"),
    pauseBtn: document.getElementById("pause-btn"),
    stepBtn: document.getElementById("step-btn"),
    resetBtn: document.getElementById("reset-btn"),
    clearBtn: document.getElementById("clear-btn"),
    randomBtn: document.getElementById("random-btn"),
    speedSlider: document.getElementById("speed-slider"),
    speedLabel: document.getElementById("speed-label"),
    cityCount: document.getElementById("stat-cities"),
    routeLength: document.getElementById("stat-length"),
    bestLength: document.getElementById("stat-best"),
    stepCounter: document.getElementById("stat-steps"),
    runLog: document.getElementById("run-log"),
    toast: document.getElementById("toast"),
    chartHint: document.getElementById("chart-hint"),
  };

  const canvasRenderer = new window.CanvasRenderer(dom.canvas);
  let mapAdapter = null;

  /** ---------------- Construction / improvement registries ---------------- */
  const CONSTRUCTION_ALGOS = {
    nearestNeighbor: { label: "Nearest Neighbor", fn: window.TSPConstruction.nearestNeighbor },
    greedyEdge: { label: "Greedy Edge", fn: window.TSPConstruction.greedyEdge },
    cheapestInsertion: { label: "Cheapest Insertion", fn: window.TSPConstruction.cheapestInsertion },
  };

  const IMPROVEMENT_ALGOS = {
    twoOpt: { label: "2-opt", fn: window.TSPImprovement.twoOpt },
    orOpt: { label: "Or-opt", fn: window.TSPImprovement.orOpt },
    simulatedAnnealing: { label: "Simulated Annealing", fn: window.TSPImprovement.simulatedAnnealing },
  };

  /** ---------------- Controller ---------------- */
  const controller = new window.AlgorithmController({
    onStep: handleStep,
    onFinish: handleFinish,
    onStateChange: handleStateChange,
  });

  /** ---------------- Rendering ---------------- */
  function render(order, active, closeLoop) {
    active = active || [];
    closeLoop = closeLoop !== false;
    if (state.mode === "canvas") {
      canvasRenderer.render(state.points, order, active, closeLoop);
    } else if (mapAdapter) {
      mapAdapter.render(state.points, order, active, closeLoop);
    }
  }

  function handleStep(step) {
    state.currentOrder = step.order;
    render(step.order, step.active, step.order.length === state.points.length);
    if (typeof step.length === "number") {
      dom.routeLength.textContent = formatDistance(step.length, state.mode);
      if (step.length < state.bestLength) {
        state.bestLength = step.length;
        dom.bestLength.textContent = formatDistance(state.bestLength, state.mode);
      }
    } else {
      const distanceFn = getDistanceFn(state.mode);
      const isFull = step.order.length === state.points.length;
      const len = isFull ? tourLength(state.points, step.order, distanceFn) : null;
      dom.routeLength.textContent = len !== null ? formatDistance(len, state.mode) : "—";
    }
    dom.stepCounter.textContent = String(controller.stepCount);
    dom.runLog.textContent = step.label || "";
  }

  function handleFinish(step) {
    showToast(step.label || "Algorithm finished");
    if (state.isRunningPipeline) {
      advancePipeline();
    }
  }

  function handleStateChange(newState) {
    dom.playBtn.disabled = newState === "playing" || state.points.length < 3;
    dom.pauseBtn.disabled = newState !== "playing";
    dom.stepBtn.disabled = newState === "playing" || newState === "finished" || state.points.length < 3;
  }

  function showToast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add("visible");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      dom.toast.classList.remove("visible");
    }, 3200);
  }

  /** ---------------- Mode switching ---------------- */
  function setMode(mode) {
    state.mode = mode;
    dom.modeButtons.forEach(function (b) {
      b.classList.toggle("active", b.dataset.mode === mode);
    });
    dom.canvasStage.classList.toggle("hidden", mode !== "canvas");
    dom.mapStage.classList.toggle("hidden", mode !== "map");

    clearPoints();

    if (mode === "map" && !mapAdapter) {
      mapAdapter = new window.MapAdapter("map-stage", { lat: 22.9734, lng: 78.6569 }); // India-centered default
      mapAdapter.onClick(function (latlng) {
        addPoint({ lat: latlng.lat, lng: latlng.lng });
      });
      mapAdapter.whenReady().then(function () {
        mapAdapter.resize();
      });
    } else if (mode === "map" && mapAdapter) {
      setTimeout(function () {
        mapAdapter.resize();
      }, 50);
    }

    dom.chartHint.textContent =
      mode === "canvas"
        ? "Click anywhere to plot a city. Add at least 3 to run an algorithm."
        : "Click anywhere on the map to drop a city pin. Add at least 3 to run an algorithm.";
  }

  /** ---------------- Point management ---------------- */
  function addPoint(point) {
    if (controller.isPlaying) return;
    state.points.push(point);
    recomputeDistanceMatrix();
    dom.cityCount.textContent = String(state.points.length);
    resetRunOnly();
    render([], []);
  }

  function recomputeDistanceMatrix() {
    const distanceFn = getDistanceFn(state.mode);
    state.distanceMatrix = buildDistanceMatrix(state.points, distanceFn);
  }

  function clearPoints() {
    state.points = [];
    state.distanceMatrix = [];
    state.currentOrder = [];
    state.bestLength = Infinity;
    dom.cityCount.textContent = "0";
    resetRunOnly();
    render([], []);
  }

  function resetRunOnly() {
    controller.pause();
    controller.isFinished = true;
    controller.generator = null;
    dom.routeLength.textContent = "—";
    dom.bestLength.textContent = "—";
    dom.stepCounter.textContent = "0";
    dom.runLog.textContent = "";
    handleStateChange("idle");
    state.isRunningPipeline = false;
    state.pipelineIndex = -1;
  }

  function randomizePoints() {
    clearPoints();
    const n = 12;
    if (state.mode === "canvas") {
      const rect = dom.canvas.getBoundingClientRect();
      const margin = 40;
      for (let i = 0; i < n; i++) {
        state.points.push({
          x: margin + Math.random() * (rect.width - margin * 2),
          y: margin + Math.random() * (rect.height - margin * 2),
        });
      }
    } else {
      const center = mapAdapter ? mapAdapter.map.getCenter() : { lat: 22.9734, lng: 78.6569 };
      for (let i = 0; i < n; i++) {
        state.points.push({
          lat: center.lat + (Math.random() - 0.5) * 4,
          lng: center.lng + (Math.random() - 0.5) * 4,
        });
      }
    }
    recomputeDistanceMatrix();
    dom.cityCount.textContent = String(state.points.length);
    render([], []);
    if (state.mode === "map" && mapAdapter) mapAdapter.fitToPoints(state.points);
  }

  /** ---------------- Running a single algorithm ---------------- */
  function getInitialOrderIdentity() {
    return state.points.map(function (_, i) {
      return i;
    });
  }

  function runConstruction(key) {
    if (state.points.length < 3) {
      showToast("Plot at least 3 cities first");
      return;
    }
    const algo = CONSTRUCTION_ALGOS[key];
    controller.load(algo.fn, state.points, state.distanceMatrix, {});
    state.bestLength = Infinity;
    dom.bestLength.textContent = "—";
    controller.play();
  }

  function runImprovement(key) {
    if (state.points.length < 3) {
      showToast("Plot at least 3 cities first");
      return;
    }
    const algo = IMPROVEMENT_ALGOS[key];
    const startOrder =
      state.currentOrder.length === state.points.length ? state.currentOrder : getInitialOrderIdentity();
    controller.load(algo.fn, state.points, state.distanceMatrix, startOrder, { mode: state.mode });
    controller.play();
  }

  /** ---------------- Pipeline (construction -> improvement chain) ---------------- */
  function renderPipelineChain() {
    dom.pipelineChain.innerHTML = "";
    if (state.pipeline.length === 0) {
      dom.pipelineChain.innerHTML =
        '<span class="panel-hint">No steps queued yet — add a construction step, then an improvement step.</span>';
      dom.runPipelineBtn.disabled = true;
      return;
    }
    state.pipeline.forEach(function (step, idx) {
      if (idx > 0) {
        const arrow = document.createElement("span");
        arrow.className = "chain-arrow";
        arrow.textContent = "→";
        dom.pipelineChain.appendChild(arrow);
      }
      const chip = document.createElement("span");
      chip.className = "chain-step" + (step.type === "improvement" ? " is-improvement" : "");
      const registry = step.type === "construction" ? CONSTRUCTION_ALGOS : IMPROVEMENT_ALGOS;
      chip.textContent = registry[step.key].label;
      dom.pipelineChain.appendChild(chip);
    });
    dom.runPipelineBtn.disabled = state.points.length < 3;
  }

  function addToPipeline(type, key) {
    state.pipeline.push({ type: type, key: key });
    renderPipelineChain();
  }

  function runPipeline() {
    if (state.pipeline.length === 0 || state.points.length < 3) return;
    state.isRunningPipeline = true;
    state.pipelineIndex = -1;
    state.bestLength = Infinity;
    dom.bestLength.textContent = "—";
    advancePipeline();
  }

  function advancePipeline() {
    state.pipelineIndex++;
    if (state.pipelineIndex >= state.pipeline.length) {
      state.isRunningPipeline = false;
      showToast("Pipeline complete");
      return;
    }
    const step = state.pipeline[state.pipelineIndex];
    if (step.type === "construction") {
      const algo = CONSTRUCTION_ALGOS[step.key];
      controller.load(algo.fn, state.points, state.distanceMatrix, {});
    } else {
      const algo = IMPROVEMENT_ALGOS[step.key];
      const startOrder =
        state.currentOrder.length === state.points.length ? state.currentOrder : getInitialOrderIdentity();
      controller.load(algo.fn, state.points, state.distanceMatrix, startOrder, { mode: state.mode });
    }
    controller.play();
  }

  function clearPipeline() {
    state.pipeline = [];
    renderPipelineChain();
  }

  /** ---------------- Event wiring ---------------- */
  dom.modeButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      setMode(btn.dataset.mode);
    });
  });

  dom.canvas.addEventListener("click", function (evt) {
    if (state.mode !== "canvas") return;
    addPoint(canvasRenderer.eventToPoint(evt));
  });

  dom.addToPipelineConstruction.addEventListener("click", function () {
    addToPipeline("construction", dom.constructionSelect.value);
  });
  dom.addToPipelineImprovement.addEventListener("click", function () {
    addToPipeline("improvement", dom.improvementSelect.value);
  });

  dom.runPipelineBtn.addEventListener("click", runPipeline);

  document.getElementById("run-construction-only").addEventListener("click", function () {
    runConstruction(dom.constructionSelect.value);
  });
  document.getElementById("run-improvement-only").addEventListener("click", function () {
    runImprovement(dom.improvementSelect.value);
  });

  document.getElementById("clear-pipeline").addEventListener("click", clearPipeline);

  dom.playBtn.addEventListener("click", function () {
    controller.play();
  });
  dom.pauseBtn.addEventListener("click", function () {
    controller.pause();
  });
  dom.stepBtn.addEventListener("click", function () {
    controller.stepOnce();
  });
  dom.resetBtn.addEventListener("click", function () {
    resetRunOnly();
    render([], []);
  });
  dom.clearBtn.addEventListener("click", clearPoints);
  dom.randomBtn.addEventListener("click", randomizePoints);

  dom.speedSlider.addEventListener("input", function () {
    const delay = Number(dom.speedSlider.value);
    controller.setSpeed(delay);
    dom.speedLabel.textContent = delay <= 60 ? "fast" : delay >= 600 ? "slow" : delay + "ms";
  });

  /** ---------------- Init ---------------- */
  setMode("canvas");
  renderPipelineChain();
  controller.setSpeed(Number(dom.speedSlider.value));
  handleStateChange("idle");
})();
