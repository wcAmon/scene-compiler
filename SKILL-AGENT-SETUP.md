# Agent Architecture for Game Development — Human Reference

> 本文件是給**人類**看的。
> 記錄如何設計 AI agent 系統來開發 Babylon.js 遊戲，基於實際運行數百次覺醒的經驗。

---

## 核心發現：Orchestrator 模式產出更精細的場景

我們測試了兩種 agent 架構：

| | Orchestrator 模式 | Direct 模式 |
|---|---|---|
| **代表** | midnight（台北戰線） | dusk（Banana Defense） |
| **agent 能否寫 code** | 禁止 Write/Edit | 可以 |
| **子 agent** | game-dev, blender-dev, fullstack-dev | game-dev, blender-dev |
| **產出規模** | 14,825 行, 25 個模組 | 3,395 行, 11 個檔案 |
| **3D 資產** | 10+ GLB 模型 | 0 GLB（純程序化） |
| **場景精細度** | 高（多層燈光、環境物件、氛圍） | 中（功能完整但視覺單薄） |
| **開發週期** | 11 個 phase, ~2 週 | 2 個 phase, ~1 週 |

**結論：** 當 orchestrator 不能自己寫 code 時，它會：
1. 花更多 turns 在**設計和審核**上
2. 給子 agent 更**具體的指示**（因為它必須用文字描述想要的效果）
3. 主動使用**資產管線**（因為它不能用 MeshBuilder 偷懶）
4. 對結果做更嚴格的 **QA**（因為它只能看，不能改）

---

## Agent 角色設計

### Orchestrator（總監）

```
職責：規劃、決策、審核、溝通
禁止工具：Write, Edit, NotebookEdit
允許工具：Read, Bash, Glob, Grep + MCP tools（記憶、報告、資產管理）
模型：最強模型（如 claude-opus-4-6）
Turn 預算：100-120 turns
```

**為什麼禁止寫 code：**
- 強制使用子 agent，產生可審核的工作邊界
- 避免 orchestrator 陷入 debug 循環
- 保持 orchestrator 的注意力在全局設計上

### game-dev（遊戲開發者）

```
職責：寫 Babylon.js/TypeScript 代碼
允許工具：Read, Write, Edit, Bash, Glob, Grep
模型：強模型（claude-opus-4-6 或 claude-sonnet-4-6）
Turn 預算：由 orchestrator 控制
```

**Prompt 中必須包含：**
- 工作目錄路徑
- scene-compiler SKILL.md 的路徑（要求先讀）
- Build 指令（驗證代碼是否通過 scene-compiler）
- 明確的邊界（不能改哪些檔案）

### blender-dev（3D 建模者）

```
職責：寫 Blender Python 腳本，產出 GLB + 預覽圖
允許工具：Read, Write, Edit, Bash, Glob, Grep
模型：強模型
Turn 預算：由 orchestrator 控制
```

**Prompt 中必須包含：**
- blender-modeling 參考文件路徑
- 輸出目錄路徑
- 面數預算
- 必須產出 3 張預覽 + bbox 的要求

---

## 記憶驅動的自適應開發

**這是最重要的設計模式。**

Agent 不是按照一個固定計畫執行到底。它每次覺醒時：
1. 讀取記憶（上次做了什麼、當前里程碑、技術筆記）
2. 讀取外部輸入（人類訊息、其他 agent 的報告、資產回饋）
3. **根據當前狀況重新決策**
4. 執行一個任務
5. **更新記憶**（不是 append，是 replace — 記憶永遠反映最新狀態）

### 記憶結構設計

```markdown
## 北極星
一句話描述最終目標（永遠不變）

### 階段里程碑
1. 核心玩法原型 ✅
2. 射擊系統 ✅
3. 多人連線 ✅
4. 場景豐富化 ← 當前
5. 打磨 & QA

## 當前狀態
- 版本：v0.8.0
- 最近完成：路燈 + 街樹放置
- 下一步：機車群聚放置
- 已知問題：路口碰撞牆需要開口

## 技術筆記
- freezeWorldMatrix 後用 setEnabled() 不用 scaling
- 多關卡 return early 不 removeCallback
- （只記有用的教訓，不記流水帳）

## 已完成資產
- name (id): 狀態
```

### 為什麼用 replace 而非 append

Append 模式會導致記憶無限膨脹，早期的過時資訊干擾決策。
Replace 模式強制 agent 每次覺醒時**整理和濃縮**記憶，只保留當前相關的資訊。

```python
# 覺醒結束時
write_memory_tool(replace=true)  # 不是 append！
```

### 自適應決策流程

```
讀取記憶
  ↓
掃描外部輸入：
  人類訊息？→ 最高優先級，立即處理
  資產回饋？→ 高優先級，修正資產
  已完成資產？→ 整合進遊戲
  其他 agent 報告？→ 參考但不干涉
  ↓
（以上都沒有）
  ↓
根據里程碑進度選擇下一個任務
  ↓
宣告「本次覺醒專注於：[任務]」
  ↓
執行
  ↓
更新記憶（replace）
```

**關鍵：** Agent 的計畫（里程碑列表）會隨著開發過程演化。
Phase 3 可能原本計畫做「外送系統」，但實際跑起來發現玩法更適合波次生存，就把外送標記為「暫停」並調整方向。
這不是 bug，這是設計——**記憶是活的文件，不是死的計畫。**

---

## 單任務專注模式

每次覺醒只做**一個任務**，做完做好。

**為什麼不做多任務：**
- Agent context window 有限，多任務會導致每個任務都做得淺
- 單任務更容易 QA — 如果 build 壞了，肯定是這個任務造成的
- 覺醒報告更清晰 — 「本次完成了 X」比「本次推進了 X, Y, Z 各 30%」更有用
- 人類更容易追蹤進度

**任務粒度範例：**
- ✅ 好的粒度：「實作 5 關卡推進系統」
- ✅ 好的粒度：「整合 3 個已完成資產到場景中」
- ❌ 太大：「完成 Phase 7」
- ❌ 太小：「修改一行 CSS」

---

## 覺醒排程設計

### 決定覺醒頻率的因素

| 因素 | 高頻率（每 2h） | 低頻率（每 12h） |
|------|---------------|----------------|
| 開發速度 | 快速迭代 | 深思熟慮 |
| Token 成本 | 高 | 低 |
| 適合誰 | 主要開發者（midnight） | 內容產出者（dawn） |
| 適合什麼 | 遊戲功能開發 | 部落格寫作 |

### 空轉保護

Agent 沒事做時不應該浪費 token 做「健康檢查」。在 supervisor 加檢查：

```python
# 如果遊戲在等待人類審核 且 沒有人類訊息 → 跳過
if pending_review and not messages and not assets and not feedbacks:
    return {"status": "skipped", "reason": "pending_review"}

# 如果沒有覺醒報告 且 沒有訊息 → 跳過（適用於 dawn 等讀報告的 agent）
if not reports and not messages:
    return {"status": "skipped", "reason": "no_reports"}
```

---

## Agent 間通訊

### 合作模式

Agent 可透過 message 系統互相溝通：

```python
send_message_to_agent("dusk", "幫手召喚系統設計規格已寫入 design doc，請讀取")
```

**風險：** Agent 會自發協作（看到對方的訊息後主動幫忙）。
如果不希望 agent 跨界，需要在 prompt 中明確限制：

```markdown
## 邊界
- 你只負責 /home/wake/runner-game/ 的開發
- 不要修改其他 agent 的遊戲專案
- 不要主動幫其他 agent 做事
```

### 報告可見性

`get_recent_reports_tool()` 返回**所有 agent** 的報告。
如果需要隔離，在 MCP tool 層面過濾：

```python
# 只返回自己的報告
reports = [r for r in all_reports if r["agent"] == AGENT_NAME]
```

---

## Phase 規劃建議

基於台北戰線的 11 phase 經驗，建議的 phase 結構：

### 前期（功能導向）
1. **核心玩法原型** — 最小可玩版本，驗證基本機制
2. **核心機制完善** — 補齊缺失的遊戲機制
3. **世界骨架** — 道路、建築、基本場景

### 中期（內容導向）
4. **資產管線啟動** — 提案 + 建模 + 整合第一批 GLB
5. **遊戲深度** — 敵人種類、武器、技能樹
6. **多人連線**（如需要）— 網路同步、房間系統

### 後期（打磨導向）
7. **環境豐富化** — 路燈、樹木、招牌、停放車輛（Level 3 精細度）
8. **氛圍系統** — 多層燈光、霧、GlowLayer、音效（Level 4 精細度）
9. **互動回饋** — HUD 疊加、破壞系統、連鎖效果（Level 5 精細度）
10. **UX 打磨** — 載入畫面、暫停、設定、教學提示
11. **QA & 修 bug** — 最終驗收

**關鍵：Phase 7-8 是大多數遊戲跳過的，但它們是精細度的核心。**
在規劃時明確加入「環境豐富化」和「氛圍系統」phase，不要讓它們被功能開發擠掉。

---

## 實際 Orchestrator Prompt 範本

```markdown
# {agent_name} — 遊戲總監

你是 **{agent_name}**，{game_name} 的遊戲總監。

## 核心身份
- 你是**設計者和審核者**，不是開發者。你不寫遊戲代碼。
- 你透過子 agent 執行工作：game-dev（寫代碼）、blender-dev（建模）。
- 你的職責：規劃任務、審核結果、管理資產管線、維護品質。

## 覺醒工作流程
1. `read_memory_tool()` — 讀取記憶（北極星、里程碑、進度、技術筆記）
2. 檢查外部輸入（人類訊息 > 資產回饋 > 已完成資產 > 開發任務）
3. 宣告「本次覺醒專注於：[一個任務]」
4. 透過子 agent 執行任務
5. 驗證結果（build / 預覽檢查）
6. `write_awakening_report_tool()` — 繳交覺醒報告
7. `write_memory_tool(replace=true)` — 更新記憶

## 資產管線（強制）
- 場景中的 3D 物件**必須**使用 GLB 資產，不可用 MeshBuilder 代替
- 資產流程：propose → reference → blender-dev → QA → integrate
- 每次覺醒最多提案 3 個資產
- 整合前必須 QA 審核（對比參考圖 + 尺寸檢查）

## 記憶管理
- 覺醒結束前**必須** `write_memory_tool(replace=true)` 更新記憶
- 記憶格式：北極星 + 里程碑列表 + 當前狀態 + 技術筆記 + 已完成資產
- 里程碑可以根據實際進展調整（標記暫停、新增、重排序）
- 技術筆記只記有用的教訓，不記流水帳

## 限制
- **禁止** Write, Edit, NotebookEdit（你是 orchestrator）
- 每次覺醒只做**一個**任務
- 子 agent 寫的代碼必須通過 scene-compiler build
```

---

## 架構選型：Prompt-guided vs Memory-guided

這是設計 agent 系統的**第一個決策**。選錯了會影響整個專案的規模和品質。

### 兩種模式

| | Prompt-guided（北極星在 prompt） | Memory-guided（北極星在記憶） |
|---|---|---|
| **Prompt 內容** | 遊戲類型、美術風格、攝影機架構、子 agent 職責、資產管線、技術參考索引 | 通用的 orchestrator 流程、子 agent 用法 |
| **記憶內容** | 里程碑進度、技術筆記、已完成資產 | **整份設計文件** + 進度 + 技術筆記 |
| **不變的部分** | 「Co-op TPS、台灣街景、越肩視角、正面品質 > 屋頂」 | 幾乎只有「你是管理者」 |
| **會變的部分** | 當前 Phase、做到哪裡 | 在做什麼遊戲、設計方向、進度 |

### 為什麼這決定了專案規模

**Prompt 是每次覺醒都會讀到的** — agent 無法忘記它、無法修改它、無法跳過它。

Prompt-guided agent 的 prompt 寫死了技術約束（攝影機架構、材質管線、QA 流程、職責劃分）。這些是**護欄**。不管記憶怎麼變、里程碑怎麼調整，agent 永遠不會：
- 用 MeshBuilder 偷懶（因為 prompt 強制資產管線）
- 跳過 QA（因為 prompt 寫了「嚴格 — 不可跳步」）
- 把射擊邏輯丟給錯的子 agent（因為 prompt 寫了職責劃分）

Memory-guided agent 的設計文件在記憶裡，agent 可以修改它。靈活但也危險 — agent 可能在某次覺醒中「優化」設計文件，無意間改掉重要的技術約束。

### 累積效應

這是真正的差異。

Prompt-guided agent 做了 11 個 Phase，每個 Phase 的成果**疊加**在前一個上。因為攝影機架構、材質管線從第一天就固定，Phase 11 的載入畫面和 Phase 1 的核心玩法用的是同一套技術基礎。技術債務低，成果可累積。

Memory-guided agent 做 11 個 Phase，中途可能因為記憶被修改，導致 Phase 6 的技術決策和 Phase 1 不一致。

### 選型指南

| 選擇 | 條件 |
|------|------|
| **Prompt-guided** | 方向明確、長期開發（> 5 phases）、需要資產管線、多人連線等複雜系統 |
| **Memory-guided** | 需要探索、短期開發（< 5 phases）、專案會切換、方向未定 |

### 混合策略

也可以混合：用 prompt 固定**技術約束**（攝影機、材質管線、QA 流程），用記憶存**設計方向**（遊戲主題、關卡設計、角色設定）。這樣技術基礎穩定，但創意方向靈活。

```markdown
# Prompt 中（不變）
- 你是 orchestrator，禁止 Write/Edit
- 攝影機架構：[具體技術規格]
- 資產管線：propose → blender → QA → integrate
- Build 驗證：scene-compiler validate + vite build

# 記憶中（可變）
## 當前遊戲設計
- 主題：[可調整]
- 關卡設計：[可調整]
- 角色設定：[可調整]
```

---

## Prompt 設計模式

以下是從實際運行的 orchestrator prompt 中提煉的設計模式。

### Turn 預算分配

不要只給 agent 一個總 turn 數——**按階段分配**，強制時間管理：

```markdown
## 覺醒工作流程

每次覺醒你有 **60 turns 預算**：

### 第一階段：狀況評估（5 turns）
1. read_memory_tool()
2. 檢查人類訊息
3. 掃描遊戲 source code

### 第二階段：選擇唯一任務（3 turns）
選擇一個任務，宣告「本次覺醒專注於：[任務]」

### 第三階段：執行（40 turns）
透過子 agent 執行

### 第四階段：收尾（10 turns）
Build 驗證 + 覺醒報告 + 記憶更新
```

**為什麼有效：** Agent 不會花 30 turns 「評估狀況」然後只剩 10 turns 做事。

### 自主決策 + 決策紀錄

```markdown
**自主執行原則：不需要問人類意見，直接朝北極星前進。**
遇到決策點時，自行判斷最佳方案執行，在覺醒報告中記錄決策理由。
人類的意見會透過訊息送達，收到後優先處理即可。
```

**為什麼有效：** Agent 不會卡在「要不要問人類」的猶豫中。
人類透過非同步訊息參與，agent 透過報告記錄為什麼這樣決定——雙方都有完整資訊。

### Build 失敗的有限重試

```markdown
1. Build 驗證
   - **Build 成功** → 繼續收尾
   - **Build 失敗** → 啟動 game-dev 修復，再跑一次（最多重試 2 次）
   - 修不好的話在覺醒報告中記錄，下次覺醒優先處理
```

**為什麼有效：** 防止 agent 陷入 build → fail → fix → fail 的死循環消耗所有 turns。
2 次重試是經驗值——大多數 build 錯誤 1-2 次就能修好，修不好的通常需要更大的設計變更。

### 按 Phase 讀參考文件

不要讓 agent 一次讀完所有參考文件——按當前需要讀。

```markdown
## 技術參考文件（按需讀取）

| 文件 | 何時讀 |
|------|--------|
| TPS 戰鬥系統 | **Phase 1**：射擊、動畫混合、破壞 |
| 多人連線 | **Phase 2**：WebSocket、狀態同步 |
| NPC 尋路 | **Phase 3**：敵人 AI、NavMesh |
| 光照系統 | **Phase 7**：光源、陰影、霓虹 |

**原則：依 Phase 需要讀取 — 不需要一次全讀。**
```

**為什麼有效：** 節省 context window。一個 500 行的參考文件在不需要時讀進去，會擠壓 agent 做其他事情的空間。

### 分層記憶（適用於有大量可重用經驗的 agent）

當 agent 累積的經驗太多放不進一份記憶檔案時，用**索引 + 詳細檔案**的兩層結構：

```markdown
## Blender 成功模式索引（上限 20 條）

格式：`- {名稱}｜{手法關鍵字}｜{面數}｜→ memory/references/blender-scripts/{filename}.md`

- 台灣騎樓公寓｜bmesh extrude + array｜5K faces｜→ blender-scripts/taiwan-apartment.md
- 路燈｜cylinder + torus + emission｜800 faces｜→ blender-scripts/street-lamp.md
```

**使用規則：**
1. 建模前先查索引，有相似物件就讓子 agent 讀詳細檔案
2. 成功建模後寫入詳細檔案 + 更新索引
3. 索引滿 20 條時淘汰最不通用的（特殊造型優先淘汰，通用模式優先保留）

**為什麼有效：** 記憶不膨脹（索引只有 20 行），但經驗不丟失（詳細檔案隨時可讀）。

### 設計文件的放置：Prompt vs 記憶

兩種策略都可行：

| 策略 | 適用場景 | 優點 | 缺點 |
|------|---------|------|------|
| **設計文件在 prompt 裡** | 專案固定、方向不變 | 每次覺醒一定會讀到 | 佔 prompt 空間 |
| **設計文件在記憶裡** | 專案會變、方向會調整 | agent 可以隨時修改 | agent 可能不讀 |

Midnight 用的是 **prompt 策略**（TPS 遊戲方向固定，prompt 裡寫死「Co-op TPS, 台灣街景」）。
Dusk 用的是 **記憶策略**（遊戲工廠，每個專案不同，設計文件存在記憶裡隨專案變化）。

---

## 檢查清單：Agent 系統上線前

- [ ] Orchestrator 的 disallowed_tools 包含 Write, Edit, NotebookEdit
- [ ] game-dev 的 prompt 包含 SKILL.md 路徑（要求先讀）
- [ ] blender-dev 的 prompt 包含面數預算和預覽要求
- [ ] 記憶系統使用 replace 模式（不是 append）
- [ ] 覺醒報告工具已配置（summary, tasks_completed, questions）
- [ ] Supervisor 有空轉保護（pending_review / no_reports → skip）
- [ ] Agent 間通訊邊界已在 prompt 中定義
- [ ] Build 指令已寫入 game-dev prompt（scene-compiler validate + vite build）
- [ ] Phase 規劃包含「環境豐富化」和「氛圍系統」phase
- [ ] Turn 預算按階段分配（評估 5 + 選擇 3 + 執行 40 + 收尾 10）
- [ ] Prompt 包含「自主執行，不需問人類」+ 覺醒報告記錄決策理由
- [ ] Build 失敗有限重試（最多 2 次，修不好記錄到下次）
- [ ] 參考文件按 Phase 標註何時讀（不要一次全讀）
- [ ] 經驗豐富的 agent 使用分層記憶（索引 + 詳細檔案，上限 20 條）
