# Open World Budget v2 — 設計文件

*日期：2026-03-03*
*範疇：scene-compiler 開放世界優化支援*

---

## 問題陳述

現有 `game.budget.json` 設計哲學是「整個場景不能超過這個數字」。這在開放世界場景下有兩個根本問題：

1. **Agent 把 world total 當天花板** — 看到 `maxActiveMeshes: 500` 就認為整個世界只能有 500 個物件，做不出真正的開放世界。
2. **爆了才發現** — 沒有漸進式警告，build 通過 → 上線卡頓 → 才知道問題。

## 設計哲學：能力閘門（Capability Gate）

> 世界可以無限大，但任何一幀的渲染必須在 frame budget 內。
> 世界越大，agent 必須實作越多優化技術。沒有對應優化 → build 失敗。

```
Frame budget（固定）：任何一幀 active mesh ≤ 500
World budget（無上限）：靠 LOD + Octree + Streaming 填補差距

世界規模 vs 需要的優化技術：
< 500 mesh    → 無需任何優化
500–1000      → ⚠ 建議 Octree
1000–2500     → ❌ 必須有 Octree
2500–5000     → ❌ 必須有 Octree + LOD
5000+         → ❌ 必須有 Octree + LOD + Streaming
```

---

## 變更一：budget.json v2 Schema

### 新結構

```json
{
  "version": 2,
  "frame": {
    "maxDrawCalls": 200,
    "maxActiveMeshes": 500,
    "maxShadowCasters": 10,
    "maxRenderDistance": 300,
    "targetFPS": 30
  },
  "world": {
    "maxTotalMeshTypes": 50,
    "chunkSize": 100
  },
  "npcs": {
    "maxTotal": 100,
    "maxActive": 25,
    "activationRadius": 80
  },
  "openWorld": {
    "lodRequired": true,
    "lodDistances": [50, 150, 300],
    "octreeRequired": true,
    "streamingChunkSize": 100
  },
  "assets": {
    "maxGLBSizeMB": 5,
    "maxTextureSizePx": 2048
  },
  "thresholds": {
    "warn": 0.75,
    "error": 1.0
  }
}
```

### 欄位語義

| Section | 欄位 | 語義 |
|---------|------|------|
| `frame` | `maxDrawCalls` | 任何一幀的 draw call 上限 |
| `frame` | `maxActiveMeshes` | 任何一幀的 active mesh 上限 |
| `frame` | `maxShadowCasters` | 任何一幀的陰影投射體上限 |
| `frame` | `maxRenderDistance` | 相機 far plane |
| `frame` | `targetFPS` | 最低目標 FPS |
| `world` | `maxTotalMeshTypes` | 整個世界的 GLB 資產種類上限 |
| `world` | `chunkSize` | 建議 chunk 分割大小（單位：世界座標） |
| `npcs` | `maxTotal` | 世界中 NPC 總數上限 |
| `npcs` | `maxActive` | 同時啟動的 NPC 上限 |
| `npcs` | `activationRadius` | NPC 啟動半徑（單位：世界座標） |
| `openWorld` | `lodRequired` | 是否強制要求 LOD（true = 比例超標就 error） |
| `openWorld` | `lodDistances` | 建議的 LOD 切換距離 |
| `openWorld` | `octreeRequired` | 是否強制要求 Octree |
| `openWorld` | `streamingChunkSize` | Streaming 分塊大小 |
| `assets` | `maxGLBSizeMB` | 單一 GLB 檔案大小上限 |
| `assets` | `maxTextureSizePx` | 貼圖最大邊長（px） |
| `thresholds` | `warn` | 達到 limit × warn 時發 WARNING |
| `thresholds` | `error` | 達到 limit × error 時發 ERROR |

### 向後相容

舊版（無 `version` 欄位）的 `game.budget.json` 繼續支援，validator 自動識別版本。`frame.*` 欄位對應舊版的頂層欄位。

---

## 變更二：三個 Validator 變更

### 2a. 新規則：`require-lod`

**觸發條件：**
- 單一檔案內 `MeshBuilder.Create*` 呼叫數 > `frame.maxActiveMeshes × 0.5`
- 且整個 src/ 找不到 `.addLODLevel(`

**嚴重度：**
- `openWorld.lodRequired = false` → WARNING
- `openWorld.lodRequired = true` → ERROR

**訊息範例：**
```
[require-lod] OpenWorldBuilder.ts creates 847 meshes but no LOD levels found.
Add: mesh.addLODLevel(150, lowDetailMesh); mesh.addLODLevel(300, null);
```

### 2b. 新規則：`require-octree`

**觸發條件：**
- 整個 src/ 估算 mesh 建立總數 > `frame.maxActiveMeshes × 2`
- 且整個 src/ 找不到 `createOrUpdateSelectionOctree`

**嚴重度：**
- `openWorld.octreeRequired = false` → WARNING
- `openWorld.octreeRequired = true` → ERROR

**訊息範例：**
```
[require-octree] Scene creates ~1200 meshes (2.4× frame budget of 500).
Add after scene setup: scene.createOrUpdateSelectionOctree(32, 2);
```

### 2c. 修正：`no-raw-mesh-in-loop` 誤報

**現有問題：**
Midnight 的 `buildLaneMarkings()` 在迴圈內建立 mesh，最後呼叫 `Mesh.MergeMeshes()` — 這是正確的優化模式，但現有規則會誤報 ERROR。

**修正邏輯：**
```
迴圈內有 MeshBuilder.Create* ?
  → 同函數內有 Mesh.MergeMeshes() ?
      → YES: 豁免（merge-after-loop 正確模式）
      → NO:  ERROR（raw mesh in loop）
```

---

## 變更三：SKILL.md 新增段落

在現有 SKILL.md 末尾新增「開放世界優化原則」段落，涵蓋：

- Frame Budget vs World Budget 核心概念
- 比例閘門表格（什麼規模需要什麼優化）
- LOD、Octree、Streaming、NPC distance culling 程式碼範例
- `merge-after-loop` 豁免模式說明（避免 agent 誤以為迴圈建立 mesh 都是錯的）

---

## 變更四：Midnight memory 新增段落

在 `/home/wake/voiceloader/memory/midnight.md` 「技術筆記」節新增「開放世界效能原則」。

**時機說明：** Midnight 目前在里程碑 3→4 過渡，里程碑 4 是「世界擴展」。在大量新增物件之前植入優化知識，避免爆了才修。

**內容：**
- Frame Budget vs World Budget 核心認知
- 比例閘門規則（什麼規模需要什麼優化）
- 已知正確模式確認（NPC culling ✅、MergeMeshes ✅）
- 待加入的優化（建築 LOD、場景 Octree）

---

## 檔案變更清單

| 檔案 | 變更類型 |
|------|---------|
| `game.budget.json` | 更新為 v2 schema |
| `packages/validator/src/types.ts` | 更新 `BudgetConfig` 型別 |
| `packages/validator/src/rules/no-raw-mesh-in-loop.ts` | 修正誤報邏輯 |
| `packages/validator/src/rules/require-lod.ts` | 新建 |
| `packages/validator/src/rules/require-octree.ts` | 新建 |
| `packages/validator/src/rules/index.ts` | 註冊新規則 |
| `packages/validator/src/validator.ts` | 支援 v2 budget 解析 |
| `packages/runtime/src/types.ts` | 更新 `RuntimeBudgetConfig` |
| `packages/runtime/src/AdaptiveQuality.ts` | 從 budget v2 讀取設定 |
| `SKILL.md` | 新增開放世界段落 |
| `/home/wake/voiceloader/memory/midnight.md` | 新增效能原則段落 |
| `packages/validator/tests/rules.test.ts` | 新增三個規則的測試 |
