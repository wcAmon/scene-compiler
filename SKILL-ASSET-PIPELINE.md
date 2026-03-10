# 3D Asset Pipeline — Agent Skill Reference

> 強制 agent 使用結構化的資產管線，是場景精細度的最大單一因素。
> 沒有管線的遊戲（純程序化 MeshBuilder）和有管線的遊戲，精細度差距是數量級的。

---

## 為什麼需要強制資產管線

Agent 天然傾向用 `MeshBuilder.CreateBox()` 快速搭建場景——這在原型階段有效，但會導致：
- 所有物件看起來像幾何體，缺乏辨識度
- 無法復用資產（每次重建）
- 沒有 QA 環節，品質失控
- 場景缺乏層次感（所有東西都是同質的 primitive）

**強制使用 GLB 資產管線後：**
- 每個物件都經過提案 → 建模 → 審核 → 整合的流程
- Blender 可以做出 MeshBuilder 做不到的細節（弧面、UV 材質、骨架動畫）
- 審核環節強制 agent 對比參考圖，品質有底線
- 資產可跨專案復用

---

## 資產生命週期（6 階段）

```
queued → reference_generated → in_progress → review → completed → integrated
  ↑                                            |
  └────── feedback（人類或 agent 退回）──────────┘
```

### Stage 1: 提案（Proposal）

由 orchestrator agent 呼叫 `propose_asset_tool()`：

```
name:          snake_case 識別碼（如 taiwan_arcade_apartment）
category:      vehicle | prop | character | environment | building | furniture | destructible
description:   視覺風格描述（給 Gemini 和 blender-dev 看的）
dimensions_m:  JSON {"x": 4.5, "y": 1.8, "z": 2.0}（真實世界尺度，1 unit = 1 meter）
purpose:       在遊戲中的用途
world_position: 放置位置
priority:      critical | high | medium | low
reusable:      true（通用物件如路樹）| false（獨特物件如特定建築）
```

**提案規則：**
- 提案前**必須**搜尋現有資產（`list_assets_tool()`），避免重複
- 每次覺醒最多 3 個提案
- 提案不可刪除，只能暫停（`set_asset_on_hold_tool()`）
- reusable 資產不可重複提案

### Stage 2: 參考圖生成（Reference）

AI 圖像生成（如 Gemini）產生參考圖：

```
輸入：asset description + style hints
輸出：{name}_ref_v{N}.png
存放：public/assets/references/
```

參考圖的作用是**給 blender-dev 一個視覺目標**，也作為 QA 審核的比對基準。

### Stage 3: Blender 建模（Production）

由 blender-dev 子 agent 執行 headless Blender 腳本：

**輸入：**
- 參考圖路徑
- 目標尺寸（meters）
- 面數預算（見下方表格）

**輸出（必須全部產出）：**
- `{name}.glb` — 3D 模型
- `{name}_preview_front.png` — 正面預覽
- `{name}_preview_side.png` — 側面預覽
- `{name}_preview_34.png` — 3/4 角度預覽
- stdout 印出 `BBOX: x=1.23 y=4.56 z=7.89` 和 `Faces: 1234`

**面數預算表：**

| 類型 | 面數範圍 | 說明 |
|------|---------|------|
| 小道具（桶、箱） | 200–500 | 簡單幾何 |
| 中型道具（機車、攤位） | 500–2,000 | 可識別輪廓 |
| 角色 | 3,000–8,000 | 需要表情和姿態 |
| 建築 | 2,000–5,000 | 正面需細節，背面可簡化 |
| 大型環境 | 5,000–10,000 | 多部件組合 |

### Stage 4: QA 審核（Review）

**嚴格 6 步驟流程：**

1. **讀取 3 張預覽圖** — 缺圖 = 自動 FAIL
2. **結構化視覺分析** — 描述每張圖中可見的部件、缺失、比例
3. **對比參考圖** — 形狀、比例、風格偏差
4. **尺寸檢查** — bbox 是否在預期範圍
5. **Pass/Fail 判定** — 全部通過才 PASS；FAIL 需附具體修改指示
6. **記錄迭代** — `record_iteration_tool()` 記錄本輪結果

**PASS 條件（全部滿足）：**
- 3 張預覽完整且清晰
- 合理匹配參考圖
- 無主要缺失部件
- 如有前輪回饋，已可見修正
- bbox 在預期範圍內

**FAIL 後：** 重新 spawn blender-dev，附帶**具體修改指示**（不是「做得更好」，而是「左側窗戶缺失，參考圖中有 3 扇窗」）。最多重試 3 次。

### Stage 5: 完成（Completion）

資產具備：
- ✓ GLB 檔案
- ✓ 3 張預覽圖
- ✓ 面數、頂點數、bbox 度量
- ✓ 迭代歷史記錄
- ✓ status = completed, integrated = 0

### Stage 6: 遊戲整合（Integration）

Orchestrator agent 將 GLB 載入遊戲代碼：

```typescript
// 單次使用
const result = await SceneLoader.ImportMeshAsync("", "/assets/models/", "name.glb", scene);

// 多次實例化
const container = await SceneLoader.LoadAssetContainerAsync("/assets/models/", "name.glb", scene);
const instance = container.instantiateModelsToScene();
```

整合後呼叫 `mark_asset_integrated_tool(asset_id)`。

---

## 回饋迭代循環

人類或 agent 可對任何階段的資產提供回饋：

```
人類回饋 → asset_feedback 表 → agent 下次覺醒讀取
  ↓
agent 根據回饋：
  1. 重新生成參考圖（modify_existing=true）
  2. 重新 spawn blender-dev 附帶修改指示
  3. 重新 QA 審核
  4. record_iteration_tool() 記錄新一輪
```

迭代次數透過 `asset_rounds` 表追蹤，每輪有獨立的 summary 和 preview_paths。

---

## Blender 腳本模板

每個 Blender 腳本必須遵循此結構（詳見 SKILL.md 的 Blender 章節）：

```python
#!/usr/bin/env python3
import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix

# 1. 清空場景
bpy.ops.wm.read_factory_settings(use_empty=True)

# 2. 設定輸出路徑
OUTPUT_DIR = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "/tmp"
MODEL_NAME = "my_model"

# 3. 建模（bmesh / bpy.ops）
# ...

# 4. PBR 材質（Principled BSDF）
# ...

# 5. Apply transforms（匯出前必做）
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# 6. 匯出 GLB
bpy.ops.export_scene.gltf(filepath=os.path.join(OUTPUT_DIR, f"{MODEL_NAME}.glb"),
    export_format='GLB', use_selection=True, export_yup=True,
    export_apply=True, export_materials='EXPORT')

# 7. 印出 bbox + 面數
dims = obj.dimensions
print(f"BBOX: x={dims.x:.2f} y={dims.y:.2f} z={dims.z:.2f}")
print(f"Faces: {len(obj.data.polygons)}")

# 8. 渲染 3 角度預覽
# ... (front, side, 3/4)
```

**執行：** `blender --background --python script.py -- /output/directory/`

---

## 關鍵規則

1. **每個 GLB = 1 材質**（多材質 = 多 draw call）
2. **1 Blender unit = 1 meter**（真實世界尺度）
3. **圓柱體 8-12 段**（不用預設 32 段）
4. **禁止 Subdivision Surface modifier**（面數爆炸）
5. **角色/車輛面向 +Y**（Blender 座標，匯出後 = glTF +Z）
6. **匯出前 Apply Transforms**（location + rotation + scale）
7. **每次建模必須產出 3 張預覽 + bbox**（無預覽 = QA 無法審核）
8. **Texture 解析度上限 1024x1024**（瀏覽器記憶體限制）
