import type { GameTemplate } from "./types.js";

export const minimal: GameTemplate = {
  name: "minimal",
  description: "Empty scene with a box (default)",
  indexTs: () => `import "@babylonjs/loaders/glTF";
import { Engine, Scene, FreeCamera, HemisphericLight, MeshBuilder, Vector3, Color4 } from "@babylonjs/core";

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);

scene.clearColor = new Color4(0.53, 0.81, 0.92, 1);

const camera = new FreeCamera("camera", new Vector3(0, 5, -10), scene);
camera.setTarget(Vector3.Zero());
camera.attachControl(canvas, true);

new HemisphericLight("light", new Vector3(0, 1, 0), scene);

const ground = MeshBuilder.CreateGround("ground", { width: 20, height: 20 }, scene);
const box = MeshBuilder.CreateBox("box", { size: 1 }, scene);
box.position.y = 0.5;

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
`,
};
