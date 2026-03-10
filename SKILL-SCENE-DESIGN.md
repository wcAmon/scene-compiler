# Scene Design Patterns — Agent Skill Reference

> Scene fidelity is not about more code, but about **layered design decisions**.
> This document records scene design patterns validated through real-world practice.

---

## Fidelity Pyramid

Scene fidelity from bottom to top:

```
Level 5: Interactive Feedback (destruction, chain explosions, HUD overlays)
Level 4: Atmosphere Systems (lighting, fog, Glow, sound effects)
Level 3: Environmental Props (street lights, signs, scooters, trees)
Level 2: Scene Skeleton (buildings, roads, terrain)
Level 1: Game Mechanics (movement, shooting, collision)
```

**Common mistake:** Agent spends 80% of time on Level 1-2, skips Level 3-4 and jumps directly to Level 5.
**Correct order:** Complete each layer before moving up. Level 3-4 is the key to "looking polished".

---

## Pattern 1: Multi-Layer Lighting System

Single light source = flat. Three-layer lighting = atmosphere.

### Night Scene (Recommended Configuration)

```typescript
// Layer 1: Moonlight (global cool-tone base)
const moonLight = new DirectionalLight("moon", new Vector3(0.3, -1, -0.5), scene);
moonLight.intensity = 0.25;
moonLight.diffuse = new Color3(0.6, 0.6, 0.85); // Cool blue-white

// Layer 2: Ambient light (very dim, only prevents total darkness)
const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
ambient.intensity = 0.18;
ambient.groundColor = new Color3(0.05, 0.05, 0.08); // Almost no bounce light

// Layer 3: Street lights (warm local illumination, creates contrast)
const lampPositions = [/* Intersection corners + both sides of street */];
for (const pos of lampPositions) {
  const lamp = new PointLight(`lamp`, pos, scene);
  lamp.intensity = 1.2;
  lamp.diffuse = new Color3(1, 0.85, 0.55); // Warm orange
  lamp.range = 18;
  lamp.radius = 0.3; // Soft shadows
}
```

**Why it works:** Cool-warm contrast (moonlight vs street lights) naturally guides visual focus to important areas.

### Daytime Scene (Alternative Configuration)

```typescript
// Sunlight + sky ambient + ground reflection
const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, 0.3), scene);
sun.intensity = 0.8;
sun.diffuse = new Color3(1, 0.95, 0.85); // Warm white

const sky = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
sky.intensity = 0.4;
sky.groundColor = new Color3(0.3, 0.25, 0.2); // Ground reflects warm tones
```

---

## Pattern 2: Fog = Free Depth Perception

Fog is not just a visual effect — it is a **performance optimization tool**. Objects obscured by fog allow LOD transitions and disappearances to go unnoticed.

```typescript
// EXP2 fog (exponential decay, most natural look)
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogDensity = 0.012;        // Density: 0.008 (thin) to 0.02 (thick)
scene.fogColor = new Color4(0.03, 0.03, 0.08, 1); // Match night sky color
```

**Fog color rule:** Fog color = sky color x 0.3. Use dark blue-black for night, light gray-blue for day.

---

## Pattern 3: GlowLayer (Neon / Emissive Effects)

Selective glow is more effective than full-scene glow — only make signs, lamp heads, and effects glow.

```typescript
const glow = new GlowLayer("glow", scene, {
  mainTextureSamples: 4,
  mainTextureFixedSize: 512,
  blurKernelSize: 32,
});
glow.intensity = 0.6;

// Exclude meshes that should not glow
glow.addExcludedMesh(ground);
glow.addExcludedMesh(road);

// Or inversely: only include specific meshes
glow.addIncludedOnlyMesh(neonSign);
glow.addIncludedOnlyMesh(lampHead);
```

**Emissive material pairing:**
```typescript
// Sign material
const neonMat = new StandardMaterial("neon", scene);
neonMat.emissiveColor = new Color3(1, 0.2, 0.5); // Pink neon
neonMat.diffuseColor = Color3.Black();
neonMat.freeze();
```

---

## Pattern 4: Environmental Prop Density

Scene fidelity comes from **appropriate density of environmental objects**. Too few = barren, too many = cluttered.

### Density Reference (per 100m of street)

| Object Type | Count | Placement Rules |
|---------|------|---------|
| Street lights | 6-10 | Staggered on both sides, 15-20m spacing |
| Street trees | 8-12 | Inside of sidewalk, 10-15m spacing |
| Parked scooters | 10-15 | Groups of 2-3, clustered at curbs |
| Signs | 50-70% chance per building | Random colors (pink/green/blue/gold/purple) |
| Utility poles | 2-4 | Near intersections |

### Deterministic Random Placement

Use seeded random to guarantee identical results each generation (required for multiplayer):

```typescript
// Simple LCG random number generator
function createSeededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const random = createSeededRandom(42);

// Scooter cluster placement
for (const group of scooterGroups) {
  const count = 2 + Math.floor(random() * 3); // 2-4 per group
  for (let i = 0; i < count; i++) {
    const instance = container.instantiateModelsToScene();
    const root = instance.rootNodes[0];
    root.position = group.center.add(
      new Vector3(random() * 2 - 1, 0, random() * 2 - 1)
    );
    root.rotation.y = group.baseAngle + random() * 0.35; // Slight angle variation
  }
}
```

---

## Pattern 5: Hand-Crafted Spatial Design > Procedural Generation

For small maps (< 200m x 200m), hand-crafted design yields higher quality than procedural generation.

### T-Intersection Example (Taipei Frontline)

```
         ┌──────────┐
         │ Building  │
         │  Cluster  │
    ─────┤          ├─────
 Main 14m│ T-Inter- │ Side St 43m
    ─────┤  section ├─────
         │ Building  │
         │  Cluster  │
         └──────────┘
```

**Design principles:**
- Intersection center = natural firefight hotspot
- Corners = cover positions
- Side streets = flanking routes
- Every location has gameplay purpose — no "purely decorative" spaces

### Building Placement

```typescript
// Not randomly arranged — every building has intent
const buildings = [
  { model: "convenience_store", pos: [12, 0, 5], rot: Math.PI,   // Faces main road
    emissive: true },   // Convenience store has warm light
  { model: "arcade_apartment", pos: [12, 0, 20], rot: Math.PI,  // Apartment is dark
    emissive: false },  // Light-dark contrast
  { model: "tea_shop", pos: [-12, 0, 35], rot: 0,               // Faces main road
    emissive: true },   // Tea shop has neon
];
```

---

## Pattern 6: Multi-Layer Feedback Stacking

Every game event triggers **multiple simultaneous feedback layers** — this is the core of "game feel":

### "Hit Enemy" Feedback Stack

| Layer | Feedback | Duration |
|------|------|---------|
| Visual | Crosshair contraction | 100ms |
| Visual | Hit marker (X-shape flash) | 200ms |
| Visual | Damage number float-up | 500ms |
| Visual | Enemy hit-flash white | 50ms |
| Audio | Hit sound (tick) | Instant |
| HUD | Kill streak counter +1 | Persistent |
| Haptic | Screen micro-shake (optional) | 50ms |

### "Player Takes Damage" Feedback Stack

| Layer | Feedback | Duration |
|------|------|---------|
| Visual | White flash overlay | 100ms |
| Visual | Screen-edge blood splatter | 2s fade-out |
| Visual | Damage direction arc | 1s |
| Visual | Low-HP red pulsing border | Persistent (HP < 30%) |
| Audio | Hit-taken sound | Instant |
| HUD | Health bar animated decrease | 300ms |

**Implementation principle:** Each feedback is an independent module, triggered via the event system, not coupled into game logic.

---

## Pattern 7: Procedural Sound Effects (Zero Asset Files)

Synthesize all sound effects with Web Audio API — no .mp3/.wav loading:

```typescript
// Gunshot = white noise + exponential decay + lowpass filter
function playGunshot(ctx: AudioContext) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.02));
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2000;

  source.connect(filter).connect(ctx.destination);
  source.start();
}
```

**Advantages:**
- Zero load time
- Parameters adjustable in real-time (pitch, volume change with game events)
- No disk space usage

---

## Pattern 8: Camera Angle Determines Detail Priority

### Third-Person (TPS)

```
Camera 8-12 units behind character → Building front quality > rooftop > back
                                   → Ground detail moderately important
                                   → Sky almost invisible
```

### Top-Down

```
Camera at 45° above → Rooftop quality > front > back
                    → Ground texture very important
                    → Object silhouette clarity > surface detail
```

### Portrait Mobile Game (3/4 View)

```
Fixed camera angle → Foreground layering > background
                   → Character readability is most important
                   → Background can use low-poly + fog cover
```

**Rule:** Determine camera type first, then decide which face of each object needs detail. Do not distribute polygon count uniformly.

---

## Checklist: Scene Fidelity Self-Assessment

After completing a game scene, check each item:

- [ ] **Lighting**: Are there 2+ light source layers? Is there cool-warm contrast?
- [ ] **Fog**: Is fog enabled? Does fog color match the sky?
- [ ] **Glow**: Is there selective GlowLayer? Do signs/lamp heads glow?
- [ ] **Environmental props**: Do street lights, trees, parked vehicles have appropriate density?
- [ ] **Randomness**: Are environmental props placed with seeded random?
- [ ] **Sound**: Are there ambient sounds + action sound effects? At least 5 different effects?
- [ ] **HUD feedback**: Does every game event have 3+ simultaneous feedback layers?
- [ ] **Spatial intent**: Does every area have gameplay function (not just decoration)?
- [ ] **Camera adaptation**: Is object detail allocated based on camera angle?
