from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.models.models import DaySession, WeekSession

router = APIRouter(prefix='/dashboard', tags=['dashboard'])


@router.get('')
def dashboard_state(db: DBSession, user: CurrentUser):
    day = db.scalar(
        select(DaySession).where(DaySession.user_id == user.id, DaySession.closed_at.is_(None)).order_by(DaySession.id.desc())
    )
    week = db.scalar(
        select(WeekSession).where(WeekSession.user_id == user.id, WeekSession.closed_at.is_(None)).order_by(WeekSession.id.desc())
    )
    return {
        'open_day': {
            'id': day.id,
            'started_at': day.started_at,
        }
        if day
        else None,
        'open_week': {
            'id': week.id,
            'started_at': week.started_at,
        }
        if week
        else None,
    }
