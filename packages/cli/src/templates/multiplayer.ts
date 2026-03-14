import type { GameTemplate } from "./types.js";

export const multiplayer: GameTemplate = {
  name: "multiplayer",
  description: "Express + Socket.IO server with Babylon.js multiplayer client",
  indexTs: () => `import "@babylonjs/loaders/glTF";
import {
  Engine, Scene, FreeCamera, HemisphericLight,
  MeshBuilder, Vector3, Color3, Color4, StandardMaterial,
  AbstractMesh,
} from "@babylonjs/core";
import { io, type Socket } from "socket.io-client";

// ── Engine & Scene ──
const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(0.05, 0.05, 0.1, 1);

// ── Camera ──
const camera = new FreeCamera("camera", new Vector3(0, 12, -15), scene);
camera.setTarget(new Vector3(0, 0, 0));

// ── Light ──
const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
hemi.intensity = 0.8;

// ── Ground ──
const ground = MeshBuilder.CreateGround("ground", { width: 20, height: 20 }, scene);
const groundMat = new StandardMaterial("groundMat", scene);
groundMat.diffuseColor = new Color3(0.15, 0.2, 0.15);
groundMat.specularColor = Color3.Black();
groundMat.freeze();
ground.material = groundMat;

// ── Local Player ──
const player = MeshBuilder.CreateBox("player", { size: 1 }, scene);
player.position.y = 0.5;
const playerMat = new StandardMaterial("playerMat", scene);
playerMat.diffuseColor = new Color3(0.3, 0.8, 1);
playerMat.freeze();
player.material = playerMat;

// ── Remote Players ──
const remotePlayers = new Map<string, AbstractMesh>();

function getOrCreateRemote(id: string): AbstractMesh {
  let mesh = remotePlayers.get(id);
  if (!mesh) {
    mesh = MeshBuilder.CreateBox(\`remote_\${id}\`, { size: 1 }, scene);
    mesh.position.y = 0.5;
    const mat = new StandardMaterial(\`remoteMat_\${id}\`, scene);
    mat.diffuseColor = new Color3(1, 0.4, 0.3);
    mat.freeze();
    mesh.material = mat;
    remotePlayers.set(id, mesh);
  }
  return mesh;
}

function removeRemote(id: string): void {
  const mesh = remotePlayers.get(id);
  if (mesh) {
    mesh.dispose();
    remotePlayers.delete(id);
  }
}

// ── Input ──
const keys: Record<string, boolean> = {};
scene.onKeyboardObservable.add((info) => {
  keys[info.event.key.toLowerCase()] = info.type === 1;
});

// ── Network ──
const socket: Socket = io({ autoConnect: false });
let myId = "";

socket.on("connect", () => {
  myId = socket.id ?? "";
  console.log("Connected:", myId);
});

socket.on("state", (players: Record<string, { x: number; z: number }>) => {
  const activeIds = new Set<string>();
  for (const [id, pos] of Object.entries(players)) {
    if (id === myId) continue;
    activeIds.add(id);
    const mesh = getOrCreateRemote(id);
    // Frame-rate-independent interpolation
    const dt = engine.getDeltaTime() / 1000;
    const alpha = 1 - Math.pow(0.001, dt);
    mesh.position.x += (pos.x - mesh.position.x) * alpha;
    mesh.position.z += (pos.z - mesh.position.z) * alpha;
  }
  // Remove disconnected players
  for (const id of remotePlayers.keys()) {
    if (!activeIds.has(id)) removeRemote(id);
  }
});

socket.on("leave", (id: string) => removeRemote(id));

socket.connect();

// ── Game Loop ──
const SPEED = 5;
const BOUNDS = 9;
let lastSentX = 0;
let lastSentZ = 0;

scene.onBeforeRenderObservable.add(() => {
  const dt = engine.getDeltaTime() / 1000;
  let dx = 0, dz = 0;
  if (keys["a"] || keys["arrowleft"]) dx -= 1;
  if (keys["d"] || keys["arrowright"]) dx += 1;
  if (keys["w"] || keys["arrowup"]) dz += 1;
  if (keys["s"] || keys["arrowdown"]) dz -= 1;

  if (dx || dz) {
    const len = Math.sqrt(dx * dx + dz * dz);
    player.position.x += (dx / len) * SPEED * dt;
    player.position.z += (dz / len) * SPEED * dt;
    player.position.x = Math.max(-BOUNDS, Math.min(BOUNDS, player.position.x));
    player.position.z = Math.max(-BOUNDS, Math.min(BOUNDS, player.position.z));
  }

  // Send position at ~20Hz (every 50ms)
  const { x, z } = player.position;
  if (Math.abs(x - lastSentX) > 0.01 || Math.abs(z - lastSentZ) > 0.01) {
    socket.volatile.emit("move", { x, z });
    lastSentX = x;
    lastSentZ = z;
  }
});

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => engine.resize());
`,
  serverTs: () => `import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? "3000", 10);

const app = express();
const http = createServer(app);
const io = new Server(http, {
  cors: { origin: "*" },
  serveClient: false,
});

// Serve static build (production)
const distDir = resolve(__dirname, "..", "dist");
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get("*", (_req, res) => res.sendFile(resolve(distDir, "index.html")));
}

// ── Game State ──
interface PlayerState {
  x: number;
  z: number;
}

const players = new Map<string, PlayerState>();

// ── Socket.IO ──
io.on("connection", (socket) => {
  console.log(\`[+] \${socket.id}\`);
  players.set(socket.id, { x: 0, z: 0 });

  socket.on("move", (data: { x: number; z: number }) => {
    const state = players.get(socket.id);
    if (state) {
      state.x = data.x;
      state.z = data.z;
    }
  });

  socket.on("disconnect", () => {
    console.log(\`[-] \${socket.id}\`);
    players.delete(socket.id);
    io.emit("leave", socket.id);
  });
});

// Broadcast state at 20Hz
setInterval(() => {
  if (players.size > 0) {
    const state: Record<string, PlayerState> = Object.fromEntries(players);
    io.volatile.emit("state", state);
  }
}, 50);

http.listen(PORT, () => {
  console.log(\`Server listening on http://localhost:\${PORT}\`);
});
`,
  budgetOverrides: {
    maxNPCs: 8,
    maxActiveMeshes: 200,
    maxDrawCalls: 100,
    maxRenderDistance: 150,
  },
};
