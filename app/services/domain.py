from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.models.models import DaySession, Instance, InstanceStatus, Task, TaskKind, TelegramUser, UserSettings, WeekSession


def _active_tasks_query(user_id: int, kind: TaskKind) -> Select[tuple[Task]]:
    return select(Task).where(Task.user_id == user_id, Task.kind == kind, Task.is_active.is_(True))


def get_open_day(db: Session, user_id: int) -> DaySession | None:
    return db.scalar(select(DaySession).where(DaySession.user_id == user_id, DaySession.closed_at.is_(None)).order_by(DaySession.id.desc()))


def get_open_week(db: Session, user_id: int) -> WeekSession | None:
    return db.scalar(select(WeekSession).where(WeekSession.user_id == user_id, WeekSession.closed_at.is_(None)).order_by(WeekSession.id.desc()))


def resolve_penalty(task: Task, settings: UserSettings) -> Decimal:
    if task.penalty_amount is not None:
        return Decimal(task.penalty_amount)
    if task.kind == TaskKind.weekly:
        return Decimal(settings.penalty_weekly_default)
    return Decimal(settings.penalty_daily_default)


def mark_instance_failed(db: Session, instance: Instance, settings: UserSettings) -> None:
    if instance.status != InstanceStatus.planned:
        return
    penalty = resolve_penalty(instance.task, settings)
    instance.status = InstanceStatus.failed
    instance.penalty_applied = penalty


def start_day(db: Session, user: TelegramUser) -> DaySession:
    if get_open_day(db, user.id):
        raise HTTPException(status_code=400, detail='There is already an open day session')

    open_week = get_open_week(db, user.id)
    day = DaySession(user_id=user.id, week_session_id=open_week.id if open_week else None)
    db.add(day)
    db.flush()

    tasks = db.scalars(_active_tasks_query(user.id, TaskKind.daily)).all()
    for task in tasks:
        db.add(Instance(user_id=user.id, task_id=task.id, status=InstanceStatus.planned, day_session_id=day.id))

    db.commit()
    db.refresh(day)
    return day


def close_day(db: Session, user: TelegramUser) -> DaySession:
    day = get_open_day(db, user.id)
    if not day:
        raise HTTPException(status_code=400, detail='No open day session')

    settings = db.scalar(select(UserSettings).where(UserSettings.user_id == user.id))
    planned = db.scalars(
        select(Instance).where(
            Instance.user_id == user.id,
            Instance.day_session_id == day.id,
            Instance.status == InstanceStatus.planned,
        )
    ).all()

    for inst in planned:
        mark_instance_failed(db, inst, settings)

    day.closed_at = datetime.utcnow()
    db.commit()
    db.refresh(day)
    return day


def _close_week(db: Session, user: TelegramUser, week: WeekSession) -> None:
    settings = db.scalar(select(UserSettings).where(UserSettings.user_id == user.id))
    planned_weekly = db.scalars(
        select(Instance)
        .join(Task, Instance.task_id == Task.id)
        .where(
            Instance.user_id == user.id,
            Instance.week_session_id == week.id,
            Instance.status == InstanceStatus.planned,
            Task.kind == TaskKind.weekly,
        )
    ).all()
    for inst in planned_weekly:
        mark_instance_failed(db, inst, settings)
    week.closed_at = datetime.utcnow()


def _instance_summary(
    db: Session,
    user_id: int,
    *,
    day_session_id: int | None = None,
    week_session_id: int | None = None,
) -> dict:
    if day_session_id is None and week_session_id is None:
        raise ValueError('One of day_session_id or week_session_id must be provided')

    filters = [Instance.user_id == user_id]
    if day_session_id is not None:
        filters.append(Instance.day_session_id == day_session_id)
    if week_session_id is not None:
        filters.append(Instance.week_session_id == week_session_id)

    rows = db.execute(select(Instance.status, func.count(Instance.id)).where(*filters).group_by(Instance.status)).all()
    by_status = {status.value: int(count) for status, count in rows}
    total_penalty = db.scalar(
        select(func.coalesce(func.sum(Instance.penalty_applied), 0)).where(*filters, Instance.status == InstanceStatus.failed)
    )
    return {
        'done_count': by_status.get(InstanceStatus.done.value, 0),
        'canceled_count': by_status.get(InstanceStatus.canceled.value, 0),
        'failed_count': by_status.get(InstanceStatus.failed.value, 0),
        'total_penalty': Decimal(total_penalty),
    }


def build_day_close_result(db: Session, user: TelegramUser, day: DaySession) -> tuple[dict, str]:
    settings = db.scalar(select(UserSettings).where(UserSettings.user_id == user.id))
    summary = _instance_summary(db, user.id, day_session_id=day.id)
    return summary, settings.currency


def build_week_close_result(db: Session, user: TelegramUser, week: WeekSession) -> tuple[dict, str]:
    settings = db.scalar(select(UserSettings).where(UserSettings.user_id == user.id))
    summary = _instance_summary(db, user.id, week_session_id=week.id)
    return summary, settings.currency


def start_week(db: Session, user: TelegramUser) -> WeekSession:
    current = get_open_week(db, user.id)
    if current:
        _close_week(db, user, current)

    week = WeekSession(user_id=user.id)
    db.add(week)
    db.flush()

    weekly_tasks = db.scalars(_active_tasks_query(user.id, TaskKind.weekly)).all()
    for task in weekly_tasks:
        db.add(Instance(user_id=user.id, task_id=task.id, status=InstanceStatus.planned, week_session_id=week.id))

    db.commit()
    db.refresh(week)
    return week


def close_week(db: Session, user: TelegramUser) -> WeekSession:
    week = get_open_week(db, user.id)
    if not week:
        raise HTTPException(status_code=400, detail='No open week session')
    _close_week(db, user, week)
    db.commit()
    db.refresh(week)
    return week


def list_instances(
    db: Session,
    user_id: int,
    scope: str,
) -> list[Instance]:
    if scope == 'today':
        day = get_open_day(db, user_id)
        if not day:
            return []
        return db.scalars(
            select(Instance).where(Instance.user_id == user_id, Instance.day_session_id == day.id).order_by(Instance.created_at.desc())
        ).all()

    if scope == 'week':
        week = get_open_week(db, user_id)
        if not week:
            return []
        return db.scalars(
            select(Instance).where(Instance.user_id == user_id, Instance.week_session_id == week.id).order_by(Instance.created_at.desc())
        ).all()

    if scope == 'history':
        return db.scalars(select(Instance).where(Instance.user_id == user_id).order_by(Instance.created_at.desc()).limit(200)).all()

    raise HTTPException(status_code=400, detail='Unsupported scope')


def add_backlog_to_scope(db: Session, user: TelegramUser, task_id: int, scope: str) -> Instance:
    task = db.scalar(select(Task).where(Task.id == task_id, Task.user_id == user.id))
    if not task or task.kind != TaskKind.backlog:
        raise HTTPException(status_code=404, detail='Backlog task not found')

    if scope == 'today':
        day = get_open_day(db, user.id)
        if not day:
            raise HTTPException(status_code=400, detail='No open day session. Start day first.')
        instance = db.scalar(select(Instance).where(Instance.task_id == task.id, Instance.day_session_id == day.id))
        if instance:
            return instance
        instance = Instance(user_id=user.id, task_id=task.id, status=InstanceStatus.planned, day_session_id=day.id)
    elif scope == 'week':
        week = get_open_week(db, user.id)
        if not week:
            raise HTTPException(status_code=400, detail='No open week session. Start week first.')
        instance = db.scalar(select(Instance).where(Instance.task_id == task.id, Instance.week_session_id == week.id))
        if instance:
            return instance
        instance = Instance(user_id=user.id, task_id=task.id, status=InstanceStatus.planned, week_session_id=week.id)
    else:
        raise HTTPException(status_code=400, detail='Scope must be today or week')

    db.add(instance)
    db.commit()
    db.refresh(instance)
    return instance


def update_instance_status(db: Session, user: TelegramUser, instance_id: int, status: InstanceStatus) -> Instance:
    instance = db.scalar(select(Instance).where(Instance.id == instance_id, Instance.user_id == user.id))
    if not instance:
        raise HTTPException(status_code=404, detail='Instance not found')

    if instance.status == status:
        return instance

    settings = db.scalar(select(UserSettings).where(UserSettings.user_id == user.id))
    instance.status = status
    if status == InstanceStatus.failed:
        instance.penalty_applied = resolve_penalty(instance.task, settings)
    else:
        instance.penalty_applied = None

    db.commit()
    db.refresh(instance)
    return instance


def stats_penalty(db: Session, user_id: int, period: str) -> tuple[int, Decimal]:
    failed = select(func.count(Instance.id), func.coalesce(func.sum(Instance.penalty_applied), 0)).where(
        Instance.user_id == user_id,
        Instance.status == InstanceStatus.failed,
    )

    if period == 'days':
        failed = failed.where(Instance.day_session_id.is_not(None))
    elif period == 'weeks':
        failed = failed.where(Instance.week_session_id.is_not(None))
    elif period == 'months':
        pass
    else:
        raise HTTPException(status_code=400, detail='period must be days, weeks, or months')

    count, total = db.execute(failed).one()
    return int(count), Decimal(total)
