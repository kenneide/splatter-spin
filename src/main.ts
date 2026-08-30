import "./style.css";
import { defaultConfig, validateConfig, type SimulationConfig } from "./config";
import { Simulation } from "./model";
import { Renderer } from "./renderer";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Application root is missing.");

app.innerHTML = `
  <main class="shell">
    <header class="hero">
      <div>
        <p class="eyebrow">Deterministic kinetic study</p>
        <h1>Splatter Spin</h1>
      </div>
      <p class="intro">Tune the motion, release the paint, and replay the exact same composition from a seed.</p>
    </header>
    <section class="workspace">
      <aside class="panel" aria-label="Simulation controls">
        <form id="controls">
          <div class="field"><label for="angle">Initial angle <output id="angle-value"></output></label><input id="angle" name="initialAngleDegrees" type="range" min="5" max="80" step="1"></div>
          <div class="field"><label for="orbit">Orbit speed <output id="orbit-value"></output></label><input id="orbit" name="azimuthalVelocityRadiansPerSecond" type="range" min="-3" max="3" step="0.05"></div>
          <div class="field"><label for="length">Length (m)</label><input id="length" name="pendulumLengthMeters" type="number" min="0.4" max="1.5" step="0.05"></div>
          <div class="field"><label for="damping">Damping (s⁻¹)</label><input id="damping" name="dampingPerSecond" type="number" min="0" max="1" step="0.005"></div>
          <div class="field field-pair"><div><label for="color">Paint</label><input id="color" name="paintColor" type="color"></div><div><label for="seed">Seed</label><input id="seed" name="seed" type="number" step="1"></div></div>
          <div class="field"><label for="rate">Drops per second</label><input id="rate" name="dropsPerSecond" type="number" min="0.5" max="60" step="0.5"></div>
          <div class="field"><label for="duration">Duration (s)</label><input id="duration" name="durationSeconds" type="number" min="1" max="120" step="1"></div>
          <div class="field"><label for="randomness">Randomness <output id="randomness-value"></output></label><input id="randomness" name="randomness" type="range" min="0" max="1" step="0.01"></div>
          <p id="form-error" class="error" role="alert"></p>
          <div class="actions"><button id="start" type="button" class="primary">Start</button><button id="reset" type="button">Reset</button><button id="rerun" type="submit">Rerun</button></div>
        </form>
      </aside>
      <div class="stage-card">
        <canvas id="stage" aria-label="Paint pendulum visualization"></canvas>
        <div class="stats" aria-live="polite"><span><b id="time">0.0</b>s elapsed</span><span><b id="drops">0</b> falling</span><span><b id="marks">0</b> marks</span><span id="state" class="state">Paused</span></div>
      </div>
    </section>
  </main>`;

const form = document.querySelector<HTMLFormElement>("#controls")!;
const canvas = document.querySelector<HTMLCanvasElement>("#stage")!;
const renderer = new Renderer(canvas);
let simulation = new Simulation(defaultConfig);
let accumulatorSeconds = 0;
let previousFrameMilliseconds = performance.now();

const input = (name: keyof SimulationConfig) =>
  form.elements.namedItem(name) as HTMLInputElement;

function populateForm(config: SimulationConfig): void {
  const editable: Array<keyof SimulationConfig> = [
    "initialAngleDegrees",
    "azimuthalVelocityRadiansPerSecond",
    "pendulumLengthMeters",
    "dampingPerSecond",
    "paintColor",
    "dropsPerSecond",
    "durationSeconds",
    "randomness",
    "seed",
  ];
  for (const key of editable) input(key).value = String(config[key]);
  updateOutputs();
}

function updateOutputs(): void {
  document.querySelector("#angle-value")!.textContent =
    `${input("initialAngleDegrees").value}°`;
  document.querySelector("#randomness-value")!.textContent =
    `${Math.round(Number(input("randomness").value) * 100)}%`;
  document.querySelector("#orbit-value")!.textContent =
    `${Number(input("azimuthalVelocityRadiansPerSecond").value).toFixed(2)} rad/s`;
}

function configFromForm(): SimulationConfig | null {
  const config: SimulationConfig = {
    ...defaultConfig,
    initialAngleDegrees: Number(input("initialAngleDegrees").value),
    azimuthalVelocityRadiansPerSecond: Number(
      input("azimuthalVelocityRadiansPerSecond").value,
    ),
    pendulumLengthMeters: Number(input("pendulumLengthMeters").value),
    dampingPerSecond: Number(input("dampingPerSecond").value),
    paintColor: input("paintColor").value,
    dropsPerSecond: Number(input("dropsPerSecond").value),
    durationSeconds: Number(input("durationSeconds").value),
    randomness: Number(input("randomness").value),
    seed: Number(input("seed").value),
  };
  const errors = validateConfig(config);
  document.querySelector("#form-error")!.textContent = errors[0] ?? "";
  return errors.length === 0 ? config : null;
}

function replaceSimulation(config: SimulationConfig, start: boolean): void {
  simulation = new Simulation(config);
  accumulatorSeconds = 0;
  previousFrameMilliseconds = performance.now();
  if (start) simulation.start();
}

form.addEventListener("input", updateOutputs);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const config = configFromForm();
  if (config) replaceSimulation(config, true);
});
document.querySelector("#start")!.addEventListener("click", () => {
  if (simulation.status === "running") simulation.pause();
  else if (simulation.status === "complete")
    replaceSimulation(simulation.config, true);
  else simulation.start();
});
document
  .querySelector("#reset")!
  .addEventListener("click", () => replaceSimulation(simulation.config, false));

function updateStatus(): void {
  document.querySelector("#time")!.textContent =
    simulation.elapsedSeconds.toFixed(1);
  document.querySelector("#drops")!.textContent = String(
    simulation.drops.length,
  );
  document.querySelector("#marks")!.textContent = String(
    simulation.canvas.marks.length,
  );
  const label = simulation.status[0].toUpperCase() + simulation.status.slice(1);
  document.querySelector("#state")!.textContent = label;
  document.querySelector("#start")!.textContent =
    simulation.status === "running"
      ? "Pause"
      : simulation.status === "complete"
        ? "Replay"
        : "Start";
}

function frame(nowMilliseconds: number): void {
  renderer.resize();
  if (simulation.status === "running") {
    const frameSeconds = Math.min(
      (nowMilliseconds - previousFrameMilliseconds) / 1000,
      0.1,
    );
    accumulatorSeconds += Math.max(0, frameSeconds);
    while (accumulatorSeconds >= simulation.config.fixedTimeStepSeconds) {
      simulation.step();
      accumulatorSeconds -= simulation.config.fixedTimeStepSeconds;
    }
  }
  previousFrameMilliseconds = nowMilliseconds;
  renderer.render(simulation);
  updateStatus();
  requestAnimationFrame(frame);
}

populateForm(defaultConfig);
new ResizeObserver(() => renderer.resize()).observe(canvas);
requestAnimationFrame(frame);
