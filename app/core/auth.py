import hashlib
import hmac
import json
from typing import Annotated
from urllib.parse import parse_qsl

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.models import TelegramUser, UserSettings


def _build_data_check_string(init_data: str) -> tuple[str, str]:
    pairs = dict(parse_qsl(init_data, strict_parsing=True))
    received_hash = pairs.pop('hash', None)
    if not received_hash:
        raise HTTPException(status_code=401, detail='Missing initData hash')
    data_check_string = '\n'.join(f'{k}={v}' for k, v in sorted(pairs.items()))
    return data_check_string, received_hash


def validate_telegram_init_data(init_data: str) -> dict:
    data_check_string, received_hash = _build_data_check_string(init_data)

    secret_key = hmac.new(b'WebAppData', settings.bot_token.encode(), hashlib.sha256).digest()
    calculated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(calculated_hash, received_hash):
        raise HTTPException(status_code=401, detail='Invalid Telegram initData signature')

    pairs = dict(parse_qsl(init_data, strict_parsing=True))
    if 'user' not in pairs:
        raise HTTPException(status_code=401, detail='Missing user payload')

    user_payload = json.loads(pairs['user'])
    return user_payload


def _get_or_create_user(db: Session, user_payload: dict) -> TelegramUser:
    telegram_user_id = user_payload['id']
    user = db.scalar(select(TelegramUser).where(TelegramUser.telegram_user_id == telegram_user_id))
    if not user:
        user = TelegramUser(
            telegram_user_id=telegram_user_id,
            username=user_payload.get('username'),
            first_name=user_payload.get('first_name'),
            last_name=user_payload.get('last_name'),
        )
        db.add(user)
        db.flush()
        db.add(UserSettings(user_id=user.id, currency='EUR', penalty_daily_default=10, penalty_weekly_default=20))
        db.commit()
        db.refresh(user)
        return user

    user.username = user_payload.get('username')
    user.first_name = user_payload.get('first_name')
    user.last_name = user_payload.get('last_name')
    db.commit()
    db.refresh(user)
    return user


def _get_or_create_fake_user(db: Session, fake_user_id: int) -> TelegramUser:
    user = db.scalar(select(TelegramUser).where(TelegramUser.telegram_user_id == fake_user_id))
    if user:
        return user
    user = TelegramUser(telegram_user_id=fake_user_id, username=f'local_{fake_user_id}', first_name='Local', last_name='User')
    db.add(user)
    db.flush()
    db.add(UserSettings(user_id=user.id, currency='EUR', penalty_daily_default=10, penalty_weekly_default=20))
    db.commit()
    db.refresh(user)
    return user


def get_current_user(
    db: Annotated[Session, Depends(get_db)],
    x_telegram_init_data: Annotated[str | None, Header()] = None,
    authorization: Annotated[str | None, Header()] = None,
    x_telegram_user_id: Annotated[int | None, Header()] = None,
) -> TelegramUser:
    init_data = x_telegram_init_data
    if not init_data and authorization and authorization.lower().startswith('tma '):
        init_data = authorization[4:].strip()

    if init_data:
        user_payload = validate_telegram_init_data(init_data)
        return _get_or_create_user(db, user_payload)

    if settings.debug_allow_fake_auth and x_telegram_user_id:
        return _get_or_create_fake_user(db, x_telegram_user_id)

    raise HTTPException(status_code=401, detail='Missing authentication headers')
