"""FastAPI application for Park — ATU Letterkenny Parking Availability."""

import json
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
    LotDB,
    OccupancySessionDB,
    PushTokenDB,
    ReportDB,
    create_tables,
    get_db,
)
from backend.models import (
    Coordinate,
    CvEstimateCreate,
    CvEstimateResponse,
    LotDefinition,
    LotDefinitionResponse,
    LotDefinitionUpdate,
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

# Seed data — the 4 original ATU Letterkenny campus lots with real coordinates
SEED_LOTS = [
    {
        "id": "A",
        "name": "Main Car Park",
        "capacity": 120,
        "coordinates": [
            {"lat": 54.9533446, "lng": -7.7262454},
            {"lat": 54.9533684, "lng": -7.7263687},
            {"lat": 54.9534161, "lng": -7.7263905},
            {"lat": 54.9534866, "lng": -7.7259307},
            {"lat": 54.9534268, "lng": -7.7258997},
            {"lat": 54.9533707, "lng": -7.7255703},
            {"lat": 54.9534029, "lng": -7.7255391},
            {"lat": 54.9534156, "lng": -7.7254401},
            {"lat": 54.9534453, "lng": -7.7254185},
            {"lat": 54.9535036, "lng": -7.7250370},
            {"lat": 54.9534934, "lng": -7.7250133},
            {"lat": 54.9535206, "lng": -7.7248571},
            {"lat": 54.9534484, "lng": -7.7243465},
            {"lat": 54.9534934, "lng": -7.7243298},
            {"lat": 54.9533643, "lng": -7.7233960},
            {"lat": 54.9533288, "lng": -7.7234133},
            {"lat": 54.9533239, "lng": -7.7233834},
            {"lat": 54.9534740, "lng": -7.7232675},
            {"lat": 54.9534859, "lng": -7.7233384},
            {"lat": 54.9535903, "lng": -7.7232973},
            {"lat": 54.9535793, "lng": -7.7232145},
            {"lat": 54.9536426, "lng": -7.7231939},
            {"lat": 54.9535950, "lng": -7.7228464},
            {"lat": 54.9534941, "lng": -7.7226934},
            {"lat": 54.9534033, "lng": -7.7228563},
            {"lat": 54.9529763, "lng": -7.7231756},
            {"lat": 54.9525841, "lng": -7.7236607},
            {"lat": 54.9526087, "lng": -7.7237360},
            {"lat": 54.9526354, "lng": -7.7237626},
            {"lat": 54.9526586, "lng": -7.7238220},
            {"lat": 54.9527131, "lng": -7.7240045},
            {"lat": 54.9527743, "lng": -7.7242231},
            {"lat": 54.9528396, "lng": -7.7244508},
            {"lat": 54.9529051, "lng": -7.7246765},
            {"lat": 54.9529818, "lng": -7.7249296},
            {"lat": 54.9530432, "lng": -7.7251544},
            {"lat": 54.9531095, "lng": -7.7253794},
            {"lat": 54.9531735, "lng": -7.7256103},
            {"lat": 54.9532412, "lng": -7.7258702},
            {"lat": 54.9533446, "lng": -7.7262454},
        ],
        "centroid_lat": 54.95325,
        "centroid_lng": -7.7245,
    },
    {
        "id": "B",
        "name": "Sports Centre",
        "capacity": 60,
        "coordinates": [
            {"lat": 54.9545995, "lng": -7.7254408},
            {"lat": 54.9546000, "lng": -7.7261283},
            {"lat": 54.9545768, "lng": -7.7262689},
            {"lat": 54.9541719, "lng": -7.7260364},
            {"lat": 54.9542047, "lng": -7.7257914},
            {"lat": 54.9542202, "lng": -7.7255982},
            {"lat": 54.9542250, "lng": -7.7254315},
            {"lat": 54.9542060, "lng": -7.7250758},
            {"lat": 54.9542086, "lng": -7.7250277},
            {"lat": 54.9541404, "lng": -7.7242783},
            {"lat": 54.9544836, "lng": -7.7241204},
            {"lat": 54.9545298, "lng": -7.7244163},
            {"lat": 54.9545968, "lng": -7.7251055},
            {"lat": 54.9545995, "lng": -7.7254408},
        ],
        "centroid_lat": 54.954383,
        "centroid_lng": -7.725297,
    },
    {
        "id": "C",
        "name": "West Block",
        "capacity": 45,
        "coordinates": [
            {"lat": 54.9506128, "lng": -7.7225746},
            {"lat": 54.9504104, "lng": -7.7230268},
            {"lat": 54.9501751, "lng": -7.7235523},
            {"lat": 54.9494837, "lng": -7.7226158},
            {"lat": 54.9500551, "lng": -7.7217539},
            {"lat": 54.9502898, "lng": -7.7220939},
            {"lat": 54.9506128, "lng": -7.7225746},
        ],
        "centroid_lat": 54.950234,
        "centroid_lng": -7.722599,
    },
    {
        "id": "D",
        "name": "Staff / Overflow",
        "capacity": 80,
        "coordinates": [
            {"lat": 54.9512653, "lng": -7.7218068},
            {"lat": 54.9514396, "lng": -7.7223762},
            {"lat": 54.9522062, "lng": -7.7216647},
            {"lat": 54.9520895, "lng": -7.7212834},
            {"lat": 54.9519746, "lng": -7.7213901},
            {"lat": 54.9519170, "lng": -7.7212019},
            {"lat": 54.9512653, "lng": -7.7218068},
        ],
        "centroid_lat": 54.951737,
        "centroid_lng": -7.721647,
    },
]


def compute_centroid(coordinates: list[dict]) -> tuple[float, float]:
    """Compute centroid from a list of coordinate dicts with 'lat' and 'lng' keys."""
    n = len(coordinates)
    avg_lat = sum(c["lat"] for c in coordinates) / n
    avg_lng = sum(c["lng"] for c in coordinates) / n
    return round(avg_lat, 6), round(avg_lng, 6)


def seed_lots(db: Session):
    """Insert the 4 original lots if they don't already exist."""
    for lot_data in SEED_LOTS:
        existing = db.query(LotDB).filter(LotDB.id == lot_data["id"]).first()
        if existing is None:
            db_lot = LotDB(
                id=lot_data["id"],
                name=lot_data["name"],
                capacity=lot_data["capacity"],
                coordinates=json.dumps(lot_data["coordinates"]),
                centroid_lat=lot_data["centroid_lat"],
                centroid_lng=lot_data["centroid_lng"],
            )
            db.add(db_lot)
    db.commit()


@app.on_event("startup")
def on_startup():
    create_tables()
    db = next(get_db())
    try:
        seed_lots(db)
    finally:
        db.close()


def verify_cv_api_key(request: Request):
    """Verify the X-API-Key header for CV endpoints."""
    key = request.headers.get("X-API-Key")
    if key != CV_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid API key")


def get_lot_info(lot_id: str, db: Session) -> dict:
    """Query LotDB and return lot dict (id, name, capacity, coordinates, centroid) or raise 404."""
    lot = db.query(LotDB).filter(LotDB.id == lot_id).first()
    if lot is None:
        raise HTTPException(status_code=404, detail=f"Lot '{lot_id}' not found")
    return {
        "id": lot.id,
        "name": lot.name,
        "capacity": lot.capacity,
        "coordinates": json.loads(lot.coordinates),
        "centroid_lat": lot.centroid_lat,
        "centroid_lng": lot.centroid_lng,
    }


def get_all_lot_ids(db: Session) -> list[str]:
    """Return all lot IDs from the DB."""
    rows = db.query(LotDB.id).all()
    return [row[0] for row in rows]


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
    lot_info = get_lot_info(lot_id, db)
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

    coords = [Coordinate(lat=c["lat"], lng=c["lng"]) for c in lot_info["coordinates"]]
    centroid = Coordinate(lat=lot_info["centroid_lat"], lng=lot_info["centroid_lng"])

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
        coordinates=coords,
        centroid=centroid,
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
    # Validate lot exists in DB
    lot_info = get_lot_info(report.lot_id, db)

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
        lot_name = lot_info["name"]
        body = _build_push_body(lot_name, old_status, new_status)
        background_tasks.add_task(send_push_notifications, "Parking Update", body, db)

    return db_report


@app.get("/api/lots", response_model=list[LotResponse])
def get_all_lots(db: Session = Depends(get_db)):
    """Get status of all parking lots."""
    lot_ids = get_all_lot_ids(db)
    return [compute_lot_status(lot_id, db) for lot_id in lot_ids]


# --- Lot Definition CRUD Endpoints ---
# These must be registered BEFORE /api/lots/{lot_id} to avoid path conflicts.


def _lot_db_to_response(lot: LotDB) -> LotDefinitionResponse:
    """Convert a LotDB record to a LotDefinitionResponse."""
    coords = json.loads(lot.coordinates)
    return LotDefinitionResponse(
        id=lot.id,
        name=lot.name,
        capacity=lot.capacity,
        coordinates=[Coordinate(lat=c["lat"], lng=c["lng"]) for c in coords],
        centroid=Coordinate(lat=lot.centroid_lat, lng=lot.centroid_lng),
        created_at=lot.created_at,
        updated_at=lot.updated_at,
    )


@app.get("/api/lots/definitions", response_model=list[LotDefinitionResponse])
def get_lot_definitions(db: Session = Depends(get_db)):
    """Return all lot definitions with polygons."""
    lots = db.query(LotDB).all()
    return [_lot_db_to_response(lot) for lot in lots]


@app.post("/api/lots/definitions", response_model=LotDefinitionResponse, status_code=201)
def create_lot_definition(lot_def: LotDefinition, db: Session = Depends(get_db)):
    """Create a new lot definition."""
    existing = db.query(LotDB).filter(LotDB.id == lot_def.id).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Lot '{lot_def.id}' already exists")

    coords = [{"lat": c.lat, "lng": c.lng} for c in lot_def.coordinates]
    centroid_lat, centroid_lng = compute_centroid(coords)

    now = datetime.now(timezone.utc)
    db_lot = LotDB(
        id=lot_def.id,
        name=lot_def.name,
        capacity=lot_def.capacity,
        coordinates=json.dumps(coords),
        centroid_lat=centroid_lat,
        centroid_lng=centroid_lng,
        created_at=now,
        updated_at=now,
    )
    db.add(db_lot)
    db.commit()
    db.refresh(db_lot)
    return _lot_db_to_response(db_lot)


@app.put("/api/lots/definitions/{lot_id}", response_model=LotDefinitionResponse)
def update_lot_definition(lot_id: str, update: LotDefinitionUpdate, db: Session = Depends(get_db)):
    """Update a lot's name, capacity, or coordinates. Recomputes centroid if coordinates change."""
    lot = db.query(LotDB).filter(LotDB.id == lot_id).first()
    if lot is None:
        raise HTTPException(status_code=404, detail=f"Lot '{lot_id}' not found")

    if update.name is not None:
        lot.name = update.name
    if update.capacity is not None:
        lot.capacity = update.capacity
    if update.coordinates is not None:
        coords = [{"lat": c.lat, "lng": c.lng} for c in update.coordinates]
        lot.coordinates = json.dumps(coords)
        centroid_lat, centroid_lng = compute_centroid(coords)
        lot.centroid_lat = centroid_lat
        lot.centroid_lng = centroid_lng

    lot.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(lot)
    return _lot_db_to_response(lot)


@app.delete("/api/lots/definitions/{lot_id}")
def delete_lot_definition(lot_id: str, db: Session = Depends(get_db)):
    """Delete a lot definition."""
    lot = db.query(LotDB).filter(LotDB.id == lot_id).first()
    if lot is None:
        raise HTTPException(status_code=404, detail=f"Lot '{lot_id}' not found")
    db.delete(lot)
    db.commit()
    return {"status": "deleted", "lot_id": lot_id}


@app.get("/api/lots/{lot_id}", response_model=LotResponse)
def get_lot(lot_id: str, db: Session = Depends(get_db)):
    """Get status of a single parking lot."""
    # get_lot_info will raise 404 if not found
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
    # Validate lot exists in DB
    get_lot_info(estimate.lot_id, db)

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
    for lot_id in get_all_lot_ids(db):
        estimate = get_latest_cv_estimate(lot_id, db)
        if estimate is not None:
            results.append(estimate)
    return results


@app.get("/api/cv/latest/{lot_id}", response_model=CvEstimateResponse)
def get_cv_latest_for_lot(lot_id: str, db: Session = Depends(get_db)):
    """Get the latest CV estimate for a specific lot."""
    get_lot_info(lot_id, db)
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
    # Validate lot exists
    get_lot_info(event.lot_id, db)

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
    for lot_id in get_all_lot_ids(db):
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


