# Agent Architecture for Game Development — Human Reference

> This document is intended for **humans**.
> It records how to design an AI agent system for developing Babylon.js games, based on practical experience from hundreds of awakenings.

---

## Core Finding: Orchestrator Mode Produces More Refined Scenes

We tested two agent architectures:

| | Orchestrator Mode | Direct Mode |
|---|---|---|
| **Representative** | midnight (Taipei Frontline) | dusk (Banana Defense) |
| **Can agent write code** | Write/Edit forbidden | Yes |
| **Sub-agents** | game-dev, blender-dev, fullstack-dev | game-dev, blender-dev |
| **Output scale** | 14,825 lines, 25 modules | 3,395 lines, 11 files |
| **3D assets** | 10+ GLB models | 0 GLB (purely procedural) |
| **Scene refinement** | High (multi-layer lighting, environmental objects, atmosphere) | Medium (functionally complete but visually thin) |
| **Dev cycle** | 11 phases, ~2 weeks | 2 phases, ~1 week |

**Conclusion:** When the orchestrator cannot write code itself, it will:
1. Spend more turns on **design and review**
2. Give sub-agents more **specific instructions** (because it must describe the desired effect in words)
3. Actively use the **asset pipeline** (because it cannot take shortcuts with MeshBuilder)
4. Perform stricter **QA** on results (because it can only observe, not modify)

---

## Agent Role Design

### Orchestrator (Director)

```
Responsibilities: Planning, decision-making, review, communication
Disallowed tools: Write, Edit, NotebookEdit
Allowed tools: Read, Bash, Glob, Grep + MCP tools (memory, reports, asset management)
Model: Strongest model (e.g., claude-opus-4-6)
Turn budget: 100-120 turns
```

**Why code writing is forbidden:**
- Forces use of sub-agents, creating auditable work boundaries
- Prevents the orchestrator from getting stuck in debug loops
- Keeps the orchestrator's attention on overall design

### game-dev (Game Developer)

```
Responsibilities: Writing Babylon.js/TypeScript code
Allowed tools: Read, Write, Edit, Bash, Glob, Grep
Model: Strong model (claude-opus-4-6 or claude-sonnet-4-6)
Turn budget: Controlled by orchestrator
```

**Prompt must include:**
- Working directory path
- Path to scene-compiler SKILL.md (require reading it first)
- Build instructions (verify code passes scene-compiler)
- Clear boundaries (which files cannot be modified)

### blender-dev (3D Modeler)

```
Responsibilities: Writing Blender Python scripts, producing GLB + preview images
Allowed tools: Read, Write, Edit, Bash, Glob, Grep
Model: Strong model
Turn budget: Controlled by orchestrator
```

**Prompt must include:**
- Path to blender-modeling reference files
- Output directory path
- Polygon budget
- Requirement to produce 3 preview images + bounding box

---

## Memory-Driven Adaptive Development

**This is the most important design pattern.**

The agent does not execute a fixed plan from start to finish. At each awakening it:
1. Reads memory (what was done last time, current milestone, technical notes)
2. Reads external inputs (human messages, other agents' reports, asset feedback)
3. **Re-evaluates decisions based on the current situation**
4. Executes one task
5. **Updates memory** (not append, but replace — memory always reflects the latest state)

### Memory Structure Design

```markdown
## North Star
One sentence describing the ultimate goal (never changes)

### Phase Milestones
1. Core gameplay prototype ✅
2. Shooting system ✅
3. Multiplayer networking ✅
4. Scene enrichment ← current
5. Polish & QA

## Current State
- Version: v0.8.0
- Recently completed: Street lamp + street tree placement
- Next step: Motorcycle cluster placement
- Known issues: Intersection collision walls need openings

## Technical Notes
- After freezeWorldMatrix, use setEnabled() instead of scaling
- Multi-level return early, don't removeCallback
- (Only record useful lessons, not play-by-play logs)

## Completed Assets
- name (id): status
```

### Why Replace Instead of Append

Append mode causes memory to grow unboundedly, with outdated early information interfering with decisions.
Replace mode forces the agent to **organize and condense** memory at each awakening, keeping only currently relevant information.

```python
# At the end of an awakening
write_memory_tool(replace=true)  # Not append!
```

### Adaptive Decision Flow

```
Read memory
  ↓
Scan external inputs:
  Human message? → Highest priority, handle immediately
  Asset feedback? → High priority, fix asset
  Completed assets? → Integrate into game
  Other agent reports? → Reference but don't interfere
  ↓
(None of the above)
  ↓
Choose next task based on milestone progress
  ↓
Declare "This awakening focuses on: [task]"
  ↓
Execute
  ↓
Update memory (replace)
```

**Key point:** The agent's plan (milestone list) evolves throughout development.
Phase 3 may have originally planned for a "delivery system," but after running it, the gameplay turned out to be better suited for wave survival, so delivery gets marked as "paused" and the direction adjusts.
This is not a bug — this is by design. **Memory is a living document, not a dead plan.**

---

## Single-Task Focus Mode

Each awakening handles only **one task**, done well and done completely.

**Why not multitask:**
- Agent context windows are limited; multitasking leads to shallow work on each task
- Single tasks are easier to QA — if the build breaks, it was definitely caused by this task
- Awakening reports are clearer — "Completed X this time" is more useful than "Advanced X, Y, Z each by 30%"
- Easier for humans to track progress

**Task granularity examples:**
- ✅ Good granularity: "Implement 5-level progression system"
- ✅ Good granularity: "Integrate 3 completed assets into the scene"
- ❌ Too large: "Complete Phase 7"
- ❌ Too small: "Modify one line of CSS"

---

## Awakening Scheduling Design

### Factors That Determine Awakening Frequency

| Factor | High frequency (every 2h) | Low frequency (every 12h) |
|------|---------------|----------------|
| Development speed | Rapid iteration | Deliberate thinking |
| Token cost | High | Low |
| Suited for whom | Primary developer (midnight) | Content producer (dawn) |
| Suited for what | Game feature development | Blog writing |

### Idle Protection

When the agent has nothing to do, it should not waste tokens on "health checks." Add checks in the supervisor:

```python
# If the game is awaiting human review AND no human messages → skip
if pending_review and not messages and not assets and not feedbacks:
    return {"status": "skipped", "reason": "pending_review"}

# If no awakening reports AND no messages → skip (applies to agents like dawn that read reports)
if not reports and not messages:
    return {"status": "skipped", "reason": "no_reports"}
```

---

## Inter-Agent Communication

### Cooperation Mode

Agents can communicate with each other through the message system:

```python
send_message_to_agent("dusk", "Helper summoning system design spec has been written to the design doc, please read it")
```

**Risk:** Agents may spontaneously collaborate (proactively helping after seeing another's messages).
If you don't want agents to cross boundaries, explicitly restrict this in the prompt:

```markdown
## Boundaries
- You are only responsible for development in /home/wake/runner-game/
- Do not modify other agents' game projects
- Do not proactively do work for other agents
```

### Report Visibility

`get_recent_reports_tool()` returns reports from **all agents**.
If isolation is needed, filter at the MCP tool level:

```python
# Only return your own reports
reports = [r for r in all_reports if r["agent"] == AGENT_NAME]
```

---

## Phase Planning Recommendations

Based on the 11-phase experience from Taipei Frontline, here is the recommended phase structure:

### Early Stages (Feature-Oriented)
1. **Core gameplay prototype** — Minimum playable version, validate basic mechanics
2. **Core mechanics refinement** — Fill in missing game mechanics
3. **World skeleton** — Roads, buildings, basic scene

### Middle Stages (Content-Oriented)
4. **Asset pipeline launch** — Proposal + modeling + integrating first batch of GLBs
5. **Game depth** — Enemy types, weapons, skill trees
6. **Multiplayer networking** (if needed) — Network sync, room system

### Late Stages (Polish-Oriented)
7. **Environment enrichment** — Street lamps, trees, signs, parked vehicles (Level 3 refinement)
8. **Atmosphere system** — Multi-layer lighting, fog, GlowLayer, sound effects (Level 4 refinement)
9. **Interactive feedback** — HUD overlays, destruction system, chain effects (Level 5 refinement)
10. **UX polish** — Loading screens, pause, settings, tutorial prompts
11. **QA & bug fixes** — Final acceptance

**Key point: Phases 7-8 are what most games skip, but they are the core of refinement.**
When planning, explicitly include "environment enrichment" and "atmosphere system" phases — don't let them get squeezed out by feature development.

---

## Practical Orchestrator Prompt Template

```markdown
# {agent_name} — Game Director

You are **{agent_name}**, the game director for {game_name}.

## Core Identity
- You are a **designer and reviewer**, not a developer. You do not write game code.
- You execute work through sub-agents: game-dev (writes code), blender-dev (creates models).
- Your responsibilities: Plan tasks, review results, manage the asset pipeline, maintain quality.

## Awakening Workflow
1. `read_memory_tool()` — Read memory (North Star, milestones, progress, technical notes)
2. Check external inputs (human messages > asset feedback > completed assets > development tasks)
3. Declare "This awakening focuses on: [one task]"
4. Execute the task through sub-agents
5. Verify results (build / preview check)
6. `write_awakening_report_tool()` — Submit awakening report
7. `write_memory_tool(replace=true)` — Update memory

## Asset Pipeline (Mandatory)
- 3D objects in the scene **must** use GLB assets; MeshBuilder substitutes are not allowed
- Asset flow: propose → reference → blender-dev → QA → integrate
- Maximum 3 asset proposals per awakening
- QA review required before integration (compare reference images + size check)

## Memory Management
- **Must** run `write_memory_tool(replace=true)` to update memory before the awakening ends
- Memory format: North Star + milestone list + current state + technical notes + completed assets
- Milestones can be adjusted based on actual progress (mark as paused, add new ones, reorder)
- Technical notes should only record useful lessons, not play-by-play logs

## Constraints
- **Forbidden:** Write, Edit, NotebookEdit (you are the orchestrator)
- Only **one** task per awakening
- Code written by sub-agents must pass the scene-compiler build
```

---

## Architecture Choice: Prompt-Guided vs Memory-Guided

This is the **first decision** when designing an agent system. Getting it wrong will affect the entire project's scale and quality.

### Two Modes

| | Prompt-guided (North Star in prompt) | Memory-guided (North Star in memory) |
|---|---|---|
| **Prompt content** | Game type, art style, camera architecture, sub-agent responsibilities, asset pipeline, technical reference index | Generic orchestrator workflow, sub-agent usage |
| **Memory content** | Milestone progress, technical notes, completed assets | **Entire design document** + progress + technical notes |
| **Immutable parts** | "Co-op TPS, Taiwan streetscape, over-the-shoulder view, front-facing quality > rooftops" | Almost only "you are a manager" |
| **Mutable parts** | Current phase, progress | What game is being built, design direction, progress |

### Why This Determines Project Scale

**The prompt is read at every awakening** — the agent cannot forget it, modify it, or skip it.

A prompt-guided agent's prompt hardcodes technical constraints (camera architecture, material pipeline, QA workflow, role division). These are **guardrails**. No matter how memory changes or milestones shift, the agent will never:
- Take shortcuts with MeshBuilder (because the prompt enforces the asset pipeline)
- Skip QA (because the prompt says "strict — no skipping steps")
- Assign shooting logic to the wrong sub-agent (because the prompt defines role division)

A memory-guided agent's design document lives in memory, which the agent can modify. Flexible but also risky — the agent might "optimize" the design document during an awakening and inadvertently alter important technical constraints.

### Cumulative Effect

This is the real difference.

A prompt-guided agent completed 11 phases, with each phase's results **building upon** the previous one. Because the camera architecture and material pipeline were fixed from day one, Phase 11's loading screen and Phase 1's core gameplay use the same technical foundation. Technical debt is low, and results accumulate.

A memory-guided agent doing 11 phases might, due to memory modifications mid-way, end up with Phase 6 technical decisions inconsistent with Phase 1.

### Selection Guide

| Choice | Conditions |
|------|------|
| **Prompt-guided** | Clear direction, long-term development (> 5 phases), needs asset pipeline, multiplayer networking, or other complex systems |
| **Memory-guided** | Needs exploration, short-term development (< 5 phases), project may switch, direction undecided |

### Hybrid Strategy

You can also mix approaches: use the prompt to lock down **technical constraints** (camera, material pipeline, QA workflow), and use memory to store **design direction** (game theme, level design, character settings). This keeps the technical foundation stable while allowing creative direction to remain flexible.

```markdown
# In the prompt (immutable)
- You are the orchestrator, Write/Edit forbidden
- Camera architecture: [specific technical specs]
- Asset pipeline: propose → blender → QA → integrate
- Build verification: scene-compiler validate + vite build

# In memory (mutable)
## Current Game Design
- Theme: [adjustable]
- Level design: [adjustable]
- Character settings: [adjustable]
```

---

## Prompt Design Patterns

The following are design patterns distilled from actually running orchestrator prompts.

### Turn Budget Allocation

Don't just give the agent a total turn count — **allocate by phase** to enforce time management:

```markdown
## Awakening Workflow

Each awakening you have a **60-turn budget**:

### Phase 1: Situation Assessment (5 turns)
1. read_memory_tool()
2. Check human messages
3. Scan game source code

### Phase 2: Choose a Single Task (3 turns)
Choose one task, declare "This awakening focuses on: [task]"

### Phase 3: Execution (40 turns)
Execute through sub-agents

### Phase 4: Wrap-up (10 turns)
Build verification + awakening report + memory update
```

**Why this works:** The agent won't spend 30 turns "assessing the situation" and then have only 10 turns left to do actual work.

### Autonomous Decision-Making + Decision Logging

```markdown
**Autonomous execution principle: Do not ask for human input; proceed directly toward the North Star.**
When encountering decision points, make your own judgment on the best approach, and record the reasoning in the awakening report.
Human input will arrive via messages; when received, handle it with priority.
```

**Why this works:** The agent won't get stuck hesitating about "should I ask the human."
Humans participate through asynchronous messages, and the agent records its reasoning in reports — both sides have complete information.

### Limited Retries on Build Failure

```markdown
1. Build verification
   - **Build succeeds** → Continue to wrap-up
   - **Build fails** → Launch game-dev to fix, run again (maximum 2 retries)
   - If it can't be fixed, record it in the awakening report and prioritize it next awakening
```

**Why this works:** Prevents the agent from falling into a build → fail → fix → fail death spiral that consumes all turns.
2 retries is an empirical value — most build errors can be fixed in 1-2 attempts; those that can't usually require a larger design change.

### Read Reference Files by Phase

Don't have the agent read all reference files at once — read them as currently needed.

```markdown
## Technical Reference Files (Read on Demand)

| File | When to Read |
|------|--------|
| TPS combat system | **Phase 1**: Shooting, animation blending, destruction |
| Multiplayer networking | **Phase 2**: WebSocket, state synchronization |
| NPC pathfinding | **Phase 3**: Enemy AI, NavMesh |
| Lighting system | **Phase 7**: Light sources, shadows, neon |

**Principle: Read as needed per phase — no need to read everything at once.**
```

**Why this works:** Saves context window space. A 500-line reference file read in when not needed takes up space that could be used for the agent to do other work.

### Layered Memory (For Agents with Extensive Reusable Experience)

When an agent has accumulated too much experience to fit in a single memory file, use a **two-tier structure of index + detailed files**:

```markdown
## Blender Success Pattern Index (limit 20 entries)

Format: `- {name}｜{technique keywords}｜{polygon count}｜→ memory/references/blender-scripts/{filename}.md`

- Taiwan arcade apartment｜bmesh extrude + array｜5K faces｜→ blender-scripts/taiwan-apartment.md
- Street lamp｜cylinder + torus + emission｜800 faces｜→ blender-scripts/street-lamp.md
```

**Usage rules:**
1. Before modeling, check the index first; if a similar object exists, have the sub-agent read the detailed file
2. After successful modeling, write a detailed file + update the index
3. When the index reaches 20 entries, retire the least versatile ones (specialized shapes are retired first, general-purpose patterns are kept)

**Why this works:** Memory doesn't bloat (the index is only 20 lines), but experience isn't lost (detailed files can be read anytime).

### Design Document Placement: Prompt vs Memory

Both strategies are viable:

| Strategy | Use Case | Pros | Cons |
|------|---------|------|------|
| **Design doc in prompt** | Fixed project, unchanging direction | Guaranteed to be read every awakening | Takes up prompt space |
| **Design doc in memory** | Project may change, direction may shift | Agent can modify anytime | Agent might not read it |

Midnight uses the **prompt strategy** (TPS game direction is fixed; prompt hardcodes "Co-op TPS, Taiwan streetscape").
Dusk uses the **memory strategy** (game factory; each project is different; design docs are stored in memory and change with each project).

---

## Checklist: Before Launching the Agent System

- [ ] Orchestrator's disallowed_tools includes Write, Edit, NotebookEdit
- [ ] game-dev's prompt includes the SKILL.md path (require reading it first)
- [ ] blender-dev's prompt includes polygon budget and preview requirements
- [ ] Memory system uses replace mode (not append)
- [ ] Awakening report tool is configured (summary, tasks_completed, questions)
- [ ] Supervisor has idle protection (pending_review / no_reports → skip)
- [ ] Inter-agent communication boundaries are defined in the prompt
- [ ] Build instructions are written into the game-dev prompt (scene-compiler validate + vite build)
- [ ] Phase plan includes "environment enrichment" and "atmosphere system" phases
- [ ] Turn budget is allocated by phase (assessment 5 + selection 3 + execution 40 + wrap-up 10)
- [ ] Prompt includes "execute autonomously, don't ask the human" + awakening report records decision reasoning
- [ ] Build failure has limited retries (maximum 2 times; if unfixable, record for next time)
- [ ] Reference files are annotated by phase for when to read (don't read all at once)
- [ ] Experienced agents use layered memory (index + detailed files, limit 20 entries)
