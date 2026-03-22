# Park — ATU Letterkenny Parking Availability App
## CLAUDE.md — Full PRD for Claude Code

---

## Project Overview

**Park** is a crowdsourced parking availability app for ATU Letterkenny campus.
Students tap "Found a space ✅" or "It's full 🔴" when they arrive at a campus lot.
Reports are time-weighted and decay after 90 minutes.

- **Motivation:** 32.7% of ATU Letterkenny students (March 2026 survey, n=79) cited parking as the #1 campus complaint.
- **Purpose:** Student pitch/interest demo — needs to look polished on a phone. Not a funding document.
- **Target audience:** ATU Letterkenny students.
- **Repo:** `todd427/park`

---

## Architecture

**Frontend:** Standalone Expo SDK 52 app (TypeScript, Android-first)
**Backend:** FastAPI — SQLite in dev, PostgreSQL on Fly.io prod (same pattern as `todd427/lorg`)
**Live backend:** `https://park-api.fly.dev` (LHR, PostgreSQL via `park-db`)

```
park/
├── app/                        # Expo Router screens
│   ├── index.tsx               # MapScreen (default tab)
│   └── list.tsx                # ListScreen
├── components/
│   ├── LotCard.tsx
│   ├── LotOverlay.tsx
│   ├── ReportModal.tsx
│   └── SuccessToast.tsx
├── hooks/
│   ├── useGeofence.ts
│   └── useUserId.ts            # persistent anonymous UUID via AsyncStorage
├── services/
│   └── api.ts                  # API client, __DEV__ switching
├── data/
│   └── mockData.ts             # fallback if API unreachable
├── constants/
│   ├── theme.ts
│   └── config.ts               # API_BASE, POLL_INTERVAL_MS, etc.
├── backend/
│   ├── main.py
│   ├── models.py
│   ├── database.py
│   ├── requirements.txt
│   └── tests/
│       └── test_api.py         # 11 passing pytest tests
├── fly.toml
├── Dockerfile
├── app.json
├── package.json
└── tsconfig.json
```

---

## Theming

| Token | Value | Usage |
|---|---|---|
| `ATU_BLUE` | `#003087` | Primary brand, headers, buttons |
| `ATU_GOLD` | `#C8A84B` | Accents, active states |
| `BG_DARK` | `#121212` | App background |
| `BG_CARD` | `#1E1E1E` | Card surfaces |
| `BG_MODAL` | `#2A2A2A` | Bottom sheet |
| `TEXT_PRIMARY` | `#FFFFFF` | Primary text |
| `TEXT_SECONDARY` | `#A0A0A0` | Metadata, timestamps |
| `STATUS_AVAILABLE` | `#4CAF50` | Green — space available |
| `STATUS_FILLING` | `#FF9800` | Amber — filling up |
| `STATUS_FULL` | `#F44336` | Red — full |
| `STATUS_UNKNOWN` | `#757575` | Grey — no recent data |

All defined in `constants/theme.ts` and used via named tokens throughout — no raw hex in components.

---

## Campus Parking Lots

Four lots on ATU Letterkenny campus:

| ID | Name | Capacity |
|---|---|---|
| `A` | Main Car Park | 120 spaces |
| `B` | Sports Centre | 60 spaces |
| `C` | West Block | 45 spaces |
| `D` | Staff / Overflow | 80 spaces |

Each lot has a GPS bounding polygon (geofence) used by `useGeofence.ts`.

---

## Status Logic (Report Decay)

Reports decay over time. Each report contributes a weighted vote:

| Age | Weight |
|---|---|
| < 45 minutes | 1.0 (full weight) |
| 45–90 minutes | 0.5 (half weight) |
| > 90 minutes | 0.0 (ignored) |

**Status thresholds** (based on weighted % of reports saying "full"):

| Weighted % Full | Status |
|---|---|
| ≥ 70% | `full` 🔴 |
| 40–69% | `filling` 🟡 |
| < 40% | `available` 🟢 |
| No data | `unknown` ⬜ |

---

## Screens & Components

### MapScreen (`app/index.tsx`)
- Full-screen satellite map (react-native-maps, `HYBRID` type)
- Centred on ATU Letterkenny campus coordinates
- 4 colour-coded lot overlays (`LotOverlay`) — colour from status
- Tap a lot overlay → opens `ReportModal`
- Status legend strip at bottom
- Tab bar: Map | List
- Loading spinner (ATU_BLUE) while fetching
- Error banner if API unreachable

### ListScreen (`app/list.tsx`)
- Scrollable `FlatList` of `LotCard` components
- Each card shows: lot name, status badge, fill percentage bar, report count, "Report" button
- Pull-to-refresh (calls live API)
- Skeleton placeholders on first load
- Inline error state with retry button

### LotCard (`components/LotCard.tsx`)
```tsx
interface LotCardProps {
  lot: Lot;
  onReport: (lotId: string) => void;
}
```
- Status badge: coloured pill (Available / Filling / Full / No Data)
- Fill bar: animated progress bar, colour matches status
- Report count: "3 reports in last 90 min"
- Report button → opens `ReportModal`

### LotOverlay (`components/LotOverlay.tsx`)
- `react-native-maps` `Polygon` with fill colour from status
- Semi-transparent (opacity 0.45)
- Stroke: white at 0.8 opacity
- Tap handler → `onPress`

### ReportModal (`components/ReportModal.tsx`)
- Bottom sheet (slide up)
- Lot name + current status header
- Two large tap targets: "Found a space ✅" / "It's full 🔴"
- Spinner in tapped button during submission
- Both buttons disabled while in-flight
- Inline error on failure — does not dismiss modal
- On success: dismiss + `SuccessToast`

### SuccessToast (`components/SuccessToast.tsx`)
- Animated slide-up notification
- "Thanks! Your report helps other students."
- Auto-dismisses after 2.5s
- Positioned above tab bar

### useGeofence (`hooks/useGeofence.ts`)
- `expo-location` background watch (same pattern as `todd427/lorg`)
- Haversine distance to each lot centroid
- Auto-prompts `ReportModal` on lot entry (80m radius)
- Debounced — once per lot entry per session

### useUserId (`hooks/useUserId.ts`)
- Generates anonymous UUID once via `expo-crypto`
- Persists via `AsyncStorage`
- Returned UUID used in all report submissions

### services/api.ts
- Single source for all API calls — screens never call `fetch` directly
- `__DEV__` switching: `http://localhost:8000` (emulator) vs `https://park-api.fly.dev`
- 60s poll interval, 10s request timeout via `AbortController`
- Mock data fallback if API unreachable

---

## Backend API (FastAPI — `backend/main.py`)

### Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/reports` | Submit a parking report |
| `GET` | `/api/lots` | Get status of all lots |
| `GET` | `/api/lots/{lot_id}` | Get status of one lot |
| `GET` | `/api/status` | Health check |

### Database Schema

```sql
CREATE TABLE reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    lot_id      TEXT NOT NULL,
    report_type TEXT NOT NULL CHECK(report_type IN ('found', 'full')),
    timestamp   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_id     TEXT NOT NULL
);

CREATE INDEX idx_reports_lot_timestamp ON reports(lot_id, timestamp);
```

---

## Required Pytest Tests (11 — all passing)

File: `backend/tests/test_api.py`

1. Health check returns 200
2. GET /api/lots returns list of 4 lots
3. GET /api/lots/A returns lot A
4. GET /api/lots/Z returns 404
5. POST /api/reports with valid payload returns 201
6. POST /api/reports with type=full returns 201
7. POST /api/reports with invalid lot_id returns 422
8. POST /api/reports with invalid report_type returns 422
9. Report decay — report older than 90min has zero weight
10. Status threshold — ≥70% full reports → status=full
11. Status threshold — <40% full reports → status=available

---

## Pinned Dependencies

### Frontend (`package.json`)

```json
{
  "dependencies": {
    "expo": "~52.0.0",
    "expo-location": "~17.0.0",
    "expo-router": "~4.0.0",
    "react-native": "0.76.5",
    "react-native-maps": "1.18.0",
    "@gorhom/bottom-sheet": "^5.0.0"
  }
}
```

### Backend (`backend/requirements.txt`)

```
fastapi==0.115.0
uvicorn==0.32.0
pydantic==2.9.0
sqlalchemy==2.0.36
psycopg2-binary==2.9.9
pytest==8.3.0
httpx==0.28.0
python-dateutil==2.9.0
```

---

## Fly.io Config

- **App:** `park-api` — `https://park-api.fly.dev`
- **Region:** LHR
- **Database:** `park-db` (Postgres, attached, `DATABASE_URL` secret set by Fly)
- **VM:** shared-cpu-1x, 256MB

---

## Phase Roadmap

| Phase | Status | Description |
|---|---|---|
| **Phase 0** | ✅ Complete | Demo app — mock data, self-report flow, all screens, 11/11 tests |
| **Phase 1** | ✅ Complete | Backend live at park-api.fly.dev, frontend wired to live API, PostgreSQL |
| **Phase 2** | ✅ Complete | Lorg geofence integration — auto-prompt on lot entry |
| **Phase 3** | 🔲 Pending | Drone / CV occupancy layer (FoxxeLabs research) |
| **Phase 4** | 🔲 Pending | Push alerts — "Lot A just freed up" |

---

## Build Instructions for Claude Code

1. Scaffold Expo project: `npx create-expo-app park --template blank-typescript`
2. Install pinned dependencies above
3. Implement `constants/theme.ts` first — all colours defined before any component
4. Build screens in order: MapScreen → ListScreen → ReportModal → SuccessToast
5. Implement `useGeofence.ts` and `useUserId.ts`
6. Implement `services/api.ts` with `__DEV__` switching and mock fallback
7. Populate `mockData.ts` with the 4 lots above
8. Build FastAPI backend in `backend/` — all 4 endpoints + decay logic
9. Write 11 pytest tests — all must pass
10. Verify on Android (physical device or emulator) — this is Android-first
11. **After completing each phase: `git add -A && git commit -m "phaseN: ..." && git push`**

**Do not use Expo Go for final testing — use a dev build.**

---

## Phase 2 — Lorg Geofence Integration

### Goal

The `useGeofence.ts` hook exists but currently uses hardcoded lot centroids and a simple
Haversine check. Phase 2 replaces this with lorg's proven geofence pattern
(`todd427/lorg`) so the app auto-prompts the user to report when they physically
enter a campus parking lot.

---

### Background

`todd427/lorg` is Todd's GPS worldline tracker — FastAPI on Fly.io, React Native/Expo,
background GPS every 5 minutes. It has a working geofence implementation. Reuse that
pattern directly rather than reinventing it.

---

### Step 1 — Review Lorg's Geofence Implementation

Read `todd427/lorg` hooks and location handling before writing any code. Understand:
- How it requests `expo-location` background permissions
- How it sets up the background location task
- How it computes entry/exit events

Mirror that pattern in Park's `useGeofence.ts`.

---

### Step 2 — Define Lot Polygons (`data/lots.ts`)

Replace centroid + radius with proper bounding polygons for each lot.
Coordinates are approximate — use ATU Letterkenny campus (54.9998° N, 7.7184° W) as reference.

```typescript
export interface LotPolygon {
  id: string;
  name: string;
  polygon: { latitude: number; longitude: number }[];
  centroid: { latitude: number; longitude: number };
}
```

Lot polygons should be tight enough to avoid false triggers from the road or adjacent lots.

---

### Step 3 — Update `useGeofence.ts`

- Request background location permission on first app launch (show rationale modal before requesting)
- Register a background location task using `TaskManager` + `expo-location` (same as lorg)
- On position update, run point-in-polygon test against all 4 lot polygons
- On lot entry: fire `onEnterLot(lotId)` callback — debounced, once per lot per session
- On lot exit: clear debounce for that lot (so it can trigger again next entry)
- If permission denied: hook returns `{ permissionDenied: true }` — screens degrade gracefully, no crash

---

### Step 4 — Wire Auto-Prompt in Both Screens

Both `MapScreen` and `ListScreen` should respond to `onEnterLot`:

```typescript
useGeofence({
  onEnterLot: (lotId) => {
    setAutoPromptLotId(lotId);  // opens ReportModal for that lot
  }
});
```

The auto-prompt should feel natural — a gentle bottom sheet, not an intrusive alert.
User can dismiss without reporting. No repeated prompts for the same lot visit.

---

### Step 5 — Permission UX

Add a `PermissionRationale` component shown once before requesting background location:

- Heading: "Help other students find parking"
- Body: "Park can notify you to report availability when you arrive at a campus lot. This uses background location — only while you're on campus."
- Two buttons: "Allow" (requests permission) / "Not now" (skips, never shows again)
- Store decision in `AsyncStorage` — don't ask again if user said "Not now"

---

### Validation Checklist (Phase 2 Done When)

- [ ] Background location permission requested with rationale modal
- [ ] "Not now" decision persisted — rationale never shown again after dismissal
- [ ] Walking/driving into a lot polygon triggers `onEnterLot` on a physical device
- [ ] `ReportModal` auto-opens for the correct lot on entry
- [ ] No double-prompt for the same lot visit
- [ ] Prompt fires again on next visit (after exit + re-entry)
- [ ] Permission denied → app works normally, no crash, no prompt
- [ ] Lot overlays on MapScreen still render correctly from `data/lots.ts` polygons
- [ ] 11/11 pytest tests still passing
- [ ] `git push` after completion

---

*PRD version: 1.2 — 2026-03-22 (Phase 2 added)*
*todd427/park*
