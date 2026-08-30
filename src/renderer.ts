import type { CanvasConfig } from "./config";
import type { PaintMark, Simulation } from "./model";

export class Renderer {
  private readonly context: CanvasRenderingContext2D;
  private cssWidth = 0;
  private cssHeight = 0;

  constructor(private readonly element: HTMLCanvasElement) {
    const context = element.getContext("2d");
    if (!context) throw new Error("Canvas 2D rendering is unavailable.");
    this.context = context;
  }

  resize(): void {
    const bounds = this.element.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.cssWidth = Math.max(1, bounds.width);
    this.cssHeight = Math.max(1, bounds.height);
    const width = Math.round(this.cssWidth * pixelRatio);
    const height = Math.round(this.cssHeight * pixelRatio);
    if (this.element.width !== width || this.element.height !== height) {
      this.element.width = width;
      this.element.height = height;
    }
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  exportPainting(
    simulations: readonly Simulation[],
    canvasConfig: CanvasConfig,
    widthPixels = 4096,
  ): Promise<Blob> {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = widthPixels;
    exportCanvas.height = Math.round(
      widthPixels * (canvasConfig.depthMeters / canvasConfig.widthMeters),
    );
    const context = exportCanvas.getContext("2d");
    if (!context) throw new Error("Canvas export is unavailable.");

    context.fillStyle = canvasConfig.color;
    context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    const scale = widthPixels / canvasConfig.widthMeters;
    for (const simulation of simulations)
      this.drawPaintMarks(
        context,
        simulation.canvas.marks,
        exportCanvas.width / 2,
        exportCanvas.height / 2,
        scale,
        2,
      );

    return new Promise((resolve, reject) => {
      exportCanvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The browser could not encode the artwork."));
      }, "image/png");
    });
  }

  render(
    simulations: readonly Simulation[],
    canvasConfig: CanvasConfig,
    projectedMarks: readonly PaintMark[] = [],
    projectionHorizonSeconds = 10,
  ): void {
    const simulation = simulations[0];
    if (!simulation) return;
    const ctx = this.context;
    const margin = 34;
    const paintingRegionTop = this.cssHeight * 0.56;
    const paintingAvailableHeight = this.cssHeight - paintingRegionTop - margin;
    const paintingScale = Math.min(
      (this.cssWidth - margin * 2) / canvasConfig.widthMeters,
      paintingAvailableHeight / canvasConfig.depthMeters,
    );
    const paintingWidth = canvasConfig.widthMeters * paintingScale;
    const paintingHeight = canvasConfig.depthMeters * paintingScale;
    const paintingLeft = (this.cssWidth - paintingWidth) / 2;
    const paintingTop =
      paintingRegionTop + (paintingAvailableHeight - paintingHeight) / 2;
    const canvasY = paintingRegionTop - 18;
    const worldHeight =
      Math.max(
        ...simulations.map(
          (item) =>
            item.config.pivotHeightMeters + item.config.pivotOffsetHeightMeters,
        ),
      ) + 0.32;
    const physicsScale = Math.min(
      (this.cssWidth - margin * 2) / canvasConfig.widthMeters,
      (canvasY - margin) / worldHeight,
    );
    const centerX = this.cssWidth / 2;
    const toScreen = (
      xMeters: number,
      yMeters: number,
      zMeters = 0,
    ): [number, number] => [
      centerX + (xMeters + zMeters * 0.28) * physicsScale,
      canvasY - yMeters * physicsScale + zMeters * 0.12 * physicsScale,
    ];

    ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);

    const glow = ctx.createRadialGradient(
      centerX,
      canvasY * 0.42,
      10,
      centerX,
      canvasY * 0.42,
      this.cssWidth * 0.7,
    );
    glow.addColorStop(0, "rgba(124, 92, 255, 0.10)");
    glow.addColorStop(1, "rgba(124, 92, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    const canvasCorners = [
      toScreen(-canvasConfig.widthMeters / 2, 0, -canvasConfig.depthMeters / 2),
      toScreen(canvasConfig.widthMeters / 2, 0, -canvasConfig.depthMeters / 2),
      toScreen(canvasConfig.widthMeters / 2, 0, canvasConfig.depthMeters / 2),
      toScreen(-canvasConfig.widthMeters / 2, 0, canvasConfig.depthMeters / 2),
    ];
    ctx.fillStyle = "rgba(247, 243, 232, 0.08)";
    ctx.strokeStyle = "rgba(247, 243, 232, 0.18)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([2, 7]);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(...canvasCorners[0]);
    for (const corner of canvasCorners.slice(1)) ctx.lineTo(...corner);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);

    // The full physical canvas is fitted below at its true width/depth ratio.
    ctx.fillStyle = canvasConfig.color;
    ctx.beginPath();
    roundedRectPath(
      ctx,
      paintingLeft,
      paintingTop,
      paintingWidth,
      paintingHeight,
      8,
    );
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "rgba(36, 30, 47, 0.48)";
    ctx.font = "600 9px Inter, sans-serif";
    ctx.letterSpacing = "0.12em";
    ctx.fillText(
      "PAINTING SURFACE · TOP VIEW",
      paintingLeft + 12,
      paintingTop + 17,
    );

    if (
      simulations.every(
        (item) => item.elapsedSeconds === 0 && item.canvas.marks.length === 0,
      )
    ) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1.25;
      ctx.setLineDash([3, 3]);
      for (const mark of projectedMarks) {
        ctx.strokeStyle = mark.color;
        const x = centerX + mark.xMeters * paintingScale;
        const y =
          paintingTop + paintingHeight / 2 + mark.zMeters * paintingScale;
        const radius = Math.max(3, mark.radiusMeters * paintingScale * 1.15);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      ctx.fillStyle = "rgba(36, 30, 47, 0.42)";
      ctx.font = "500 9px Inter, sans-serif";
      ctx.letterSpacing = "0.04em";
      ctx.fillText(
        `NEXT ${projectionHorizonSeconds.toFixed(0)}s · ${projectedMarks.length} SAMPLED IMPACTS`,
        paintingLeft + 12,
        paintingTop + paintingHeight - 12,
      );
    }

    for (const item of simulations)
      this.drawPaintMarks(
        ctx,
        item.canvas.marks,
        centerX,
        paintingTop + paintingHeight / 2,
        paintingScale,
        4,
      );

    for (const item of simulations)
      for (const drop of item.drops) {
        const [x, y] = toScreen(
          drop.position.xMeters,
          drop.position.yMeters,
          drop.position.zMeters,
        );
        ctx.fillStyle = drop.color;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        drawBlob(
          ctx,
          x,
          y,
          Math.max(1, drop.radiusMeters * physicsScale * 0.28),
          hashValues(
            drop.position.xMeters,
            drop.position.yMeters,
            drop.position.zMeters,
          ),
          7,
        );
        ctx.fill();
        ctx.globalAlpha = 1;
      }

    for (const item of simulations) {
      const [pivotX, pivotY] = toScreen(
        item.config.pivotOffsetXMeters,
        item.config.pivotHeightMeters + item.config.pivotOffsetHeightMeters,
        item.config.pivotOffsetZMeters,
      );
      const bob = item.pendulum.bobPosition(
        item.config.pivotHeightMeters + item.config.pivotOffsetHeightMeters,
      );
      const [bobX, bobY] = toScreen(
        bob.xMeters + item.config.pivotOffsetXMeters,
        bob.yMeters,
        bob.zMeters + item.config.pivotOffsetZMeters,
      );
      const flowFraction = item.paintSource.flowFraction;
      if (item.status === "running" && flowFraction > 0.08) {
        ctx.strokeStyle = item.config.paintColor;
        ctx.globalAlpha = 0.35 + flowFraction * 0.45;
        ctx.lineWidth = 1 + flowFraction * 4;
        ctx.beginPath();
        ctx.moveTo(bobX, bobY + 11);
        ctx.lineTo(bobX, bobY + 18 + flowFraction * 55);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = "#d8d4e8";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(pivotX, pivotY);
      ctx.lineTo(bobX, bobY);
      ctx.stroke();
      ctx.save();
      ctx.translate(bobX, bobY);
      ctx.rotate(-item.pendulum.angleRadians);
      ctx.fillStyle = item.config.paintColor;
      ctx.beginPath();
      roundedRectPath(ctx, -14, -11, 28, 23, 7);
      ctx.fill();
      ctx.fillStyle = "rgba(20, 16, 36, 0.5)";
      ctx.fillRect(-9, -7, 18, 3);
      ctx.restore();
      ctx.fillStyle = "#f7f3e8";
      ctx.beginPath();
      ctx.arc(pivotX, pivotY, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = item.config.paintColor;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  private drawPaintMarks(
    context: CanvasRenderingContext2D,
    marks: readonly PaintMark[],
    centerX: number,
    centerY: number,
    scale: number,
    minimumRadiusPixels: number,
  ): void {
    for (const [index, mark] of marks.entries()) {
      const x = centerX + mark.xMeters * scale;
      const y = centerY + mark.zMeters * scale;
      const radius = Math.max(
        minimumRadiusPixels,
        mark.radiusMeters * scale * 1.9,
      );
      context.fillStyle = mark.color;
      context.globalAlpha = 0.68;
      context.beginPath();
      drawBlob(
        context,
        x,
        y,
        radius,
        hashValues(index, mark.xMeters, mark.zMeters, mark.radiusMeters),
        9,
      );
      context.fill();
      context.globalAlpha = 0.28;
      context.beginPath();
      drawBlob(
        context,
        x + Math.cos(index * 4.17) * radius * 0.9,
        y + Math.sin(index * 3.31) * radius * 0.8,
        radius * 0.42,
        hashValues(index, mark.zMeters, mark.xMeters),
        7,
      );
      context.fill();
      context.globalAlpha = 1;
    }
  }
}

/** Draw a smoothly connected, deterministic irregular blob around a center. */
function drawBlob(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  seed: number,
  vertexCount: number,
): void {
  const points = Array.from({ length: vertexCount }, (_, index) => {
    const angle = (index / vertexCount) * Math.PI * 2;
    const variation = 0.78 + pseudoRandom(seed + index * 2654435761) * 0.4;
    return {
      x: centerX + Math.cos(angle) * radius * variation,
      y: centerY + Math.sin(angle) * radius * variation,
    };
  });
  const midpoint = (
    first: { x: number; y: number },
    second: { x: number; y: number },
  ) => ({
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  });
  const start = midpoint(points[vertexCount - 1], points[0]);
  context.moveTo(start.x, start.y);
  for (let index = 0; index < vertexCount; index += 1) {
    const next = points[(index + 1) % vertexCount];
    const end = midpoint(points[index], next);
    context.quadraticCurveTo(points[index].x, points[index].y, end.x, end.y);
  }
  context.closePath();
}

function hashValues(...values: number[]): number {
  let hash = 2166136261;
  for (const value of values) {
    hash ^= Math.round(value * 100_000);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pseudoRandom(value: number): number {
  let state = value >>> 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 4_294_967_296;
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  // roundRect is unavailable in older Safari releases; use equivalent arcs.
  if (typeof context.roundRect === "function") {
    context.roundRect(x, y, width, height, radius);
    return;
  }
  const corner = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  context.moveTo(x + corner, y);
  context.lineTo(x + width - corner, y);
  context.arcTo(x + width, y, x + width, y + corner, corner);
  context.lineTo(x + width, y + height - corner);
  context.arcTo(x + width, y + height, x + width - corner, y + height, corner);
  context.lineTo(x + corner, y + height);
  context.arcTo(x, y + height, x, y + height - corner, corner);
  context.lineTo(x, y + corner);
  context.arcTo(x, y, x + corner, y, corner);
  context.closePath();
}
