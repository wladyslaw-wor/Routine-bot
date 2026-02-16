from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select

from app.api.deps import CurrentUser, DBSession
from app.models.models import Task
from app.schemas.common import MessageOut, TaskCreate, TaskOut, TaskUpdate, TasksReorderIn

router = APIRouter(prefix='/tasks', tags=['tasks'])


@router.get('', response_model=list[TaskOut])
def list_tasks(db: DBSession, user: CurrentUser):
    return db.scalars(select(Task).where(Task.user_id == user.id).order_by(Task.order_index.asc(), Task.created_at.asc())).all()


@router.post('', response_model=TaskOut)
def create_task(payload: TaskCreate, db: DBSession, user: CurrentUser):
    max_order = db.scalar(select(func.coalesce(func.max(Task.order_index), -1)).where(Task.user_id == user.id))
    task = Task(user_id=user.id, order_index=int(max_order) + 1, **payload.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.post('/reorder', response_model=MessageOut)
def reorder_tasks(payload: TasksReorderIn, db: DBSession, user: CurrentUser):
    tasks = db.scalars(select(Task).where(Task.user_id == user.id)).all()
    by_id = {task.id: task for task in tasks}
    ordered_ids = payload.ordered_ids

    if len(ordered_ids) != len(tasks) or set(ordered_ids) != set(by_id.keys()):
        raise HTTPException(status_code=400, detail='ordered_ids must contain all user task ids exactly once')

    for idx, task_id in enumerate(ordered_ids):
        by_id[task_id].order_index = idx

    db.commit()
    return {'message': 'Tasks reordered'}


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
