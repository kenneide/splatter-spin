# Splatter Spin

Splatter Spin is a deterministic, browser-based paint-pendulum simulation. A damped planar pendulum carries a paint container, releases drops at a configured rate, and leaves permanent marks where their ballistic trajectories meet a horizontal canvas.

## Run locally

Requires a recent Node.js release (Node 20.19+ or 22.12+).

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Edit the controls and select **Rerun** to apply them. **Start/Pause** controls the current run; **Reset** clears it using the currently applied configuration.

Useful checks:

```sh
npm test
npm run format:check
npm run build
npm run preview
```

## Model

The pendulum angle `θ` follows:

```text
θ″ = -(g/L) sin(θ) - cθ′
```

It is integrated with semi-implicit Euler at a fixed 1/120-second timestep. Rendering uses `requestAnimationFrame` independently and may perform multiple physics steps per frame.

Each drop begins at the paint container with its current horizontal velocity and zero vertical velocity. It then follows constant-gravity ballistic motion without air resistance. The exact positive root of the height equation determines when it intersects the canvas, avoiding timestep-sized landing errors. A seeded Mulberry32 generator supplies small symmetric variations in mark radius and landing position.

The configured duration controls pendulum motion and paint emission. Once it is reached, already-released drops continue until they hit the canvas; only then is the run complete.

This is intentionally a simplified model: the arm is rigid and massless; motion is confined to one vertical plane; damping is linear; drops do not collide or experience drag; and marks are stylized rather than simulated fluid splashes. Marks landing outside the finite canvas are discarded.

## Architecture

- `Pendulum`, `PaintSource`, `PaintDrop`, `PaintCanvas`, and `Simulation` contain the model and have no browser dependencies.
- `SimulationConfig` is plain serializable data. The same configuration, seed, and physics-step sequence produces identical marks.
- `Renderer` only maps model coordinates to the HTML canvas and draws the current state.
- `main.ts` owns controls, lifecycle, and the display-frame/fixed-step accumulator.

## GitHub Pages

The production build uses relative asset paths and the included workflow deploys `dist` on pushes to `main`.

1. Create a GitHub repository and push this project to it.
2. In **Settings → Pages**, select **GitHub Actions** as the source.
3. Push to `main`, or manually run the **Deploy to GitHub Pages** workflow.

No repository-name-specific configuration is required. You can verify the static build locally with `npm run build && npm run preview`.

## Next step

Extend the domain model to two-dimensional or spherical pendulum motion, allowing the source to paint across both axes of a horizontal surface.
