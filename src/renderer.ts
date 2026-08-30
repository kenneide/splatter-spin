import type { Simulation } from "./model";

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

  render(simulation: Simulation): void {
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

    for (const [index, mark] of simulation.canvas.marks.entries()) {
      const x = centerX + mark.xMeters * paintingScale;
      const radius = Math.max(4, mark.radiusMeters * paintingScale * 1.9);
      const paintY =
        paintingTop + paintingHeight / 2 + mark.zMeters * paintingScale;
      ctx.fillStyle = mark.color;
      ctx.globalAlpha = 0.68;
      ctx.beginPath();
      ctx.arc(x, paintY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.arc(
        x + Math.cos(index * 4.17) * radius * 0.9,
        paintY + Math.sin(index * 3.31) * radius * 0.8,
        radius * 0.42,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    for (const drop of simulation.drops) {
      const [x, y] = toScreen(drop.position.xMeters, drop.position.yMeters);
      ctx.fillStyle = drop.color;
      ctx.beginPath();
      ctx.arc(
        x,
        y,
        Math.max(2, drop.radiusMeters * physicsScale * 0.65),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    const [pivotX, pivotY] = toScreen(0, config.pivotHeightMeters);
    const bob = simulation.pendulum.bobPosition(config.pivotHeightMeters);
    const [bobX, bobY] = toScreen(bob.xMeters, bob.yMeters);
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
}
