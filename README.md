# Splatter Spin

Splatter Spin is a deterministic, browser-based paint-pendulum simulation. A damped spherical pendulum carries a draining paint container and leaves permanent marks where its three-dimensional paint trajectories meet a horizontal canvas.

## Run locally

Requires a recent Node.js release (Node 20.19+ or 22.12+).

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Edit the controls and select **Rerun** to apply them. **Start/Pause** controls the current run; **Reset** clears it using the currently applied configuration.

Initial inclination and azimuth set the starting arm direction, while orbit speed supplies rotation around the pivot. Paint amount sets the initial reservoir volume and hole diameter controls how quickly it drains.

Useful checks:

```sh
npm test
npm run format:check
npm run build
npm run preview
```

## Model

The pendulum stores a Cartesian unit arm direction `q` and its tangent velocity `q′`:

```text
q″ = (g/L)(down - (down · q)q) - c q′ - |q′|²q
```

It is integrated with fourth-order Runge-Kutta at a fixed 1/120-second timestep. After each step, `q` is normalized and radial velocity is removed to maintain the rigid-arm constraint. Cartesian state avoids the inclination/azimuth singularity when the bob crosses directly beneath the pivot, while RK4 limits artificial energy drift. Rendering uses `requestAnimationFrame` independently and may perform multiple physics steps per frame.

Each drop begins at the paint container with both of its current horizontal velocity components and zero vertical velocity. It then follows constant-gravity ballistic motion without air resistance. The exact positive root of the height equation determines when it intersects the canvas, avoiding timestep-sized landing errors. A seeded Mulberry32 generator supplies small symmetric variations in mark radius and both landing coordinates.

Reservoir outflow follows Torricelli's law, `Q = Cd Ahole √(2gh)`, using the remaining volume and a fixed container cross-section to determine paint head `h`. Emitted volume accumulates into fixed-volume droplets. The initially high flow appears as a continuous stream; as the paint head falls, the same-size droplets are released progressively farther apart. This models draining and cadence rather than detailed paint viscosity or surface tension.

The configured duration controls pendulum motion and paint emission. Once it is reached, already-released drops continue until they hit the canvas; only then is the run complete.

This is intentionally a simplified model: the arm is rigid and massless; the bob is a point mass; damping is linear; the paint is treated as an ideal fluid with a fixed discharge coefficient; drops do not collide or experience drag; and marks are stylized rather than simulated fluid splashes. Marks landing outside the finite rectangular canvas are discarded.

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

Add multiple paint reservoirs and color changes, then support exporting the finished canvas as a high-resolution image.
