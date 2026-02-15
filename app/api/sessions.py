from fastapi import APIRouter

from app.api.deps import CurrentUser, DBSession
from app.schemas.common import CloseSessionOut, SessionOut
from app.services.domain import (
    build_day_close_result,
    build_week_close_result,
    close_day,
    close_week,
    get_open_week,
    start_day,
    start_week,
)
from app.services.telegram_notify import notify_day_closed, notify_week_closed

router = APIRouter(prefix='/sessions', tags=['sessions'])


@router.post('/start_day', response_model=SessionOut)
def api_start_day(db: DBSession, user: CurrentUser):
    return start_day(db, user)


@router.post('/close_day', response_model=CloseSessionOut)
def api_close_day(db: DBSession, user: CurrentUser):
    day = close_day(db, user)
    summary, currency = build_day_close_result(db, user, day)
    notify_day_closed(user.telegram_user_id, day.id, summary, currency)
    return {
        'id': day.id,
        'started_at': day.started_at,
        'closed_at': day.closed_at,
        **summary,
        'currency': currency,
        'amount_to_transfer': summary['total_penalty'],
    }


@router.post('/start_week', response_model=SessionOut)
def api_start_week(db: DBSession, user: CurrentUser):
    previous_week = get_open_week(db, user.id)
    week = start_week(db, user)
    if previous_week:
        summary, currency = build_week_close_result(db, user, previous_week)
        notify_week_closed(user.telegram_user_id, previous_week.id, summary, currency, auto=True)
    return week


@router.post('/close_week', response_model=CloseSessionOut)
def api_close_week(db: DBSession, user: CurrentUser):
    week = close_week(db, user)
    summary, currency = build_week_close_result(db, user, week)
    notify_week_closed(user.telegram_user_id, week.id, summary, currency)
    return {
        'id': week.id,
        'started_at': week.started_at,
        'closed_at': week.closed_at,
        **summary,
        'currency': currency,
        'amount_to_transfer': summary['total_penalty'],
    }
