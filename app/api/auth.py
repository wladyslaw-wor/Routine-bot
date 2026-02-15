from fastapi import APIRouter

from app.api.deps import CurrentUser
from app.schemas.common import UserOut

router = APIRouter(prefix='/auth', tags=['auth'])


@router.get('/me', response_model=UserOut)
def me(user: CurrentUser):
    return user
