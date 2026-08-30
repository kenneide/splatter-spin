export interface SimulationConfig {
  initialAngleDegrees: number;
  initialAzimuthDegrees: number;
  azimuthalVelocityRadiansPerSecond: number;
  pendulumLengthMeters: number;
  dampingPerSecond: number;
  paintColor: string;
  initialPaintMilliliters: number;
  holeDiameterMillimeters: number;
  durationSeconds: number;
  randomness: number;
  seed: number;
  gravityMetersPerSecondSquared: number;
  fixedTimeStepSeconds: number;
  pivotHeightMeters: number;
  canvasWidthMeters: number;
  canvasDepthMeters: number;
  baseDropRadiusMeters: number;
  maximumScatterMeters: number;
  reservoirAreaSquareMeters: number;
  dischargeCoefficient: number;
  dropletVolumeMilliliters: number;
}

export const defaultConfig: SimulationConfig = {
  initialAngleDegrees: 52,
  initialAzimuthDegrees: 0,
  azimuthalVelocityRadiansPerSecond: 1.35,
  pendulumLengthMeters: 1,
  dampingPerSecond: 0.075,
  paintColor: "#ff3b72",
  initialPaintMilliliters: 100,
  holeDiameterMillimeters: 1.5,
  durationSeconds: 24,
  randomness: 0.45,
  seed: 2026,
  gravityMetersPerSecondSquared: 9.81,
  fixedTimeStepSeconds: 1 / 120,
  pivotHeightMeters: 1.72,
  canvasWidthMeters: 4.2,
  canvasDepthMeters: 2.4,
  baseDropRadiusMeters: 0.045,
  maximumScatterMeters: 0.1,
  reservoirAreaSquareMeters: 0.005,
  dischargeCoefficient: 0.62,
  dropletVolumeMilliliters: 0.01,
};

export function validateConfig(config: SimulationConfig): string[] {
  const errors: string[] = [];
  const finitePositive: Array<[number, string]> = [
    [config.pendulumLengthMeters, "Pendulum length"],
    [config.initialPaintMilliliters, "Initial paint amount"],
    [config.holeDiameterMillimeters, "Hole diameter"],
    [config.durationSeconds, "Duration"],
    [config.gravityMetersPerSecondSquared, "Gravity"],
    [config.fixedTimeStepSeconds, "Physics timestep"],
    [config.pivotHeightMeters, "Pivot height"],
    [config.canvasWidthMeters, "Canvas width"],
    [config.canvasDepthMeters, "Canvas depth"],
    [config.baseDropRadiusMeters, "Drop radius"],
    [config.reservoirAreaSquareMeters, "Reservoir area"],
    [config.dischargeCoefficient, "Discharge coefficient"],
    [config.dropletVolumeMilliliters, "Droplet volume"],
  ];

  for (const [value, label] of finitePositive) {
    if (!Number.isFinite(value) || value <= 0)
      errors.push(`${label} must be positive.`);
  }
  if (!Number.isFinite(config.initialAngleDegrees))
    errors.push("Initial angle must be finite.");
  if (!Number.isFinite(config.initialAzimuthDegrees))
    errors.push("Initial direction must be finite.");
  if (!Number.isFinite(config.azimuthalVelocityRadiansPerSecond))
    errors.push("Orbit speed must be finite.");
  if (
    !Number.isFinite(config.dampingPerSecond) ||
    config.dampingPerSecond < 0
  ) {
    errors.push("Damping cannot be negative.");
  }
  if (
    !Number.isFinite(config.randomness) ||
    config.randomness < 0 ||
    config.randomness > 1
  ) {
    errors.push("Randomness must be between 0 and 1.");
  }
  if (!Number.isInteger(config.seed)) errors.push("Seed must be an integer.");
  if (!/^#[0-9a-f]{6}$/i.test(config.paintColor))
    errors.push("Paint color must be a hex color.");
  if (config.pivotHeightMeters <= config.pendulumLengthMeters) {
    errors.push("Pendulum length must leave the container above the canvas.");
  }
  return errors;
}

export function parseSimulationConfigJson(json: string): SimulationConfig {
  const value: unknown = JSON.parse(json);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Configuration JSON must contain an object.");
  }
  const config = { ...defaultConfig, ...value } as SimulationConfig;
  const errors = validateConfig(config);
  if (errors.length > 0) throw new Error(errors[0]);
  return config;
}
