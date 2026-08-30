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
    const worldHeight = config.pivotHeightMeters + 0.32;
    const scale = Math.min(
      (this.cssWidth - margin * 2) / config.canvasWidthMeters,
      (this.cssHeight - margin * 2) / worldHeight,
    );
    const centerX = this.cssWidth / 2;
    const canvasY = this.cssHeight - margin;
    const toScreen = (xMeters: number, yMeters: number): [number, number] => [
      centerX + xMeters * scale,
      canvasY - yMeters * scale,
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

    const canvasLeft = centerX - (config.canvasWidthMeters * scale) / 2;
    ctx.fillStyle = "#f7f3e8";
    ctx.fillRect(canvasLeft, canvasY, config.canvasWidthMeters * scale, 8);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(canvasLeft, canvasY, config.canvasWidthMeters * scale, 8);

    for (const mark of simulation.canvas.marks) {
      const [x, y] = toScreen(mark.xMeters, 0);
      const radius = Math.max(2.5, mark.radiusMeters * scale);
      ctx.fillStyle = mark.color;
      ctx.globalAlpha = 0.82;
      ctx.beginPath();
      ctx.ellipse(x, y + 1, radius * 1.35, radius * 0.44, 0, 0, Math.PI * 2);
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
        Math.max(2, drop.radiusMeters * scale * 0.65),
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
