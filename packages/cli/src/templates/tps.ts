import type { GameTemplate } from "./types.js";

export const tps: GameTemplate = {
  name: "tps",
  description: "Third-person character with WASD + mouse look",
  indexTs: () => `import "@babylonjs/loaders/glTF";
import {
  Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight,
  MeshBuilder, Vector3, Color3, Color4, StandardMaterial, ShadowGenerator,
} from "@babylonjs/core";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);

scene.clearColor = new Color4(0.4, 0.6, 0.9, 1);
scene.ambientColor = new Color3(0.3, 0.3, 0.3);

// -- Lights --
const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
hemi.intensity = 0.3;

const sun = new DirectionalLight("sun", new Vector3(-1, -2, 1), scene);
sun.intensity = 0.8;

const shadowGen = new ShadowGenerator(1024, sun);
shadowGen.useBlurExponentialShadowMap = true;
shadowGen.blurKernel = 32;

// -- Ground --
const ground = MeshBuilder.CreateGround("ground", { width: 60, height: 60 }, scene);
const groundMat = new StandardMaterial("groundMat", scene);
groundMat.diffuseColor = new Color3(0.35, 0.55, 0.3);
groundMat.specularColor = Color3.Black();
groundMat.freeze();
ground.material = groundMat;
ground.receiveShadows = true;

// -- Player capsule --
const player = MeshBuilder.CreateCapsule("player", { height: 1.8, radius: 0.35 }, scene);
player.position.y = 0.9;
const playerMat = new StandardMaterial("playerMat", scene);
playerMat.diffuseColor = new Color3(0.2, 0.4, 0.8);
playerMat.freeze();
player.material = playerMat;
shadowGen.addShadowCaster(player);

// -- Camera (third-person) --
const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3, 10, player.position, scene);
camera.lowerRadiusLimit = 4;
camera.upperRadiusLimit = 20;
camera.lowerBetaLimit = 0.3;
camera.upperBetaLimit = Math.PI / 2.2;
camera.attachControl(canvas, true);

// -- Input --
const keys: Record<string, boolean> = {};
scene.onKeyboardObservable.add((info) => {
  const down = info.type === 1; // KEY_DOWN
  keys[info.event.key.toLowerCase()] = down;
});

// -- Movement --
const SPEED = 5;
scene.onBeforeRenderObservable.add(() => {
  const dt = engine.getDeltaTime() / 1000;
  const forward = camera.getForwardRay().direction;
  forward.y = 0;
  forward.normalize();
  const right = Vector3.Cross(Vector3.Up(), forward).normalize();

  const move = Vector3.Zero();
  if (keys["w"]) move.addInPlace(forward);
  if (keys["s"]) move.subtractInPlace(forward);
  if (keys["a"]) move.addInPlace(right);
  if (keys["d"]) move.subtractInPlace(right);

  if (move.length() > 0) {
    move.normalize().scaleInPlace(SPEED * dt);
    player.position.addInPlace(move);
    camera.target = player.position.clone();
  }
});

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
`,
  budgetOverrides: {
    maxRenderDistance: 500,
    maxActiveMeshes: 800,
  },
};
