from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.api.deps import CurrentUser, DBSession
from app.models.models import Task
from app.schemas.common import TaskCreate, TaskOut, TaskUpdate

router = APIRouter(prefix='/tasks', tags=['tasks'])


@router.get('', response_model=list[TaskOut])
def list_tasks(db: DBSession, user: CurrentUser):
    return db.scalars(select(Task).where(Task.user_id == user.id).order_by(Task.created_at.desc())).all()


@router.post('', response_model=TaskOut)
def create_task(payload: TaskCreate, db: DBSession, user: CurrentUser):
    task = Task(user_id=user.id, **payload.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.put('/{task_id}', response_model=TaskOut)
def update_task(task_id: int, payload: TaskUpdate, db: DBSession, user: CurrentUser):
    task = db.scalar(select(Task).where(Task.id == task_id, Task.user_id == user.id))
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')
    for key, value in payload.model_dump().items():
        setattr(task, key, value)
    db.commit()
    db.refresh(task)
    return task


@router.delete('/{task_id}')
def delete_task(task_id: int, db: DBSession, user: CurrentUser):
    task = db.scalar(select(Task).where(Task.id == task_id, Task.user_id == user.id))
    if not task:
        raise HTTPException(status_code=404, detail='Task not found')
    db.delete(task)
    db.commit()
    return {'message': 'Task deleted'}
