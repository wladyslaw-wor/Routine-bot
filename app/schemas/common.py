from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from app.models.models import InstanceStatus, TaskKind


class MessageOut(BaseModel):
    message: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    telegram_user_id: int
    username: str | None = None
    first_name: str | None = None
    last_name: str | None = None


class SettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    currency: str
    penalty_daily_default: Decimal
    penalty_weekly_default: Decimal


class SettingsUpdate(BaseModel):
    currency: str
    penalty_daily_default: Decimal
    penalty_weekly_default: Decimal


class TaskCreate(BaseModel):
    title: str
    kind: TaskKind
    is_active: bool = True
    penalty_amount: Decimal | None = None


class TaskUpdate(BaseModel):
    title: str
    kind: TaskKind
    is_active: bool
    penalty_amount: Decimal | None = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    kind: TaskKind
    is_active: bool
    penalty_amount: Decimal | None = None


class SessionOut(BaseModel):
    id: int
    started_at: datetime
    closed_at: datetime | None


class CloseSessionOut(SessionOut):
    done_count: int
    canceled_count: int
    failed_count: int
    total_penalty: Decimal
    currency: str
    amount_to_transfer: Decimal


class InstanceOut(BaseModel):
    id: int
    task_id: int
    task_title: str
    task_kind: TaskKind
    status: InstanceStatus
    penalty_applied: Decimal | None
    day_session_id: int | None
    week_session_id: int | None
    created_at: datetime


class InstanceStatusUpdate(BaseModel):
    status: InstanceStatus


class AddBacklogToScope(BaseModel):
    task_id: int
    scope: str  # today | week


class StatsOut(BaseModel):
    period: str
    failed_count: int
    total_penalty: Decimal


class StatsDetailRow(BaseModel):
    task_title: str
    status: InstanceStatus
    started_at: datetime
    total_penalty: Decimal


class StatsDetailsOut(BaseModel):
    period: str
    total_penalty: Decimal
    status_counts: dict[str, int]
    rows: list[StatsDetailRow]
