import type { GameTemplate } from "./types.js";

export const waveShooter: GameTemplate = {
  name: "wave-shooter",
  description: "Fixed camera, horizontal movement, shoot upward",
  indexTs: () => `import "@babylonjs/loaders/glTF";
import {
  Engine, Scene, FreeCamera, HemisphericLight,
  MeshBuilder, Vector3, Color3, Color4, StandardMaterial, Camera,
} from "@babylonjs/core";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);

scene.clearColor = new Color4(0.05, 0.05, 0.12, 1);

// -- Camera (fixed, top-down angled) --
const camera = new FreeCamera("camera", new Vector3(0, 18, -10), scene);
camera.setTarget(new Vector3(0, 0, 2));
camera.fovMode = Camera.FOVMODE_VERTICAL_FIXED;

// -- Lights --
const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
hemi.intensity = 0.6;
hemi.groundColor = new Color3(0.1, 0.1, 0.2);

// -- Ground (play area) --
const ground = MeshBuilder.CreateGround("ground", { width: 16, height: 22 }, scene);
const groundMat = new StandardMaterial("groundMat", scene);
groundMat.diffuseColor = new Color3(0.1, 0.12, 0.18);
groundMat.specularColor = Color3.Black();
groundMat.freeze();
ground.material = groundMat;

// -- Player capsule (bottom of screen) --
const player = MeshBuilder.CreateCapsule("player", { height: 1.2, radius: 0.3 }, scene);
player.position.set(0, 0.6, -8);
const playerMat = new StandardMaterial("playerMat", scene);
playerMat.diffuseColor = new Color3(0.3, 0.8, 1);
playerMat.emissiveColor = new Color3(0.1, 0.3, 0.5);
playerMat.freeze();
player.material = playerMat;

// -- Input --
const keys: Record<string, boolean> = {};
scene.onKeyboardObservable.add((info) => {
  const down = info.type === 1;
  keys[info.event.key.toLowerCase()] = down;
});

// -- Movement --
const SPEED = 8;
const BOUNDS = 6.5;
scene.onBeforeRenderObservable.add(() => {
  const dt = engine.getDeltaTime() / 1000;
  let dx = 0;
  if (keys["a"] || keys["arrowleft"]) dx -= 1;
  if (keys["d"] || keys["arrowright"]) dx += 1;

  if (dx !== 0) {
    player.position.x += dx * SPEED * dt;
    player.position.x = Math.max(-BOUNDS, Math.min(BOUNDS, player.position.x));
  }
});

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
`,
  budgetOverrides: {
    maxNPCs: 50,
    maxRenderDistance: 150,
    maxActiveMeshes: 300,
  },
};
