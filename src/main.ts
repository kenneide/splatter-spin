import "./style.css";
import exampleProjectJson from "../default.json";
import {
  defaultConfig,
  defaultProjectConfig,
  parseProjectConfigJson,
  simulationConfigForPendulum,
  validateCanvasConfig,
  validateConfig,
  type PendulumConfig,
  type ProjectConfig,
} from "./config";
import { projectFuturePaintMarks, Simulation } from "./model";
import { Renderer } from "./renderer";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Application root is missing.");

app.innerHTML = `
  <main class="shell">
    <header class="hero">
      <div><p class="eyebrow">Deterministic kinetic study</p><h1>Splatter Spin</h1></div>
      <p class="intro">Layer multiple paint pendulums onto one deterministic canvas.</p>
    </header>
    <section class="workspace">
      <aside class="panel" aria-label="Project controls">
        <section class="control-section">
          <div class="section-heading"><span>01</span><h2>Pendulums</h2></div>
          <div id="pendulum-list" class="pendulum-list"></div>
          <form id="pendulum-form">
            <div class="field"><label for="angle">Initial inclination <output id="angle-value"></output></label><input id="angle" name="initialInclinationDegrees" type="range" min="5" max="80" step="1"></div>
            <div class="field"><label for="azimuth">Initial azimuth <output id="azimuth-value"></output></label><input id="azimuth" name="initialAzimuthDegrees" type="range" min="-180" max="180" step="1"></div>
            <div class="field"><label for="orbit">Orbit speed <output id="orbit-value"></output></label><input id="orbit" name="initialOrbitSpeedRadiansPerSecond" type="range" min="-3" max="3" step="0.05"></div>
            <div class="field field-pair"><div><label for="length">Length (m) <output id="length-limit"></output></label><input id="length" name="lengthMeters" type="number" min="0.4" step="0.05"></div><div><label for="damping">Damping (s⁻¹)</label><input id="damping" name="dampingPerSecond" type="number" min="0" max="1" step="0.005"></div></div>
            <div class="field field-triple"><div><label for="position-x">X (m)</label><input id="position-x" name="positionXMeters" type="number" min="-10" max="10" step="0.1"></div><div><label for="position-y">Y (m)</label><input id="position-y" name="positionYMeters" type="number" min="-10" max="10" step="0.1"></div><div><label for="position-z">Z / height (m)</label><input id="position-z" name="positionZMeters" type="number" min="-1" max="10" step="0.1"></div></div>
            <div class="field field-pair"><div><label for="color">Paint</label><input id="color" name="paintColor" type="color"></div><div><label for="paint-amount">Paint (ml)</label><input id="paint-amount" name="initialPaintMilliliters" type="number" min="1" max="1000" step="5"></div></div>
            <div class="field"><label for="hole-size">Hole diameter (mm)</label><input id="hole-size" name="holeDiameterMillimeters" type="number" min="0.1" max="6" step="0.05"></div>
            <div class="field"><label for="drop-size">Drop size <output id="drop-size-value"></output></label><input id="drop-size" name="dropletVolumeMilliliters" type="range" min="-4" max="-1" step="0.05"></div>
            <div class="field"><label for="randomness">Landing scatter <output id="randomness-value"></output></label><input id="randomness" name="randomness" type="range" min="0" max="1" step="0.01"></div>
            <div class="field"><label for="size-variation">Drop size variation <output id="size-variation-value"></output></label><input id="size-variation" name="dropSizeVariation" type="range" min="0" max="1" step="0.01"></div>
            <button id="add-pendulum" type="button" class="wide-button">+ Add another pendulum</button>
          </form>
        </section>

        <section class="control-section">
          <div class="section-heading"><span>02</span><h2>Canvas</h2></div>
          <div id="canvas-form">
            <div class="field field-pair"><div><label for="canvas-width">Width (m)</label><input id="canvas-width" type="number" min="0.5" max="20" step="0.1"></div><div><label for="canvas-depth">Depth (m)</label><input id="canvas-depth" type="number" min="0.5" max="20" step="0.1"></div></div>
            <div class="field"><label for="canvas-color">Paper color</label><input id="canvas-color" type="color"></div>
          </div>
        </section>

        <section class="control-section project-section">
          <div class="section-heading"><span>03</span><h2>Project</h2></div>
          <div class="field field-pair"><div><label for="seed">Seed</label><input id="seed" type="number" step="1"></div><div><label for="duration">Duration (s)</label><input id="duration" type="number" min="1" max="300" step="1"></div></div>
          <p id="form-error" class="error" role="alert"></p>
          <div class="actions"><button id="start" type="button" class="primary">Start</button><button id="reset" type="button">Reset</button></div>
          <div class="config-actions"><button id="save-config" type="button">Save JSON</button><button id="load-config" type="button">Load JSON</button><button id="save-artwork" type="button">Save artwork PNG · 4K</button><input id="config-file" type="file" accept="application/json,.json" hidden></div>
        </section>
      </aside>
      <div class="stage-card">
        <canvas id="stage" aria-label="Multi-pendulum paint visualization"></canvas>
        <div class="stats" aria-live="polite"><span><b id="time">0.0</b>s elapsed</span><span><b id="paint-left">0</b>ml paint</span><span><b id="drops">0</b> falling</span><span><b id="marks">0</b> marks</span><span id="state" class="state">Paused</span></div>
      </div>
    </section>
  </main>`;

const pendulumForm = document.querySelector<HTMLFormElement>("#pendulum-form")!;
const canvas = document.querySelector<HTMLCanvasElement>("#stage")!;
const renderer = new Renderer(canvas);
function initialProjectConfig(): ProjectConfig {
  try {
    // Keep the richer example in one editable, portable JSON file.
    return parseProjectConfigJson(JSON.stringify(exampleProjectJson));
  } catch {
    // A bundled fallback keeps the UI usable if the example is malformed.
    return structuredClone(defaultProjectConfig);
  }
}

let project: ProjectConfig = initialProjectConfig();
let selectedPendulumIndex = 0;
let simulations = createSimulations(project);
let projectedMarks: ReturnType<typeof createProjections> = [];
let accumulatorSeconds = 0;
let previousFrameMilliseconds = performance.now();
let projectionUpdateTimer: number | undefined;
const projectionHorizonSeconds = 10;

const field = (name: keyof PendulumConfig) =>
  pendulumForm.elements.namedItem(name) as HTMLInputElement;
const element = <T extends HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;

function createSimulations(config: ProjectConfig): Simulation[] {
  return config.pendulums.map(
    (_, index) => new Simulation(simulationConfigForPendulum(config, index)),
  );
}

function createProjections(config: ProjectConfig) {
  return config.pendulums.flatMap((_, index) =>
    projectFuturePaintMarks(
      simulationConfigForPendulum(config, index),
      projectionHorizonSeconds,
      500,
    ),
  );
}

function populatePendulum(config: PendulumConfig): void {
  const ordinary: Array<keyof PendulumConfig> = [
    "paintColor",
    "lengthMeters",
    "initialInclinationDegrees",
    "initialAzimuthDegrees",
    "initialOrbitSpeedRadiansPerSecond",
    "dampingPerSecond",
    "initialPaintMilliliters",
    "holeDiameterMillimeters",
    "randomness",
    "dropSizeVariation",
    "positionXMeters",
    "positionYMeters",
    "positionZMeters",
  ];
  for (const key of ordinary) field(key).value = String(config[key]);
  field("dropletVolumeMilliliters").value = String(
    Math.log10(config.dropletVolumeMilliliters),
  );
  updateOutputs();
}

function populateProjectControls(): void {
  element<HTMLInputElement>("#seed").value = String(project.seed);
  element<HTMLInputElement>("#duration").value = String(
    project.durationSeconds,
  );
  element<HTMLInputElement>("#canvas-width").value = String(
    project.canvas.widthMeters,
  );
  element<HTMLInputElement>("#canvas-depth").value = String(
    project.canvas.depthMeters,
  );
  element<HTMLInputElement>("#canvas-color").value = project.canvas.color;
}

function updateOutputs(): void {
  const effectivePivotHeight =
    defaultConfig.pivotHeightMeters + Number(field("positionZMeters").value);
  const maximumLength = Math.max(
    0.4,
    effectivePivotHeight - defaultConfig.minimumBobClearanceMeters,
  );
  const lengthInput = field("lengthMeters");
  lengthInput.max = String(maximumLength);
  if (Number(lengthInput.value) > maximumLength)
    lengthInput.value = maximumLength.toFixed(2);
  element("#length-limit").textContent = `max ${maximumLength.toFixed(2)}`;
  element("#angle-value").textContent =
    `${field("initialInclinationDegrees").value}°`;
  element("#azimuth-value").textContent =
    `${field("initialAzimuthDegrees").value}°`;
  element("#orbit-value").textContent =
    `${Number(field("initialOrbitSpeedRadiansPerSecond").value).toFixed(2)} rad/s`;
  element("#randomness-value").textContent =
    `${Math.round(Number(field("randomness").value) * 100)}%`;
  element("#size-variation-value").textContent =
    `${Math.round(Number(field("dropSizeVariation").value) * 100)}%`;
  element("#drop-size-value").textContent =
    `${(10 ** Number(field("dropletVolumeMilliliters").value) * 1000).toPrecision(2)} µl`;
}

function pendulumFromForm(): PendulumConfig {
  return {
    paintColor: field("paintColor").value,
    lengthMeters: Number(field("lengthMeters").value),
    initialInclinationDegrees: Number(field("initialInclinationDegrees").value),
    initialAzimuthDegrees: Number(field("initialAzimuthDegrees").value),
    initialOrbitSpeedRadiansPerSecond: Number(
      field("initialOrbitSpeedRadiansPerSecond").value,
    ),
    dampingPerSecond: Number(field("dampingPerSecond").value),
    initialPaintMilliliters: Number(field("initialPaintMilliliters").value),
    holeDiameterMillimeters: Number(field("holeDiameterMillimeters").value),
    dropletVolumeMilliliters:
      10 ** Number(field("dropletVolumeMilliliters").value),
    randomness: Number(field("randomness").value),
    dropSizeVariation: Number(field("dropSizeVariation").value),
    positionXMeters: Number(field("positionXMeters").value),
    positionYMeters: Number(field("positionYMeters").value),
    positionZMeters: Number(field("positionZMeters").value),
  };
}

function readSharedControls(): void {
  project.seed = Number(element<HTMLInputElement>("#seed").value);
  project.durationSeconds = Number(
    element<HTMLInputElement>("#duration").value,
  );
  project.canvas = {
    widthMeters: Number(element<HTMLInputElement>("#canvas-width").value),
    depthMeters: Number(element<HTMLInputElement>("#canvas-depth").value),
    color: element<HTMLInputElement>("#canvas-color").value,
  };
}

function commitControls(): boolean {
  readSharedControls();
  project.pendulums[selectedPendulumIndex] = pendulumFromForm();
  const canvasErrors = validateCanvasConfig(project.canvas);
  const trialErrors = validateConfig(
    simulationConfigForPendulum(project, selectedPendulumIndex),
  );
  const error = canvasErrors[0] ?? trialErrors[0];
  element("#form-error").textContent = error ?? "";
  return !error;
}

function renderPendulumList(): void {
  const list = element("#pendulum-list");
  list.innerHTML = project.pendulums
    .map(
      (pendulum, index) => `
        <div class="pendulum-item ${index === selectedPendulumIndex ? "selected" : ""}" data-index="${index}">
          <button type="button" class="select-pendulum" data-index="${index}"><i style="background:${pendulum.paintColor}"></i><span>Pendulum ${index + 1}</span><small>${pendulum.positionXMeters.toFixed(1)}, ${pendulum.positionYMeters.toFixed(1)}, ${pendulum.positionZMeters.toFixed(1)}</small></button>
          <div class="reorder-pendulum" aria-label="Reorder pendulum ${index + 1}">
            <button type="button" class="move-pendulum" data-action="up" data-index="${index}" aria-label="Move pendulum ${index + 1} up" ${index === 0 ? "disabled" : ""}>↑</button>
            <button type="button" class="move-pendulum" data-action="down" data-index="${index}" aria-label="Move pendulum ${index + 1} down" ${index === project.pendulums.length - 1 ? "disabled" : ""}>↓</button>
          </div>
          <button type="button" class="remove-pendulum" data-index="${index}" aria-label="Remove pendulum ${index + 1}">×</button>
        </div>`,
    )
    .join("");
}

function refreshPreview(): void {
  projectedMarks = createProjections(project);
  renderPendulumList();
}

function preparePausedInitialState(): void {
  refreshPreview();
  if (!simulations.some((simulation) => simulation.status === "running"))
    rebuildSimulations(false);
}

function rebuildSimulations(start: boolean): void {
  simulations = createSimulations(project);
  accumulatorSeconds = 0;
  previousFrameMilliseconds = performance.now();
  if (start) for (const simulation of simulations) simulation.start();
}

pendulumForm.addEventListener("input", () => {
  updateOutputs();
  window.clearTimeout(projectionUpdateTimer);
  projectionUpdateTimer = window.setTimeout(() => {
    if (commitControls()) preparePausedInitialState();
  }, 120);
});

element("#canvas-form").addEventListener("input", () => {
  window.clearTimeout(projectionUpdateTimer);
  projectionUpdateTimer = window.setTimeout(() => {
    if (commitControls()) preparePausedInitialState();
  }, 120);
});

for (const selector of ["#seed", "#duration"]) {
  element(selector).addEventListener("input", () => {
    window.clearTimeout(projectionUpdateTimer);
    projectionUpdateTimer = window.setTimeout(() => {
      if (commitControls()) preparePausedInitialState();
    }, 120);
  });
}

element("#add-pendulum").addEventListener("click", () => {
  if (!commitControls()) return;
  project.pendulums.push(
    structuredClone(project.pendulums[selectedPendulumIndex]),
  );
  selectedPendulumIndex = project.pendulums.length - 1;
  populatePendulum(project.pendulums[selectedPendulumIndex]);
  preparePausedInitialState();
});

element("#pendulum-list").addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const select = target.closest<HTMLButtonElement>(".select-pendulum");
  const remove = target.closest<HTMLButtonElement>(".remove-pendulum");
  const move = target.closest<HTMLButtonElement>(".move-pendulum");
  if (select) {
    if (!commitControls()) return;
    selectedPendulumIndex = Number(select.dataset.index);
    populatePendulum(project.pendulums[selectedPendulumIndex]);
    renderPendulumList();
  } else if (move) {
    if (!commitControls()) return;
    const index = Number(move.dataset.index);
    const direction = move.dataset.action === "up" ? -1 : 1;
    const destination = index + direction;
    if (destination < 0 || destination >= project.pendulums.length) return;
    [project.pendulums[index], project.pendulums[destination]] = [
      project.pendulums[destination],
      project.pendulums[index],
    ];
    if (selectedPendulumIndex === index) selectedPendulumIndex = destination;
    else if (selectedPendulumIndex === destination)
      selectedPendulumIndex = index;
    populatePendulum(project.pendulums[selectedPendulumIndex]);
    preparePausedInitialState();
  } else if (remove) {
    if (project.pendulums.length === 1) {
      element("#form-error").textContent =
        "A project needs at least one pendulum.";
      return;
    }
    project.pendulums.splice(Number(remove.dataset.index), 1);
    selectedPendulumIndex = Math.min(
      selectedPendulumIndex,
      project.pendulums.length - 1,
    );
    populatePendulum(project.pendulums[selectedPendulumIndex]);
    preparePausedInitialState();
  }
});

element("#start").addEventListener("click", () => {
  if (simulations.some((simulation) => simulation.status === "running")) {
    for (const simulation of simulations) simulation.pause();
    return;
  }
  if (simulations.some((simulation) => simulation.elapsedSeconds > 0)) {
    if (simulations.every((simulation) => simulation.status === "complete")) {
      if (!commitControls()) return;
      rebuildSimulations(true);
      return;
    }
    for (const simulation of simulations) simulation.start();
    return;
  }
  if (!commitControls()) return;
  rebuildSimulations(true);
});

element("#reset").addEventListener("click", () => {
  if (!commitControls()) return;
  refreshPreview();
  rebuildSimulations(false);
});

element("#save-config").addEventListener("click", () => {
  if (!commitControls()) return;
  downloadBlob(
    new Blob([`${JSON.stringify(project, null, 2)}\n`], {
      type: "application/json",
    }),
    "splatter-spin-project.json",
  );
});

const configFileInput = element<HTMLInputElement>("#config-file");
element("#load-config").addEventListener("click", () =>
  configFileInput.click(),
);
configFileInput.addEventListener("change", async () => {
  const file = configFileInput.files?.[0];
  if (!file) return;
  try {
    project = parseProjectConfigJson(await file.text());
    selectedPendulumIndex = 0;
    populateProjectControls();
    populatePendulum(project.pendulums[0]);
    refreshPreview();
    rebuildSimulations(false);
    element("#form-error").textContent = "";
  } catch (error) {
    element("#form-error").textContent =
      error instanceof Error ? error.message : "Could not load project.";
  } finally {
    configFileInput.value = "";
  }
});

const saveArtworkButton = element<HTMLButtonElement>("#save-artwork");
saveArtworkButton.addEventListener("click", async () => {
  if (simulations.every((simulation) => simulation.canvas.marks.length === 0)) {
    element("#form-error").textContent =
      "Run the simulation before saving the artwork.";
    return;
  }
  saveArtworkButton.disabled = true;
  saveArtworkButton.textContent = "Rendering 4K…";
  try {
    const blob = await renderer.exportPainting(simulations, project.canvas);
    downloadBlob(blob, `splatter-spin-seed-${project.seed}.png`);
  } catch (error) {
    element("#form-error").textContent =
      error instanceof Error ? error.message : "Could not export artwork.";
  } finally {
    saveArtworkButton.disabled = false;
    saveArtworkButton.textContent = "Save artwork PNG · 4K";
  }
});

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function updateStatus(): void {
  const elapsed = Math.max(...simulations.map((item) => item.elapsedSeconds));
  const drops = simulations.reduce((sum, item) => sum + item.drops.length, 0);
  const marks = simulations.reduce(
    (sum, item) => sum + item.canvas.marks.length,
    0,
  );
  const paint = simulations.reduce(
    (sum, item) => sum + item.paintSource.remainingPaintMilliliters,
    0,
  );
  const running = simulations.some((item) => item.status === "running");
  const complete = simulations.every((item) => item.status === "complete");
  element("#time").textContent = elapsed.toFixed(1);
  element("#drops").textContent = String(drops);
  element("#marks").textContent = String(marks);
  element("#paint-left").textContent = paint.toFixed(1);
  element("#state").textContent = running
    ? "Running"
    : complete
      ? "Complete"
      : "Paused";
  element("#start").textContent = running
    ? "Pause"
    : complete
      ? "Replay"
      : "Start";
  for (const control of Array.from(pendulumForm.elements))
    (control as HTMLInputElement | HTMLButtonElement).disabled = running;
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    ".select-pendulum, .move-pendulum, .remove-pendulum",
  ))
    button.disabled = running;
}

function frame(nowMilliseconds: number): void {
  renderer.resize();
  if (simulations.some((simulation) => simulation.status === "running")) {
    accumulatorSeconds += Math.max(
      0,
      Math.min((nowMilliseconds - previousFrameMilliseconds) / 1000, 0.1),
    );
    const dt = simulations[0].config.fixedTimeStepSeconds;
    while (accumulatorSeconds >= dt) {
      for (const simulation of simulations) simulation.step();
      accumulatorSeconds -= dt;
    }
  }
  previousFrameMilliseconds = nowMilliseconds;
  renderer.render(
    simulations,
    project.canvas,
    projectedMarks,
    Math.min(project.durationSeconds, projectionHorizonSeconds),
  );
  updateStatus();
  requestAnimationFrame(frame);
}

populateProjectControls();
populatePendulum(project.pendulums[0]);
renderPendulumList();
new ResizeObserver(() => renderer.resize()).observe(canvas);
requestAnimationFrame(frame);
// Let controls and the first animation frame become interactive before doing
// forecast work; Start never waits for this projection.
window.setTimeout(refreshPreview, 0);
