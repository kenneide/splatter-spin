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

  exportPainting(simulation: Simulation, widthPixels = 4096): Promise<Blob> {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = widthPixels;
    exportCanvas.height = Math.round(
      widthPixels *
        (simulation.config.canvasDepthMeters /
          simulation.config.canvasWidthMeters),
    );
    const context = exportCanvas.getContext("2d");
    if (!context) throw new Error("Canvas export is unavailable.");

    const paper = context.createLinearGradient(0, 0, 0, exportCanvas.height);
    paper.addColorStop(0, "#fffdf6");
    paper.addColorStop(1, "#e8e1d2");
    context.fillStyle = paper;
    context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    const scale = widthPixels / simulation.config.canvasWidthMeters;
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
    simulation: Simulation,
    projectedMarks: readonly PaintMark[] = [],
  ): void {
    const ctx = this.context;
    const { config } = simulation;
    const margin = 34;
    const paintingRegionTop = this.cssHeight * 0.56;
    const paintingAvailableHeight = this.cssHeight - paintingRegionTop - margin;
    const paintingScale = Math.min(
      (this.cssWidth - margin * 2) / config.canvasWidthMeters,
      paintingAvailableHeight / config.canvasDepthMeters,
    );
    const paintingWidth = config.canvasWidthMeters * paintingScale;
    const paintingHeight = config.canvasDepthMeters * paintingScale;
    const paintingLeft = (this.cssWidth - paintingWidth) / 2;
    const paintingTop =
      paintingRegionTop + (paintingAvailableHeight - paintingHeight) / 2;
    const canvasY = paintingRegionTop - 18;
    const worldHeight = config.pivotHeightMeters + 0.32;
    const physicsScale = Math.min(
      (this.cssWidth - margin * 2) / config.canvasWidthMeters,
      (canvasY - margin) / worldHeight,
    );
    const centerX = this.cssWidth / 2;
    const toScreen = (xMeters: number, yMeters: number): [number, number] => [
      centerX + xMeters * physicsScale,
      canvasY - yMeters * physicsScale,
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

    const physicsCanvasWidth = config.canvasWidthMeters * physicsScale;
    const physicsCanvasLeft = centerX - physicsCanvasWidth / 2;
    ctx.fillStyle = "rgba(247, 243, 232, 0.08)";
    ctx.fillRect(physicsCanvasLeft, canvasY - 2, physicsCanvasWidth, 4);

    // The full physical canvas is fitted below at its true width/depth ratio.
    const paperGradient = ctx.createLinearGradient(
      0,
      paintingTop,
      0,
      paintingTop + paintingHeight,
    );
    paperGradient.addColorStop(0, "#fffdf6");
    paperGradient.addColorStop(1, "#e8e1d2");
    ctx.fillStyle = paperGradient;
    ctx.beginPath();
    ctx.roundRect(paintingLeft, paintingTop, paintingWidth, paintingHeight, 8);
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
      simulation.elapsedSeconds === 0 &&
      simulation.canvas.marks.length === 0
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
        `FIRST ${projectedMarks.length} IMPACTS · PROJECTED`,
        paintingLeft + 12,
        paintingTop + paintingHeight - 12,
      );
    }

    this.drawPaintMarks(
      ctx,
      simulation.canvas.marks,
      centerX,
      paintingTop + paintingHeight / 2,
      paintingScale,
      4,
    );

    for (const drop of simulation.drops) {
      const [x, y] = toScreen(drop.position.xMeters, drop.position.yMeters);
      ctx.fillStyle = drop.color;
      ctx.beginPath();
      ctx.arc(
        x,
        y,
        Math.max(1, drop.radiusMeters * physicsScale * 0.28),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    const [pivotX, pivotY] = toScreen(0, config.pivotHeightMeters);
    const bob = simulation.pendulum.bobPosition(config.pivotHeightMeters);
    const [bobX, bobY] = toScreen(bob.xMeters, bob.yMeters);
    const flowFraction = simulation.paintSource.flowFraction;
    if (simulation.status === "running" && flowFraction > 0.08) {
      ctx.strokeStyle = config.paintColor;
      ctx.globalAlpha = 0.35 + flowFraction * 0.45;
      ctx.lineWidth = 1 + flowFraction * 4;
      ctx.beginPath();
      ctx.moveTo(bobX, bobY + 11);
      ctx.lineTo(bobX, bobY + 18 + flowFraction * 55);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = "#d8d4e8";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pivotX, pivotY);
    ctx.lineTo(bobX, bobY);
    ctx.stroke();

    ctx.fillStyle = "#f7f3e8";
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#7c5cff";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.save();
    ctx.translate(bobX, bobY);
    ctx.rotate(-simulation.pendulum.angleRadians);
    ctx.fillStyle = config.paintColor;
    ctx.beginPath();
    ctx.roundRect(-17, -13, 34, 28, 8);
    ctx.fill();
    ctx.fillStyle = "rgba(20, 16, 36, 0.5)";
    ctx.fillRect(-11, -8, 22, 4);
    ctx.restore();
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
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 0.28;
      context.beginPath();
      context.arc(
        x + Math.cos(index * 4.17) * radius * 0.9,
        y + Math.sin(index * 3.31) * radius * 0.8,
        radius * 0.42,
        0,
        Math.PI * 2,
      );
      context.fill();
      context.globalAlpha = 1;
    }
  }
}
