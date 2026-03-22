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
│   ├── useGeofence.ts          # background perms first, falls back to foreground
│   └── useUserId.ts            # persistent anonymous UUID via AsyncStorage
├── services/
│   ├── api.ts                  # API client, __DEV__ switching, mock fallback
│   ├── locationTask.ts         # background location task (lorg pattern)
│   └── geofenceEvents.ts       # pub/sub bridge: background task → React state
├── data/
│   ├── lots.ts                 # lot polygons + centroids
│   └── mockData.ts             # fallback if API unreachable
├── constants/
│   ├── theme.ts
│   └── config.ts
├── backend/
│   ├── main.py
│   ├── models.py
│   ├── database.py
│   ├── requirements.txt
│   └── tests/
│       └── test_api.py         # 11 passing pytest tests
├── index.ts                    # imports locationTask.ts before expo-router
├── fly.toml
├── Dockerfile
├── app.json                    # background location + foreground service enabled
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

Lot polygons and centroids defined in `data/lots.ts`.

---

## Status Logic (Report Decay)

| Age | Weight |
|---|---|
| < 45 minutes | 1.0 |
| 45–90 minutes | 0.5 |
| > 90 minutes | 0.0 (ignored) |

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
- Centred on ATU Letterkenny campus
- 4 colour-coded lot overlays from `data/lots.ts` polygons
- Tap overlay → `ReportModal`
- Status legend strip at bottom
- Loading spinner (ATU_BLUE) while fetching
- Error banner if API unreachable
- ATU Blue banner when background auto-detect is active

### ListScreen (`app/list.tsx`)
- Scrollable `FlatList` of `LotCard` components
- Pull-to-refresh → live API
- Skeleton placeholders on first load
- Inline error state with retry

### LotCard / LotOverlay / ReportModal / SuccessToast
- (unchanged from Phase 1 — see git history)

### useGeofence (`hooks/useGeofence.ts`)
- Requests background location first (lorg pattern), falls back to foreground-only
- Subscribes to `geofenceEvents.ts` pub/sub from background task
- Returns `{ hasPermission, backgroundEnabled }`
- `onEnterLot(lotId)` callback — debounced, once per lot per session
- Visited lots persisted in `AsyncStorage` across background wakes
- Permission denied → graceful degradation, no crash

### services/locationTask.ts
- Background location task registered at module scope via `TaskManager.defineTask`
- Runs geofence checks even when app is backgrounded
- Android foreground service notification: "Detecting nearby car parks" (ATU Blue)

### services/geofenceEvents.ts
- Pub/sub event emitter bridging background task → React components
- Necessary because background tasks cannot directly update React state

### services/api.ts
- All API calls — screens never call `fetch` directly
- `__DEV__` switching: `http://localhost:8000` vs `https://park-api.fly.dev`
- 60s poll, 10s timeout, mock fallback if unreachable

---

## Backend API

Live at `https://park-api.fly.dev`

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/reports` | Submit a parking report |
| `GET` | `/api/lots` | All lots with live status |
| `GET` | `/api/lots/{lot_id}` | Single lot |
| `GET` | `/api/status` | Health check |

---

## Tests

11 pytest tests in `backend/tests/test_api.py` — all passing.

---

## Fly.io Config

- **App:** `park-api` — `https://park-api.fly.dev`
- **Region:** LHR
- **Database:** `park-db` (Postgres, `DATABASE_URL` secret set by Fly)
- **VM:** shared-cpu-1x, 256MB

---

## Phase Roadmap

| Phase | Status | Description |
|---|---|---|
| **Phase 0** | ✅ Complete | Demo app — mock data, self-report flow, all screens, 11/11 tests |
| **Phase 1** | ✅ Complete | Backend live at park-api.fly.dev, frontend wired to live API, PostgreSQL |
| **Phase 2** | ✅ Complete | Background geofence, auto-prompt on lot entry, pub/sub bridge |
| **Phase 3** | ✅ Complete | Drone / CV occupancy layer (FoxxeLabs research) |
| **Phase 4** | 🔲 Pending | Push alerts — "Lot A just freed up" |

---

## Build Instructions for Claude Code

1. Scaffold Expo project: `npx create-expo-app park --template blank-typescript`
2. Install pinned dependencies
3. `constants/theme.ts` first — all colours before any component
4. Build screens: MapScreen → ListScreen → ReportModal → SuccessToast
5. `services/locationTask.ts` + `services/geofenceEvents.ts` (lorg pattern)
6. `hooks/useGeofence.ts` + `hooks/useUserId.ts`
7. `services/api.ts` with `__DEV__` switching and mock fallback
8. `data/lots.ts` with lot polygons
9. FastAPI backend — 4 endpoints + decay logic
10. 11 pytest tests — all must pass
11. **After each phase: `git add -A && git commit -m "phaseN: ..." && git push`**

**Do not use Expo Go for final testing — use a dev build.**

---

## Phase 3 — Drone / CV Occupancy Layer

### Goal

Add a computer-vision-derived occupancy feed as a second data source alongside
crowdsourced reports. A drone or fixed camera periodically images the lots; a CV
pipeline counts visible vehicles and posts occupancy estimates to the backend.
The app blends CV estimates with crowdsourced reports to produce a higher-confidence
status for each lot.

This is a FoxxeLabs research phase — the CV pipeline is out of scope for Claude Code.
What Claude Code builds here is the **backend ingestion endpoint** and the
**frontend blending logic**.

---

### Step 1 — Backend: CV Ingestion Endpoint

Add a new authenticated endpoint to `backend/main.py`:

```
POST /api/cv/occupancy
```

Payload:
```json
{
  "lot_id": "A",
  "vehicle_count": 87,
  "capacity": 120,
  "captured_at": "2026-03-22T14:30:00Z",
  "source": "drone",
  "confidence": 0.91
}
```

- Auth: `X-API-Key` header (new env var `PARK_CV_API_KEY`, separate from any future user auth)
- Stored in new table `cv_observations`
- CV observations decay after 4 hours (much slower than crowdsourced 90-min decay)
- `confidence` field (0.0–1.0) stored but not yet used in blending — reserved for Phase 3+

New DB table:
```sql
CREATE TABLE cv_observations (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    lot_id       TEXT NOT NULL,
    vehicle_count INTEGER NOT NULL,
    capacity     INTEGER NOT NULL,
    captured_at  DATETIME NOT NULL,
    source       TEXT NOT NULL DEFAULT 'drone',
    confidence   REAL NOT NULL DEFAULT 1.0
);
```

---

### Step 2 — Backend: Blended Status Logic

Update `compute_lot_status()` in `backend/main.py` to blend CV + crowdsourced:

- If a CV observation exists within the last 4 hours, compute a CV fill_pct:
  `cv_fill_pct = vehicle_count / capacity * 100`
- Blend: `blended_pct = (cv_fill_pct * 0.6) + (crowd_fill_pct * 0.4)`
  - If no recent crowd reports, use CV alone (weight 1.0)
  - If no recent CV observation, use crowd alone (existing logic unchanged)
- Add `data_source` field to `LotResponse`:
  - `"crowd"` — crowd only
  - `"cv"` — CV only
  - `"blended"` — both sources

---

### Step 3 — Frontend: Data Source Indicator

Add a subtle data source indicator to `LotCard` and `MapScreen`:

- Small icon/label: 📡 "Live" (blended), 👥 "Community" (crowd only), 📷 "Camera" (CV only)
- Shown in `TEXT_SECONDARY` below the status badge — unobtrusive
- Tapping it shows a one-line tooltip explaining the source

---

### Step 4 — New Pytest Tests (add to `test_api.py`)

```python
# 12. POST /api/cv/occupancy with valid payload returns 201
def test_post_cv_occupancy():

# 13. POST /api/cv/occupancy without API key returns 401
def test_cv_auth_required():

# 14. CV observation within 4h contributes to blended status
def test_cv_blended_status():

# 15. CV observation older than 4h is ignored
def test_cv_decay_expired():

# 16. No CV data → crowd-only status unchanged
def test_cv_absent_falls_back_to_crowd():
```

All 16 tests must pass.

---

### Validation Checklist (Phase 3 Done When)

- [ ] `POST /api/cv/occupancy` returns 201 with valid key
- [ ] `POST /api/cv/occupancy` returns 401 without key
- [ ] `GET /api/lots` returns `data_source` field on each lot
- [ ] Blended status correctly weights 60% CV / 40% crowd
- [ ] CV observation older than 4h falls back to crowd-only
- [ ] No CV + no crowd → `unknown`
- [ ] Data source indicator visible on LotCard (not intrusive)
- [ ] Tooltip explains source on tap
- [ ] All 16 pytest tests passing
- [ ] `git push` after completion

---

*PRD version: 1.3 — 2026-03-22 (Phase 3 added)*
*todd427/park*
