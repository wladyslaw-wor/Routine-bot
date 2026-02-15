from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.models import TelegramUser

DBSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[TelegramUser, Depends(get_current_user)]
