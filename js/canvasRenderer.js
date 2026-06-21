/**
 * canvasRenderer.js
 * -----------------
 * Handles all drawing for "blank canvas" mode: plotting points, drawing
 * the current tour, highlighting the edges/cities an algorithm is
 * currently considering, and converting click coordinates to point space.
 *
 * Map mode rendering lives in mapAdapter.js — this file only ever touches
 * a plain 2D <canvas> element.
 */

class CanvasRenderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.resizeToParent();
    window.addEventListener("resize", () => this.resizeToParent());
  }

  resizeToParent() {
    const parent = this.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const rect = parent.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = rect.width;
    this.height = rect.height;
  }

  /** Converts a mouse/click event into canvas-space {x, y}. */
  eventToPoint(evt) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top,
    };
  }

  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  /**
   * Draws everything for one frame.
   * @param {Array<{x:number,y:number}>} points
   * @param {number[]} order  current tour order (city indices), may be partial
   * @param {number[]} activeIndices  point indices to highlight (city ids, not order positions)
   * @param {boolean} closeLoop  whether to draw the closing edge back to start
   */
  render(points, order, activeIndices = [], closeLoop = true) {
    this.clear();
    const style = getComputedStyle(document.documentElement);
    const tourColor = style.getPropertyValue("--color-route").trim();
    const constructionColor = style.getPropertyValue("--color-construction").trim();
    const nodeColor = style.getPropertyValue("--color-node").trim();
    const activeColor = style.getPropertyValue("--color-active").trim();
    const labelColor = style.getPropertyValue("--color-text-dim").trim();

    // Draw tour edges
    if (order.length > 1) {
      this.ctx.beginPath();
      this.ctx.lineWidth = 2.4;
      this.ctx.strokeStyle = order.length === points.length ? tourColor : constructionColor;
      this.ctx.lineCap = "round";
      this.ctx.lineJoin = "round";

      const segmentCount = closeLoop && order.length === points.length ? order.length : order.length - 1;
      this.ctx.moveTo(points[order[0]].x, points[order[0]].y);
      for (let i = 1; i <= segmentCount; i++) {
        const p = points[order[i % order.length]];
        this.ctx.lineTo(p.x, p.y);
      }
      this.ctx.stroke();
    }

    // Highlight active edges (the ones the algorithm is currently comparing)
    if (activeIndices.length >= 2) {
      this.ctx.save();
      this.ctx.strokeStyle = activeColor;
      this.ctx.lineWidth = 3.2;
      this.ctx.setLineDash([6, 4]);
      for (let i = 0; i < activeIndices.length - 1; i += 2) {
        const a = points[activeIndices[i]];
        const b = points[activeIndices[i + 1]];
        if (!a || !b) continue;
        this.ctx.beginPath();
        this.ctx.moveTo(a.x, a.y);
        this.ctx.lineTo(b.x, b.y);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    // Draw nodes
    points.forEach((p, idx) => {
      const isActive = activeIndices.includes(idx);
      const radius = isActive ? 7 : 5.5;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      this.ctx.fillStyle = isActive ? activeColor : nodeColor;
      this.ctx.fill();
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeStyle = "rgba(14, 21, 37, 0.6)";
      this.ctx.stroke();
    });

    // Index labels (small, only if not too crowded)
    if (points.length <= 60) {
      this.ctx.font = "10px 'IBM Plex Mono', monospace";
      this.ctx.fillStyle = labelColor;
      points.forEach((p, idx) => {
        this.ctx.fillText(String(idx), p.x + 8, p.y - 8);
      });
    }
  }
}

window.CanvasRenderer = CanvasRenderer;
