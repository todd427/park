"""FastAPI application for Park — ATU Letterkenny Parking Availability."""

import os
from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import desc
from sqlalchemy.orm import Session

from backend.database import CvEstimateDB, ReportDB, create_tables, get_db
from backend.models import (
    CvEstimateCreate,
    CvEstimateResponse,
    LotResponse,
    ReportCreate,
    ReportResponse,
)

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

    # Determine fill_pct and data_source via blending
    cv_occupancy = None
    cv_confidence = None
    cv_source = None

    if has_cv:
        cv_pct = (cv_estimate.occupied_spaces / cv_estimate.total_spaces) * 100.0
        cv_occupancy = round(cv_pct, 1)
        cv_confidence = cv_estimate.confidence
        cv_source = cv_estimate.source

    if has_crowd and has_cv:
        # Blend crowd and CV data
        crowd_weight_factor = min(len(reports), 5) / 5.0
        cv_weight_factor = cv_estimate.confidence * 2.0
        blended_fill_pct = (
            crowd_pct * crowd_weight_factor + cv_pct * cv_weight_factor
        ) / (crowd_weight_factor + cv_weight_factor)
        fill_pct = round(blended_fill_pct, 1)
        data_source = "blended"
    elif has_cv:
        fill_pct = round(cv_pct, 1)
        data_source = "cv"
    elif has_crowd:
        fill_pct = round(crowd_pct, 1)
        data_source = "crowd"
    else:
        fill_pct = 0.0
        data_source = "crowd"

    # Determine status from fill_pct
    if not has_crowd and not has_cv:
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
    )


@app.get("/api/status")
def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


@app.post("/api/reports", response_model=ReportResponse, status_code=201)
def create_report(report: ReportCreate, db: Session = Depends(get_db)):
    """Submit a parking report."""
    db_report = ReportDB(
        lot_id=report.lot_id,
        report_type=report.report_type,
        timestamp=datetime.now(timezone.utc),
        user_id=report.user_id,
    )
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
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
