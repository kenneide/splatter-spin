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
  referenceDropletVolumeMilliliters: number;
  maximumRenderedDropsPerStep: number;
}

export interface CanvasConfig {
  widthMeters: number;
  depthMeters: number;
  color: string;
}

export interface PendulumConfig {
  paintColor: string;
  lengthMeters: number;
  initialInclinationDegrees: number;
  initialAzimuthDegrees: number;
  initialOrbitSpeedRadiansPerSecond: number;
  dampingPerSecond: number;
  initialPaintMilliliters: number;
  holeDiameterMillimeters: number;
  dropletVolumeMilliliters: number;
  randomness: number;
}

export interface ProjectConfig {
  version: 1;
  seed: number;
  durationSeconds: number;
  canvas: CanvasConfig;
  pendulums: PendulumConfig[];
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
  referenceDropletVolumeMilliliters: 0.01,
  maximumRenderedDropsPerStep: 24,
};

export const defaultCanvasConfig: CanvasConfig = {
  widthMeters: defaultConfig.canvasWidthMeters,
  depthMeters: defaultConfig.canvasDepthMeters,
  color: "#fffdf6",
};

export const defaultPendulumConfig: PendulumConfig = {
  paintColor: defaultConfig.paintColor,
  lengthMeters: defaultConfig.pendulumLengthMeters,
  initialInclinationDegrees: defaultConfig.initialAngleDegrees,
  initialAzimuthDegrees: defaultConfig.initialAzimuthDegrees,
  initialOrbitSpeedRadiansPerSecond:
    defaultConfig.azimuthalVelocityRadiansPerSecond,
  dampingPerSecond: defaultConfig.dampingPerSecond,
  initialPaintMilliliters: defaultConfig.initialPaintMilliliters,
  holeDiameterMillimeters: defaultConfig.holeDiameterMillimeters,
  dropletVolumeMilliliters: defaultConfig.dropletVolumeMilliliters,
  randomness: defaultConfig.randomness,
};

export const defaultProjectConfig: ProjectConfig = {
  version: 1,
  seed: defaultConfig.seed,
  durationSeconds: defaultConfig.durationSeconds,
  canvas: { ...defaultCanvasConfig },
  pendulums: [{ ...defaultPendulumConfig }],
};

export function simulationConfigForPendulum(
  project: ProjectConfig,
  index: number,
): SimulationConfig {
  const pendulum = project.pendulums[index];
  return {
    ...defaultConfig,
    initialAngleDegrees: pendulum.initialInclinationDegrees,
    initialAzimuthDegrees: pendulum.initialAzimuthDegrees,
    azimuthalVelocityRadiansPerSecond:
      pendulum.initialOrbitSpeedRadiansPerSecond,
    pendulumLengthMeters: pendulum.lengthMeters,
    dampingPerSecond: pendulum.dampingPerSecond,
    paintColor: pendulum.paintColor,
    initialPaintMilliliters: pendulum.initialPaintMilliliters,
    holeDiameterMillimeters: pendulum.holeDiameterMillimeters,
    dropletVolumeMilliliters: pendulum.dropletVolumeMilliliters,
    randomness: pendulum.randomness,
    durationSeconds: project.durationSeconds,
    seed: (project.seed + index) | 0,
    canvasWidthMeters: project.canvas.widthMeters,
    canvasDepthMeters: project.canvas.depthMeters,
  };
}

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
    [config.referenceDropletVolumeMilliliters, "Reference droplet volume"],
    [config.maximumRenderedDropsPerStep, "Rendered-drop limit"],
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
  if (!Number.isInteger(config.maximumRenderedDropsPerStep))
    errors.push("Rendered-drop limit must be an integer.");
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

export function validateCanvasConfig(config: CanvasConfig): string[] {
  const errors: string[] = [];
  if (!Number.isFinite(config.widthMeters) || config.widthMeters <= 0)
    errors.push("Canvas width must be positive.");
  if (!Number.isFinite(config.depthMeters) || config.depthMeters <= 0)
    errors.push("Canvas depth must be positive.");
  if (!/^#[0-9a-f]{6}$/i.test(config.color))
    errors.push("Canvas color must be a hex color.");
  return errors;
}

export function parseProjectConfigJson(json: string): ProjectConfig {
  const value: unknown = JSON.parse(json);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Project JSON must contain an object.");
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.pendulums)) {
    // Backward compatibility: a previous single-pendulum configuration.
    const pendulum = parseSimulationConfigJson(json);
    return {
      version: 1,
      seed: pendulum.seed,
      durationSeconds: pendulum.durationSeconds,
      canvas: { ...defaultCanvasConfig },
      pendulums: [simulationToPendulumConfig(pendulum)],
    };
  }
  if (record.pendulums.length === 0)
    throw new Error("A project must contain at least one pendulum.");
  const rawCanvas =
    typeof record.canvas === "object" && record.canvas !== null
      ? record.canvas
      : {};
  const canvas = { ...defaultCanvasConfig, ...rawCanvas } as CanvasConfig;
  const canvasErrors = validateCanvasConfig(canvas);
  if (canvasErrors.length > 0) throw new Error(canvasErrors[0]);
  const seed = record.seed ?? defaultProjectConfig.seed;
  const durationSeconds =
    record.durationSeconds ?? defaultProjectConfig.durationSeconds;
  if (!Number.isInteger(seed)) throw new Error("Seed must be an integer.");
  if (!Number.isFinite(durationSeconds) || Number(durationSeconds) <= 0)
    throw new Error("Duration must be positive.");
  const pendulums = record.pendulums.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item))
      throw new Error("Every pendulum must be an object.");
    const raw = item as Record<string, unknown>;
    const pendulum =
      "pendulumLengthMeters" in raw
        ? simulationToPendulumConfig({
            ...defaultConfig,
            ...raw,
          } as SimulationConfig)
        : ({ ...defaultPendulumConfig, ...raw } as PendulumConfig);
    const trialProject: ProjectConfig = {
      version: 1,
      seed: Number(seed),
      durationSeconds: Number(durationSeconds),
      canvas,
      pendulums: [pendulum],
    };
    const errors = validateConfig(simulationConfigForPendulum(trialProject, 0));
    if (errors.length > 0) throw new Error(errors[0]);
    return pendulum;
  });
  return {
    version: 1,
    seed: Number(seed),
    durationSeconds: Number(durationSeconds),
    canvas,
    pendulums,
  };
}

function simulationToPendulumConfig(config: SimulationConfig): PendulumConfig {
  return {
    paintColor: config.paintColor,
    lengthMeters: config.pendulumLengthMeters,
    initialInclinationDegrees: config.initialAngleDegrees,
    initialAzimuthDegrees: config.initialAzimuthDegrees,
    initialOrbitSpeedRadiansPerSecond: config.azimuthalVelocityRadiansPerSecond,
    dampingPerSecond: config.dampingPerSecond,
    initialPaintMilliliters: config.initialPaintMilliliters,
    holeDiameterMillimeters: config.holeDiameterMillimeters,
    dropletVolumeMilliliters: config.dropletVolumeMilliliters,
    randomness: config.randomness,
  };
}
