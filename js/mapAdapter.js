/**
 * mapAdapter.js
 * -------------
 * Wraps a MapLibre GL JS map using OpenFreeMap vector tiles (rendered from
 * OpenStreetMap data) and exposes a drawing interface that mirrors
 * canvasRenderer.js as closely as possible, so controller.js and main.js
 * don't need to know which mode is active.
 *
 * OpenFreeMap: https://openfreemap.org/  (free vector tiles, no API key)
 * Style used: https://tiles.openfreemap.org/styles/liberty
 * Underlying data: https://www.openstreetmap.org/
 *
 * Cities are stored as {lat, lng} and drawn using MapLibre's GeoJSON
 * source/layer system (a "tour-line" line layer + a "tour-points" circle
 * layer), which is far cheaper than re-creating DOM markers every frame.
 */

class MapAdapter {
  /**
   * @param {string} containerId  DOM id of the map's container div
   * @param {{lat:number,lng:number}} initialCenter
   */
  constructor(containerId, initialCenter = { lat: 20.5937, lng: 78.9629 }) {
    this.containerId = containerId;
    this.map = new maplibregl.Map({
      container: containerId,
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [initialCenter.lng, initialCenter.lat],
      zoom: 4,
      attributionControl: true,
    });

    this.map.addControl(new maplibregl.NavigationControl(), "top-right");
    this._ready = new Promise((resolve) => {
      this.map.on("load", () => {
        this._initLayers();
        resolve();
      });
    });
  }

  whenReady() {
    return this._ready;
  }

  _initLayers() {
    this.map.addSource("tour-line", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    this.map.addSource("active-line", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    this.map.addSource("tour-points", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });

    this.map.addLayer({
      id: "tour-line-layer",
      type: "line",
      source: "tour-line",
      paint: {
        "line-color": ["case", ["get", "isFullTour"], "#e8a33d", "#3e7c7c"],
        "line-width": 3,
      },
    });

    this.map.addLayer({
      id: "active-line-layer",
      type: "line",
      source: "active-line",
      paint: {
        "line-color": "#e0573f",
        "line-width": 3.5,
        "line-dasharray": [1.4, 1.2],
      },
    });

    this.map.addLayer({
      id: "tour-points-layer",
      type: "circle",
      source: "tour-points",
      paint: {
        "circle-radius": ["case", ["get", "isActive"], 8, 6],
        "circle-color": ["case", ["get", "isActive"], "#e0573f", "#f2efe4"],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#0e1525",
      },
    });

    this.map.addLayer({
      id: "tour-points-label",
      type: "symbol",
      source: "tour-points",
      layout: {
        "text-field": ["get", "label"],
        "text-size": 11,
        "text-offset": [0, -1.4],
        "text-font": ["Noto Sans Regular"],
      },
      paint: {
        "text-color": "#aab4c8",
        "text-halo-color": "#0e1525",
        "text-halo-width": 1,
      },
    });
  }

  /** Registers a click handler that receives {lat, lng}. */
  onClick(handler) {
    this.map.on("click", (e) => {
      handler({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
  }

  /** Pans/zooms to fit all current points. */
  fitToPoints(points) {
    if (points.length === 0) return;
    if (points.length === 1) {
      this.map.flyTo({ center: [points[0].lng, points[0].lat], zoom: 12 });
      return;
    }
    const lngs = points.map((p) => p.lng);
    const lats = points.map((p) => p.lat);
    const bounds = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ];
    this.map.fitBounds(bounds, { padding: 60, duration: 600 });
  }

  /**
   * Same render contract as CanvasRenderer.render, but for the map.
   * @param {Array<{lat:number,lng:number}>} points
   * @param {number[]} order
   * @param {number[]} activeIndices
   * @param {boolean} closeLoop
   */
  render(points, order, activeIndices = [], closeLoop = true) {
    if (!this.map.getSource("tour-points")) return; // not ready yet

    // Points layer
    const pointFeatures = points.map((p, idx) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { label: String(idx), isActive: activeIndices.includes(idx) },
    }));
    this.map.getSource("tour-points").setData({ type: "FeatureCollection", features: pointFeatures });

    // Tour line
    let lineFeatures = [];
    if (order.length > 1) {
      const isFullTour = order.length === points.length;
      const segmentCount = closeLoop && isFullTour ? order.length : order.length - 1;
      const coords = [];
      for (let i = 0; i <= segmentCount; i++) {
        const p = points[order[i % order.length]];
        coords.push([p.lng, p.lat]);
      }
      lineFeatures.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: { isFullTour },
      });
    }
    this.map.getSource("tour-line").setData({ type: "FeatureCollection", features: lineFeatures });

    // Active/highlighted edges
    let activeFeatures = [];
    for (let i = 0; i < activeIndices.length - 1; i += 2) {
      const a = points[activeIndices[i]];
      const b = points[activeIndices[i + 1]];
      if (!a || !b) continue;
      activeFeatures.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[a.lng, a.lat], [b.lng, b.lat]] },
        properties: {},
      });
    }
    this.map.getSource("active-line").setData({ type: "FeatureCollection", features: activeFeatures });
  }

  resize() {
    this.map.resize();
  }
}

window.MapAdapter = MapAdapter;
