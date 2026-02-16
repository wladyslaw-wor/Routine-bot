from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.models.models import Instance
from app.schemas.common import AddBacklogToScope, InstanceOut, InstanceStatusUpdate
from app.services.domain import add_backlog_to_scope, list_instances, update_instance_status

router = APIRouter(prefix='/instances', tags=['instances'])


def _to_out(instance: Instance) -> InstanceOut:
    return InstanceOut(
        id=instance.id,
        task_id=instance.task_id,
        task_title=instance.task.title,
        task_kind=instance.task.kind,
        status=instance.status,
        penalty_applied=instance.penalty_applied,
        day_session_id=instance.day_session_id,
        week_session_id=instance.week_session_id,
        created_at=instance.created_at,
    )


@router.get('', response_model=list[InstanceOut])
def get_instances(scope: str, db: DBSession, user: CurrentUser):
    instances = list_instances(db, user.id, scope)
    return [_to_out(inst) for inst in instances]


@router.put('/{instance_id}/status', response_model=InstanceOut)
def set_status(instance_id: int, payload: InstanceStatusUpdate, db: DBSession, user: CurrentUser):
    instance = update_instance_status(db, user, instance_id, payload.status)
    instance = db.scalar(select(Instance).where(Instance.id == instance.id))
    return _to_out(instance)


@router.post('/add_backlog', response_model=InstanceOut)
def add_backlog(payload: AddBacklogToScope, db: DBSession, user: CurrentUser):
    instance = add_backlog_to_scope(db, user, payload.task_id, payload.scope)
    instance = db.scalar(select(Instance).where(Instance.id == instance.id))
    return _to_out(instance)
