"""SQLAlchemy database setup for Park backend."""

import os

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.sql import func

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./reports.db")

# Fly.io Postgres uses postgres:// but SQLAlchemy needs postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class ReportDB(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lot_id = Column(Text, nullable=False)
    report_type = Column(Text, nullable=False)
    timestamp = Column(DateTime, nullable=False, server_default=func.now())
    user_id = Column(Text, nullable=False)

    __table_args__ = (
        Index("idx_reports_lot_timestamp", "lot_id", "timestamp"),
    )


class LotDB(Base):
    __tablename__ = "lots"

    id = Column(Text, primary_key=True)
    name = Column(Text, nullable=False)
    capacity = Column(Integer, nullable=False)
    coordinates = Column(Text, nullable=False)  # JSON string: [{"lat": ..., "lng": ...}, ...]
    centroid_lat = Column(Float, nullable=False)
    centroid_lng = Column(Float, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class PushTokenDB(Base):
    __tablename__ = "push_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token = Column(Text, nullable=False, unique=True)
    user_id = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class CvEstimateDB(Base):
    __tablename__ = "cv_estimates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lot_id = Column(Text, nullable=False)
    occupied_spaces = Column(Integer, nullable=False)
    total_spaces = Column(Integer, nullable=False)
    confidence = Column(Float, nullable=False)  # 0.0 to 1.0
    source = Column(Text, nullable=False)  # "drone", "camera", "simulation"
    image_url = Column(Text, nullable=True)  # optional reference to source image
    timestamp = Column(DateTime, nullable=False, server_default=func.now())

    __table_args__ = (
        Index("idx_cv_estimates_lot_timestamp", "lot_id", "timestamp"),
    )


class OccupancySessionDB(Base):
    __tablename__ = "occupancy_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lot_id = Column(Text, nullable=False)
    user_id = Column(Text, nullable=False)
    entered_at = Column(DateTime, nullable=False, server_default=func.now())
    exited_at = Column(DateTime, nullable=True)  # NULL = still in lot

    __table_args__ = (
        Index("idx_occupancy_lot_exited", "lot_id", "exited_at"),
        UniqueConstraint(
            "lot_id", "user_id", "exited_at", name="uq_occupancy_active_session"
        ),
    )


def create_tables():
    """Create all tables in the database."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """Dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
