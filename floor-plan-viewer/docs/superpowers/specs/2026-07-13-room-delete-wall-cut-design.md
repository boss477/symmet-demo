# Room Delete + Wall Cut Tool — Design

Date: 2026-07-13

## Problem

1. When the vision pipeline (or the user) creates an unwanted room, there is no way to
   remove it — only its vertices can be edited.
2. "Remove wall" deletes the entire wall polyline. Users need to remove only a portion
   of a wall (e.g. to open up a partition) while keeping the rest.

## Feature 1: Delete room

- In **view** mode, clicking a room selects it (existing behavior). While a room is
  selected, a **Delete room** button appears in the geometry toolbar row (next to
  "Remove wall" / "Delete vertex").
- Pressing **Delete/Backspace** in view mode with a room selected does the same.
- `deleteSelectedRoom()` in `geometryEditor.js`: push undo snapshot (`deleteRoom`),
  splice the room from `data.rooms`, clear room selection, sync toolbar/readouts,
  notify `onSelectRoom(null)`, re-render.
- Furniture inside the room is untouched. Ctrl+Z restores the room (undo stack already
  snapshots `data.rooms`).

## Feature 2: Cut wall (two-click cutter)

- New wall sub-mode button **Cut** in the Walls toolbar (`wallModeWrap`), alongside
  Draw / Edit / Door. Tool mode id: `cutWall`.
- Interaction is identical to the existing Door tool: click one edge of the section to
  remove, then the other edge on the same straight wall section. The span between the
  two points is removed and the wall splits into two shorter walls (or one/none if the
  cut reaches an end).
- Implementation reuses the door-cut machinery: `handleDoorCutClick` becomes a shared
  two-click handler used by both `cutDoor` and `cutWall`; `cutDoorInWall` gains an
  `addDoor` flag — `cutWall` skips pushing a door entry. Undo action label: `cutWall`.
- `cutWall` is added everywhere `cutDoor` appears in mode plumbing: click-mode check,
  crosshair cursor, walls-group active state, hint text, plan click routing, draft
  rendering (`doorCutDraft` render option), escape/reset clearing.

## Out of scope

- Deleting furniture along with a room.
- Segment-select deletion in wall Edit mode (two-click cutter covers the need).

## Testing

- Manual: build passes; in the app — draw room → select → Delete room → Ctrl+Z restores;
  wall Cut: two clicks remove only the span, Door tool still adds doors, undo restores.
