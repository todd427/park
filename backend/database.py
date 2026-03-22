"""SQLAlchemy database setup for Park backend."""

from sqlalchemy import (
    Column,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.sql import func

DATABASE_URL = "sqlite:///./reports.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
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
