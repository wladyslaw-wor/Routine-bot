from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.models.models import UserSettings
from app.schemas.common import SettingsOut, SettingsUpdate

router = APIRouter(prefix='/settings', tags=['settings'])


@router.get('', response_model=SettingsOut)
def get_settings(db: DBSession, user: CurrentUser):
    return db.scalar(select(UserSettings).where(UserSettings.user_id == user.id))


@router.put('', response_model=SettingsOut)
def update_settings(payload: SettingsUpdate, db: DBSession, user: CurrentUser):
    settings = db.scalar(select(UserSettings).where(UserSettings.user_id == user.id))
    settings.currency = payload.currency
    settings.penalty_daily_default = payload.penalty_daily_default
    settings.penalty_weekly_default = payload.penalty_weekly_default
    db.commit()
    db.refresh(settings)
    return settings
