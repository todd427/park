"""11 required pytest tests for Park backend API + extended tests."""

import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from unittest.mock import MagicMock, patch

from backend.database import Base, CvEstimateDB, LotDB, OccupancySessionDB, PhotoDB, PushTokenDB, ReportDB, get_db
from backend.main import SEED_LOTS, app

# Use in-memory SQLite for tests
TEST_DATABASE_URL = "sqlite://"

engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _seed_test_lots(db):
    """Insert the 4 original lots into the test database."""
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


@pytest.fixture(autouse=True)
def setup_database():
    """Create fresh tables for each test, seed lots, drop after."""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    _seed_test_lots(db)
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client():
    """TestClient with overridden DB dependency."""

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def db_session():
    """Direct DB session for inserting test data."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


# 1. Health check returns 200
def test_health_check(client):
    response = client.get("/api/status")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


# 2. GET /api/lots returns list of 4 lots
def test_get_all_lots(client):
    response = client.get("/api/lots")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 4
    lot_ids = {lot["id"] for lot in data}
    assert lot_ids == {"A", "B", "C", "D"}


# 3. GET /api/lots/A returns lot A
def test_get_lot_by_id(client):
    response = client.get("/api/lots/A")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "A"
    assert data["name"] == "Main Car Park"
    assert data["capacity"] == 120


# 4. GET /api/lots/Z returns 404
def test_get_invalid_lot_returns_404(client):
    response = client.get("/api/lots/Z")
    assert response.status_code == 404


# 5. POST /api/reports with valid payload returns 201
def test_post_report_found(client):
    response = client.post(
        "/api/reports",
        json={"lot_id": "A", "report_type": "found", "user_id": "user-123"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["lot_id"] == "A"
    assert data["report_type"] == "found"
    assert data["user_id"] == "user-123"
    assert "id" in data


# 6. POST /api/reports with type=full returns 201
def test_post_report_full(client):
    response = client.post(
        "/api/reports",
        json={"lot_id": "B", "report_type": "full", "user_id": "user-456"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["report_type"] == "full"


# 7. POST /api/reports with invalid lot_id returns 404 (lot not in DB)
def test_post_report_invalid_lot(client):
    response = client.post(
        "/api/reports",
        json={"lot_id": "Z", "report_type": "found", "user_id": "user-123"},
    )
    assert response.status_code == 404


# 8. POST /api/reports with invalid report_type returns 422
def test_post_report_invalid_type(client):
    response = client.post(
        "/api/reports",
        json={"lot_id": "A", "report_type": "maybe", "user_id": "user-123"},
    )
    assert response.status_code == 422


# 9. Report decay — report older than 90min has zero weight
def test_report_decay_expired(client, db_session):
    # Insert a report that is 100 minutes old
    old_time = datetime.now(timezone.utc) - timedelta(minutes=100)
    old_report = ReportDB(
        lot_id="C",
        report_type="full",
        timestamp=old_time,
        user_id="user-old",
    )
    db_session.add(old_report)
    db_session.commit()

    response = client.get("/api/lots/C")
    assert response.status_code == 200
    data = response.json()
    # Report is >90min old so it should be ignored entirely
    # The lot should not show up within the 90-min window
    assert data["status"] == "unknown"
    assert data["report_count"] == 0


# 10. Status threshold — >=70% full reports -> status=full
def test_status_threshold_full(client, db_session):
    now = datetime.now(timezone.utc)
    # Insert 8 full reports and 2 found reports (80% full -> status=full)
    for i in range(8):
        db_session.add(
            ReportDB(
                lot_id="A",
                report_type="full",
                timestamp=now - timedelta(minutes=i),
                user_id=f"user-full-{i}",
            )
        )
    for i in range(2):
        db_session.add(
            ReportDB(
                lot_id="A",
                report_type="found",
                timestamp=now - timedelta(minutes=i + 10),
                user_id=f"user-found-{i}",
            )
        )
    db_session.commit()

    response = client.get("/api/lots/A")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "full"
    assert data["fill_pct"] >= 70


# 11. Status threshold — <40% full reports -> status=available
def test_status_threshold_available(client, db_session):
    now = datetime.now(timezone.utc)
    # Insert 2 full reports and 8 found reports (20% full -> status=available)
    for i in range(2):
        db_session.add(
            ReportDB(
                lot_id="B",
                report_type="full",
                timestamp=now - timedelta(minutes=i),
                user_id=f"user-full-{i}",
            )
        )
    for i in range(8):
        db_session.add(
            ReportDB(
                lot_id="B",
                report_type="found",
                timestamp=now - timedelta(minutes=i + 5),
                user_id=f"user-found-{i}",
            )
        )
    db_session.commit()

    response = client.get("/api/lots/B")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "available"
    assert data["fill_pct"] < 40


# --- Phase 3: CV (Computer Vision) Occupancy Tests ---


# 12. POST /api/cv/estimate with valid payload returns 201
def test_post_cv_estimate(client):
    response = client.post(
        "/api/cv/estimate",
        json={
            "lot_id": "A",
            "occupied_spaces": 80,
            "total_spaces": 120,
            "confidence": 0.85,
            "source": "drone",
        },
        headers={"X-API-Key": "park-cv-dev-key"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["lot_id"] == "A"
    assert data["occupied_spaces"] == 80
    assert data["total_spaces"] == 120
    assert data["confidence"] == 0.85
    assert data["source"] == "drone"
    assert "id" in data


# 13. POST /api/cv/estimate without API key returns 403
def test_post_cv_estimate_no_auth(client):
    response = client.post(
        "/api/cv/estimate",
        json={
            "lot_id": "A",
            "occupied_spaces": 80,
            "total_spaces": 120,
            "confidence": 0.85,
            "source": "drone",
        },
    )
    assert response.status_code == 403


# 14. POST /api/cv/estimate with invalid lot returns 404 (lot not in DB)
def test_post_cv_estimate_invalid_lot(client):
    response = client.post(
        "/api/cv/estimate",
        json={
            "lot_id": "Z",
            "occupied_spaces": 10,
            "total_spaces": 50,
            "confidence": 0.9,
            "source": "camera",
        },
        headers={"X-API-Key": "park-cv-dev-key"},
    )
    assert response.status_code == 404


# 15. GET /api/cv/latest returns estimates
def test_get_cv_latest(client):
    # First submit a CV estimate
    client.post(
        "/api/cv/estimate",
        json={
            "lot_id": "B",
            "occupied_spaces": 30,
            "total_spaces": 60,
            "confidence": 0.92,
            "source": "simulation",
        },
        headers={"X-API-Key": "park-cv-dev-key"},
    )
    response = client.get("/api/cv/latest")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    lot_ids = {e["lot_id"] for e in data}
    assert "B" in lot_ids


# 16. CV data blends with crowd reports
def test_cv_crowd_blending(client, db_session):
    now = datetime.now(timezone.utc)

    # Insert 5 crowd reports for lot A — all "full" (100% crowd fill)
    for i in range(5):
        db_session.add(
            ReportDB(
                lot_id="A",
                report_type="full",
                timestamp=now - timedelta(minutes=i),
                user_id=f"user-blend-{i}",
            )
        )
    db_session.commit()

    # Submit a CV estimate showing lot A at 20% occupancy (low)
    cv_estimate = CvEstimateDB(
        lot_id="A",
        occupied_spaces=24,
        total_spaces=120,
        confidence=0.9,
        source="drone",
        timestamp=now,
    )
    db_session.add(cv_estimate)
    db_session.commit()

    response = client.get("/api/lots/A")
    assert response.status_code == 200
    data = response.json()
    assert data["data_source"] == "blended"
    # Crowd says 100%, CV says 20%. Blended should be between them.
    assert 20 < data["fill_pct"] < 100


# 17. CV-only lot shows data_source=cv
def test_cv_only_data_source(client, db_session):
    now = datetime.now(timezone.utc)

    # Insert only a CV estimate for lot C (no crowd reports)
    cv_estimate = CvEstimateDB(
        lot_id="C",
        occupied_spaces=10,
        total_spaces=45,
        confidence=0.8,
        source="camera",
        timestamp=now,
    )
    db_session.add(cv_estimate)
    db_session.commit()

    response = client.get("/api/lots/C")
    assert response.status_code == 200
    data = response.json()
    assert data["data_source"] == "cv"
    assert data["cv_occupancy"] is not None
    assert data["cv_confidence"] == 0.8
    assert data["cv_source"] == "camera"


# --- Phase 4: Push Notification Tests ---


# 18. POST /api/push/register returns 201
def test_register_push_token(client):
    response = client.post(
        "/api/push/register",
        json={"token": "ExponentPushToken[abc123]", "user_id": "user-push-1"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["token"] == "ExponentPushToken[abc123]"
    assert data["user_id"] == "user-push-1"
    assert "id" in data


# 19. POST /api/push/register with same token upserts
def test_register_push_token_upsert(client, db_session):
    client.post(
        "/api/push/register",
        json={"token": "ExponentPushToken[dup123]", "user_id": "user-a"},
    )
    client.post(
        "/api/push/register",
        json={"token": "ExponentPushToken[dup123]", "user_id": "user-b"},
    )
    # Should only be 1 entry for this token
    tokens = (
        db_session.query(PushTokenDB)
        .filter(PushTokenDB.token == "ExponentPushToken[dup123]")
        .all()
    )
    assert len(tokens) == 1
    assert tokens[0].user_id == "user-b"


# 20. DELETE /api/push/unregister removes token
def test_unregister_push_token(client, db_session):
    client.post(
        "/api/push/register",
        json={"token": "ExponentPushToken[del456]", "user_id": "user-del"},
    )
    response = client.request(
        "DELETE",
        "/api/push/unregister",
        json={"token": "ExponentPushToken[del456]", "user_id": "user-del"},
    )
    assert response.status_code == 200
    # Verify it's gone
    count = (
        db_session.query(PushTokenDB)
        .filter(PushTokenDB.token == "ExponentPushToken[del456]")
        .count()
    )
    assert count == 0


# 21. Status transition triggers notification (mock the httpx call)
def test_status_transition_notification(client, db_session):
    # Register a push token
    client.post(
        "/api/push/register",
        json={"token": "ExponentPushToken[notify789]", "user_id": "user-notify"},
    )

    # Lot D starts as "unknown". Insert enough "full" reports to make it "full".
    # We need >=70% full. Submitting 10 full reports via the API will do it.
    with patch("backend.main.httpx.post") as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": [{"status": "ok", "id": "fake-ticket-id"}]
        }
        mock_post.return_value = mock_response

        # First report transitions from unknown -> full (100% full with 1 report)
        response = client.post(
            "/api/reports",
            json={"lot_id": "D", "report_type": "full", "user_id": "user-t1"},
        )
        assert response.status_code == 201

        # The background task runs synchronously in TestClient, so check the mock
        assert mock_post.called
        call_args = mock_post.call_args
        assert call_args[0][0] == "https://exp.host/--/api/v2/push/send"
        messages = call_args[1]["json"] if "json" in call_args[1] else call_args[0][1]
        assert any("Staff / Overflow" in m["body"] for m in messages)


# --- Phase 2: Passive Occupancy Tracking Tests ---


# 22. POST /api/occupancy/enter creates session
def test_occupancy_enter(client):
    response = client.post(
        "/api/occupancy/enter",
        json={"lot_id": "A", "user_id": "user-geo-1"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["lot_id"] == "A"
    assert data["user_id"] == "user-geo-1"
    assert data["entered_at"] is not None
    assert data["exited_at"] is None
    assert "id" in data


# 23. POST /api/occupancy/enter is idempotent (same lot)
def test_occupancy_enter_idempotent(client, db_session):
    client.post(
        "/api/occupancy/enter",
        json={"lot_id": "A", "user_id": "user-geo-2"},
    )
    client.post(
        "/api/occupancy/enter",
        json={"lot_id": "A", "user_id": "user-geo-2"},
    )
    # Should still only have 1 active session
    count = (
        db_session.query(OccupancySessionDB)
        .filter(
            OccupancySessionDB.lot_id == "A",
            OccupancySessionDB.user_id == "user-geo-2",
            OccupancySessionDB.exited_at.is_(None),
        )
        .count()
    )
    assert count == 1


# 24. POST /api/occupancy/enter auto-exits previous lot
def test_occupancy_enter_auto_exits_previous(client, db_session):
    # Enter lot A
    client.post(
        "/api/occupancy/enter",
        json={"lot_id": "A", "user_id": "user-geo-3"},
    )
    # Enter lot B — should auto-exit lot A
    client.post(
        "/api/occupancy/enter",
        json={"lot_id": "B", "user_id": "user-geo-3"},
    )
    # Lot A session should now be exited
    lot_a_session = (
        db_session.query(OccupancySessionDB)
        .filter(
            OccupancySessionDB.lot_id == "A",
            OccupancySessionDB.user_id == "user-geo-3",
        )
        .first()
    )
    assert lot_a_session is not None
    assert lot_a_session.exited_at is not None

    # Lot B session should be active
    lot_b_session = (
        db_session.query(OccupancySessionDB)
        .filter(
            OccupancySessionDB.lot_id == "B",
            OccupancySessionDB.user_id == "user-geo-3",
            OccupancySessionDB.exited_at.is_(None),
        )
        .first()
    )
    assert lot_b_session is not None


# 25. POST /api/occupancy/exit closes session
def test_occupancy_exit(client):
    # Enter then exit
    client.post(
        "/api/occupancy/enter",
        json={"lot_id": "A", "user_id": "user-geo-4"},
    )
    response = client.post(
        "/api/occupancy/exit",
        json={"lot_id": "A", "user_id": "user-geo-4"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["exited_at"] is not None

    # Verify active count is 0
    active_resp = client.get("/api/occupancy/active")
    active_data = active_resp.json()
    lot_a = next(x for x in active_data if x["lot_id"] == "A")
    assert lot_a["active_count"] == 0


# 26. Active sessions contribute to lot status
def test_occupancy_affects_status(client, db_session):
    now = datetime.now(timezone.utc)
    # Insert 40 active sessions for lot C (capacity=45) directly in DB
    for i in range(40):
        db_session.add(
            OccupancySessionDB(
                lot_id="C",
                user_id=f"user-occ-{i}",
                entered_at=now - timedelta(minutes=10),
                exited_at=None,
            )
        )
    db_session.commit()

    response = client.get("/api/lots/C")
    assert response.status_code == 200
    data = response.json()
    assert data["active_sessions"] == 40
    assert data["status"] != "unknown"
    # 40/45 capacity = ~88.9% -> should be full
    assert data["fill_pct"] >= 70
    assert data["status"] == "full"
    assert "passive" in data["data_source"]


# 27. Stale sessions (>4h) are ignored
def test_occupancy_stale_session_ignored(client, db_session):
    # Insert a session with entered_at 5 hours ago, still active (no exit)
    stale_time = datetime.now(timezone.utc) - timedelta(hours=5)
    db_session.add(
        OccupancySessionDB(
            lot_id="D",
            user_id="user-stale-1",
            entered_at=stale_time,
            exited_at=None,
        )
    )
    db_session.commit()

    response = client.get("/api/lots/D")
    assert response.status_code == 200
    data = response.json()
    # Stale session should NOT be counted
    assert data["active_sessions"] == 0
    assert data["status"] == "unknown"


# --- Lot Definition CRUD Tests ---


# 28. GET /api/lots/definitions returns all lots with coordinates
def test_get_lot_definitions(client):
    response = client.get("/api/lots/definitions")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 4
    lot_ids = {lot["id"] for lot in data}
    assert lot_ids == {"A", "B", "C", "D"}
    # Each lot should have coordinates array
    for lot in data:
        assert "coordinates" in lot
        assert len(lot["coordinates"]) >= 3
        assert "centroid" in lot
        assert "lat" in lot["centroid"]
        assert "lng" in lot["centroid"]
        assert "created_at" in lot
        assert "updated_at" in lot


# 29. POST /api/lots/definitions creates a new lot
def test_create_lot(client):
    response = client.post(
        "/api/lots/definitions",
        json={
            "id": "E",
            "name": "New Visitor Lot",
            "capacity": 30,
            "coordinates": [
                {"lat": 54.9510, "lng": -7.7230},
                {"lat": 54.9512, "lng": -7.7228},
                {"lat": 54.9511, "lng": -7.7225},
                {"lat": 54.9509, "lng": -7.7227},
            ],
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["id"] == "E"
    assert data["name"] == "New Visitor Lot"
    assert data["capacity"] == 30
    assert len(data["coordinates"]) == 4
    assert "centroid" in data
    # Verify it shows up in definitions list
    defs = client.get("/api/lots/definitions").json()
    assert len(defs) == 5


# 30. PUT /api/lots/definitions/{lot_id} updates a lot
def test_update_lot(client):
    response = client.put(
        "/api/lots/definitions/A",
        json={"capacity": 150},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "A"
    assert data["capacity"] == 150
    assert data["name"] == "Main Car Park"  # unchanged


# 31. DELETE /api/lots/definitions/{lot_id} removes a lot
def test_delete_lot(client):
    response = client.delete("/api/lots/definitions/D")
    assert response.status_code == 200
    # Verify it's gone
    defs = client.get("/api/lots/definitions").json()
    assert len(defs) == 3
    lot_ids = {lot["id"] for lot in defs}
    assert "D" not in lot_ids


# 32. POST /api/reports with new lot_id works after creating lot
def test_report_on_new_lot(client):
    # Create lot E
    client.post(
        "/api/lots/definitions",
        json={
            "id": "E",
            "name": "New Visitor Lot",
            "capacity": 30,
            "coordinates": [
                {"lat": 54.9510, "lng": -7.7230},
                {"lat": 54.9512, "lng": -7.7228},
                {"lat": 54.9511, "lng": -7.7225},
                {"lat": 54.9509, "lng": -7.7227},
            ],
        },
    )
    # Now submit a report for lot E
    response = client.post(
        "/api/reports",
        json={"lot_id": "E", "report_type": "found", "user_id": "user-new-lot"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["lot_id"] == "E"
    assert data["report_type"] == "found"


# --- Photo Upload Tests ---


# 33. test_upload_photo — POST multipart form, assert 201
def test_upload_photo(client):
    import io

    fake_file = io.BytesIO(b"fake image data")
    response = client.post(
        "/api/photos",
        files={"file": ("test.jpg", fake_file, "image/jpeg")},
        data={"user_id": "user-photo-1", "note": "test snap"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["filename"] == "test.jpg"
    assert "url" in data
