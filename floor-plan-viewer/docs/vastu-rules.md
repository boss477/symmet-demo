# Vastu Rules Reference

Canonical rule source for the **Vastu-aware furniture auto-placement** feature in
floor-plan-viewer. This file is the single place the `lib/vastuPlacement` module
(and its tests) mirror — change a rule here first, then the code.

## Provenance — read this first

- **[eBook]** = taken directly from the user-supplied *"Vastu for House"*
  eBook (FreeVastuShastra.com, residential). Chapter cited.
- **[Extension]** = **not** in that eBook. Standard Vastu-consultancy practice for
  non-residential buildings (offices, hostels, hospitals, parking), derived from
  the **same elemental-zone logic** the eBook teaches. Flagged honestly so no one
  mistakes it for a direct quote.

The eBook is residential only. Parking, office, hostel, and hospital sections are
**[Extension]** unless a specific eBook line applies.

---

## 0. Direction & zone model

Eight compass zones plus the centre. Screen orientation is user-set via
`meta.northEdge` (`top | right | bottom | left`, default `top`); all zones are
computed from that, never hard-coded to the screen.

| Zone | Sanskrit / lord | Element | Character |
|------|-----------------|---------|-----------|
| **N**  | Kubera   | —      | Wealth, career. Light, open. |
| **NE** | Ishanya  | Water  | Most sacred. Water, prayer. Keep light & open. |
| **E**  | Indra    | Sun    | Health, sunrise. Light, open. |
| **SE** | Agni     | **Fire** | Kitchen, fire, electricals, heat. |
| **S**  | Yama     | —      | Heavy, storage. |
| **SW** | Nairutya | Earth  | Heaviest. Master bed, valuables, stability. |
| **W**  | Varuna   | —      | Storage, dining. |
| **NW** | Vayu     | Air    | Movement: guests, parking, dining, toilets. |
| **Centre** | Brahma | Space | **Brahmasthan** — keep open/empty, no heavy items, no pillars. |

**Positive zones (light objects / open):** N, E, NE.
**Negative zones (heavy objects):** S, W, SW.
Rule of thumb **[eBook Ch4]**: light furnishings → positive zones; heavy ones →
negative zones.

**Polarity flow [eBook Ch2]:** NE is the positive pole, SW the negative pole.
Wider openings NE, smaller openings SW. NE-half lower/lighter, SW-half
higher/heavier.

---

## 1. Plot / land (site selection) — [eBook Ch2]

Site-level; informational for the app (not snapped), useful for a future "site
score".

- **Shape:** square / rectangle best. *Sherdah* (wide front, narrow rear) and
  *Gaumukhi* (narrow front, wide rear) acceptable. Avoid triangular, diamond,
  L-shaped, corner-cut / "headless" plots.
- **Slope/level:** NE (solar half) lower than SW (lunar half). Avoid centre-humped
  plots. NE extension good (wealth); NW extension bad (loss).
- **Soil:** yellowish good; black/clay/crumbly-rock poor. Excavation omens (stone =
  wealth, coal = illness, etc.) per Ch2 table.
- **Roads:** NE/N and NE/E facings favourable; road on all sides best; T-junction /
  dead-end weak.
- **Obstructions:** nothing tall on N/NE/E (blocks sun). Tall objects on S/W are
  protective. Keep ≥ 80 ft / 2× building-height clear of temples & public buildings.

## 2. Compound, gate, exterior — [eBook Ch2]

- **Compound wall:** start build from SW; SW wall highest; N & E walls 21 in (min
  3 in) shorter than S & W. Never taller than the house.
- **Gates:** two gates ideal; **never on the South**. Avoid main-gate obstructions
  (big tree, ditch, open well, pole, straight street, dilapidated wall).
- **Well / bore / underground tank:** NE or N (Ch2/Ch3).
- **Trees:** large trees S/W (even number); not on N/NE/E; not directly before the
  entrance. Tulasi recommended; no thorny plants (except roses).
- **Parking lot:** **NW** corner; not attached to wall/main building; cars face
  **E or N, never S**; light-coloured garage. *(See §6 for parking-building detail.)*

---

## 3. Room placement (which room goes in which zone)

The app snaps **furniture within a room** (§4) and can flag when a room itself sits
in a Vastu-poor zone (house-level hint).

| Room | Ideal zone | Avoid | Source |
|------|-----------|-------|--------|
| Main entrance / door | E, NE, N (of NE) | centre, extreme corners, facing T-junction | eBook Ch3 |
| Pooja / prayer | **NE** (ground floor) | NW | eBook Ch3 |
| Living room | Front, N / E | W or S of front room | eBook Ch3 |
| Kitchen | **SE** (alt NW) | NE, SW | eBook Ch3 |
| Dining | SE / NW / NE (W for profit) | SW | eBook Ch3 |
| Master bedroom | **SW** (upper floor if any) | NE | eBook Ch3 |
| Male/adult bedroom | W / NW | — | eBook Ch3 |
| Female bedroom | S / SE | — | eBook Ch3 |
| Children's bedroom | NW / E | SW | eBook Ch3 |
| Study | **NE** (next to pooja) | — | eBook Ch3 |
| Bathroom | W / S (drain to NE) | — | eBook Ch3 |
| Toilet (WC) | W / NW | NE | eBook Ch3 |
| Staircase | **S / W** | N / E | eBook Ch3 |
| Store / heavy storage | S / W / SW | NE | eBook Ch3/Ch4 |
| Overhead water tank | **SW** (alt W; small NW) | centre of roof, NE | eBook Ch3 |
| Underground water / pool / well | **NE / E / N** | SW | eBook Ch3 |
| Balcony / verandah | NE | SW (enclose if present) | eBook Ch3 |

---

## 4. Furniture & object placement — the snap table

This is the table the `vastuPlacement` module mirrors. **Zone** = where in the
room's bounding box the item snaps (computed from `northEdge`). **Facing** = the
direction the item's "front" points after snapping.

Item type is detected from `item.type` / `item.shape` / `item.richIcon`, or, for
catalog SKUs, from the SKU **category** (`shapeFromCategory`). Anything not listed
→ **placed normally, no snap**.

| Item (types / keywords) | Snaps to | Facing | Source |
|-------------------------|----------|--------|--------|
| **bed** (`bed`, `mattress`, `king/queen/twin`) | **SW** corner | head to **S** (headboard on S or W wall; never head-N) | eBook Ch3/Ch4 |
| **sofa** (`sofa`, `sofa_1/2/3`, `couch`, `loveseat`, `sectional`, `chaise`, `shearling_sofa`) | **S** side (fallback **W**) | back to wall, seat faces **N** | eBook Ch4 |
| **chair** (`chair`, `armchair`, `stool`) | **S / W** | faces **N / E** | eBook Ch4 |
| **cupboard / wardrobe / dresser / bureau** (SKU category) | **SW** | flush to S/W wall | eBook Ch3 (wardrobe NW/S), Ch4 (bureau SW) |
| **nightstand** | beside bed, **NW / S** | — | eBook Ch3 |
| **kitchen_island / stove / cooktop / counter** | **SE** corner | cook side faces **E** | eBook Ch3 (kitchen SE, cook faces E), Ch4 (heat → SE) |
| **sink / basin / tap** | **NE** | — (keep away from stove) | eBook Ch3 |
| **desk / study table** | **N or E** side | faces **N** | eBook Ch4 (study table N/E) |
| **dining_table** | **NW** | square/rect only | eBook Ch4 |
| **toilet / wc** | **W / NW** | — | eBook Ch3 |
| **bathtub / tub / vanity** | **NE / N / E** | — | eBook Ch3 |
| **plant / tree** | avoid **NE** → push **S/W** | — | eBook Ch4 |
| **wash basin (dining)** | E / N | not SE/SW | eBook Ch3 |
| **safe / locker** | against **S** wall | door opens N | eBook Ch3 (bedroom safe S wall) |
| **TV / heater / electricals** | **SE** | — | eBook Ch3 (bedroom TV/heater SE), Ch4 |
| **mirror** | **N or E** wall | not opposite bed | eBook Ch4 |
| **aquarium** | **N / E / NE** | — | eBook Ch4 |
| **bookshelf / library** | **W** side (not corners) | — | eBook Ch3 (study) |

> ❌ No demo icon today for: cupboard/wardrobe, TV, safe, aquarium, bookshelf,
> stove, mirror. These snap only when a **catalog SKU** resolves to a matching
> type/category. The table keeps them so the rule exists the moment an icon/SKU
> lands.

### Non-blocking house-level hints

After a snap, warn (status line only — never move across rooms) when the room is
in a Vastu-poor zone for that item:

- **bed** → room should be in S/W half of the building (warn if NE/E).
- **kitchen item** → room should be SE (warn if NE).
- **toilet** → warn if room is NE.
- **pooja/study item** → warn if room is **not** NE.

---

## 5. Colours, lighting, materials — [eBook Ch4]

Informational (the app does not repaint), kept for completeness.

- Walls: light blue/green/pink/cream. **Avoid red & black** as wall paint.
- Bedroom: light rose / dark blue / dark green (not white/light-yellow).
- Pooja: white / light blue / light yellow.
- Study: white / sky blue / cream / light green.
- Ceilings white & flat. House brightly lit. Floors mosaic/ceramic/marble (white
  marble only for pooja).
- Heat appliances SE; TV/audio N/E/SE; **no electricals in NE**.

---

## 6. Building-type adaptations

Furniture/equipment catalogs and zone targets per building type. The **House**
column is **[eBook]**; the rest are **[Extension]** (same elemental logic).

### 6a. House (residential) — [eBook]

Covered fully by §3–§5. Item catalog: bed, sofa, chair, cupboard/wardrobe,
nightstand, dining table, kitchen island/stove, sink, desk, bookshelf, toilet,
bathtub, vanity, mirror, safe, TV, aquarium, plant, area rug, pooja altar.

### 6b. Car parking / garage — [Extension] (NW rule is [eBook Ch2])

| Element | Zone | Notes |
|---------|------|-------|
| Parking area / garage | **NW** (alt SE) | not attached to main building; light colour |
| Car orientation | face **E or N**, never **S** | [eBook] |
| Two-wheeler parking | NW / SE | |
| Ramp / entry | N / E / NW | |
| Driver/guard cabin | SE corner | [eBook: guard SE] |
| Electrical / charging point | **SE** | fire/electric zone |
| Wash / drain | NE drain-out | water flows out NE |

Catalog: car slot, two-wheeler slot, ramp, pillar (keep off centre/Brahmasthan),
guard cabin, EV charger, drain.

### 6c. Office — [Extension]

| Element | Zone | Facing | Notes |
|---------|------|--------|-------|
| Owner / MD / CEO cabin | **SW** | sits facing **N/E** | heaviest authority zone |
| Manager cabins | S / W | face N/E | |
| Reception | **NE / E** | receptionist faces N/E | open, light |
| Accounts / cashier / cash safe | **N** (Kubera) or SE; safe on S wall opening N | | |
| Workstations / desks | face **N or E** | | per study-table rule |
| Conference / meeting room | **NW** (alt W) | | decisions/movement |
| Server room / electricals / DBs | **SE** | | fire zone |
| Pantry / kitchen | **SE** (alt NW) | | |
| Storage / records | **SW / S / W** | | heavy |
| Toilets | **W / NW** | | not NE |
| Marketing / sales | **NW** | | air/movement |
| Pooja / temple | **NE** | idols face E/W | |
| Waiting area | NE / E | | |

Catalog: executive desk, workstation desk, office chair, conference table,
reception counter, sofa (waiting), cupboard/filing cabinet, server rack, safe,
pantry counter, sink, toilet, plant, pooja altar.

### 6d. Hostel — [Extension]

| Element | Zone | Notes |
|---------|------|-------|
| Warden / manager room | **SW** | authority |
| Resident beds | **SW** of each room | head **S/E**; per [eBook] bed rule |
| Study tables | **N / E** of room | face N/E |
| Wardrobes / lockers | SW / NW | |
| Mess kitchen | **SE** | cook faces E |
| Dining hall | W / E; diners face E/N | |
| Common / TV room | NW (TV at SE) | |
| Reception / entry | NE / E | |
| Toilets / bath blocks | **W / NW**; drain NE | not NE |
| Overhead water tank | **SW** | |
| Underground water | **NE / N** | |
| Pooja / meditation | NE | |

Catalog: bed (bunk/single), study desk, chair, wardrobe, locker, dining table,
mess counter/stove, sink, common-room sofa, TV, toilet, bath, water tank, plant.

### 6e. Hospital — [Extension]

| Element | Zone | Notes |
|---------|------|-------|
| Reception / enquiry | **NE / E** | open, calm |
| Waiting area | NE / N / E | |
| Doctor / consultant cabins | **W / SW**; doctor faces **E/N** | |
| OPD rooms | S / W; patient faces N/E | |
| Operation theatre (OT) | **W / NW**; surgeon faces E | electricals SE within |
| ICU | W / S | |
| Pharmacy / medical store | **N / NE / E** | wealth/light |
| Pathology lab / equipment / electricals | **SE** | fire/equipment |
| Generator / boiler / sterilizer | **SE** | heat |
| Wards (patient beds) | beds head **S/E**; ward in S/W | per [eBook] bed rule |
| Toilets | **W / NW** | not NE |
| Water storage (UG) | **NE / N** | |
| Overhead tank | **SW** | |
| Mortuary | **S / SW** | heaviest, away from entry |
| Staircase / lift | S / W | |
| Temple / prayer | NE | |
| Canteen kitchen | SE | |

Catalog: hospital bed, bedside cabinet, doctor desk, consultation chairs,
examination couch, OT table, equipment trolley, pharmacy counter/shelves, lab
bench, sink, reception counter, waiting sofa, toilet, water tank, generator.

---

## 7. App mapping summary (what v1 actually snaps)

Detectable today (icon or SKU category present) and in scope for the snap module:

`bed → SW(head S)`, `sofa/chair → S/W(face N/E)`, `cupboard → SW`,
`nightstand → NW/S`, `kitchen_island → SE`, `sink → NE`, `desk → N/E`,
`dining_table → NW`, `toilet → W/NW`, `bathtub → NE`, `plant → avoid NE`.

Rules present but waiting on an icon/SKU: TV, safe, aquarium, bookshelf, stove,
mirror, and every **[Extension]** item above. They activate automatically once a
matching type/category exists — no rule rewrite needed.
