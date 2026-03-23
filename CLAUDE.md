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
├── app/
│   ├── index.tsx               # MapScreen
│   └── list.tsx                # ListScreen
├── components/
│   ├── LotCard.tsx
│   ├── LotOverlay.tsx
│   ├── ReportModal.tsx
│   └── SuccessToast.tsx
├── hooks/
│   ├── useGeofence.ts
│   └── useUserId.ts
├── services/
│   ├── api.ts
│   ├── locationTask.ts
│   └── geofenceEvents.ts
├── data/
│   ├── lots.ts
│   └── mockData.ts
├── constants/
│   ├── theme.ts
│   └── config.ts
├── backend/
│   ├── main.py
│   ├── models.py
│   ├── database.py
│   ├── requirements.txt
│   └── tests/
│       └── test_api.py         # 17 passing pytest tests
├── index.ts
├── eas.json                    # EAS build config
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
| `ATU_GOLD` | `#C8A84B` | Accents, active states, CV/Blended badges |
| `BG_DARK` | `#121212` | App background |
| `BG_CARD` | `#1E1E1E` | Card surfaces |
| `BG_MODAL` | `#2A2A2A` | Bottom sheet |
| `TEXT_PRIMARY` | `#FFFFFF` | Primary text |
| `TEXT_SECONDARY` | `#A0A0A0` | Metadata, timestamps |
| `STATUS_AVAILABLE` | `#4CAF50` | Green |
| `STATUS_FILLING` | `#FF9800` | Amber |
| `STATUS_FULL` | `#F44336` | Red |
| `STATUS_UNKNOWN` | `#757575` | Grey |

---

## Campus Parking Lots

| ID | Name | Capacity |
|---|---|---|
| `A` | Main Car Park | 120 |
| `B` | Sports Centre | 60 |
| `C` | West Block | 45 |
| `D` | Staff / Overflow | 80 |

Polygons and centroids in `data/lots.ts`.

---

## Status Logic

**Crowd decay:**
| Age | Weight |
|---|---|
| < 45 min | 1.0 |
| 45–90 min | 0.5 |
| > 90 min | 0.0 |

**CV decay:** 30-minute window.

**Passive occupancy:** Geofence enter/exit events tracked per device.
- Sessions auto-expire after 4 hours (stale device protection)
- `passive_pct = (active_sessions / capacity) * 100`
- `passive_weight = min(active_sessions, 10) / 10.0`

**Blending (all sources):**
- `cv_weight = confidence * 2.0`
- `crowd_weight = min(report_count, 5) / 5.0`
- `passive_weight = min(active_sessions, 10) / 10.0`
- Weighted blend of all available sources
- `data_source`: `"crowd"` | `"cv"` | `"passive"` | `"blended"`

**Status thresholds:**
| Weighted % Full | Status |
|---|---|
| ≥ 70% | `full` 🔴 |
| 40–69% | `filling` 🟡 |
| < 40% | `available` 🟢 |
| No data | `unknown` ⬜ |

---

## Backend API — `https://park-api.fly.dev`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/status` | none | Health check |
| `GET` | `/api/lots` | none | All lots with blended status |
| `GET` | `/api/lots/{lot_id}` | none | Single lot |
| `POST` | `/api/reports` | none | Submit crowd report |
| `POST` | `/api/cv/estimate` | `X-API-Key` | Ingest CV occupancy estimate |
| `GET` | `/api/cv/latest` | none | Latest CV estimate per lot (30min window) |
| `GET` | `/api/cv/latest/{lot_id}` | none | Single lot CV data |
| `POST` | `/api/occupancy/enter` | none | Device entered a lot (passive) |
| `POST` | `/api/occupancy/exit` | none | Device left a lot (passive) |
| `GET` | `/api/occupancy/active` | none | Active session counts per lot |

**Env vars:** `DATABASE_URL`, `CV_API_KEY` (set via Fly secrets)

---

## Tests — 27 passing

`backend/tests/test_api.py`

1–11: Original crowd/decay/threshold tests (unchanged)
12. `POST /api/cv/estimate` with valid key → 201
13. `POST /api/cv/estimate` without key → 401
14. CV estimate within window contributes to blended status
15. CV estimate older than 30min is ignored
16. No CV data → crowd-only status unchanged
17. Blended weighting correct (confidence * 2.0 vs crowd weight)

---

## Fly.io Config

- **App:** `park-api` — region LHR
- **DB:** `park-db` (Postgres, `DATABASE_URL` secret)
- **VM:** shared-cpu-1x, 256MB

---

## Phase Roadmap

| Phase | Status | Description |
|---|---|---|
| **Phase 0** | ✅ Complete | Mock data, all screens, 21/21 tests |
| **Phase 1** | ✅ Complete | Live backend on Fly.io, frontend wired |
| **Phase 2** | ✅ Complete | Background geofence, auto-prompt, pub/sub bridge |
| **Phase 3** | ✅ Complete | CV occupancy layer, confidence-weighted blending |
| **Phase 4** | ✅ Complete | EAS Build + push alerts — "Lot A just freed up" |

---

## Build Instructions for Claude Code

1. Scaffold: `npx create-expo-app park --template blank-typescript`
2. Install pinned dependencies
3. `constants/theme.ts` first
4. Screens: MapScreen → ListScreen → ReportModal → SuccessToast
5. `services/locationTask.ts` + `services/geofenceEvents.ts` (lorg pattern)
6. `hooks/useGeofence.ts` + `hooks/useUserId.ts`
7. `services/api.ts` with `__DEV__` switching and mock fallback
8. `data/lots.ts` with lot polygons
9. FastAPI backend — all endpoints + decay + blending
10. 27 pytest tests — all must pass
11. **After each phase: `git add -A && git commit -m "phaseN: ..." && git push`**

**Do not use Expo Go for final testing — use a dev build.**

---

## Phase 4 — EAS Build (Downloadable APK)

### Goal

Produce a shareable Android APK that can be sideloaded or distributed via EAS for
demo purposes — show it off on a real phone without needing a dev environment.

---

### Step 1 — EAS Setup

Install EAS CLI if not already present:
```bash
npm install -g eas-cli
eas login    # todd427's Expo account
```

Initialise EAS in the repo:
```bash
eas build:configure
```

This creates `eas.json`. Ensure it contains a `preview` profile:

```json
{
  "cli": {
    "version": ">= 10.0.0"
  },
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      }
    }
  }
}
```

---

### Step 2 — app.json Checks

Ensure `app.json` has:
- `expo.name`: `"Park"`
- `expo.slug`: `"park"`
- `expo.version`: `"1.0.0"`
- `expo.android.package`: `"ie.foxxelabs.park"`
- `expo.android.versionCode`: `1`
- `expo.android.adaptiveIcon` pointing to existing assets

---

### Step 3 — Trigger the Build

```bash
eas build --platform android --profile preview
```

This queues a cloud build on EAS. When complete, EAS provides a QR code and download
link for the `.apk`. Share the link — anyone can download and sideload it.

---

### Step 4 — Verification

- [ ] `eas.json` present and correct
- [ ] `app.json` has `ie.foxxelabs.park` package name
- [ ] `eas build --platform android --profile preview` completes without error
- [ ] APK installs and runs on a physical Android device
- [ ] MapScreen loads, shows live lot status from `park-api.fly.dev`
- [ ] Can submit a report end-to-end
- [ ] Background geofence active (notification visible in status bar)
- [ ] `git push` after completion

---

## Phase 5 — Push Alerts

### Goal

Notify users when a lot they care about changes status — "Lot A just freed up".

Architecture: Expo Push Notifications (`expo-notifications`) + server-side fan-out
when a lot status transitions from `full`/`filling` → `available`.

Phase 5 spec to be written when Phase 4 is complete.

---

*PRD version: 1.4 — 2026-03-22 (Phase 3 complete, Phase 4 EAS build added)*
*todd427/park*
