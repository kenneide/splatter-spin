import { describe, expect, it } from "vitest";
import { defaultConfig } from "./config";
import { PaintDrop, Pendulum, Simulation } from "./model";

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
    dropsPerSecond: 8,
  });
  simulation.start();
  while (simulation.status !== "complete") simulation.step();
  return simulation.canvas.marks;
}

describe("Simulation determinism", () => {
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
