import type { SimulationConfig } from "./config";
import { SeededRandom } from "./random";

export interface Point {
  xMeters: number;
  yMeters: number;
  zMeters: number;
}

export interface Velocity {
  xMetersPerSecond: number;
  yMetersPerSecond: number;
  zMetersPerSecond: number;
}

export class Pendulum {
  private armDirection: Vector3;
  private directionVelocityPerSecond: Vector3;

  constructor(
    readonly lengthMeters: number,
    readonly dampingPerSecond: number,
    initialAngleRadians: number,
    initialAngularVelocityRadiansPerSecond = 0,
    initialAzimuthRadians = 0,
    initialAzimuthalVelocityRadiansPerSecond = 0,
  ) {
    const sine = Math.sin(initialAngleRadians);
    const cosine = Math.cos(initialAngleRadians);
    const sinAzimuth = Math.sin(initialAzimuthRadians);
    const cosAzimuth = Math.cos(initialAzimuthRadians);
    this.armDirection = {
      x: sine * cosAzimuth,
      y: cosine,
      z: sine * sinAzimuth,
    };
    this.directionVelocityPerSecond = {
      x:
        cosine * initialAngularVelocityRadiansPerSecond * cosAzimuth -
        sine * sinAzimuth * initialAzimuthalVelocityRadiansPerSecond,
      y: -sine * initialAngularVelocityRadiansPerSecond,
      z:
        cosine * initialAngularVelocityRadiansPerSecond * sinAzimuth +
        sine * cosAzimuth * initialAzimuthalVelocityRadiansPerSecond,
    };
  }

  step(dtSeconds: number, gravityMetersPerSecondSquared: number): void {
    const gravityScale = gravityMetersPerSecondSquared / this.lengthMeters;
    const acceleration = (direction: Vector3, velocity: Vector3): Vector3 =>
      constrainedAcceleration(
        direction,
        velocity,
        gravityScale,
        this.dampingPerSecond,
      );

    // Fixed-step RK4 limits long-run energy drift while remaining deterministic.
    const k1Direction = this.directionVelocityPerSecond;
    const k1Velocity = acceleration(
      this.armDirection,
      this.directionVelocityPerSecond,
    );
    const k2Direction = addScaled(
      this.directionVelocityPerSecond,
      k1Velocity,
      dtSeconds / 2,
    );
    const k2Velocity = acceleration(
      addScaled(this.armDirection, k1Direction, dtSeconds / 2),
      k2Direction,
    );
    const k3Direction = addScaled(
      this.directionVelocityPerSecond,
      k2Velocity,
      dtSeconds / 2,
    );
    const k3Velocity = acceleration(
      addScaled(this.armDirection, k2Direction, dtSeconds / 2),
      k3Direction,
    );
    const k4Direction = addScaled(
      this.directionVelocityPerSecond,
      k3Velocity,
      dtSeconds,
    );
    const k4Velocity = acceleration(
      addScaled(this.armDirection, k3Direction, dtSeconds),
      k4Direction,
    );

    this.armDirection = normalize(
      addRungeKutta(
        this.armDirection,
        k1Direction,
        k2Direction,
        k3Direction,
        k4Direction,
        dtSeconds,
      ),
    );
    const nextVelocity = addRungeKutta(
      this.directionVelocityPerSecond,
      k1Velocity,
      k2Velocity,
      k3Velocity,
      k4Velocity,
      dtSeconds,
    );
    // Projection removes radial drift introduced by numerical integration.
    this.directionVelocityPerSecond = subtractScaled(
      nextVelocity,
      this.armDirection,
      dot(nextVelocity, this.armDirection),
    );
  }

  get angleRadians(): number {
    return Math.acos(Math.max(-1, Math.min(1, this.armDirection.y)));
  }

  get azimuthRadians(): number {
    return Math.atan2(this.armDirection.z, this.armDirection.x);
  }

  get angularVelocityRadiansPerSecond(): number {
    const azimuth = this.azimuthRadians;
    const inclinationDirection: Vector3 = {
      x: Math.cos(this.angleRadians) * Math.cos(azimuth),
      y: -Math.sin(this.angleRadians),
      z: Math.cos(this.angleRadians) * Math.sin(azimuth),
    };
    return dot(this.directionVelocityPerSecond, inclinationDirection);
  }

  get azimuthalVelocityRadiansPerSecond(): number {
    const sine = Math.sin(this.angleRadians);
    if (Math.abs(sine) < 1e-8) return 0;
    const azimuth = this.azimuthRadians;
    return (
      (-Math.sin(azimuth) * this.directionVelocityPerSecond.x +
        Math.cos(azimuth) * this.directionVelocityPerSecond.z) /
      sine
    );
  }

  specificMechanicalEnergy(gravityMetersPerSecondSquared: number): number {
    return (
      0.5 *
        this.lengthMeters ** 2 *
        dot(this.directionVelocityPerSecond, this.directionVelocityPerSecond) +
      gravityMetersPerSecondSquared *
        this.lengthMeters *
        (1 - this.armDirection.y)
    );
  }

  bobPosition(pivotHeightMeters: number): Point {
    return {
      xMeters: this.lengthMeters * this.armDirection.x,
      yMeters: pivotHeightMeters - this.lengthMeters * this.armDirection.y,
      zMeters: this.lengthMeters * this.armDirection.z,
    };
  }

  bobVelocity(): Velocity {
    return {
      xMetersPerSecond: this.lengthMeters * this.directionVelocityPerSecond.x,
      yMetersPerSecond: -this.lengthMeters * this.directionVelocityPerSecond.y,
      zMetersPerSecond: this.lengthMeters * this.directionVelocityPerSecond.z,
    };
  }
}

interface Vector3 {
  x: number;
  y: number;
  z: number;
}

function dot(left: Vector3, right: Vector3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function addScaled(vector: Vector3, delta: Vector3, scale: number): Vector3 {
  return {
    x: vector.x + delta.x * scale,
    y: vector.y + delta.y * scale,
    z: vector.z + delta.z * scale,
  };
}

function addRungeKutta(
  value: Vector3,
  k1: Vector3,
  k2: Vector3,
  k3: Vector3,
  k4: Vector3,
  dtSeconds: number,
): Vector3 {
  const scale = dtSeconds / 6;
  return {
    x: value.x + scale * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
    y: value.y + scale * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
    z: value.z + scale * (k1.z + 2 * k2.z + 2 * k3.z + k4.z),
  };
}

function constrainedAcceleration(
  direction: Vector3,
  velocity: Vector3,
  gravityScale: number,
  dampingPerSecond: number,
): Vector3 {
  const speedSquared = dot(velocity, velocity);
  // Tangential gravity drives the swing; -|q'|²q supplies centripetal
  // acceleration for unit direction q. This form has no pole singularity.
  return {
    x:
      -gravityScale * direction.y * direction.x -
      dampingPerSecond * velocity.x -
      speedSquared * direction.x,
    y:
      gravityScale * (1 - direction.y * direction.y) -
      dampingPerSecond * velocity.y -
      speedSquared * direction.y,
    z:
      -gravityScale * direction.y * direction.z -
      dampingPerSecond * velocity.z -
      speedSquared * direction.z,
  };
}

function subtractScaled(
  vector: Vector3,
  direction: Vector3,
  scale: number,
): Vector3 {
  return {
    x: vector.x - direction.x * scale,
    y: vector.y - direction.y * scale,
    z: vector.z - direction.z * scale,
  };
}

function normalize(vector: Vector3): Vector3 {
  const length = Math.sqrt(dot(vector, vector));
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

export interface PaintMark {
  xMeters: number;
  zMeters: number;
  radiusMeters: number;
  color: string;
}

export interface PaintStroke {
  x1Meters: number;
  z1Meters: number;
  x2Meters: number;
  z2Meters: number;
  widthMeters: number;
  color: string;
}

export class PaintCanvas {
  readonly marks: PaintMark[] = [];
  readonly strokes: PaintStroke[] = [];

  constructor(
    readonly widthMeters: number,
    readonly depthMeters: number,
  ) {}

  addMark(mark: PaintMark): void {
    if (
      Math.abs(mark.xMeters) <= this.widthMeters / 2 &&
      Math.abs(mark.zMeters) <= this.depthMeters / 2
    ) {
      this.marks.push(mark);
    }
  }

  addStroke(stroke: PaintStroke): void {
    const endpointInside = (xMeters: number, zMeters: number) =>
      Math.abs(xMeters) <= this.widthMeters / 2 &&
      Math.abs(zMeters) <= this.depthMeters / 2;
    if (
      endpointInside(stroke.x1Meters, stroke.z1Meters) ||
      endpointInside(stroke.x2Meters, stroke.z2Meters)
    ) {
      this.strokes.push(stroke);
    }
  }
}

export interface DropImpact {
  xMeters: number;
  zMeters: number;
  timeSeconds: number;
}

export class PaintDrop {
  constructor(
    public position: Point,
    public velocity: Velocity,
    readonly radiusMeters: number,
    readonly color: string,
    readonly landingScatterXMeters: number,
    readonly landingScatterZMeters: number,
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
        this.landingScatterXMeters,
      zMeters:
        this.position.zMeters +
        this.velocity.zMetersPerSecond * impactTime +
        this.landingScatterZMeters,
      timeSeconds: impactTime,
    };
  }

  step(dtSeconds: number, gravityMetersPerSecondSquared: number): void {
    // Exact constant-acceleration update avoids display-rate-dependent trajectories.
    this.position = {
      xMeters:
        this.position.xMeters + this.velocity.xMetersPerSecond * dtSeconds,
      yMeters:
        this.position.yMeters +
        this.velocity.yMetersPerSecond * dtSeconds -
        0.5 * gravityMetersPerSecondSquared * dtSeconds * dtSeconds,
      zMeters:
        this.position.zMeters + this.velocity.zMetersPerSecond * dtSeconds,
    };
    this.velocity = {
      xMetersPerSecond: this.velocity.xMetersPerSecond,
      yMetersPerSecond:
        this.velocity.yMetersPerSecond -
        gravityMetersPerSecondSquared * dtSeconds,
      zMetersPerSecond: this.velocity.zMetersPerSecond,
    };
  }
}

export class PaintSource {
  private accumulatedPaintCubicMeters = 0;
  private remainingPaintCubicMeters: number;
  private readonly initialFlowCubicMetersPerSecond: number;

  constructor(
    private readonly config: SimulationConfig,
    private readonly random: SeededRandom,
  ) {
    this.remainingPaintCubicMeters = config.initialPaintMilliliters * 1e-6;
    this.initialFlowCubicMetersPerSecond =
      this.currentFlowCubicMetersPerSecond();
  }

  get remainingPaintMilliliters(): number {
    return this.remainingPaintCubicMeters * 1e6;
  }

  get flowRateMillilitersPerSecond(): number {
    return this.currentFlowCubicMetersPerSecond() * 1e6;
  }

  get flowFraction(): number {
    if (this.initialFlowCubicMetersPerSecond === 0) return 0;
    return (
      this.currentFlowCubicMetersPerSecond() /
      this.initialFlowCubicMetersPerSecond
    );
  }

  emitForStep(dtSeconds: number, pendulum: Pendulum): PaintDrop[] {
    const emitted: PaintDrop[] = [];
    if (this.remainingPaintCubicMeters <= 0) return emitted;

    // Torricelli outflow: Q = Cd Ahole sqrt(2gh). Head h falls with volume.
    const emittedVolume = Math.min(
      this.remainingPaintCubicMeters,
      this.currentFlowCubicMetersPerSecond() * dtSeconds,
    );
    this.remainingPaintCubicMeters -= emittedVolume;
    this.accumulatedPaintCubicMeters += emittedVolume;
    const dropletVolume = this.config.dropletVolumeMilliliters * 1e-6;

    const completeDropletCount = Math.floor(
      this.accumulatedPaintCubicMeters / dropletVolume,
    );
    const partialVolume =
      this.accumulatedPaintCubicMeters - completeDropletCount * dropletVolume;
    const hasFinalPartialDrop =
      this.remainingPaintCubicMeters === 0 && partialVolume > 0;
    const renderedDropCount = Math.min(
      completeDropletCount + (hasFinalPartialDrop ? 1 : 0),
      this.config.maximumRenderedDropsPerStep,
    );
    this.accumulatedPaintCubicMeters = hasFinalPartialDrop ? 0 : partialVolume;

    for (let dropIndex = 0; dropIndex < renderedDropCount; dropIndex += 1) {
      const representsPartialDrop =
        hasFinalPartialDrop &&
        completeDropletCount < this.config.maximumRenderedDropsPerStep &&
        dropIndex === renderedDropCount - 1;
      const releasedVolume = representsPartialDrop
        ? partialVolume
        : dropletVolume;
      const referenceDropletVolume =
        this.config.referenceDropletVolumeMilliliters * 1e-6;
      const sizeFactor =
        Math.cbrt(releasedVolume / referenceDropletVolume) *
        (1 + this.random.signed() * 0.5 * this.config.dropSizeVariation);
      const scatterX =
        this.random.signed() *
        this.config.maximumScatterMeters *
        this.config.randomness;
      const scatterZ =
        this.random.signed() *
        this.config.maximumScatterMeters *
        this.config.randomness;
      const bobPosition = pendulum.bobPosition(
        this.config.pivotHeightMeters + this.config.pivotOffsetHeightMeters,
      );
      bobPosition.xMeters += this.config.pivotOffsetXMeters;
      bobPosition.zMeters += this.config.pivotOffsetZMeters;
      const bobVelocity = pendulum.bobVelocity();
      emitted.push(
        new PaintDrop(
          { ...bobPosition },
          {
            xMetersPerSecond: bobVelocity.xMetersPerSecond,
            yMetersPerSecond: 0,
            zMetersPerSecond: bobVelocity.zMetersPerSecond,
          },
          this.config.baseDropRadiusMeters * sizeFactor,
          this.config.paintColor,
          scatterX,
          scatterZ,
        ),
      );
    }
    return emitted;
  }

  advanceForStep(dtSeconds: number): void {
    if (this.remainingPaintCubicMeters <= 0) return;
    this.remainingPaintCubicMeters = Math.max(
      0,
      this.remainingPaintCubicMeters -
        this.currentFlowCubicMetersPerSecond() * dtSeconds,
    );
  }

  flowWidthMeters(): number {
    const baseWidthMeters = Math.max(
      0.002,
      (this.config.holeDiameterMillimeters / 1000) * 0.75,
    );
    // Small seeded fluctuations make a continuous line feel fluid rather
    // than mechanically uniform while preserving deterministic replay.
    return Math.max(
      0.001,
      baseWidthMeters *
        (1 + this.random.signed() * 0.55 * this.config.dropSizeVariation),
    );
  }

  private currentFlowCubicMetersPerSecond(): number {
    if (this.remainingPaintCubicMeters <= 0) return 0;
    const headMeters =
      this.remainingPaintCubicMeters / this.config.reservoirAreaSquareMeters;
    const holeRadiusMeters = this.config.holeDiameterMillimeters / 2000;
    const holeAreaSquareMeters = Math.PI * holeRadiusMeters ** 2;
    return (
      this.config.dischargeCoefficient *
      holeAreaSquareMeters *
      Math.sqrt(2 * this.config.gravityMetersPerSecondSquared * headMeters)
    );
  }
}

export type SimulationStatus = "paused" | "running" | "complete";

export class Simulation {
  readonly config: SimulationConfig;
  readonly pendulum: Pendulum;
  readonly paintSource: PaintSource;
  readonly canvas: PaintCanvas;
  readonly drops: PaintDrop[] = [];
  private lastFlowPoint: Point;
  elapsedSeconds = 0;
  status: SimulationStatus = "paused";

  constructor(config: SimulationConfig) {
    // SimulationConfig is plain serializable data; shallow copy avoids relying
    // on structuredClone in older Safari releases.
    this.config = { ...config };
    this.pendulum = new Pendulum(
      config.pendulumLengthMeters,
      config.dampingPerSecond,
      (config.initialAngleDegrees * Math.PI) / 180,
      config.initialAngularVelocityRadiansPerSecond,
      (config.initialAzimuthDegrees * Math.PI) / 180,
      config.azimuthalVelocityRadiansPerSecond,
    );
    this.paintSource = new PaintSource(
      this.config,
      new SeededRandom(config.seed),
    );
    this.canvas = new PaintCanvas(
      config.canvasWidthMeters,
      config.canvasDepthMeters,
    );
    this.lastFlowPoint = this.paintPoint();
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
      if (this.config.paintMode === "flow") {
        const wasPainting = this.paintSource.remainingPaintMilliliters > 0;
        this.paintSource.advanceForStep(dt);
        const nextPoint = this.paintPoint();
        if (wasPainting)
          this.canvas.addStroke({
            x1Meters: this.lastFlowPoint.xMeters,
            z1Meters: this.lastFlowPoint.zMeters,
            x2Meters: nextPoint.xMeters,
            z2Meters: nextPoint.zMeters,
            widthMeters: this.paintSource.flowWidthMeters(),
            color: this.config.paintColor,
          });
        this.lastFlowPoint = nextPoint;
      } else {
        this.drops.push(...this.paintSource.emitForStep(dt, this.pendulum));
      }
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
          zMeters: impact.zMeters,
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
    ) {
      this.status = "complete";
    }
  }

  private paintPoint(): Point {
    const bob = this.pendulum.bobPosition(
      this.config.pivotHeightMeters + this.config.pivotOffsetHeightMeters,
    );
    return {
      xMeters: bob.xMeters + this.config.pivotOffsetXMeters,
      yMeters: 0,
      zMeters: bob.zMeters + this.config.pivotOffsetZMeters,
    };
  }
}

export function projectInitialPaintMarks(
  config: SimulationConfig,
  count = 24,
): PaintMark[] {
  const projection = new Simulation(config);
  projection.start();
  const maximumSteps = Math.ceil(
    (config.durationSeconds + 5) / config.fixedTimeStepSeconds,
  );
  for (
    let step = 0;
    step < maximumSteps &&
    projection.status !== "complete" &&
    projection.canvas.marks.length < count;
    step += 1
  ) {
    projection.step();
  }
  return marksForProjection(projection, count);
}

export function projectFuturePaintMarks(
  config: SimulationConfig,
  horizonSeconds = 10,
  maximumMarks = 500,
): PaintMark[] {
  const previewConfig: SimulationConfig = {
    ...config,
    durationSeconds: Math.min(config.durationSeconds, horizonSeconds),
    // A coarser fixed step is sufficient for a visual forecast and keeps
    // multi-pendulum parameter editing responsive. Full runs remain at 120 Hz.
    fixedTimeStepSeconds: Math.max(config.fixedTimeStepSeconds, 1 / 30),
    // Dense streams only need representative particles in the preview.
    maximumRenderedDropsPerStep: Math.min(
      config.maximumRenderedDropsPerStep,
      2,
    ),
  };
  const projection = new Simulation(previewConfig);
  projection.start();
  const maximumSteps = Math.ceil(
    (previewConfig.durationSeconds + 5) / previewConfig.fixedTimeStepSeconds,
  );
  for (
    let step = 0;
    step < maximumSteps && projection.status !== "complete";
    step += 1
  ) {
    projection.step();
  }

  const marks = marksForProjection(projection);
  if (maximumMarks <= 0) return [];
  if (marks.length <= maximumMarks) return marks.map((mark) => ({ ...mark }));
  if (maximumMarks === 1) return [{ ...marks[0] }];
  // Even temporal sampling retains the overall path instead of favoring the
  // beginning of a dense stream.
  return Array.from({ length: maximumMarks }, (_, index) => {
    const sourceIndex = Math.floor(
      (index * (marks.length - 1)) / (maximumMarks - 1),
    );
    return { ...marks[sourceIndex] };
  });
}

function marksForProjection(
  projection: Simulation,
  maximum = Infinity,
): PaintMark[] {
  if (projection.config.paintMode === "flow") {
    return projection.canvas.strokes.slice(0, maximum).map((stroke) => ({
      xMeters: stroke.x2Meters,
      zMeters: stroke.z2Meters,
      radiusMeters: stroke.widthMeters / 2,
      color: stroke.color,
    }));
  }
  return projection.canvas.marks.slice(0, maximum).map((mark) => ({ ...mark }));
}
