# Vastu-aware furniture auto-placement — design

Status: approved (brainstorming) · Date: 2026-06-24

## Problem

When a user places a piece of furniture on a plan, it should move to the
Vastu-correct spot within its room, following the rules in
[`docs/vastu-rules.md`](../../vastu-rules.md). Today the viewer has a placeholder
"Vaastu" toggle (`vaastuEnabled`, labelled "rules coming") and no compass data.

## Decisions (locked during brainstorming)

1. **North is user-set, 4-way.** A toolbar control picks which screen edge is
   North: `top | right | bottom | left` (default `top`). Stored as
   `meta.northEdge`, persisted with the project alongside `vaastuEnabled`.
2. **Snap scope:** the piece snaps to its Vastu zone **within the room it lands
   in**, plus a **non-blocking house-level hint** (status line) when the room
   itself sits in a Vastu-poor zone for that item. Never moves a piece across
   rooms.
3. **Gating & behaviour:** snapping happens **only when the Vaastu toggle is ON**,
   **once on drop**; afterwards the piece drags freely with **no re-snapping**.
4. **Rule source:** [`docs/vastu-rules.md`](../../vastu-rules.md) §4 (snap table)
   and §4 hints. Item-based rules → building-type-agnostic (one module, no
   per-building branches).

## Implementation deltas (shipped 2026-06-26)

The approved design above held, with these user-requested changes during testing:

1. **Snapping is a "magnet", not snap-once.** Besides on-placement, a piece also
   re-snaps to its zone **on drag-drop** while Vaastu is ON, and **toggling Vaastu
   ON re-snaps every existing item** (`snapAllFurnitureToVastu`). Free positioning
   = turn Vaastu OFF. (Original spec said snap-once-then-free-drag.)
2. **Both placement paths snap** (fresh drop *and* "add near selected"), with a
   robust room resolver: room under the item → hovered room → nearest room
   centroid. After snapping, `resolveFurniturePosition` keeps the footprint
   **inside the room polygon** (no wall-crossing on non-rectangular rooms).
3. **Status-line feedback** on every snap (incl. "no rule" / "no room" cases).
4. **Compass placement:** floats on the **left edge of the 2D plan viewport**
   (vertically centred), not in the toolbar row.

## Architecture

A pure geometry module + a thin viewer hook + a small UI control. Mirrors the
existing `lib/furnitureBounds` / `lib/wallSnap` pattern (pure functions, headless
tests, thin wiring).

```
docs/vastu-rules.md  ──(rules mirrored by hand)──►  lib/vastuPlacement.js
                                                          │  (pure, no DOM)
floorPlanViewer.js  ──addCatalogRowToPlan()──────────────►│ vastuTargetInRoom()
   (when vaastuEnabled)                                    │ vastuRoomHint()
   North control ──► meta.northEdge ────────────────────► │ northVectors()
scripts/vastu-placement.test.mjs  ──headless asserts──────►
```

### Coordinate / direction model

- Furniture: normalized `x,y ∈ [0,1]`, `rotationDeg`. Rooms: polygons in the same
  space. (Unchanged.)
- Screen axes: `+x` right, `+y` down.
- `northVectors(northEdge)` returns screen-space unit vectors `{N,E,S,W}` where E
  is 90° clockwise from N on the map:

  | northEdge | N | E | S | W |
  |-----------|---|---|---|---|
  | `top`     | (0,−1) | (1,0)  | (0,1)  | (−1,0) |
  | `right`   | (1,0)  | (0,1)  | (−1,0) | (0,−1) |
  | `bottom`  | (0,1)  | (−1,0) | (0,−1) | (1,0)  |
  | `left`    | (−1,0) | (0,−1) | (1,0)  | (0,1)  |

  Zone math uses only these vectors, so it is orientation-agnostic and extends to
  a free-angle dial later without rewrite.

### `lib/vastuPlacement.js` (pure, headless-testable)

```
northVectors(northEdge) -> { N, E, S, W }   // screen unit vectors

vastuRuleForItem(item) -> rule | null
  // detect type from item.type/shape/richIcon, else SKU-derived shape.
  // rule = { zone: 'SW'|'S'|'W'|'NE'|'SE'|'NW'|'N'|'E'|'avoid:NE',
  //          face: 'N'|'E'|'S'|'W'|null }
  // returns null for unlisted types (caller leaves item untouched).

vastuTargetInRoom(item, roomPolygon, northEdge) -> { x, y, rotationDeg } | null
  // 1. bbox of roomPolygon.
  // 2. zoneDir = sum of the rule's zone letters as vectors (e.g. 'SW' = Ŝ+Ŵ).
  // 3. target corner = bbox corner maximizing dot(corner, zoneDir).
  //    (single-letter zones e.g. 'S' use the mid-point of that edge.)
  // 4. inset toward centroid by furnitureHalfExtents(item)+margin so the
  //    footprint clears the wall.
  // 5. rotationDeg from rule.face mapped to the item's icon default facing.
  // 6. 'avoid:NE' → only move if the item currently sits in the NE quadrant of
  //    the room; push to the S/W corner; else return null (leave as-is).

vastuRoomHint(item, room, rooms) -> string | null
  // house-level, non-blocking. Compute the room's centroid quadrant within the
  // plan's unit bbox (using northEdge). Per vastu-rules §4 hints:
  //   bed     → warn if room quadrant is NE/E
  //   kitchen → warn if NE
  //   toilet  → warn if NE
  //   desk/pooja → warn if NOT NE
  // returns a short message or null.
```

`furnitureHalfExtents` is reused from `lib/furnitureBounds.js`. Rotation mapping
(`face` → `rotationDeg`) is finalized against each icon's default during
implementation and **verified visually** (the one piece this spec cannot fully
pin on paper).

### Viewer integration — `floorPlanViewer.js`

1. **North control** (next to the Vaastu toggle, ~line 1499): four buttons
   `↑ → ↓ ←`. Click sets `northEdge`, updates button pressed-state, and (if a
   piece is selected and Vaastu is on) does nothing retroactively — snapping is
   on-drop only. `northEdge` defaults to `"top"`, is written into the saved
   `meta`, and restored on load (beside the existing `vaastuEnabled` restore at
   ~lines 851 / 1254 / 1277).

2. **Snap hook** in `addCatalogRowToPlan` (line 723), fresh-placement branch
   (the `else` that calls `createFurnitureItem` → `applyCatalogSkuToItem` →
   `constrainFurnitureMove`, lines 736–741):

   ```
   // after applyCatalogSkuToItem, before constrainFurnitureMove
   if (vaastuEnabled) {
     var room = pickRoomAtNorm(newItem.x, newItem.y)
             || (activeRoomId && roomById(activeRoomId));
     if (room && room.polygon) {
       var t = vastuTargetInRoom(newItem, room.polygon, northEdge);
       if (t) { newItem.x = t.x; newItem.y = t.y; newItem.rotationDeg = t.rotationDeg; }
       var hint = vastuRoomHint(newItem, room, data.rooms);
       if (hint) setLlmStatus("Vastu: " + hint);
     }
   }
   constrainFurnitureMove(newItem, data.rooms || []);
   ```

   - Fresh placement defaults to centre `(0.5,0.5)`; the target room is the room
     at that point, falling back to the active/hovered room. `constrainFurnitureMove`
     still runs after, guaranteeing the piece stays inside the polygon.
   - The **anchor branch** (`createFurnitureNearItem`) is left unchanged — adding
     a piece "near" a selected one is an explicit relative placement, not a fresh
     drop, so it should not be yanked to a Vastu zone.

3. Persist `northEdge` wherever `vaastuEnabled` is written/read in the
   save/load/meta paths.

## Rules covered in v1

Per `vastu-rules.md` §7, the detectable set:
`bed→SW(head S)`, `sofa/chair→S/W(face N/E)`, `cupboard→SW`, `nightstand→NW/S`,
`kitchen_island→SE`, `sink→NE`, `desk→N/E`, `dining_table→NW`, `toilet→W/NW`,
`bathtub→NE`, `plant→avoid NE`. Rules for TV/safe/aquarium/bookshelf/stove/mirror
and all building-type extensions exist in the doc and activate automatically when
a matching icon/SKU appears — no module rewrite.

## Testing

`scripts/vastu-placement.test.mjs` (headless, mirrors
`scripts/furniture-item.test.mjs`). A unit-square room `[(0,0),(1,0),(1,1),(0,1)]`
with a small item (half-extent 0.05):

- `northVectors` returns the table above for all four edges.
- **bed**, `northEdge="top"` → target near bottom-left (SW); `x≈0.05+margin`,
  `y≈0.95−margin`. With `northEdge="right"` → target near **top-left** (SW
  rotates correctly).
- **sofa** → bottom (S) edge midpoint, `face N` → expected `rotationDeg`.
- **cupboard SKU** → SW corner.
- **kitchen_island** → bottom-right (SE) when `top`-North.
- **desk** → top/right (N/E) side.
- **plant** placed in NE quadrant → moved to S/W; plant placed centre → `null`
  (unchanged).
- unlisted type (`coffee_table`) → `vastuRuleForItem` returns `null`.
- `vastuRoomHint`: a bed in a room whose centroid is NE → non-null; bed in SW room
  → `null`.

Run: `node scripts/vastu-placement.test.mjs`. Manual: toggle Vaastu on, set North,
drop a bed/sofa/desk in different rooms, confirm snap + free drag after; verify
3D mirrors via `render()`/`rebuildFurnitureMeshes()`.

## Out of scope (v1)

- Free-angle North dial (4-way only; module already extensible to it).
- Repainting walls / colour rules (§5 informational).
- Site/plot scoring (§1–§2 informational).
- Moving pieces across rooms; re-snap on drag; bulk re-stage of existing items.
- Per-building-type rule branches (item-based rules are building-agnostic).
