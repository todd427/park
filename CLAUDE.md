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
│   └── useGeofence.ts
├── data/
│   └── mockData.ts
├── constants/
│   └── theme.ts
├── backend/
│   ├── main.py                 # FastAPI app
│   ├── models.py
│   ├── database.py
│   ├── requirements.txt
│   └── tests/
│       └── test_api.py         # 11 required pytest tests
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

### ListScreen (`app/list.tsx`)
- Scrollable `FlatList` of `LotCard` components
- Each card shows: lot name, status badge, fill percentage bar, report count, "Report" button
- Pull-to-refresh (re-fetches lot status)

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
- Two large tap targets:
  - **"Found a space ✅"** → posts `found` report
  - **"It's full 🔴"** → posts `full` report
- Dismiss on backdrop tap
- Shows `SuccessToast` on submit

### SuccessToast (`components/SuccessToast.tsx`)
- Animated slide-up notification
- "Thanks! Your report helps other students."
- Auto-dismisses after 2.5s
- Positioned above tab bar

### useGeofence (`hooks/useGeofence.ts`)
- `expo-location` background watch (same pattern as `todd427/lorg`)
- Haversine distance calculation to each lot centroid
- Triggers auto-prompt (`ReportModal`) when device enters a lot's geofence radius (default 80m)
- Debounced — only prompts once per lot entry per session

---

## Mock Data (`data/mockData.ts`)

Pre-seeded for demo — shows all four status states:

```typescript
export const MOCK_LOTS: Lot[] = [
  { id: 'A', name: 'Main Car Park',    status: 'full',      fillPct: 92, reportCount: 7 },
  { id: 'B', name: 'Sports Centre',    status: 'filling',   fillPct: 55, reportCount: 4 },
  { id: 'C', name: 'West Block',       status: 'available', fillPct: 18, reportCount: 3 },
  { id: 'D', name: 'Staff / Overflow', status: 'unknown',   fillPct: 0,  reportCount: 0 },
];
```

Phase 0 uses mock data. Phase 1 wires to live backend.

---

## Backend API (FastAPI — `backend/main.py`)

### Models

```python
class Report(BaseModel):
    lot_id: str          # 'A' | 'B' | 'C' | 'D'
    report_type: str     # 'found' | 'full'
    timestamp: datetime  # UTC
    user_id: str         # anonymous UUID, generated client-side

class Lot(BaseModel):
    id: str
    name: str
    capacity: int
    status: str          # 'available' | 'filling' | 'full' | 'unknown'
    fill_pct: float
    report_count: int
    last_updated: datetime | None
```

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

## Required Pytest Tests (11 total)

All must pass before handoff to Phase 1. File: `backend/tests/test_api.py`

```python
# 1. Health check returns 200
def test_health_check():

# 2. GET /api/lots returns list of 4 lots
def test_get_all_lots():

# 3. GET /api/lots/A returns lot A
def test_get_lot_by_id():

# 4. GET /api/lots/Z returns 404
def test_get_invalid_lot_returns_404():

# 5. POST /api/reports with valid payload returns 201
def test_post_report_found():

# 6. POST /api/reports with type=full returns 201
def test_post_report_full():

# 7. POST /api/reports with invalid lot_id returns 422
def test_post_report_invalid_lot():

# 8. POST /api/reports with invalid report_type returns 422
def test_post_report_invalid_type():

# 9. Report decay — report older than 90min has zero weight
def test_report_decay_expired():

# 10. Status threshold — ≥70% full reports → status=full
def test_status_threshold_full():

# 11. Status threshold — <40% full reports → status=available
def test_status_threshold_available():
```

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
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/react": "~18.3.0"
  }
}
```

### Backend (`backend/requirements.txt`)

```
fastapi==0.115.0
uvicorn==0.32.0
pydantic==2.9.0
sqlalchemy==2.0.36
pytest==8.3.0
httpx==0.28.0
python-dateutil==2.9.0
```

---

## Fly.io Deploy Config (`fly.toml`)

```toml
app = "park-api"
primary_region = "lhr"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 8000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  memory = "256mb"
  cpu_kind = "shared"
  cpus = 1
```

---

## Phase Roadmap

| Phase | Status | Description |
|---|---|---|
| **Phase 0** | ✅ Complete | Demo app — mock data, self-report flow, all screens, 11/11 tests |
| **Phase 1** | ✅ Complete | Deploy to Fly.io, wire frontend to live backend, PostgreSQL |
| **Phase 2** | 🔲 Pending | Lorg geofence integration — auto-prompt on lot entry |
| **Phase 3** | 🔲 Pending | Drone / CV occupancy layer (FoxxeLabs research) |
| **Phase 4** | 🔲 Pending | Push alerts — "Lot A just freed up" |

---

## Build Instructions for Claude Code

1. Scaffold Expo project: `npx create-expo-app park --template blank-typescript`
2. Install pinned dependencies above
3. Implement `constants/theme.ts` first — all colours defined before any component
4. Build screens in order: MapScreen → ListScreen → ReportModal → SuccessToast
5. Implement `useGeofence.ts` — use lorg's pattern if available
6. Populate `mockData.ts` with the 4 lots above
7. Build FastAPI backend in `backend/` — all 4 endpoints + decay logic
8. Write 11 pytest tests — all must pass
9. Verify on Android (physical device or emulator) — this is Android-first
10. **After completing each phase: `git add -A && git commit -m "phaseN: ..." && git push`**

**Do not use Expo Go for final testing — use a dev build.**

---

## Phase 1 — Live Backend & API Integration

### Goal

Replace mock data with live API calls to the deployed Fly.io backend. The app should work end-to-end: student taps a report on their phone → FastAPI records it → all other users see updated status within one refresh cycle.

---

### Step 1 — Deploy Backend to Fly.io

The `fly.toml` and `Dockerfile` are already in the repo root (written in Phase 0).

```bash
cd backend
fly launch --no-deploy   # confirm app name = park-api, region = lhr
fly deploy               # builds Docker image, deploys to Fly.io
```

Verify:
```bash
curl https://park-api.fly.dev/api/status
# → {"status": "ok"}

curl https://park-api.fly.dev/api/lots
# → [{...}, {...}, {...}, {...}]  (all 4 lots, status=unknown, no reports yet)
```

**The live base URL is:** `https://park-api.fly.dev`

---

### Step 2 — API Client (`hooks/useApi.ts`)

Create `hooks/useApi.ts`. This is the single place all API calls live — screens never call `fetch` directly.

```typescript
const API_BASE = 'https://park-api.fly.dev';

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

// GET /api/lots — returns all 4 lots with live status
export function useLots(): ApiState<Lot[]> & { refresh: () => void }

// POST /api/reports — submit a report, returns the created report
export async function submitReport(
  lotId: string,
  reportType: 'found' | 'full',
  userId: string
): Promise<void>
```

Implementation notes:
- `useLots` uses `useEffect` + `useState`, polls every 60 seconds (`setInterval`)
- `userId` is a UUID generated once with `expo-crypto` and persisted with `AsyncStorage` — anonymous, never changes per device
- All fetch calls have a 10s timeout via `AbortController`
- On network error, surface the error string — do not silently swallow

---

### Step 3 — Wire Screens to Live Data

#### MapScreen (`app/index.tsx`)
- Replace `MOCK_LOTS` import with `useLots()` hook
- Show `ActivityIndicator` (ATU_BLUE) centred on map while `loading === true`
- Show an error banner (red strip, top of screen) if `error !== null`: "Could not load parking data. Pull to retry."
- Lot overlays update reactively when `useLots` data refreshes

#### ListScreen (`app/list.tsx`)
- Replace `MOCK_LOTS` import with `useLots()` hook
- Pass `refresh` from `useLots` as the `onRefresh` handler for pull-to-refresh
- Show skeleton `LotCard` placeholders (3 grey animated bars) while loading on first load
- Show inline error state (grey card, retry button) if fetch fails

#### ReportModal (`components/ReportModal.tsx`)
- On tap of either report button:
  1. Show spinner inside the tapped button (replace icon with `ActivityIndicator`)
  2. Call `submitReport(lotId, reportType, userId)`
  3. On success: dismiss modal, show `SuccessToast`
  4. On error: show inline error text below buttons — "Failed to submit. Please try again." — do not dismiss modal
- Disable both buttons while submission is in flight (prevent double-tap)

---

### Step 4 — Environment Config (`constants/config.ts`)

Create `constants/config.ts`:

```typescript
export const CONFIG = {
  API_BASE: __DEV__
    ? 'http://localhost:8000'   // local uvicorn during dev
    : 'https://park-api.fly.dev',
  POLL_INTERVAL_MS: 60_000,    // 60 seconds
  REQUEST_TIMEOUT_MS: 10_000,  // 10 seconds
  GEOFENCE_RADIUS_M: 80,
};
```

`useApi.ts` imports from here — no hardcoded URLs anywhere else.

---

### Step 5 — Postgres on Fly.io (Production Database)

The Phase 0 backend uses SQLite. For Fly.io prod, switch to Postgres:

```bash
fly postgres create --name park-db --region lhr --vm-size shared-cpu-1x --volume-size 1
fly postgres attach park-db --app park-api
# Fly sets DATABASE_URL secret automatically
```

Update `backend/database.py` to use `DATABASE_URL` env var when present, fall back to SQLite for local dev:

```python
import os
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./park.db")
# If Postgres URL from Fly, replace postgres:// with postgresql+psycopg2://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)
```

Add to `backend/requirements.txt`:
```
psycopg2-binary==2.9.9
```

---

### Step 6 — Validation Checklist (Phase 1 Done When)

- [ ] `curl https://park-api.fly.dev/api/status` returns `{"status": "ok"}`
- [ ] MapScreen loads live lot data (not mock) — overlays colour correctly
- [ ] ListScreen pull-to-refresh hits the live API
- [ ] Submitting a report from ReportModal hits `POST /api/reports` — verify in Fly logs
- [ ] Submitting a report on one device is visible on another device within 60s (next poll)
- [ ] Loading spinner shown on MapScreen during initial fetch
- [ ] Error banner shown on MapScreen when API is unreachable (test by disabling network)
- [ ] Error state shown in ReportModal on submit failure
- [ ] `__DEV__` correctly switches between localhost and prod URL
- [ ] All 11 pytest tests still pass against local backend
- [ ] `git push` after completion

---

*PRD version: 1.1 — 2026-03-22 (Phase 1 added)*
*todd427/park*
