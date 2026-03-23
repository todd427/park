"""Pydantic models for Park backend API."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, field_validator


VALID_LOT_IDS = {"A", "B", "C", "D"}
VALID_REPORT_TYPES = {"found", "full"}


class ReportCreate(BaseModel):
    lot_id: str
    report_type: str
    user_id: str

    @field_validator("lot_id")
    @classmethod
    def validate_lot_id(cls, v: str) -> str:
        if v not in VALID_LOT_IDS:
            raise ValueError(f"lot_id must be one of {VALID_LOT_IDS}")
        return v

    @field_validator("report_type")
    @classmethod
    def validate_report_type(cls, v: str) -> str:
        if v not in VALID_REPORT_TYPES:
            raise ValueError(f"report_type must be one of {VALID_REPORT_TYPES}")
        return v


class ReportResponse(BaseModel):
    id: int
    lot_id: str
    report_type: str
    timestamp: datetime
    user_id: str

    model_config = {"from_attributes": True}


class CvEstimateCreate(BaseModel):
    lot_id: str
    total_spaces: int
    occupied_spaces: int
    confidence: float
    source: str
    image_url: str | None = None

    @field_validator("lot_id")
    @classmethod
    def validate_lot_id(cls, v: str) -> str:
        if v not in VALID_LOT_IDS:
            raise ValueError(f"lot_id must be one of {VALID_LOT_IDS}")
        return v

    @field_validator("confidence")
    @classmethod
    def validate_confidence(cls, v: float) -> float:
        if not 0.0 <= v <= 1.0:
            raise ValueError("confidence must be between 0.0 and 1.0")
        return v

    @field_validator("total_spaces")
    @classmethod
    def validate_total_spaces(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("total_spaces must be > 0")
        return v

    @field_validator("occupied_spaces")
    @classmethod
    def validate_occupied_spaces(cls, v: int, info) -> int:
        if v < 0:
            raise ValueError("occupied_spaces must be >= 0")
        if "total_spaces" in info.data and v > info.data["total_spaces"]:
            raise ValueError("occupied_spaces must be <= total_spaces")
        return v

    @field_validator("source")
    @classmethod
    def validate_source(cls, v: str) -> str:
        valid_sources = {"drone", "camera", "simulation"}
        if v not in valid_sources:
            raise ValueError(f"source must be one of {valid_sources}")
        return v


class CvEstimateResponse(BaseModel):
    id: int
    lot_id: str
    occupied_spaces: int
    total_spaces: int
    confidence: float
    source: str
    image_url: str | None
    timestamp: datetime

    model_config = {"from_attributes": True}


class PushTokenCreate(BaseModel):
    token: str  # Expo push token like "ExponentPushToken[xxx]"
    user_id: str


class PushTokenResponse(BaseModel):
    id: int
    token: str
    user_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class OccupancyEvent(BaseModel):
    lot_id: str
    user_id: str

    @field_validator("lot_id")
    @classmethod
    def validate_lot_id(cls, v: str) -> str:
        if v not in VALID_LOT_IDS:
            raise ValueError(f"lot_id must be one of {VALID_LOT_IDS}")
        return v


class OccupancySessionResponse(BaseModel):
    id: int
    lot_id: str
    user_id: str
    entered_at: datetime
    exited_at: datetime | None

    model_config = {"from_attributes": True}


class LotResponse(BaseModel):
    id: str
    name: str
    capacity: int
    status: str
    fill_pct: float
    report_count: int
    last_updated: Optional[datetime]
    cv_occupancy: Optional[float] = None
    cv_confidence: Optional[float] = None
    cv_source: Optional[str] = None
    data_source: str = "crowd"
    active_sessions: int = 0
