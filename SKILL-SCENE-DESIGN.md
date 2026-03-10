# Scene Design Patterns — Agent Skill Reference

> 場景精細度不是靠更多的 code，而是靠**設計決策的層次**。
> 本文件記錄從實戰中驗證過的場景設計模式。

---

## 精細度金字塔

場景精細度由底層到頂層：

```
Level 5: 互動回饋（破壞、連鎖爆炸、HUD 疊加）
Level 4: 氛圍系統（燈光、霧、Glow、音效）
Level 3: 環境點綴（路燈、招牌、機車、樹木）
Level 2: 場景骨架（建築、道路、地形）
Level 1: 遊戲機制（移動、射擊、碰撞）
```

**常見錯誤：** Agent 花 80% 時間在 Level 1-2，跳過 Level 3-4 直接做 Level 5。
**正確順序：** 完成每一層才往上走。Level 3-4 是「看起來精細」的關鍵。

---

## Pattern 1: 多層燈光系統

單一光源 = 平淡。三層光源 = 氛圍。

### 夜間場景（推薦配置）

```typescript
// Layer 1: 月光（全局冷色基調）
const moonLight = new DirectionalLight("moon", new Vector3(0.3, -1, -0.5), scene);
moonLight.intensity = 0.25;
moonLight.diffuse = new Color3(0.6, 0.6, 0.85); // 冷藍白

// Layer 2: 環境光（極暗，僅防止全黑）
const ambient = new HemisphericLight("ambient", new Vector3(0, 1, 0), scene);
ambient.intensity = 0.18;
ambient.groundColor = new Color3(0.05, 0.05, 0.08); // 幾乎無反彈光

// Layer 3: 路燈（暖色局部照明，製造對比）
const lampPositions = [/* 路口四角 + 街道兩側 */];
for (const pos of lampPositions) {
  const lamp = new PointLight(`lamp`, pos, scene);
  lamp.intensity = 1.2;
  lamp.diffuse = new Color3(1, 0.85, 0.55); // 暖橘
  lamp.range = 18;
  lamp.radius = 0.3; // 軟陰影
}
```

**為什麼有效：** 冷暖對比（月光 vs 路燈）自然引導視覺焦點到重要區域。

### 日間場景（替代配置）

```typescript
// 太陽光 + 天空環境光 + 地面反射
const sun = new DirectionalLight("sun", new Vector3(-0.5, -1, 0.3), scene);
sun.intensity = 0.8;
sun.diffuse = new Color3(1, 0.95, 0.85); // 暖白

const sky = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
sky.intensity = 0.4;
sky.groundColor = new Color3(0.3, 0.25, 0.2); // 地面反射暖色
```

---

## Pattern 2: 霧 = 免費的深度感

霧不只是視覺效果，它是**效能優化工具**——遠處物件被霧遮蓋後，LOD 切換和消失不會突兀。

```typescript
// EXP2 霧（指數衰減，自然感最好）
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogDensity = 0.012;        // 密度：0.008（薄霧）到 0.02（濃霧）
scene.fogColor = new Color4(0.03, 0.03, 0.08, 1); // 配合夜空色
```

**霧色規則：** 霧色 = 天空色 × 0.3。夜景用深藍黑，日景用淺灰藍。

---

## Pattern 3: GlowLayer（霓虹 / 發光效果）

選擇性發光比全場景發光更有效——只讓招牌、燈頭、特效發光。

```typescript
const glow = new GlowLayer("glow", scene, {
  mainTextureSamples: 4,
  mainTextureFixedSize: 512,
  blurKernelSize: 32,
});
glow.intensity = 0.6;

// 排除不需要發光的 mesh
glow.addExcludedMesh(ground);
glow.addExcludedMesh(road);

// 或者反向：只包含特定 mesh
glow.addIncludedOnlyMesh(neonSign);
glow.addIncludedOnlyMesh(lampHead);
```

**Emissive 材質配合：**
```typescript
// 招牌材質
const neonMat = new StandardMaterial("neon", scene);
neonMat.emissiveColor = new Color3(1, 0.2, 0.5); // 粉紅霓虹
neonMat.diffuseColor = Color3.Black();
neonMat.freeze();
```

---

## Pattern 4: 環境點綴密度

場景精細感來自**適當密度的環境物件**。太少 = 空曠，太多 = 雜亂。

### 密度參考（每 100m 街道）

| 物件類型 | 數量 | 放置規則 |
|---------|------|---------|
| 路燈 | 6-10 | 兩側交錯，間距 15-20m |
| 街樹 | 8-12 | 人行道內側，間距 10-15m |
| 停放機車 | 10-15 | 2-3 台一組，路邊群聚 |
| 招牌 | 每棟建築 50-70% 機率 | 隨機色彩（粉/綠/藍/金/紫） |
| 電線桿 | 2-4 | 路口附近 |

### 確定性隨機放置

用 seeded random 保證每次生成一樣的結果（多人連線必須）：

```typescript
// 簡易 LCG 隨機數產生器
function createSeededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

const random = createSeededRandom(42);

// 機車群聚放置
for (const group of scooterGroups) {
  const count = 2 + Math.floor(random() * 3); // 2-4 台一組
  for (let i = 0; i < count; i++) {
    const instance = container.instantiateModelsToScene();
    const root = instance.rootNodes[0];
    root.position = group.center.add(
      new Vector3(random() * 2 - 1, 0, random() * 2 - 1)
    );
    root.rotation.y = group.baseAngle + random() * 0.35; // 微小角度偏差
  }
}
```

---

## Pattern 5: 手工空間設計 > 程序生成

小規模地圖（< 200m × 200m）用手工設計比程序生成更有品質。

### T 字路口範例（台北戰線）

```
         ┌──────────┐
         │  建築群   │
    ─────┤          ├─────
 主路 14m │  T 路口  │ 支路 43m
    ─────┤   中心   ├─────
         │  建築群   │
         └──────────┘
```

**設計原則：**
- 路口中心 = 自然交火熱點
- 轉角 = 掩體位置
- 支路 = 側翼攻擊路線
- 每個位置都有遊玩意義，沒有「純裝飾」的空間

### 建築放置

```typescript
// 不是隨機排列——每棟建築有意圖
const buildings = [
  { model: "convenience_store", pos: [12, 0, 5], rot: Math.PI,   // 面向主路
    emissive: true },   // 便利商店有暖光
  { model: "arcade_apartment", pos: [12, 0, 20], rot: Math.PI,  // 公寓無光
    emissive: false },  // 明暗對比
  { model: "tea_shop", pos: [-12, 0, 35], rot: 0,               // 面向主路
    emissive: true },   // 茶店有霓虹
];
```

---

## Pattern 6: 多層回饋疊加

每個遊戲事件觸發**多個同時回饋**，這是「遊戲感」的核心：

### 「擊中敵人」的回饋堆疊

| 層級 | 回饋 | 持續時間 |
|------|------|---------|
| 視覺 | 準星收縮 | 100ms |
| 視覺 | 命中標記（X 形閃爍） | 200ms |
| 視覺 | 傷害數字飄起 | 500ms |
| 視覺 | 敵人命中閃白 | 50ms |
| 音效 | 命中音效（tick） | 即時 |
| HUD | 連殺計數器 +1 | 持續 |
| 觸覺 | 畫面微震（可選） | 50ms |

### 「玩家受傷」的回饋堆疊

| 層級 | 回饋 | 持續時間 |
|------|------|---------|
| 視覺 | 白色閃光覆蓋 | 100ms |
| 視覺 | 畫面邊緣血跡 | 2s 淡出 |
| 視覺 | 傷害方向弧線 | 1s |
| 視覺 | 低血量紅色脈動邊框 | 持續（HP < 30%） |
| 音效 | 受擊音效 | 即時 |
| HUD | 血條動畫下降 | 300ms |

**實作原則：** 每個回饋是獨立模組，透過事件系統觸發，不耦合在遊戲邏輯裡。

---

## Pattern 7: 程序化音效（零資源檔案）

用 Web Audio API 合成所有音效，不載入 .mp3/.wav：

```typescript
// 槍聲 = 白噪音 + 指數衰減 + 低通濾波
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

**優點：**
- 零載入時間
- 可即時調整參數（音高、音量隨遊戲事件變化）
- 不佔磁碟空間

---

## Pattern 8: 攝影機視角決定細節優先級

### 第三人稱（TPS）

```
攝影機在角色背後 8-12 單位 → 建築正面品質 > 屋頂 > 背面
                           → 地面細節中等重要
                           → 天空幾乎不可見
```

### 俯視角（Top-down）

```
攝影機在上方 45° → 屋頂品質 > 正面 > 背面
                 → 地面紋理非常重要
                 → 物件輪廓清晰度 > 表面細節
```

### Portrait 手機遊戲（3/4 視角）

```
固定攝影機角度 → 前景層次感 > 背景
              → 角色辨識度最重要
              → 背景可用低面數 + 霧遮蓋
```

**規則：** 先確定攝影機類型，再決定每個物件哪個面需要細節。不要均勻分配面數。

---

## 檢查清單：場景精細度自評

完成遊戲場景後，逐項檢查：

- [ ] **燈光**：是否有 2 層以上光源？是否有冷暖對比？
- [ ] **霧**：是否啟用霧效果？霧色是否配合天空？
- [ ] **發光**：是否有選擇性 GlowLayer？招牌/燈頭是否發光？
- [ ] **環境物件**：路燈、樹木、停放車輛是否有適當密度？
- [ ] **隨機性**：環境物件是否用 seeded random 放置？
- [ ] **音效**：是否有環境音 + 動作音效？至少 5 種不同音效？
- [ ] **HUD 回饋**：每個遊戲事件是否有 3+ 層同時回饋？
- [ ] **空間意圖**：每個區域是否有遊玩功能（不只是裝飾）？
- [ ] **攝影機適配**：物件細節是否根據攝影機角度分配？
