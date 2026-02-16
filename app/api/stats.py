from fastapi import APIRouter
from sqlalchemy import delete

from app.api.deps import CurrentUser, DBSession
from app.models.models import DaySession, Instance, WeekSession
from app.schemas.common import MessageOut, StatsDetailsOut, StatsOut
from app.services.domain import stats_details, stats_penalty

router = APIRouter(prefix='/stats', tags=['stats'])


@router.get('', response_model=StatsOut)
def get_stats(period: str, db: DBSession, user: CurrentUser):
    failed_count, total_penalty = stats_penalty(db, user.id, period)
    return StatsOut(period=period, failed_count=failed_count, total_penalty=total_penalty)


@router.get('/details', response_model=StatsDetailsOut)
def get_stats_details(period: str, db: DBSession, user: CurrentUser):
    return stats_details(db, user.id, period)


@router.delete('', response_model=MessageOut)
def clear_stats(db: DBSession, user: CurrentUser):
    db.execute(delete(Instance).where(Instance.user_id == user.id))
    db.execute(delete(DaySession).where(DaySession.user_id == user.id))
    db.execute(delete(WeekSession).where(WeekSession.user_id == user.id))
    db.commit()
    return {'message': 'Statistics cleared'}
