import { describe, expect, it } from "vitest";
import {
  defaultConfig,
  defaultProjectConfig,
  parseProjectConfigJson,
  parseSimulationConfigJson,
  simulationConfigForPendulum,
  validateConfig,
} from "./config";
import {
  PaintDrop,
  Pendulum,
  projectFuturePaintMarks,
  projectInitialPaintMarks,
  Simulation,
} from "./model";

describe("Pendulum", () => {
  it("evolves from known initial conditions", () => {
    const pendulum = new Pendulum(2, 0.1, Math.PI / 6, 0.2);
    const dt = 0.00001;
    pendulum.step(dt, 9.81);

    const expectedAcceleration = -(9.81 / 2) * 0.5 - 0.1 * 0.2;
    const expectedVelocity = 0.2 + expectedAcceleration * dt;
    expect(pendulum.angularVelocityRadiansPerSecond).toBeCloseTo(
      expectedVelocity,
      8,
    );
    expect(pendulum.angleRadians).toBeCloseTo(
      Math.PI / 6 + expectedVelocity * dt,
      8,
    );
  });

  it("damping reduces motion over time", () => {
    const damped = new Pendulum(1, 0.35, 0.8);
    const undamped = new Pendulum(1, 0, 0.8);
    const lateDampedAngles: number[] = [];
    const lateUndampedAngles: number[] = [];

    for (let index = 0; index < 1_200; index += 1) {
      damped.step(1 / 120, 9.81);
      undamped.step(1 / 120, 9.81);
      if (index >= 960) {
        lateDampedAngles.push(Math.abs(damped.angleRadians));
        lateUndampedAngles.push(Math.abs(undamped.angleRadians));
      }
    }

    expect(Math.max(...lateDampedAngles)).toBeLessThan(0.2);
    expect(Math.max(...lateDampedAngles)).toBeLessThan(
      Math.max(...lateUndampedAngles) * 0.3,
    );
  });

  it("does not gain unbounded energy without damping", () => {
    const pendulum = new Pendulum(1, 0, 0.9, 0, 0, 1.35);
    const initialEnergy = pendulum.specificMechanicalEnergy(9.81);
    let maximumEnergy = initialEnergy;
    for (let index = 0; index < 2_400; index += 1) {
      pendulum.step(1 / 120, 9.81);
      maximumEnergy = Math.max(
        maximumEnergy,
        pendulum.specificMechanicalEnergy(9.81),
      );
    }
    expect(maximumEnergy).toBeLessThan(initialEnergy * 1.03);
  });
});

describe("PaintDrop", () => {
  it("calculates its canvas intersection analytically", () => {
    const drop = new PaintDrop(
      { xMeters: 0.25, yMeters: 1, zMeters: -0.1 },
      {
        xMetersPerSecond: 2,
        yMetersPerSecond: 0,
        zMetersPerSecond: 1,
      },
      0.04,
      "#ff0000",
      0,
      0,
    );
    const expectedTime = Math.sqrt(2 / 9.81);
    const impact = drop.impactWithin(1, 9.81);

    expect(impact?.timeSeconds).toBeCloseTo(expectedTime, 12);
    expect(impact?.xMeters).toBeCloseTo(0.25 + 2 * expectedTime, 12);
    expect(impact?.zMeters).toBeCloseTo(-0.1 + expectedTime, 12);
    expect(drop.impactWithin(0.1, 9.81)).toBeNull();
  });
});

function runToCompletion(seed: number) {
  const simulation = new Simulation({
    ...defaultConfig,
    seed,
    durationSeconds: 3,
  });
  simulation.start();
  while (simulation.status !== "complete") simulation.step();
  return simulation.canvas.marks;
}

describe("Simulation determinism", () => {
  it("traces continuous flow without creating drops", () => {
    const simulation = new Simulation({
      ...defaultConfig,
      paintMode: "flow",
      durationSeconds: 0.2,
    });
    simulation.start();
    for (let step = 0; step < 30; step += 1) simulation.step();
    expect(simulation.drops).toHaveLength(0);
    expect(simulation.canvas.strokes.length).toBeGreaterThan(0);
    expect(simulation.canvas.marks).toHaveLength(0);
  });

  it("samples a bounded deterministic future projection", () => {
    const config = {
      ...defaultConfig,
      holeDiameterMillimeters: 6,
      dropletVolumeMilliliters: 0.0001,
    };
    const first = projectFuturePaintMarks(config, 10, 80);
    const second = projectFuturePaintMarks(config, 10, 80);
    expect(first).toHaveLength(80);
    expect(first).toEqual(second);
    expect(
      new Set(first.map((mark) => `${mark.xMeters},${mark.zMeters}`)).size,
    ).toBeGreaterThan(10);
  });

  it("projects the same first marks produced by the real run", () => {
    const config = { ...defaultConfig, durationSeconds: 3, seed: 91 };
    const projected = projectInitialPaintMarks(config, 12);
    const simulation = new Simulation(config);
    simulation.start();
    while (simulation.status !== "complete") simulation.step();
    expect(projected).toEqual(simulation.canvas.marks.slice(0, 12));
  });

  it("produces identical marks with the same seed", () => {
    expect(runToCompletion(42)).toEqual(runToCompletion(42));
  });

  it("produces different randomized marks with different seeds", () => {
    expect(runToCompletion(42)).not.toEqual(runToCompletion(43));
  });

  it("produces impacts across both canvas dimensions", () => {
    const marks = runToCompletion(42);
    const zCoordinates = marks.map((mark) => mark.zMeters);
    expect(
      Math.max(...zCoordinates) - Math.min(...zCoordinates),
    ).toBeGreaterThan(0.2);
  });

  it("stops exactly at its configured duration", () => {
    const simulation = new Simulation({
      ...defaultConfig,
      durationSeconds: 0.02,
    });
    simulation.start();
    while (simulation.status !== "complete") simulation.step();
    expect(simulation.elapsedSeconds).toBeCloseTo(0.02, 12);
    expect(simulation.drops).toHaveLength(0);
  });

  it("keeps the full default run finite through vertical crossings", () => {
    const simulation = new Simulation(defaultConfig);
    simulation.start();
    for (
      let step = 0;
      step < 3_000 && simulation.status !== "complete";
      step += 1
    ) {
      simulation.step();
      const stateValues = [
        simulation.pendulum.angleRadians,
        simulation.pendulum.angularVelocityRadiansPerSecond,
        simulation.pendulum.azimuthRadians,
        simulation.pendulum.azimuthalVelocityRadiansPerSecond,
        ...simulation.drops.flatMap((drop) => [
          drop.position.xMeters,
          drop.position.yMeters,
          drop.position.zMeters,
          drop.velocity.xMetersPerSecond,
          drop.velocity.yMetersPerSecond,
          drop.velocity.zMetersPerSecond,
        ]),
      ];
      expect(stateValues.every(Number.isFinite)).toBe(true);
    }
    expect(simulation.status).toBe("complete");
    expect(simulation.canvas.marks.length).toBeGreaterThan(100);
    expect(
      simulation.canvas.marks.every((mark) =>
        [mark.xMeters, mark.zMeters, mark.radiusMeters].every(Number.isFinite),
      ),
    ).toBe(true);
  });
});

describe("Paint reservoir", () => {
  it("slows as the paint head falls", () => {
    const simulation = new Simulation({
      ...defaultConfig,
      durationSeconds: 12,
      holeDiameterMillimeters: 7,
    });
    const initialFlow = simulation.paintSource.flowRateMillilitersPerSecond;
    simulation.start();
    for (let step = 0; step < 1_200; step += 1) simulation.step();

    expect(simulation.paintSource.remainingPaintMilliliters).toBeLessThan(
      defaultConfig.initialPaintMilliliters,
    );
    expect(simulation.paintSource.flowRateMillilitersPerSecond).toBeLessThan(
      initialFlow,
    );
  });

  it("flows faster through a larger hole", () => {
    const small = new Simulation({
      ...defaultConfig,
      holeDiameterMillimeters: 2,
    });
    const large = new Simulation({
      ...defaultConfig,
      holeDiameterMillimeters: 4,
    });
    expect(large.paintSource.flowRateMillilitersPerSecond).toBeCloseTo(
      small.paintSource.flowRateMillilitersPerSecond * 4,
      10,
    );
  });

  it("scales drop radius with the cube root of selected volume", () => {
    const small = projectInitialPaintMarks(
      {
        ...defaultConfig,
        randomness: 0,
        dropletVolumeMilliliters: 0.008,
      },
      1,
    );
    const large = projectInitialPaintMarks(
      {
        ...defaultConfig,
        randomness: 0,
        dropletVolumeMilliliters: 0.064,
      },
      1,
    );
    expect(large[0].radiusMeters).toBeCloseTo(small[0].radiusMeters * 2, 10);
  });

  it("varies drop size independently from landing scatter", () => {
    const uniform = projectInitialPaintMarks(
      {
        ...defaultConfig,
        randomness: 0,
        dropSizeVariation: 0,
      },
      12,
    );
    const varied = projectInitialPaintMarks(
      {
        ...defaultConfig,
        randomness: 0,
        dropSizeVariation: 1,
      },
      12,
    );
    expect(new Set(uniform.map((mark) => mark.radiusMeters)).size).toBe(1);
    expect(
      new Set(varied.map((mark) => mark.radiusMeters)).size,
    ).toBeGreaterThan(1);
  });

  it("bounds rendered particles for dense microdroplet flow", () => {
    const simulation = new Simulation({
      ...defaultConfig,
      holeDiameterMillimeters: 6,
      dropletVolumeMilliliters: 0.0001,
    });
    simulation.start();
    simulation.step();
    expect(simulation.drops).toHaveLength(
      defaultConfig.maximumRenderedDropsPerStep,
    );
    expect(simulation.paintSource.remainingPaintMilliliters).toBeLessThan(
      defaultConfig.initialPaintMilliliters - 0.05,
    );
  });
});

describe("configuration JSON", () => {
  it("round-trips a complete serializable configuration", () => {
    expect(parseSimulationConfigJson(JSON.stringify(defaultConfig))).toEqual(
      defaultConfig,
    );
  });

  it("merges compatible partial configurations with current defaults", () => {
    const config = parseSimulationConfigJson(
      JSON.stringify({ initialAngleDegrees: 31, seed: 17 }),
    );
    expect(config).toEqual({
      ...defaultConfig,
      initialAngleDegrees: 31,
      seed: 17,
    });
  });

  it("rejects invalid configuration structures and values", () => {
    expect(() => parseSimulationConfigJson("[]")).toThrow(
      "must contain an object",
    );
    expect(() =>
      parseSimulationConfigJson(JSON.stringify({ holeDiameterMillimeters: 0 })),
    ).toThrow("Hole diameter must be positive");
  });

  it("round-trips the compact multi-pendulum project structure", () => {
    const project = {
      ...structuredClone(defaultProjectConfig),
      seed: 42,
      durationSeconds: 30,
      pendulums: [
        { ...defaultProjectConfig.pendulums[0], paintColor: "#e63946" },
        {
          ...defaultProjectConfig.pendulums[0],
          paintColor: "#457b9d",
          lengthMeters: 1.2,
        },
      ],
    };
    expect(parseProjectConfigJson(JSON.stringify(project))).toEqual(project);
    expect(Object.keys(project.pendulums[0])).not.toContain(
      "gravityMetersPerSecondSquared",
    );
  });

  it("derives stable per-pendulum seeds and shared canvas settings", () => {
    const project = {
      ...structuredClone(defaultProjectConfig),
      seed: 42,
      canvas: { widthMeters: 8, depthMeters: 6, color: "#112233" },
      pendulums: [
        { ...defaultProjectConfig.pendulums[0] },
        { ...defaultProjectConfig.pendulums[0] },
      ],
    };
    const first = simulationConfigForPendulum(project, 0);
    const second = simulationConfigForPendulum(project, 1);
    expect([first.seed, second.seed]).toEqual([42, 43]);
    expect(second.canvasWidthMeters).toBe(8);
    expect(second.canvasDepthMeters).toBe(6);
  });

  it("translates projected impacts with the pendulum canvas position", () => {
    const base = {
      ...defaultConfig,
      randomness: 0,
      pivotOffsetXMeters: 0,
      pivotOffsetZMeters: 0,
    };
    const shifted = {
      ...base,
      pivotOffsetXMeters: 0.35,
      pivotOffsetZMeters: -0.2,
    };
    const originMark = projectInitialPaintMarks(base, 1)[0];
    const shiftedMark = projectInitialPaintMarks(shifted, 1)[0];
    expect(shiftedMark.xMeters - originMark.xMeters).toBeCloseTo(0.35, 10);
    expect(shiftedMark.zMeters - originMark.zMeters).toBeCloseTo(-0.2, 10);
  });

  it("raises the physical drop release point with pendulum Z position", () => {
    const low = new Simulation({
      ...defaultConfig,
      pivotOffsetHeightMeters: 0,
    });
    const high = new Simulation({
      ...defaultConfig,
      pivotOffsetHeightMeters: 0.6,
    });
    low.start();
    high.start();
    for (let step = 0; step < 10 && low.drops.length === 0; step += 1) {
      low.step();
      high.step();
    }
    expect(
      high.drops[0].position.yMeters - low.drops[0].position.yMeters,
    ).toBeCloseTo(0.6, 10);
  });

  it("derives valid pendulum length from effective pivot height", () => {
    const tooLong = {
      ...defaultConfig,
      pendulumLengthMeters: 1.5,
      pivotOffsetHeightMeters: -0.2,
    };
    expect(validateConfig(tooLong)).toContain(
      "Pendulum length must leave 0.05 m clearance above the canvas.",
    );
    expect(
      validateConfig({ ...tooLong, pivotOffsetHeightMeters: 0.2 }),
    ).not.toContain(
      "Pendulum length must leave 0.05 m clearance above the canvas.",
    );
  });
});
