"""FastAPI application for Park — ATU Letterkenny Parking Availability."""

from datetime import datetime, timedelta, timezone

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import desc
from sqlalchemy.orm import Session

from backend.database import ReportDB, create_tables, get_db
from backend.models import LotResponse, ReportCreate, ReportResponse

app = FastAPI(title="Park API", version="1.0.0")

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


def compute_lot_status(lot_id: str, db: Session) -> LotResponse:
    """Compute the current status for a lot based on weighted recent reports."""
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

    if not reports:
        return LotResponse(
            id=lot_info["id"],
            name=lot_info["name"],
            capacity=lot_info["capacity"],
            status="unknown",
            fill_pct=0.0,
            report_count=0,
            last_updated=None,
        )

    # Calculate weighted votes
    total_weight = 0.0
    full_weight = 0.0

    for report in reports:
        ts = report.timestamp
        # Ensure timezone-aware comparison
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

    # Compute fill percentage and status
    if total_weight == 0:
        status = "unknown"
        fill_pct = 0.0
    else:
        fill_pct = (full_weight / total_weight) * 100.0
        if fill_pct >= 70:
            status = "full"
        elif fill_pct >= 40:
            status = "filling"
        else:
            status = "available"

    last_updated = reports[0].timestamp
    if last_updated.tzinfo is None:
        last_updated = last_updated.replace(tzinfo=timezone.utc)

    return LotResponse(
        id=lot_info["id"],
        name=lot_info["name"],
        capacity=lot_info["capacity"],
        status=status,
        fill_pct=round(fill_pct, 1),
        report_count=len(reports),
        last_updated=last_updated,
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
