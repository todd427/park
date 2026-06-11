# Park — Lot Capacity Audit

**Date:** 2026-06-11
**Status:** Open issue — capacities unvalidated, area evidence says they're wrong
**Affects:** `data/mockData.ts`, backend lot records, passive occupancy math

---

## Finding

The PRD lot capacities (A:120, B:60, C:45, D:80 — total 305) do not survive contact
with the lot geometry. Computing polygon areas from the OSM coordinates in
`data/mockData.ts` (local-tangent-plane projection + shoelace):

| Lot | Stated cap | Polygon area | Est. spaces @ 25 m² | Est. @ 30 m² |
|---|---|---|---|---|
| A — Main Car Park | 120 | 12,112 m² | ~484 | ~404 |
| B — Sports Centre | 60 | 5,366 m² | ~215 | ~179 |
| C — West Block | 45 | 7,238 m² | ~290 | ~241 |
| D — Staff / Overflow | 80 | 3,783 m² | ~151 | ~126 |
| **Total** | **305** | **28,499 m²** | **~1,140** | **~950** |

25–30 m² per space is the standard planning allowance for a surface bay plus its
share of circulation aisle.

Cross-check: an independent heuristic (Irish commuter-campus planning ratios,
~1 space per 4–6 students, ATU Letterkenny ~4,000–5,000 students) gives
800–1,100 spaces campus-wide. Two independent methods agree at ~3–4× the PRD total.

## Caveats

- OSM `amenity=parking` polygons frequently include access roads and landscaping.
  Lot A's 39-vertex snake-shaped polygon almost certainly traces the access road,
  inflating its area. Ground photos (2026-06-11) of the roundabout/access road area
  are consistent with this.
- Lot C at 7,238 m² vs a stated capacity of 45 is the most implausible pairing in
  either direction — either the polygon is badly oversized or the capacity is a
  placeholder that was never sized. Note Lot C was already reset once
  (commit 57e2446 "reset lot C").

## Why it matters — not cosmetic

Passive occupancy is computed as:

```
passive_pct = (active_sessions / capacity) * 100
```

Capacity error propagates directly into status. Example: 12 active sessions in
Lot A reads as 10% full at cap 120 but ~3% at a realistic ~400. Once passive data
dominates the blend, the 40%/70% status thresholds fire wrongly — the app will
report `filling`/`full` on lots that are mostly empty. The core product claim
(trustworthy availability signal) fails quietly.

## Fixes — in order of correctness

1. **Count bays from satellite imagery** (Google Maps satellite view, per lot) and
   hard-code validated capacities. ~20 minutes, done once. Ground photos can
   sanity-check lots A and B.
2. **Re-trace polygons with the GPS Walk editor** to exclude access roads, then
   derive capacity from corrected area at ~28–30 m²/space. This also fixes the
   gap that the lot editor currently has no capacity-sizing logic for new lots —
   area-derived capacity should be the default for any lot created via GPS Walk
   or edge editing.
3. **Fallback formula** for unvalidated lots: `capacity = round(area_m2 / 28)`,
   flagged `capacity_source: "derived"` vs `"counted"` in the lot record so the
   UI can show confidence honestly.

## Action checklist

- [ ] Satellite bay count for lots A–D → update `data/mockData.ts` and backend
- [ ] Re-trace Lot A polygon to exclude access road
- [ ] Investigate Lot C polygon vs capacity mismatch
- [ ] Add `capacity_source` field to lot model
- [ ] Add area→capacity derivation to lot editor for new lots
- [ ] Re-run blending tests with corrected capacities (thresholds may need retuning)

---

*Post-viva work. Audit performed via polygon-area computation from repo data;
method reproducible from `data/mockData.ts` coordinates.*
