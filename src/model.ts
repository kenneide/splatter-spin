import type { SimulationConfig } from "./config";
import { SeededRandom } from "./random";

export interface Point {
  xMeters: number;
  yMeters: number;
}

export interface Velocity {
  xMetersPerSecond: number;
  yMetersPerSecond: number;
}

export class Pendulum {
  angleRadians: number;
  angularVelocityRadiansPerSecond: number;

  constructor(
    readonly lengthMeters: number,
    readonly dampingPerSecond: number,
    initialAngleRadians: number,
    initialAngularVelocityRadiansPerSecond = 0,
  ) {
    this.angleRadians = initialAngleRadians;
    this.angularVelocityRadiansPerSecond =
      initialAngularVelocityRadiansPerSecond;
  }

  step(dtSeconds: number, gravityMetersPerSecondSquared: number): void {
    // θ'' = -(g/L)sin(θ) - cθ'. Semi-implicit Euler remains stable at small fixed dt.
    const angularAcceleration =
      -(gravityMetersPerSecondSquared / this.lengthMeters) *
        Math.sin(this.angleRadians) -
      this.dampingPerSecond * this.angularVelocityRadiansPerSecond;
    this.angularVelocityRadiansPerSecond += angularAcceleration * dtSeconds;
    this.angleRadians += this.angularVelocityRadiansPerSecond * dtSeconds;
  }

  bobPosition(pivotHeightMeters: number): Point {
    return {
      xMeters: this.lengthMeters * Math.sin(this.angleRadians),
      yMeters:
        pivotHeightMeters - this.lengthMeters * Math.cos(this.angleRadians),
    };
  }

  bobVelocity(): Velocity {
    return {
      xMetersPerSecond:
        this.lengthMeters *
        Math.cos(this.angleRadians) *
        this.angularVelocityRadiansPerSecond,
      yMetersPerSecond:
        this.lengthMeters *
        Math.sin(this.angleRadians) *
        this.angularVelocityRadiansPerSecond,
    };
  }
}

export interface PaintMark {
  xMeters: number;
  radiusMeters: number;
  color: string;
}

export class PaintCanvas {
  readonly marks: PaintMark[] = [];

  constructor(readonly widthMeters: number) {}

  addMark(mark: PaintMark): void {
    if (Math.abs(mark.xMeters) <= this.widthMeters / 2) this.marks.push(mark);
  }
}

export interface DropImpact {
  xMeters: number;
  timeSeconds: number;
}

export class PaintDrop {
  constructor(
    public position: Point,
    public velocity: Velocity,
    readonly radiusMeters: number,
    readonly color: string,
    readonly landingScatterMeters: number,
  ) {}

  timeUntilCanvasImpact(gravityMetersPerSecondSquared: number): number | null {
    const { yMeters } = this.position;
    if (yMeters <= 0) return 0;
    const verticalVelocity = this.velocity.yMetersPerSecond;
    const discriminant =
      verticalVelocity * verticalVelocity +
      2 * gravityMetersPerSecondSquared * yMeters;
    if (discriminant < 0) return null;
    return (
      (verticalVelocity + Math.sqrt(discriminant)) /
      gravityMetersPerSecondSquared
    );
  }

  impactWithin(
    dtSeconds: number,
    gravityMetersPerSecondSquared: number,
  ): DropImpact | null {
    const impactTime = this.timeUntilCanvasImpact(
      gravityMetersPerSecondSquared,
    );
    if (impactTime === null || impactTime > dtSeconds) return null;
    return {
      xMeters:
        this.position.xMeters +
        this.velocity.xMetersPerSecond * impactTime +
        this.landingScatterMeters,
      timeSeconds: impactTime,
    };
  }

  step(dtSeconds: number, gravityMetersPerSecondSquared: number): void {
    // Exact constant-acceleration position update avoids display-rate-dependent trajectories.
    this.position = {
      xMeters:
        this.position.xMeters + this.velocity.xMetersPerSecond * dtSeconds,
      yMeters:
        this.position.yMeters +
        this.velocity.yMetersPerSecond * dtSeconds -
        0.5 * gravityMetersPerSecondSquared * dtSeconds * dtSeconds,
    };
    this.velocity = {
      xMetersPerSecond: this.velocity.xMetersPerSecond,
      yMetersPerSecond:
        this.velocity.yMetersPerSecond -
        gravityMetersPerSecondSquared * dtSeconds,
    };
  }
}

export class PaintSource {
  private secondsUntilNextDrop = 0;

  constructor(
    private readonly config: SimulationConfig,
    private readonly random: SeededRandom,
  ) {}

  emitForStep(dtSeconds: number, pendulum: Pendulum): PaintDrop[] {
    const emitted: PaintDrop[] = [];
    this.secondsUntilNextDrop -= dtSeconds;
    const intervalSeconds = 1 / this.config.dropsPerSecond;
    while (this.secondsUntilNextDrop <= 1e-12) {
      const sizeFactor =
        1 + this.random.signed() * 0.35 * this.config.randomness;
      const scatter =
        this.random.signed() *
        this.config.maximumScatterMeters *
        this.config.randomness;
      const bobPosition = pendulum.bobPosition(this.config.pivotHeightMeters);
      emitted.push(
        new PaintDrop(
          { ...bobPosition },
          {
            xMetersPerSecond: pendulum.bobVelocity().xMetersPerSecond,
            yMetersPerSecond: 0,
          },
          this.config.baseDropRadiusMeters * sizeFactor,
          this.config.paintColor,
          scatter,
        ),
      );
      this.secondsUntilNextDrop += intervalSeconds;
    }
    return emitted;
  }
}

export type SimulationStatus = "paused" | "running" | "complete";

export class Simulation {
  readonly config: SimulationConfig;
  readonly pendulum: Pendulum;
  readonly paintSource: PaintSource;
  readonly canvas: PaintCanvas;
  readonly drops: PaintDrop[] = [];
  elapsedSeconds = 0;
  status: SimulationStatus = "paused";

  constructor(config: SimulationConfig) {
    this.config = structuredClone(config);
    this.pendulum = new Pendulum(
      config.pendulumLengthMeters,
      config.dampingPerSecond,
      (config.initialAngleDegrees * Math.PI) / 180,
    );
    this.paintSource = new PaintSource(
      this.config,
      new SeededRandom(config.seed),
    );
    this.canvas = new PaintCanvas(config.canvasWidthMeters);
  }

  start(): void {
    if (this.status !== "complete") this.status = "running";
  }

  pause(): void {
    if (this.status === "running") this.status = "paused";
  }

  step(): void {
    if (this.status !== "running") return;
    const remainingEmissionSeconds =
      this.config.durationSeconds - this.elapsedSeconds;
    const dt =
      remainingEmissionSeconds > 0
        ? Math.min(this.config.fixedTimeStepSeconds, remainingEmissionSeconds)
        : this.config.fixedTimeStepSeconds;

    if (remainingEmissionSeconds > 0) {
      this.pendulum.step(dt, this.config.gravityMetersPerSecondSquared);
      this.drops.push(...this.paintSource.emitForStep(dt, this.pendulum));
      this.elapsedSeconds += dt;
    }

    for (let index = this.drops.length - 1; index >= 0; index -= 1) {
      const drop = this.drops[index];
      const impact = drop.impactWithin(
        dt,
        this.config.gravityMetersPerSecondSquared,
      );
      if (impact) {
        this.canvas.addMark({
          xMeters: impact.xMeters,
          radiusMeters: drop.radiusMeters,
          color: drop.color,
        });
        this.drops.splice(index, 1);
      } else {
        drop.step(dt, this.config.gravityMetersPerSecondSquared);
      }
    }

    if (
      this.elapsedSeconds >= this.config.durationSeconds - 1e-12 &&
      this.drops.length === 0
    )
      this.status = "complete";
  }
}
