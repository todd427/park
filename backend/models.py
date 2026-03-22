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


class LotResponse(BaseModel):
    id: str
    name: str
    capacity: int
    status: str
    fill_pct: float
    report_count: int
    last_updated: Optional[datetime]
