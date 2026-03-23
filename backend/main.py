"""FastAPI application for Park — ATU Letterkenny Parking Availability."""

import logging
import os
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import desc
from sqlalchemy.orm import Session

from backend.database import (
    CvEstimateDB,
    OccupancySessionDB,
    PushTokenDB,
    ReportDB,
    create_tables,
    get_db,
)
from backend.models import (
    CvEstimateCreate,
    CvEstimateResponse,
    LotResponse,
    OccupancyEvent,
    OccupancySessionResponse,
    PushTokenCreate,
    PushTokenResponse,
    ReportCreate,
    ReportResponse,
)

logger = logging.getLogger(__name__)

app = FastAPI(title="Park API", version="1.0.0")

CV_API_KEY = os.environ.get("CV_API_KEY", "park-cv-dev-key")

# CORS — allow all origins for dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lot definitions
LOTS = {
    "A": {"id": "A", "name": "Main Car Park", "capacity": 120},
    "B": {"id": "B", "name": "Sports Centre", "capacity": 60},
    "C": {"id": "C", "name": "West Block", "capacity": 45},
    "D": {"id": "D", "name": "Staff / Overflow", "capacity": 80},
}


@app.on_event("startup")
def on_startup():
    create_tables()


def verify_cv_api_key(request: Request):
    """Verify the X-API-Key header for CV endpoints."""
    key = request.headers.get("X-API-Key")
    if key != CV_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API key")


def get_latest_cv_estimate(lot_id: str, db: Session) -> CvEstimateDB | None:
    """Get the most recent CV estimate for a lot within the last 30 minutes."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=30)
    return (
        db.query(CvEstimateDB)
        .filter(CvEstimateDB.lot_id == lot_id, CvEstimateDB.timestamp >= cutoff)
        .order_by(desc(CvEstimateDB.timestamp))
        .first()
    )


def compute_lot_status(lot_id: str, db: Session) -> LotResponse:
    """Compute the current status for a lot based on weighted recent reports and CV data."""
    lot_info = LOTS[lot_id]
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=90)

    # Get reports from last 90 minutes
    reports = (
        db.query(ReportDB)
        .filter(ReportDB.lot_id == lot_id, ReportDB.timestamp >= cutoff)
        .order_by(desc(ReportDB.timestamp))
        .all()
    )

    # Calculate crowd weighted votes
    total_weight = 0.0
    full_weight = 0.0

    for report in reports:
        ts = report.timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        age_minutes = (now - ts).total_seconds() / 60.0

        if age_minutes < 45:
            weight = 1.0
        elif age_minutes <= 90:
            weight = 0.5
        else:
            weight = 0.0

        total_weight += weight
        if report.report_type == "full":
            full_weight += weight

    # Compute crowd fill percentage
    has_crowd = total_weight > 0
    if has_crowd:
        crowd_pct = (full_weight / total_weight) * 100.0
    else:
        crowd_pct = 0.0

    # Get latest CV estimate
    cv_estimate = get_latest_cv_estimate(lot_id, db)
    has_cv = cv_estimate is not None

    # Count active occupancy sessions (entered within last 4 hours, not exited)
    session_cutoff = now - timedelta(hours=4)
    active_sessions = (
        db.query(OccupancySessionDB)
        .filter(
            OccupancySessionDB.lot_id == lot_id,
            OccupancySessionDB.exited_at.is_(None),
            OccupancySessionDB.entered_at >= session_cutoff,
        )
        .count()
    )
    has_passive = active_sessions > 0

    # Determine fill_pct and data_source via blending
    cv_occupancy = None
    cv_confidence = None
    cv_source = None

    if has_cv:
        cv_pct = (cv_estimate.occupied_spaces / cv_estimate.total_spaces) * 100.0
        cv_occupancy = round(cv_pct, 1)
        cv_confidence = cv_estimate.confidence
        cv_source = cv_estimate.source

    # Passive occupancy calculation
    passive_pct = (active_sessions / lot_info["capacity"]) * 100.0 if has_passive else 0.0
    passive_weight = min(active_sessions, 10) / 10.0 if has_passive else 0.0

    # Build blended fill_pct from all available sources
    numerator = 0.0
    denominator = 0.0
    sources = []

    if has_crowd:
        crowd_weight_factor = min(len(reports), 5) / 5.0
        numerator += crowd_pct * crowd_weight_factor
        denominator += crowd_weight_factor
        sources.append("crowd")

    if has_cv:
        cv_weight_factor = cv_estimate.confidence * 2.0
        numerator += cv_pct * cv_weight_factor
        denominator += cv_weight_factor
        sources.append("cv")

    if has_passive:
        numerator += passive_pct * passive_weight
        denominator += passive_weight
        sources.append("passive")

    if denominator > 0:
        fill_pct = round(numerator / denominator, 1)
    else:
        fill_pct = 0.0

    # Determine data_source label
    if len(sources) == 0:
        data_source = "crowd"
    elif len(sources) == 1:
        data_source = sources[0]
    elif "crowd" in sources and "cv" in sources:
        data_source = "blended"
    else:
        data_source = "+".join(sources)

    # Determine status from fill_pct
    has_any_data = has_crowd or has_cv or has_passive
    if not has_any_data:
        status = "unknown"
    elif fill_pct >= 70:
        status = "full"
    elif fill_pct >= 40:
        status = "filling"
    else:
        status = "available"

    last_updated = None
    if reports:
        last_updated = reports[0].timestamp
        if last_updated.tzinfo is None:
            last_updated = last_updated.replace(tzinfo=timezone.utc)

    return LotResponse(
        id=lot_info["id"],
        name=lot_info["name"],
        capacity=lot_info["capacity"],
        status=status,
        fill_pct=fill_pct,
        report_count=len(reports),
        last_updated=last_updated,
        cv_occupancy=cv_occupancy,
        cv_confidence=cv_confidence,
        cv_source=cv_source,
        data_source=data_source,
        active_sessions=active_sessions,
    )


@app.get("/api/status")
def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

# Meaningful status transitions that trigger push notifications
NOTIFY_TRANSITIONS = {
    ("full", "available"),
    ("full", "filling"),
    ("filling", "available"),
    ("available", "full"),
    ("filling", "full"),
    ("unknown", "full"),
    ("unknown", "filling"),
    ("unknown", "available"),
}


def send_push_notifications(title: str, body: str, db: Session):
    """Send Expo push notifications to all registered tokens (best-effort)."""
    tokens = db.query(PushTokenDB).all()
    if not tokens:
        return

    messages = [
        {"to": t.token, "title": title, "body": body, "sound": "default"}
        for t in tokens
    ]

    try:
        resp = httpx.post(
            EXPO_PUSH_URL,
            json=messages,
            headers={
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
            timeout=10,
        )
        if resp.status_code == 200:
            data = resp.json().get("data", [])
            for i, ticket in enumerate(data):
                if ticket.get("status") == "error" and ticket.get("details", {}).get(
                    "error"
                ) in ("DeviceNotRegistered", "InvalidCredentials"):
                    # Remove invalid token
                    db.query(PushTokenDB).filter(
                        PushTokenDB.token == tokens[i].token
                    ).delete()
            db.commit()
    except Exception:
        logger.exception("Failed to send push notifications")


def _build_push_body(lot_name: str, old_status: str, new_status: str) -> str:
    """Build a human-friendly push notification body."""
    if old_status == "full" and new_status in ("available", "filling"):
        return f"{lot_name} just freed up!"
    if new_status == "full":
        return f"{lot_name} is now full"
    if new_status == "filling":
        return f"{lot_name} is now filling up"
    if new_status == "available":
        return f"{lot_name} is now available!"
    return f"{lot_name} is now {new_status}!"


@app.post("/api/reports", response_model=ReportResponse, status_code=201)
def create_report(
    report: ReportCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Submit a parking report."""
    # Compute status BEFORE the new report
    old_status = compute_lot_status(report.lot_id, db).status

    db_report = ReportDB(
        lot_id=report.lot_id,
        report_type=report.report_type,
        timestamp=datetime.now(timezone.utc),
        user_id=report.user_id,
    )
    db.add(db_report)
    db.commit()
    db.refresh(db_report)

    # Compute status AFTER the new report
    new_status = compute_lot_status(report.lot_id, db).status

    if (old_status, new_status) in NOTIFY_TRANSITIONS:
        lot_name = LOTS[report.lot_id]["name"]
        body = _build_push_body(lot_name, old_status, new_status)
        background_tasks.add_task(send_push_notifications, "Parking Update", body, db)

    return db_report


@app.get("/api/lots", response_model=list[LotResponse])
def get_all_lots(db: Session = Depends(get_db)):
    """Get status of all parking lots."""
    return [compute_lot_status(lot_id, db) for lot_id in LOTS]


@app.get("/api/lots/{lot_id}", response_model=LotResponse)
def get_lot(lot_id: str, db: Session = Depends(get_db)):
    """Get status of a single parking lot."""
    if lot_id not in LOTS:
        raise HTTPException(status_code=404, detail=f"Lot '{lot_id}' not found")
    return compute_lot_status(lot_id, db)


@app.post(
    "/api/cv/estimate",
    response_model=CvEstimateResponse,
    status_code=201,
    dependencies=[Depends(verify_cv_api_key)],
)
def create_cv_estimate(
    estimate: CvEstimateCreate, db: Session = Depends(get_db)
):
    """Submit a CV occupancy estimate. Requires X-API-Key header."""
    db_estimate = CvEstimateDB(
        lot_id=estimate.lot_id,
        occupied_spaces=estimate.occupied_spaces,
        total_spaces=estimate.total_spaces,
        confidence=estimate.confidence,
        source=estimate.source,
        image_url=estimate.image_url,
        timestamp=datetime.now(timezone.utc),
    )
    db.add(db_estimate)
    db.commit()
    db.refresh(db_estimate)
    return db_estimate


@app.get("/api/cv/latest", response_model=list[CvEstimateResponse])
def get_cv_latest(db: Session = Depends(get_db)):
    """Get the latest CV estimate for each lot (within last 30 min)."""
    results = []
    for lot_id in LOTS:
        estimate = get_latest_cv_estimate(lot_id, db)
        if estimate is not None:
            results.append(estimate)
    return results


@app.get("/api/cv/latest/{lot_id}", response_model=CvEstimateResponse)
def get_cv_latest_for_lot(lot_id: str, db: Session = Depends(get_db)):
    """Get the latest CV estimate for a specific lot."""
    if lot_id not in LOTS:
        raise HTTPException(status_code=404, detail=f"Lot '{lot_id}' not found")
    estimate = get_latest_cv_estimate(lot_id, db)
    if estimate is None:
        raise HTTPException(
            status_code=404, detail=f"No recent CV estimate for lot '{lot_id}'"
        )
    return estimate


# --- Phase 4: Push Notification Endpoints ---


@app.post("/api/push/register", response_model=PushTokenResponse, status_code=201)
def register_push_token(payload: PushTokenCreate, db: Session = Depends(get_db)):
    """Register an Expo push token. Upserts if token already exists."""
    existing = (
        db.query(PushTokenDB).filter(PushTokenDB.token == payload.token).first()
    )
    if existing:
        existing.user_id = payload.user_id
        db.commit()
        db.refresh(existing)
        return existing

    db_token = PushTokenDB(
        token=payload.token,
        user_id=payload.user_id,
    )
    db.add(db_token)
    db.commit()
    db.refresh(db_token)
    return db_token


@app.delete("/api/push/unregister")
def unregister_push_token(payload: PushTokenCreate, db: Session = Depends(get_db)):
    """Remove a push token."""
    deleted = (
        db.query(PushTokenDB).filter(PushTokenDB.token == payload.token).delete()
    )
    db.commit()
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Token not found")
    return {"status": "removed"}


# --- Phase 2: Passive Occupancy Tracking Endpoints ---


@app.post(
    "/api/occupancy/enter",
    response_model=OccupancySessionResponse,
    status_code=201,
)
def occupancy_enter(event: OccupancyEvent, db: Session = Depends(get_db)):
    """Record a device entering a parking lot via geofence."""
    # Check if user already has an active session for this lot (idempotent)
    existing = (
        db.query(OccupancySessionDB)
        .filter(
            OccupancySessionDB.lot_id == event.lot_id,
            OccupancySessionDB.user_id == event.user_id,
            OccupancySessionDB.exited_at.is_(None),
        )
        .first()
    )
    if existing:
        return existing

    # Auto-exit any active session for a different lot
    other_active = (
        db.query(OccupancySessionDB)
        .filter(
            OccupancySessionDB.user_id == event.user_id,
            OccupancySessionDB.exited_at.is_(None),
        )
        .first()
    )
    if other_active:
        other_active.exited_at = datetime.now(timezone.utc)

    # Create new session
    session = OccupancySessionDB(
        lot_id=event.lot_id,
        user_id=event.user_id,
        entered_at=datetime.now(timezone.utc),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@app.post("/api/occupancy/exit", response_model=OccupancySessionResponse)
def occupancy_exit(event: OccupancyEvent, db: Session = Depends(get_db)):
    """Record a device leaving a parking lot via geofence."""
    active = (
        db.query(OccupancySessionDB)
        .filter(
            OccupancySessionDB.lot_id == event.lot_id,
            OccupancySessionDB.user_id == event.user_id,
            OccupancySessionDB.exited_at.is_(None),
        )
        .first()
    )
    if not active:
        raise HTTPException(
            status_code=404,
            detail="No active session found for this user and lot",
        )
    active.exited_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(active)
    return active


@app.get("/api/occupancy/active")
def occupancy_active(db: Session = Depends(get_db)):
    """Get count of active occupancy sessions per lot."""
    now = datetime.now(timezone.utc)
    session_cutoff = now - timedelta(hours=4)
    results = []
    for lot_id in LOTS:
        count = (
            db.query(OccupancySessionDB)
            .filter(
                OccupancySessionDB.lot_id == lot_id,
                OccupancySessionDB.exited_at.is_(None),
                OccupancySessionDB.entered_at >= session_cutoff,
            )
            .count()
        )
        results.append({"lot_id": lot_id, "active_count": count})
    return results
