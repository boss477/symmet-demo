# Floor-Plan Viewer: DRRT System Analysis

**DRRT = Deconstruct, Relationships, Recognize, Test** — where *Relationships* are co-creative dynamics (not linear cause-effect), and feedback loops drive pattern emergence.

---

## DECONSTRUCT: Atomic Parts

### Actors
- **User** — places furniture, rotates items, adjusts colors, invokes undo/redo, checks 3D rendering
- **Catalog** — a multi-vendor pool of SKU entries + presets; sources from Supabase or offline defaults
- **2D Canvas** — Fabric.js renderer for top-down plan; source of truth for item placement
- **3D Viewer** — Three.js environment; mirrors 2D positions, interprets materials/lighting
- **Geometry Engine** — calculates walls, snap points, dimension caching, collision bounds
- **Vision Service** — reads floor images, infers room geometry, suggests furniture placement
- **Undo/Redo Stack** — captures state snapshots; enables temporal navigation
- **Selection State** — tracks which item(s) are active; gates mutation

### Data Structures
- **Furniture Item** — placed instance (x, y, rotation, catalogId, overrides like sofa color)
- **Catalog Entry** — template (id, width, depth, colors, GLB URL, vendor, price)
- **Plan Geometry** — walls, doors, floor area, snap grid
- **Material Cache** — resolved colors, textures for 3D rendering

---

## RELATIONSHIPS: Co-Creative Dynamics

**Key insight:** These parts don't fire in sequence. They respond to each other in real time, each shaping the constraints and affordances the others perceive.

### 1. **User ↔ Selection → Mutation Affordance**
- **What User does:** clicks on furniture → triggers selection
- **What happens:** selection gates ALL mutations (move, rotate, color override)
- **Co-creative loop:** User can only see what Selection offers; Selection only exists because User clicked
- **Variability:** collaborative contexts (e.g., shared plan) change who can select what at any moment

### 2. **Item Placement ↔ Geometry ↔ Snap Grid**
- **What happens:** User drags item to new (x, y)
- **Geometry responds:** calculates distance to walls, obstacles, snap points
- **What Item sees:** constrained movement envelope (can snap, cannot clip walls)
- **Item responds:** snaps visually; updates rendering; records position
- **Geometry sees:** new item position → recalculates collision bounds
- **Co-creative:** Item position and Geometry bounds co-evolve; User experience (smooth snapping) *emerges* from their synchronization
- **Variability:** Snap threshold, wall tolerance, and grid size shift based on zoom, plan scale, device DPI

### 3. **2D Render ↔ 3D Render ↔ Material Override**
- **What 2D does:** draws items, shows relative sizes and orientation
- **What 3D does:** interprets same item data; adds lighting, depth, materials
- **Material Override happens:** User selects sofa color; 2D shows outline change; 3D re-renders fabric
- **Co-creative:** The same Item object is mutated by both; neither is "source of truth"—they are **mirrors with agency**
  - If 3D material load fails, 2D should warn user (feedback from 3D failure → User signal)
  - If 2D rotation snaps to grid but 3D shows continuous rotation, User perception fractures

### 4. **Catalog Seam ↔ Icon Inference ↔ User Recognition**
- **Fetch (Supabase or offline)** → **Adapt (raw row → Entry)** → **Hold (indexed lookup)**
- **Icon Inference** runs on Catalog Entries: "is this a sofa?" → assigns shape + icon
- **User sees:** icons in toolbar; recognizes item type by visual affordance
- **Co-creative:** User's mental model of item types is shaped by icons; icon accuracy shaped by Catalog completeness
- **Feedback:** If icon inference fails, User confusion propagates → they place wrong item → plan looks off → they delete → back to start
  - This loop *teaches* what data Catalog is missing (missing `sku`, wrong color field)

### 5. **Undo/Redo ↔ Rendered State ↔ User Confidence**
- **User clicks Undo** → Stack pops prior state snapshot
- **Item positions, rotations, overrides revert** → 2D and 3D re-render
- **User sees:** entire plan reverts; can step forward again
- **Co-creative:** Confidence to experiment emerges *because* Undo is instant and visible
- **Feedback:** If Undo is slow, User hesitates → makes fewer exploratory moves → discovers fewer solutions
  - Performance becomes a design constraint

### 6. **Vision Service ↔ Geometry ↔ Furniture Placement**
- **User uploads floor photo** → Vision infers walls, doors, floor area
- **Geometry layer consumes:** wall lines, snap grid updates
- **Placement layer consumes:** new geometry → re-calculates valid snap zones
- **Existing items may violate new geometry** → system must either:
  - Auto-nudge items away from walls
  - Flag violations and ask User to resolve
  - Create friction in User workflow (may not use Vision feature again)
- **Feedback:** Vision accuracy shapes plan confidence; plan violations shape Vision iteration (User corrects walls → trains future models)

---

## RECOGNIZE: Emergent Patterns

### Pattern 1: **Coherence Through Mirroring**
The 2D and 3D renderers don't fight because they share the same Item data structure. Mutations flow through a single point (Item.update or item[field] = value). **The pattern:** single-entry mutation gates → coherent dual-render output.

*Anti-pattern exists:* If 2D uses different coordinate system than 3D, or color caches diverge, the mirrors crack and User perception fragments.

### Pattern 2: **Affordance Cascade**
User action (e.g., "I want this sofa green") triggers a cascade:
1. Selection gates the action (must select sofa first)
2. Catalog Entry checks if Entry.isColorable
3. Material Cache looks up available colors
4. 2D re-renders (outline + icon color)
5. 3D re-requests GLB + material
6. If any step fails, User sees partial affordance loss ("I can see the color option but 3D doesn't show it")

*Pattern:* each layer's failure cascades downstream unless handled. The system is robust only if each layer can fail independently and signal upstream.

### Pattern 3: **Exploratory Friction**
Undo latency, snap threshold sensitivity, icon confusion—each small friction point compounds. A User discovering the plan via trial-and-error hits cumulative friction → fewer experiments → fewer insights.

*Feedback loop:* Friction increases → experiments decrease → insights decrease → User satisfaction decreases → usage decreases → design debt accumulates (e.g., "users never use Vision").

### Pattern 4: **Catalog Completeness ↔ Item Placement Success**
Missing SKU → User can't find sofa they want → uses preset instead → preset doesn't fit room → abandons plan.

Feedback: Gaps in Catalog create adoption friction that looks like "users don't want custom items" (not true—they want items but can't find them).

---

## Feedback Loops (Non-Linear, Always Active)

### Loop A: **Collaborative Variability Loop** *(if multi-user enabled)*
```
User A moves sofa → Item state updates → User B's 3D view lags 
  → User B moves same sofa (stale view) → collision/conflict → frustration 
  → User B becomes hesitant → fewer edits → less collaborative discovery
```
**Lever:** Real-time sync latency, conflict resolution UI clarity.

### Loop B: **Material Fidelity Loop**
```
3D material fails to load → falls back to placeholder color → User thinks item looks bad 
  → doesn't use this vendor → vendor SKU sales drop → budget to improve 3D pipeline shrinks 
  → more material failures → cycle deepens
```
**Lever:** Material load reliability, fallback visual quality.

### Loop C: **Icon Accuracy → Discoverability Loop**
```
Icon inference fails (calls dining table "desk") → User searches toolbar for table → doesn't find it 
  → feels catalog is incomplete → stops browsing → fewer item placements → plan feels empty 
  → User satisfaction drops → engagement declines
```
**Lever:** Icon inference training, manual icon curation.

### Loop D: **Geometry Confidence Loop** *(Vision Service)*
```
User uploads blurry floor photo → Vision guesses walls → Geometry misaligns 
  → User manually corrects walls → tedious → doesn't trust Vision next time 
  → stops using Vision → loses auto-placement benefit → manual plan takes longer → less plan iteration
```
**Lever:** Vision model accuracy, wall-correction UX friction, auto-correction confidence threshold.

### Loop E: **Undo-Driven Exploration Loop**
```
Instant, responsive Undo → User experiments fearlessly → discovers multi-item arrangements 
  → creates "favorite layouts" → shares plans → drives adoption → encourages feature use 
  → refinement of features accelerates
```
**Lever:** Undo latency, visual feedback clarity on revert.

---

## TEST: Verification Points

### Structural Tests (Code)
- **Catalog Adapt:** raw Supabase row → Catalog Entry → verify all fields present, types correct
- **Furniture Item:** create, rotate, apply SKU override, serialize → verify symmetry (deserialize = original)
- **Geometry Bounds:** item placed in room, snap grid active → verify item never clips wall (collision detection)

### Interaction Tests (Behavior)
- **2D-3D Coherence:** mutate item in 2D (drag, rotate) → verify 3D position/rotation matches within 1 frame
- **Material Cascade:** select colorable item → check Material Cache has colors → verify 2D shows color options → apply color → 3D re-renders
- **Undo Latency:** record 10 sequential placements → undo all 10 → measure time to full visual revert; threshold < 200ms for responsive feel

### Feedback Loop Tests (System)
- **Collaborative Conflict:** Two users simultaneously move same item → measure time to conflict signal, UI clarity
- **Vision Drift:** Upload floor photo at 3 scales (photo, 50% scale, pixelated) → measure wall detection accuracy; track User correction rate
- **Icon Discoverability:** Fresh user given plan with 20 furniture types → ask user to find "dining table" without reading labels → measure time to success, eye-tracking error
- **Exploration Friction:** User A with Undo latency=50ms vs User B with Undo latency=500ms → count experiments per minute; compare plan complexity

### Emergent-Pattern Tests
- **Affordance Cascade Failure:** Simulate Material Cache miss → verify 2D doesn't crash; 3D shows fallback; User gets actionable error message (not silent fail)
- **Catalog Completeness Impact:** Run A (all 50 SKUs available) vs Run B (only 10 random SKUs) → measure items-placed-per-session; correlate drop with availability gap

---

## Why DRRT Matters for Your Floor-Planner

1. **Relationships reveal hidden constraints:** Not "how does 2D rendering work?" but *"how do 2D and 3D constrain each other's behavior?"* This surfaces coherence bugs early.

2. **Feedback loops predict adoption:** Friction loops (icon confusion, material fails, Undo latency) compound over time. DRRT mapping identifies them before they become viral anti-patterns.

3. **Variability is a feature:** Multi-user context, device DPI, network latency, Catalog source—these shift what "correct behavior" looks like. DRRT acknowledges this; single-path thinking misses it.

4. **Tests become meaningful:** Instead of "does the code compile?", you ask *"does the feedback loop resolve?"*—measurement shifts from unit to system level.

5. **Collaboration surfaces:** DRRT thinking reveals where human coordination breaks down (e.g., concurrent edits, icon interpretation, wall-snap threshold disagreement) *before* features fail in production.

---

## Heuristic: Spotting Broke Relationships

When a User reports an issue that feels vague ("the plan doesn't feel right"), map to DRRT:
- **Deconstruct:** What parts involved? (e.g., 2D placement, 3D render, Undo)
- **Relationships:** Which did they co-create the outcome? (e.g., 2D snap too aggressive, 3D material lag)
- **Recognize:** What pattern emerged? (e.g., User avoided Undo because latency, so less exploration)
- **Test:** How would you verify the feedback loop is healthy? (e.g., Undo < 200ms, icon accuracy > 95%)

**Common culprits:**
- Render coherence fracturing (2D–3D sync loss)
- Feedback loop latency (Undo, sync, material load)
- Affordance cascade failure (icon → color → material chain breaks at one step)
- Variability leakage (works on high-res desktop, breaks on mobile; works with 1 SKU, fails with 50)
